// Quotation approval workflow after the BM step:
//   BM Approved --Send to Ops (salesperson)--> Pending Ops Approval
//   Pending Ops Approval --Ops Approve--> Ops Approved   |  --Ops Return (note)--> Draft (Returned by Ops)
//   Ops Approved --Send to Customer (email / WhatsApp / handed over)--> Pending Customer Approval
// A not-approved draft can be shared with the customer at any earlier status (watermarked, status unchanged).
const supabase = require('../config/supabase');
const { toSafeInt } = require('../utils/sanitize');
const { notifyQuoteEvent } = require('../utils/notify');
const { canSeeQuote } = require('../utils/ownScope');

const ADMIN_ROLES = ['admin', 'super admin', 'superadmin', 'system administrator', 'system admin'];
const perms = (u) => (Array.isArray(u?.permissions) ? u.permissions : []);
const isAdmin = (u) => ADMIN_ROLES.includes(String(u?.role || '').toLowerCase()) || perms(u).includes('all');

/** Ops approval: dedicated Ops staff (approve_quotations_ops), HQ staff (approve_hq_deals) and Admins. */
function canOpsApprove(user) {
  return isAdmin(user) || perms(user).includes('approve_quotations_ops') || perms(user).includes('approve_hq_deals');
}

// Statuses before the quote is cleared for the customer (shared copies carry a NOT APPROVED watermark)
const PRE_APPROVAL_STATUSES = ['Draft', 'Pending Branch Approval', 'BM Approved', 'Pending Ops Approval'];
const FINAL_SEND_STATUSES = ['Ops Approved', 'Pending Customer Approval'];

async function loadQuote(id) {
  const { data, error } = await supabase
    .from('quotations')
    .select('id, quotation_no, status, organization_id, branch_id, metrics_summary')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function audit(req, quote, action, details = {}) {
  try {
    await supabase.from('record_activity_logs').insert([{
      entity_type: 'Quotation',
      entity_id: quote.id,
      action,
      performed_by: toSafeInt(req.user?.id),
      performed_by_name: req.user?.fullName || req.user?.email || null,
      details: { quotation_no: quote.quotation_no, ...details },
      created_at: new Date().toISOString(),
    }]);
  } catch (e) {
    console.warn(`[quoteWorkflow] audit ${action} failed:`, e.message);
  }
}

async function setStatus(quote, status, metricsPatch) {
  const { data, error } = await supabase
    .from('quotations')
    .update({ status, metrics_summary: { ...(quote.metrics_summary || {}), ...metricsPatch }, updated_at: new Date().toISOString() })
    .eq('id', quote.id)
    .select('id, quotation_no, status, metrics_summary')
    .single();
  if (error) throw error;
  return data;
}

const who = (req) => ({ id: req.user?.id || null, name: req.user?.fullName || req.user?.email || null });

// PUT /quotations/:id/submit-to-ops  (salesperson, after BM approval)
exports.submitToOps = async (req, res) => {
  try {
    const quote = await loadQuote(req.params.id);
    if (!quote) return res.status(404).json({ error: 'Quotation not found.' });
    if (!(await canSeeQuote(req, quote))) return res.status(403).json({ error: 'Access Denied: this quotation is not yours.' });
    if (quote.status !== 'BM Approved') {
      return res.status(400).json({ error: `Only BM-approved quotations can be sent to Ops (status: ${quote.status || 'Draft'}).` });
    }
    const now = new Date().toISOString();
    const by = who(req);
    const updated = await setStatus(quote, 'Pending Ops Approval', {
      submitted_to_ops: true, submitted_to_ops_at: now, submitted_to_ops_by: by.id, submitted_to_ops_by_name: by.name,
    });
    await audit(req, quote, 'SUBMIT_TO_OPS_REVIEW', { status: 'Pending Ops Approval' });
    await notifyQuoteEvent(req, quote.id, 'quote_submitted_ops');
    res.json({ success: true, message: 'Sent to Ops for approval.', quotation: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /quotations/:id/ops-approve  { notes?, pdf_html? }
exports.opsApprove = async (req, res) => {
  try {
    if (!canOpsApprove(req.user)) return res.status(403).json({ error: 'Access Denied: Ops approval is restricted to Ops approvers.' });
    const quote = await loadQuote(req.params.id);
    if (!quote) return res.status(404).json({ error: 'Quotation not found.' });
    if (quote.status !== 'Pending Ops Approval') {
      return res.status(400).json({ error: `This quotation is not waiting for Ops approval (status: ${quote.status || 'Draft'}).` });
    }
    const now = new Date().toISOString();
    const by = who(req);
    const { notes, pdf_html } = req.body || {};
    const updated = await setStatus(quote, 'Ops Approved', {
      ops_approved: true, ops_approved_at: now, ops_approved_by: by.id, ops_approved_by_name: by.name,
      ops_notes: notes ? String(notes).trim() : null, needs_revision: false, returned_by: null,
    });
    if (pdf_html && typeof pdf_html === 'string') {
      await supabase.from('quotations').update({ pdf_html }).eq('id', quote.id);
    }
    await audit(req, quote, 'OPS_APPROVED', { status: 'Ops Approved', notes: notes || null });
    await notifyQuoteEvent(req, quote.id, 'quote_ops_approved');
    res.json({ success: true, message: 'Ops approved. The salesperson can now send it to the customer.', quotation: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /quotations/:id/ops-return  { reason }
exports.opsReturn = async (req, res) => {
  try {
    if (!canOpsApprove(req.user)) return res.status(403).json({ error: 'Access Denied: Ops review is restricted to Ops approvers.' });
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'A reason is required to return the quotation.' });
    const quote = await loadQuote(req.params.id);
    if (!quote) return res.status(404).json({ error: 'Quotation not found.' });
    if (quote.status !== 'Pending Ops Approval') {
      return res.status(400).json({ error: `This quotation is not waiting for Ops approval (status: ${quote.status || 'Draft'}).` });
    }
    const now = new Date().toISOString();
    const by = who(req);
    // Back to Draft for edits; it goes through BM again after changes
    const updated = await setStatus(quote, 'Draft', {
      needs_revision: true, returned_by: 'ops', ops_return_reason: reason,
      ops_returned_at: now, ops_returned_by: by.id, ops_returned_by_name: by.name,
      submitted_to_ops: false, submitted_to_bm: false, bm_approved: false,
    });
    await audit(req, quote, 'OPS_RETURNED', { status: 'Draft', reason });
    await notifyQuoteEvent(req, quote.id, 'quote_ops_returned', { reason });
    res.json({ success: true, message: 'Returned to the salesperson for revision.', quotation: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /quotations/:id/mark-sent  { channel: 'whatsapp' | 'manual', draft?: boolean, note? }
// Final send (Ops Approved) -> Pending Customer Approval. Draft share: logged only, status unchanged.
exports.markSent = async (req, res) => {
  try {
    const { channel, draft, note } = req.body || {};
    if (!['whatsapp', 'manual'].includes(channel)) return res.status(400).json({ error: 'channel must be whatsapp or manual.' });
    const quote = await loadQuote(req.params.id);
    if (!quote) return res.status(404).json({ error: 'Quotation not found.' });
    if (!(await canSeeQuote(req, quote))) return res.status(403).json({ error: 'Access Denied: this quotation is not yours.' });

    const now = new Date().toISOString();
    const by = who(req);
    const ms = quote.metrics_summary || {};
    const entry = { type: draft ? 'draft' : 'proposal', channel, note: note || null, sent_at: now, sent_by: by.id, sent_by_name: by.name };

    if (draft) {
      if (!PRE_APPROVAL_STATUSES.includes(quote.status)) {
        return res.status(400).json({ error: 'This quotation is already approved; use Send to Customer instead.' });
      }
      const updated = await setStatus(quote, quote.status, { draft_shares: [...(ms.draft_shares || []), entry] });
      await audit(req, quote, 'DRAFT_SHARED_WITH_CUSTOMER', { channel });
      return res.json({ success: true, message: 'Draft share recorded (not approved).', quotation: updated });
    }

    if (!FINAL_SEND_STATUSES.includes(quote.status)) {
      return res.status(400).json({ error: `Only Ops-approved quotations can be sent to the customer (status: ${quote.status || 'Draft'}).` });
    }
    const nextStatus = quote.status === 'Ops Approved' ? 'Pending Customer Approval' : quote.status;
    const updated = await setStatus(quote, nextStatus, {
      sent_to_customer: true, sent_to_customer_at: ms.sent_to_customer_at || now, sent_to_customer_by_name: ms.sent_to_customer_by_name || by.name,
      customer_sends: [...(ms.customer_sends || []), entry],
    });
    await audit(req, quote, 'SENT_TO_CUSTOMER', { channel, status: nextStatus });
    res.json({ success: true, message: channel === 'manual' ? 'Marked as handed to the customer.' : 'Marked as sent on WhatsApp.', quotation: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports.canOpsApprove = canOpsApprove;
module.exports.PRE_APPROVAL_STATUSES = PRE_APPROVAL_STATUSES;
module.exports.FINAL_SEND_STATUSES = FINAL_SEND_STATUSES;
