import { passkey } from "@better-auth/passkey";
import { oauthProvider } from "@better-auth/oauth-provider";
import type { BetterAuthOptions } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { anonymous, emailOTP, jwt } from "better-auth/plugins";

/** Shared by the server and the isolated browser test. No secrets belong here. */
export function createNearAuthOptions(settings: {
  baseURL: string;
  secret: string;
  database: BetterAuthOptions["database"];
  rpID: string;
  origin: string;
  hasPasskey: (userId: string) => Promise<boolean>;
  revokePriorPasskeys?: (userId: string) => Promise<void>;
  sendVerificationOTP?: (message: {
    email: string;
    otp: string;
    type: string;
  }) => Promise<void>;
  allowTestDeletion?: boolean;
}): BetterAuthOptions {
  const recovery = settings.sendVerificationOTP;
  return {
    baseURL: settings.baseURL,
    secret: settings.secret,
    database: settings.database,
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/anonymous": { window: 60, max: 5 },
        "/email-otp/*": { window: 60, max: 5 },
        "/sign-in/email-otp": { window: 60, max: 5 },
      },
    },
    session: {
      additionalFields: {
        nearAuthMethod: { type: "string", required: false, input: false },
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session, ctx) => ({
            data: {
              ...session,
              ipAddress: null,
              userAgent: null,
              nearAuthMethod:
                ctx?.path === "/passkey/verify-authentication"
                  ? "passkey"
                  : ctx?.path === "/sign-in/email-otp"
                    ? "recovery"
                    : "bootstrap",
            },
          }),
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          ctx.path === "/email-otp/request-email-change" ||
          ctx.path === "/email-otp/change-email"
        ) {
          const current = await getSessionFromCtx(ctx);
          const method = current?.session.nearAuthMethod;
          const createdAt = current?.session.createdAt;
          const age = createdAt
            ? Date.now() - new Date(createdAt).getTime()
            : Infinity;
          if (method !== "passkey" || age < 0 || age > 5 * 60_000)
            throw new APIError("FORBIDDEN", {
              message: "A recent passkey sign-in is required.",
            });
        }
        if (
          ctx.path !== "/passkey/generate-register-options" &&
          ctx.path !== "/passkey/verify-registration"
        )
          return;
        const session = await getSessionFromCtx(ctx);
        if (session && (await settings.hasPasskey(session.user.id))) {
          const age =
            Date.now() - new Date(session.session.createdAt).getTime();
          if (
            session.session.nearAuthMethod !== "recovery" ||
            age < 0 ||
            age > 5 * 60_000
          )
            throw new APIError("FORBIDDEN", {
              message: "Additional passkeys require a separate verified flow.",
            });
        }
      }),
    },
    user: { deleteUser: { enabled: settings.allowTestDeletion === true } },
    plugins: [
      anonymous({ disableDeleteAnonymousUser: true }),
      passkey({
        rpID: settings.rpID,
        origin: settings.origin,
        registration: {
          afterVerification: async ({ ctx, user }) => {
            const current = await getSessionFromCtx(ctx);
            if (current?.session.nearAuthMethod !== "recovery") return;
            if (!settings.revokePriorPasskeys || current.user.id !== user.id)
              throw new APIError("FORBIDDEN", {
                message: "Recovery unavailable.",
              });
            await settings.revokePriorPasskeys(user.id);
          },
        },
      }),
      ...(recovery
        ? [
            emailOTP({
              disableSignUp: true,
              storeOTP: "hashed",
              changeEmail: { enabled: true },
              sendVerificationOTP: recovery,
            }),
          ]
        : []),
      jwt(),
      oauthProvider({
        loginPage: "/auth/login",
        consentPage: "/auth/consent",
        scopes: ["openid"],
        clientPrivileges: () => false,
        signup: {
          page: "/auth/setup",
          shouldRedirect: async ({ user, session }) =>
            session.nearAuthMethod !== "passkey" ||
            !(await settings.hasPasskey(user.id)),
        },
      }),
    ],
  };
}
