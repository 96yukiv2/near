import nodemailer from "nodemailer";

export function createRecoveryMailer(smtpURL: string, from: string) {
  if (!smtpURL && !from) return undefined;
  const address = new URL(smtpURL);
  if (
    !["smtp:", "smtps:"].includes(address.protocol) ||
    !address.hostname ||
    !address.username ||
    !address.password ||
    !from ||
    /[\r\n]/.test(from)
  )
    throw new Error("Invalid recovery email configuration");
  const secure = address.protocol === "smtps:";
  const port = address.port ? Number(address.port) : secure ? 465 : 587;
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid recovery email configuration");
  const transport = nodemailer.createTransport({
    host: address.hostname,
    port,
    secure,
    requireTLS: !secure,
    auth: {
      user: decodeURIComponent(address.username),
      pass: decodeURIComponent(address.password),
    },
  });
  return async ({
    email,
    otp,
  }: {
    email: string;
    otp: string;
    type: string;
  }) => {
    await transport.sendMail({
      from,
      to: email,
      subject: "Near の確認コード",
      text: `Near の確認コードは ${otp} です。このコードを他の人に教えないでください。`,
    });
  };
}
