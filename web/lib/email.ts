// Sends magic links. Locally (no SES env) it LOGS the link to the server console so the whole
// flow is testable without AWS. In prod (SES_FROM + AWS_REGION set) it sends via Amazon SES.
export async function sendMagicLink(email: string, url: string, kind: "invite" | "login") {
  const subject = kind === "invite"
    ? "You're invited to help edit Thanh Phung Poetry"
    : "Your sign-in link — Thanh Phung Poetry";
  const intro = kind === "invite"
    ? "You've been invited as an admin of the Thanh Phung Poetry archive."
    : "Here is your sign-in link for the Thanh Phung Poetry archive.";
  const text = `${intro}\n\nOpen this link to continue (valid for 7 days, single use):\n${url}\n\nIf you didn't expect this, you can ignore this email.`;
  const html = `<p>${intro}</p><p><a href="${url}">Click here to continue</a> — valid for 7 days, single use.</p><p style="color:#888;font-size:12px">If you didn't expect this, ignore this email.</p>`;

  if (process.env.SES_FROM && process.env.AWS_REGION) {
    try {
      const { SESv2Client, SendEmailCommand } = await import("@aws-sdk/client-sesv2");
      const client = new SESv2Client({ region: process.env.AWS_REGION });
      await client.send(new SendEmailCommand({
        FromEmailAddress: process.env.SES_FROM,
        Destination: { ToAddresses: [email] },
        Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: text }, Html: { Data: html } } } },
      }));
      return { sent: "ses" as const };
    } catch (e) {
      // In the SES sandbox, sending to an unverified recipient is rejected. Don't lose the link —
      // fall back to logging it so sign-in still works until production access is granted.
      console.error(`[email] SES send failed (${(e as Error).message}); falling back to logged link.`);
    }
  }

  console.log(`\n──────── EMAIL STUB (${kind}) ────────\n  to: ${email}\n  ${url}\n────────────────────────────────────\n`);
  return { sent: "stub" as const, url };
}
