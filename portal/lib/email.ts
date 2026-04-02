import nodemailer from 'nodemailer'

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    ...(process.env.SMTP_USER && {
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    }),
  })
}

export async function sendMagicLinkEmail(email: string, url: string): Promise<void> {
  if (!process.env.SMTP_HOST) {
    console.log(`\n🔗 Magic link for ${email}:\n${url}\n`)
    return
  }
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || 'CC Proxy <noreply@localhost>',
    to: email,
    subject: 'Sign in to CC Proxy',
    text: `Sign in to CC Proxy:\n\n${url}\n\nThis link expires in 15 minutes.`,
    html: `<p>Click to sign in to CC Proxy:</p><p><a href="${url}">${url}</a></p><p><small>Expires in 15 minutes.</small></p>`,
  })
}
