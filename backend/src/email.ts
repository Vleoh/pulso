const EMAIL_ENABLED = (process.env.EMAIL_ENABLED ?? "false").toLowerCase() === "true";
const EMAIL_PROVIDER = (process.env.EMAIL_PROVIDER ?? "resend").toLowerCase();
const EMAIL_FROM = process.env.EMAIL_FROM ?? "Pulso Pais <no-reply@pulsopais.local>";
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";

export function emailHealth(): { enabled: boolean; provider: string; configured: boolean } {
  if (!EMAIL_ENABLED) {
    return { enabled: false, provider: EMAIL_PROVIDER, configured: false };
  }
  if (EMAIL_PROVIDER === "resend") {
    return { enabled: true, provider: EMAIL_PROVIDER, configured: RESEND_API_KEY.length > 0 };
  }
  return { enabled: true, provider: EMAIL_PROVIDER, configured: false };
}

type TransactionalEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendTransactionalEmail(input: TransactionalEmailInput): Promise<void> {
  const health = emailHealth();
  if (!health.enabled || !health.configured) {
    return;
  }

  if (EMAIL_PROVIDER === "resend") {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`No se pudo enviar email (${response.status}): ${body.slice(0, 240)}`);
    }
    return;
  }

  throw new Error(`Proveedor de email no soportado: ${EMAIL_PROVIDER}`);
}

export async function sendWelcomeEmail(input: { email: string; displayName?: string | null }): Promise<void> {
  const name = input.displayName?.trim() || "Hola";
  await sendTransactionalEmail({
    to: input.email,
    subject: "Bienvenido a Pulso Pais",
    html: `<div style="font-family:Arial,sans-serif;background:#0d0d0d;color:#f2f2f2;padding:20px">
      <h2 style="margin:0 0 12px;color:#d8b85b;">Pulso Pais</h2>
      <p style="margin:0 0 10px;">${name}, tu cuenta ya esta activa.</p>
      <p style="margin:0 0 10px;">Tu plan inicial es <strong>FREE</strong>. Desde aqui iremos habilitando nuevas funciones y beneficios.</p>
      <p style="margin:0;">Gracias por sumarte.</p>
    </div>`,
    text: `${name}, tu cuenta en Pulso Pais ya esta activa. Plan inicial: FREE.`,
  });
}

export async function sendAccountCodeEmail(input: { email: string; code: string }): Promise<void> {
  await sendTransactionalEmail({
    to: input.email,
    subject: "Codigo de verificacion - Pulso Pais",
    html: `<div style="font-family:Arial,sans-serif;background:#0d0d0d;color:#f2f2f2;padding:20px">
      <h2 style="margin:0 0 12px;color:#d8b85b;">Codigo de verificacion</h2>
      <p style="margin:0 0 10px;">Usa este codigo para validar tu cuenta:</p>
      <p style="margin:0;font-size:30px;letter-spacing:0.24em;font-weight:700;color:#ffffff;">${input.code}</p>
      <p style="margin:12px 0 0;color:#bcbcbc;">El codigo vence en pocos minutos.</p>
    </div>`,
    text: `Tu codigo de verificacion es: ${input.code}`,
  });
}
