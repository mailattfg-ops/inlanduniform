const supabase = require('../config/supabase');
const { toSafeInt } = require('../utils/sanitize');
const { sendMail, renderEmail, money } = require('../utils/mailer');

const DOC_TYPES = {
  tax_invoice: 'Tax Invoice',
  proforma_invoice: 'Proforma Invoice',
};
const MAX_PDF_BYTES = 4 * 1024 * 1024; // keeps the request under Vercel's 4.5 MB body limit

// POST /api/mail/document
// { doc_type, doc_no, to, subject?, message?, pdf_base64, filename?, organization_id?, entity_id?, amount?, due_date? }
// The browser renders the document it shows into a PDF; the server checks and attaches it.
exports.sendDocument = async (req, res) => {
  try {
    const { doc_type, doc_no, to, subject, message, pdf_base64, filename, organization_id, entity_id, amount, due_date } = req.body || {};
    const label = DOC_TYPES[doc_type];
    if (!label) return res.status(400).json({ error: 'Unsupported document type.' });
    if (!doc_no) return res.status(400).json({ error: 'Document number is required.' });

    const b64 = String(pdf_base64 || '').replace(/^data:application\/pdf;base64,/, '');
    if (!b64) return res.status(400).json({ error: 'The PDF is missing.' });
    const bytes = Buffer.from(b64, 'base64');
    if (bytes.length > MAX_PDF_BYTES) return res.status(413).json({ error: 'The PDF is too large to email (over 4 MB).' });
    if (bytes.subarray(0, 4).toString() !== '%PDF') return res.status(400).json({ error: 'The attachment is not a valid PDF.' });

    let org = null;
    if (organization_id) {
      const { data } = await supabase.from('organizations').select('name, contact_email, contact_person').eq('id', organization_id).maybeSingle();
      org = data;
    }
    const recipient = String(to || org?.contact_email || '').trim();
    const brand = process.env.MAIL_FROM_NAME || 'Inland Uniform';

    const { html, text } = renderEmail({
      greeting: `Dear ${org?.contact_person || org?.name || 'Customer'},`,
      intro: [message && String(message).trim() ? String(message).trim() : `Please find attached ${label} ${doc_no}.`],
      rows: [
        [`${label} No`, doc_no],
        ['Customer', org?.name],
        ['Amount', amount !== undefined && amount !== null && amount !== '' ? money(amount) : null],
        ['Due Date', due_date || null],
      ],
      outro: ['The document is attached to this email as a PDF.'],
      signature: ['Regards,', req.user?.fullName || 'Accounts Team', brand],
    });

    const safeName = String(filename || `${label.replace(/\s+/g, '_')}_${doc_no}`).replace(/[^\w.-]+/g, '_').replace(/(\.pdf)?$/i, '.pdf');
    const sent = await sendMail({
      to: recipient,
      subject: subject || `${label} ${doc_no} from ${brand}`,
      html, text,
      replyTo: req.user?.email,
      attachments: [{ name: safeName, content: b64 }],
    });
    if (!sent.ok) {
      const code = sent.code === 'MAIL_NOT_CONFIGURED' ? 503 : 400;
      const hint = sent.code === 'NO_RECIPIENT' ? ' Add a contact email to this customer, or type one in.' : '';
      return res.status(code).json({ error: sent.error + hint, code: sent.code });
    }

    try {
      await supabase.from('record_activity_logs').insert([{
        entity_type: doc_type === 'tax_invoice' ? 'Invoice' : 'ProformaInvoice',
        entity_id: entity_id ? String(entity_id) : String(doc_no),
        action: `${doc_type.toUpperCase()}_EMAILED`,
        performed_by: toSafeInt(req.user?.id),
        details: { doc_no, to: sent.to, message_id: sent.messageId, sent_by_name: req.user?.fullName || null, at: new Date().toISOString() },
      }]);
    } catch (logErr) {
      console.warn('[mail/document] activity log failed:', logErr.message);
    }

    res.json({ success: true, message: `${label} emailed to ${sent.to.join(', ')}`, to: sent.to, message_id: sent.messageId });
  } catch (err) {
    console.error('[mail/document]', err.message);
    res.status(500).json({ error: err.message });
  }
};
