const nodemailer = require('nodemailer');

const host = process.env.SMTP_HOST;
const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined;
const secure = process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1';
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.EMAIL_FROM || 'no-reply@example.com';

const enabled = !!(host && port && user && pass);

let transporter = null;

if (enabled) {
  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    }
  });
  transporter.verify().then(() => {
    console.log('[mail] SMTP transporter ready');
  }).catch((err) => {
    console.error('[mail] SMTP verify failed:', err?.message || err);
  });
} else {
  console.warn('[mail] SMTP not fully configured, emails will not be sent');
}

const sendLoginLink = async ({ to, link }) => {
  if (!enabled || !transporter) {
    console.warn(`[mail] sendLoginLink skipped (disabled). Link: ${link}`);
    return { sent: false, preview: link };
  }

  const mailOptions = {
    from,
    to,
    subject: '登录确认链接',
    text: `请点击以下链接完成登录（有效期有限）：\n${link}`,
    html: `<p>请点击以下链接完成登录（有效期有限）：</p><p><a href="${link}" target="_blank">${link}</a></p>`
  };

  await transporter.sendMail(mailOptions);
  return { sent: true };
};

module.exports = {
  enabled,
  sendLoginLink
};
