import {
  checkRecoveryCode,
  hashRecoveryCode,
  RECOVERY_PREFIX,
  type RecoveryState,
} from "../../utils/recovery-code";
import { requireRecoverySession } from "../../utils/recovery-request";

export default defineEventHandler(async (event) => {
  const { config, database, session } = await requireRecoverySession(
    event,
    "recovery",
  );
  const body = await readBody<{ code?: unknown }>(event);
  if (typeof body?.code !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(body.code))
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid recovery code",
    });
  const client = await database.connect();
  let accepted = false;
  try {
    await client.query("begin");
    const id = RECOVERY_PREFIX + session.user.id;
    const row = await client.query<{ value: string }>(
      "select value from near_auth.verification where id = $1 for update",
      [id],
    );
    if (row.rows[0]) {
      const state = JSON.parse(row.rows[0].value) as RecoveryState;
      const result = checkRecoveryCode(
        state,
        hashRecoveryCode(body.code, String(config.nearAuthSecret)),
        Date.now(),
      );
      if (result.accepted) {
        const updated = await client.query(
          `update near_auth."session" set "nearAuthMethod" = 'recovery_verified' where id = $1 and "userId" = $2 and "nearAuthMethod" = 'recovery' and "expiresAt" > now() and "createdAt" >= now() - interval '5 minutes'`,
          [session.session.id, session.user.id],
        );
        if (updated.rowCount === 1) {
          await client.query(
            "delete from near_auth.verification where id = $1",
            [id],
          );
          accepted = true;
        }
      } else {
        await client.query(
          'update near_auth.verification set value = $2, "updatedAt" = now() where id = $1',
          [id, JSON.stringify(result.state)],
        );
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  if (!accepted)
    throw createError({
      statusCode: 403,
      statusMessage: "Invalid recovery code",
    });
  return { verified: true };
});
