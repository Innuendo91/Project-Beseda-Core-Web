import nodemailer from "nodemailer";
import { getBaseUrl } from "./settings.js";

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  if (!host) {
    console.warn("[email] SMTP_HOST not set — emails will not be sent");
    return null;
  }

  _transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
  });

  return _transporter;
}

export async function sendEmail({ to, subject, html, text }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("[email] Cannot send email to", to, "— SMTP not configured");
    return { ok: false, error: "SMTP not configured" };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@localhost";

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });
    console.log("[email] sent to", to, "— messageId:", info.messageId);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error("[email] failed to send to", to, "—", err.message);
    return { ok: false, error: err.message };
  }
}

export async function sendPasswordResetEmail(to, username, token) {
  const baseUrl = getBaseUrl();
  const link = `${baseUrl}/reset/${token}`;

  const html = `
    <!doctype html>
    <html>
    <head><meta charset="utf-8"/><style>
      body{font-family:system-ui,sans-serif;background:#101114;color:#e8e6e3;padding:24px}
      .card{max-width:440px;margin:0 auto;background:#181a1f;border:1px solid #2a2d37;border-radius:8px;padding:24px}
      h2{color:#e8e6e3;margin:0 0 8px}
      p{color:#8b8d94;line-height:1.6;margin:8px 0}
      a.btn{display:inline-block;padding:10px 20px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:4px;margin-top:12px}
      a.btn:hover{background:#2563eb}
      small{color:#555}
    </style></head>
    <body>
      <div class="card">
        <h2>Восстановление пароля</h2>
        <p>Пользователь <strong>${esc(username)}</strong> запросил сброс пароля.</p>
        <p>Перейдите по ссылке ниже, чтобы установить новый пароль:</p>
        <a class="btn" href="${esc(link)}">Сменить пароль</a>
        <p><small>Ссылка действительна 24 часа. Если вы не запрашивали сброс пароля, проигнорируйте это письмо.</small></p>
      </div>
    </body>
    </html>
  `;

  const text = `
Восстановление пароля

Пользователь ${username} запросил сброс пароля.
Откройте ссылку в браузере, чтобы установить новый пароль:

${link}

Ссылка действительна 24 часа. Если вы не запрашивали сброс пароля, проигнорируйте это письмо.
  `.trim();

  return sendEmail({ to, subject: "Восстановление пароля", html, text });
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
