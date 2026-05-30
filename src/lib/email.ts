import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function sendOTPEmail(
  to: string,
  code: string,
  purpose: "login" | "register" | "reset",
): Promise<void> {
  const subjects = {
    login:    "FRIDAY — Your login code",
    register: "FRIDAY — Verify your email",
    reset:    "FRIDAY — Password reset code",
  };

  const labels = {
    login:    "Your one-time login code:",
    register: "Verify your email to create your account:",
    reset:    "Use this code to reset your password:",
  };

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#02050a;font-family:'Courier New',monospace;">
  <div style="max-width:420px;margin:40px auto;border:1px solid rgba(0,224,255,0.2);background:#02050a;padding:2.5rem;">
    <div style="border-bottom:1px solid rgba(0,224,255,0.12);padding-bottom:1.2rem;margin-bottom:1.5rem;">
      <h1 style="margin:0;color:#00e0ff;font-size:1.6rem;letter-spacing:0.35em;font-weight:700;">F R I D A Y</h1>
      <p style="margin:4px 0 0;color:rgba(0,224,255,0.4);font-size:0.6rem;letter-spacing:0.22em;">MJ PERSONAL ASSISTANT</p>
    </div>
    <p style="color:rgba(207,233,255,0.7);font-size:0.8rem;margin:0 0 1.2rem;letter-spacing:0.04em;">${labels[purpose]}</p>
    <div style="background:rgba(0,224,255,0.04);border:1px solid rgba(0,224,255,0.25);padding:1.2rem;text-align:center;margin:0 0 1.5rem;">
      <span style="color:#00e0ff;font-size:2.2rem;letter-spacing:0.5em;font-weight:700;">${code}</span>
    </div>
    <p style="color:rgba(207,233,255,0.35);font-size:0.68rem;margin:0;line-height:1.6;">
      This code expires in <strong style="color:rgba(207,233,255,0.6);">10 minutes</strong>.<br/>
      If you didn't request this, ignore this email.
    </p>
    <div style="margin-top:2rem;padding-top:1rem;border-top:1px solid rgba(0,224,255,0.08);">
      <p style="margin:0;color:rgba(0,224,255,0.2);font-size:0.55rem;letter-spacing:0.1em;">FRIDAY · MJX Web Studio</p>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `"FRIDAY" <${process.env.GMAIL_USER}>`,
    to,
    subject: subjects[purpose],
    html,
  });
}
