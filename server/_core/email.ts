import nodemailer from "nodemailer";
import { ENV } from "./env";

function getTransport() {
  if (!ENV.smtpHost) return null;

  return nodemailer.createTransport({
    host: ENV.smtpHost,
    port: Number(ENV.smtpPort || 587),
    secure: Number(ENV.smtpPort || 587) === 465,
    auth: ENV.smtpUser && ENV.smtpPass ? { user: ENV.smtpUser, pass: ENV.smtpPass } : undefined,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const transport = getTransport();
  if (!transport) {
    console.warn(`[Email] SMTP não configurado. Link de recuperação: ${resetUrl}`);
    return;
  }

  await transport.sendMail({
    from: ENV.smtpFrom,
    to,
    subject: "Redefina sua senha no Controle de Contas",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <h2 style="margin:0 0 12px">Redefinição de senha</h2>
        <p>Recebemos uma solicitação para redefinir sua senha.</p>
        <p>Este link expira em 1 hora:</p>
        <p>
          <a href="${resetUrl}" style="display:inline-block;background:#0ea5e9;color:white;text-decoration:none;padding:12px 18px;border-radius:8px">
            Criar nova senha
          </a>
        </p>
        <p style="font-size:12px;color:#64748b">Se você não pediu isso, ignore este e-mail.</p>
      </div>
    `,
  });
}
