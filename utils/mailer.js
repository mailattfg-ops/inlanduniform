// Transactional email via Brevo (https://developers.brevo.com/reference/sendtransacemail).
// Env:
//   BREVO_API_KEY     required (Brevo > SMTP & API > API Keys)
//   MAIL_FROM_EMAIL   sender address; must be a verified sender in Brevo (default inlanduniform@gmail.com)
//   MAIL_FROM_NAME    sender display name (default "Inland Uniform")
//   MAIL_REPLY_TO     optional reply-to address (defaults to the sender)
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isEmail = (v) => EMAIL_RE.test(String(v || '').trim());

const escapeHtml = (s) => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Plain text -> simple branded HTML (keeps line breaks, turns URLs into links)
function textToHtml(text) {
  const body = escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#C82A2B;font-weight:600;">$1</a>')
    .replace(/\n/g, '<br>');
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <div style="height:6px;background:#C82A2B;"></div>
    <div style="padding:24px;font-size:14px;line-height:1.6;color:#18181b;">${body}</div>
  </div></body></html>`;
}

/**
 * Send one email. Never throws: resolves to { ok, messageId } or { ok:false, error, code }.
 * @param {{to:string|string[], subject:string, text?:string, html?:string, replyTo?:string,
 *          attachments?:{name:string, content:string /* base64 *\/}[]}} msg
 */
async function sendMail({ to, subject, text, html, replyTo, attachments }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { ok: false, code: 'MAIL_NOT_CONFIGURED', error: 'Email is not configured on the server (BREVO_API_KEY missing).' };

  const recipients = (Array.isArray(to) ? to : String(to || '').split(/[,;]/))
    .map((e) => String(e).trim()).filter(Boolean);
  const invalid = recipients.filter((e) => !isEmail(e));
  if (recipients.length === 0) return { ok: false, code: 'NO_RECIPIENT', error: 'No recipient email address.' };
  if (invalid.length) return { ok: false, code: 'BAD_RECIPIENT', error: `Invalid email address: ${invalid.join(', ')}` };
  if (!subject || !(text || html)) return { ok: false, code: 'EMPTY_MESSAGE', error: 'Subject and message are required.' };

  const fromEmail = process.env.MAIL_FROM_EMAIL || 'inlanduniform@gmail.com';
  const fromName = process.env.MAIL_FROM_NAME || 'Inland Uniform';
  const payload = {
    sender: { email: fromEmail, name: fromName },
    to: recipients.map((email) => ({ email })),
    replyTo: { email: replyTo && isEmail(replyTo) ? replyTo : (process.env.MAIL_REPLY_TO || fromEmail) },
    subject: String(subject).slice(0, 250),
    htmlContent: html || textToHtml(text),
    ...(text ? { textContent: text } : {}),
    ...(attachments && attachments.length ? { attachment: attachments } : {}),
  };

  try {
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[mailer] Brevo rejected the email:', res.status, data);
      return { ok: false, code: data.code || `HTTP_${res.status}`, error: data.message || `Email provider error (${res.status})` };
    }
    return { ok: true, messageId: data.messageId || null, to: recipients };
  } catch (err) {
    console.error('[mailer] Brevo request failed:', err.message);
    return { ok: false, code: 'NETWORK', error: 'Could not reach the email provider.' };
  }
}

/**
 * Branded email with a details table. rows: [label, value][] (falsy values are skipped).
 * Returns { html, text } so the plain-text part matches the HTML.
 */
function renderEmail({ greeting, intro = [], rows = [], button, outro = [], signature = [] }) {
  const brand = process.env.MAIL_FROM_NAME || 'Inland Uniform';
  const shown = rows.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');
  const para = (t) => `<p style="margin:0 0 12px;">${escapeHtml(t).replace(/\n/g, '<br>')}</p>`;
  const table = shown.length
    ? `<table role="presentation" style="width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:13px;">${shown.map(([k, v]) =>
        `<tr><td style="padding:8px 10px;border:1px solid #e4e4e7;background:#fafafa;color:#52525b;width:42%;">${escapeHtml(k)}</td>` +
        `<td style="padding:8px 10px;border:1px solid #e4e4e7;color:#18181b;font-weight:600;">${escapeHtml(v)}</td></tr>`).join('')}</table>`
    : '';
  const btn = button && button.url
    ? `<p style="margin:16px 0;"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#C82A2B;color:#ffffff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:8px;">${escapeHtml(button.label || 'Open')}</a></p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <div style="background:#C82A2B;color:#ffffff;padding:14px 24px;font-weight:700;font-size:15px;">${escapeHtml(brand)}</div>
    <div style="padding:24px;font-size:14px;line-height:1.6;color:#18181b;">
      ${greeting ? para(greeting) : ''}${intro.map(para).join('')}${table}${btn}${outro.map(para).join('')}
      ${signature.length ? `<p style="margin:16px 0 0;color:#52525b;">${signature.map(escapeHtml).join('<br>')}</p>` : ''}
    </div>
  </div></body></html>`;
  const text = [
    greeting, '', ...intro, '',
    ...shown.map(([k, v]) => `${k}: ${v}`), '',
    button && button.url ? `${button.label || 'Open'}: ${button.url}` : null, '',
    ...outro, '', ...signature,
  ].filter((l) => l !== null && l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { html, text };
}

const money = (v) => `Rs. ${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Customer portal login page, for credential emails
function portalLoginUrl(req) {
  const base = process.env.PORTAL_URL || process.env.FRONTEND_URL || (req && req.headers && req.headers.origin) || '';
  return base ? `${String(base).replace(/\/+$/, '')}/login` : null;
}

// Public base URL of this API, for links inside emails (Vercel sits behind a proxy)
function apiBaseUrl(req) {
  if (process.env.PUBLIC_API_URL) return process.env.PUBLIC_API_URL.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  return `${proto}://${req.get('host')}`;
}

/** Portal login details email. Never throws; returns the sendMail result. */
async function sendPortalCredentials({ req, to, customerName, username, password }) {
  const loginUrl = portalLoginUrl(req);
  const brand = process.env.MAIL_FROM_NAME || 'Inland Uniform';
  const { html, text } = renderEmail({
    greeting: `Dear ${customerName || 'Customer'},`,
    intro: [`Your customer portal account with ${brand} has been created. Use these details to sign in and track your quotations, orders and invoices.`],
    rows: [['Login URL', loginUrl], ['Username', username], ['Email', to], ['Password', password]],
    button: loginUrl ? { label: 'Sign in to the portal', url: loginUrl } : null,
    outro: ['Please keep these details private. Contact your account manager if you need the password reset.'],
    signature: ['Regards,', brand],
  });
  return sendMail({ to, subject: `Your ${brand} customer portal login`, html, text, replyTo: req?.user?.email });
}

module.exports = { sendMail, isEmail, textToHtml, escapeHtml, apiBaseUrl, renderEmail, money, portalLoginUrl, sendPortalCredentials };
