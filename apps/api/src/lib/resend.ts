type ResendResult = { ok: true; id?: string } | { ok: false; error: string };

export async function sendResendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<ResendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not set" };
  }
  if (!from) {
    return { ok: false, error: "EMAIL_FROM is not set" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    error?: { message?: string };
  };

  if (!res.ok) {
    return {
      ok: false,
      error:
        body.error?.message ??
        body.message ??
        `Resend HTTP ${res.status}`,
    };
  }
  return { ok: true, id: body.id };
}
