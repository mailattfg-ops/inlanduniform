// In-app notifications (bell). Created server-side when an approval action happens.
// Never throws: a failed notification must not break the action that triggered it.
const supabase = require('../config/supabase');
const { fetchAll } = require('./customerActivity');

const ADMIN_ROLES = ['admin', 'super admin', 'superadmin'];
const DIRECTORY_TTL_MS = 60 * 1000;
const READ_RETENTION_DAYS = 90;
let directoryCache = { at: 0, users: [] };

/** Every staff login with its role, permissions and branch. Cached for a minute. */
async function loadDirectory() {
  if (Date.now() - directoryCache.at < DIRECTORY_TTL_MS) return directoryCache.users;
  const [profiles, employees, branchUsers, roles] = await Promise.all([
    fetchAll(() => supabase.from('user_profiles').select('id, email, user_types(name, permissions)').order('id')),
    fetchAll(() => supabase.from('employees').select('user_id, email, branch_id').order('id')),
    supabase.from('branch_users').select('id, role, branch_id, is_active').then(r => r.data || []),
    supabase.from('user_types').select('name, permissions').then(r => r.data || []),
  ]);
  const permsByRole = new Map(roles.map(r => [String(r.name || '').toLowerCase(), r.permissions || []]));
  const users = [];
  for (const p of profiles) {
    const emp = employees.find(e => e.user_id === p.id || (e.email && p.email && e.email.toLowerCase() === p.email.toLowerCase()));
    users.push({
      id: String(p.id),
      role: String(p.user_types?.name || ''),
      perms: Array.isArray(p.user_types?.permissions) ? p.user_types.permissions : [],
      branchId: emp?.branch_id ?? null,
    });
  }
  for (const b of branchUsers) {
    if (b.is_active === false) continue;
    const role = String(b.role || 'Branch Manager');
    users.push({ id: `branch_user_${b.id}`, role, perms: permsByRole.get(role.toLowerCase()) || [], branchId: b.branch_id ?? null });
  }
  directoryCache = { at: Date.now(), users };
  return users;
}

const isAdmin = (u) => ADMIN_ROLES.includes(u.role.toLowerCase()) || u.perms.includes('all');
const can = (u, p) => isAdmin(u) || u.perms.includes(p);
const isBranchManager = (u) => u.role.toLowerCase() === 'branch manager';

/** Branch Managers of a branch: may BM-approve (submit_quotations_ops / corporate_approver) and belong to it.
 *  No branch on the record, or nobody found: Admins. */
async function branchManagersOf(branchId) {
  const users = await loadDirectory();
  const bms = users.filter(u => !isAdmin(u) && u.branchId != null && String(u.branchId) === String(branchId) &&
    (isBranchManager(u) || u.perms.includes('submit_quotations_ops') || u.perms.includes('corporate_approver')));
  return (bms.length ? bms : users.filter(isAdmin)).map(u => u.id);
}

/** HQ approvers: the HQ staff given "approve_hq_deals" in Admin > Roles, plus Admins. */
async function hqApprovers() {
  const users = await loadDirectory();
  return users.filter(u => isAdmin(u) || u.perms.includes('approve_hq_deals')).map(u => u.id);
}

/** Ops approvers: dedicated Ops staff (approve_quotations_ops), HQ staff (approve_hq_deals), and Admins. */
async function opsApprovers() {
  const users = await loadDirectory();
  return users.filter(u => isAdmin(u) || u.perms.includes('approve_quotations_ops') || u.perms.includes('approve_hq_deals')).map(u => u.id);
}

/** Insert one notification per recipient (deduped, never to the actor). */
async function notify(req, { recipients, type, title, message, link, entityType, entityId }) {
  try {
    const actorId = req?.user?.id != null ? String(req.user.id) : null;
    const ids = [...new Set((recipients || []).filter(Boolean).map(String))].filter(id => id !== actorId);
    if (!ids.length) return 0;
    const rows = ids.map(recipient_id => ({
      recipient_id, type, title, message: message || null, link: link || null,
      entity_type: entityType || null, entity_id: entityId != null ? String(entityId) : null,
      actor_id: actorId, actor_name: req?.user?.fullName || req?.user?.full_name || req?.user?.email || null,
    }));
    const { error } = await supabase.from('notifications').insert(rows);
    if (error) { console.warn('[notify] insert failed:', error.message); return 0; }
    if (Math.random() < 0.05) cleanupOldRead();
    return rows.length;
  } catch (err) {
    console.warn('[notify] failed:', err.message);
    return 0;
  }
}

/** Delete read notifications older than 90 days (runs occasionally, in the background). */
function cleanupOldRead() {
  const cutoff = new Date(Date.now() - READ_RETENTION_DAYS * 86400000).toISOString();
  supabase.from('notifications').delete().not('read_at', 'is', null).lt('read_at', cutoff)
    .then(({ error }) => { if (error) console.warn('[notify] cleanup failed:', error.message); });
}

const rupees = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const quoteLink = (id) => `/marketing/quotations?id=${id}&action=view`;

/** The salesperson behind a quote: who created it, else who sent it to the BM. */
function quoteOwners(ms) {
  return [ms?.created_by_id, ms?.submitted_to_bm_by].filter(Boolean);
}

/**
 * Quote / deal events. Loads the quote fresh so it sees what the action just saved.
 * event: quote_submitted_bm | quote_bm_approved | quote_bm_returned | quote_customer_decision |
 *        deal_submitted_bm | deal_bm_approved | deal_submitted_hq | deal_hq_approved
 */
async function notifyQuoteEvent(req, quoteId, event, extra = {}) {
  try {
    const { data: q } = await supabase
      .from('quotations')
      .select('id, quotation_no, title, branch_id, final_quote_value, metrics_summary, organizations(name)')
      .eq('id', quoteId)
      .maybeSingle();
    if (!q) return 0;
    const ms = q.metrics_summary || {};
    const deal = ms.so_deal_meta || {};
    const who = req?.user?.fullName || 'Someone';
    const customer = q.organizations?.name || 'customer';
    const no = q.quotation_no || `#${q.id}`;
    const base = { entityType: 'quotation', entityId: q.id };

    switch (event) {
      case 'quote_submitted_bm':
        return notify(req, { ...base, type: event, link: quoteLink(q.id), recipients: await branchManagersOf(q.branch_id),
          title: `Quote ${no} needs your approval`, message: `${who} submitted the quote for ${customer} (${rupees(q.final_quote_value)}).` });
      case 'quote_bm_approved':
        return notify(req, { ...base, type: event, link: quoteLink(q.id), recipients: quoteOwners(ms),
          title: `Quote ${no} approved by BM`, message: `${who} approved the quote for ${customer}. Send it to Ops for approval next.` });
      case 'quote_submitted_ops':
        return notify(req, { ...base, type: event, link: '/marketing/operation-team', recipients: await opsApprovers(),
          title: `Quote ${no} needs Ops approval`, message: `${who} sent the quote for ${customer} (${rupees(q.final_quote_value)}).` });
      case 'quote_ops_approved':
        return notify(req, { ...base, type: event, link: quoteLink(q.id), recipients: quoteOwners(ms),
          title: `Quote ${no} approved by Ops`, message: `${who} approved it. You can now send it to ${customer}.` });
      case 'quote_ops_returned':
        return notify(req, { ...base, type: event, link: quoteLink(q.id), recipients: quoteOwners(ms),
          title: `Quote ${no} returned by Ops`, message: `${who}: ${extra.reason || ms.ops_return_reason || 'Changes requested.'}` });
      case 'quote_bm_returned':
        return notify(req, { ...base, type: event, link: quoteLink(q.id), recipients: quoteOwners(ms),
          title: `Quote ${no} returned for revision`, message: `${who}: ${extra.reason || ms.bm_rejection_reason || 'Changes requested.'}` });
      case 'quote_customer_decision': {
        const label = { approved: 'approved', rejected: 'rejected', held: 'put on hold', revision_requested: 'asked to revise' }[extra.decision] || extra.decision;
        return notify(req, { ...base, type: event, link: quoteLink(q.id), recipients: quoteOwners(ms),
          title: `Customer ${label} quote ${no}`, message: `${customer}: ${extra.remarks || ''}`.trim() });
      }
      case 'deal_submitted_bm':
        return notify(req, { ...base, type: event, link: '/customers/deals', recipients: await branchManagersOf(q.branch_id),
          title: `Deal ${no} needs your approval`, message: `${who} submitted the deal for ${customer} (${rupees(q.final_quote_value)}).` });
      case 'deal_bm_approved':
        return notify(req, { ...base, type: event, link: '/customers/deals', recipients: [deal.submitted_to_bm_by, ...quoteOwners(ms)],
          title: `Deal ${no} approved by BM`, message: `${who} approved the deal for ${customer}. Submit it to HQ next.` });
      case 'deal_submitted_hq':
        return notify(req, { ...base, type: event, link: '/customers/deals', recipients: await hqApprovers(),
          title: `Deal ${no} awaiting HQ approval`, message: `${who} submitted the deal for ${customer} (${rupees(q.final_quote_value)}).` });
      case 'deal_hq_approved':
        return notify(req, { ...base, type: event, link: '/customers/deals',
          recipients: [deal.submitted_to_corp_by, deal.submitted_to_bm_by, deal.bm_approved_by, ...quoteOwners(ms)],
          title: `Deal ${no} approved by HQ`, message: `${who} approved the deal for ${customer}. It is now a production order.` });
      default:
        return 0;
    }
  } catch (err) {
    console.warn('[notifyQuoteEvent]', event, err.message);
    return 0;
  }
}

/** Sales order events (Order Placement): order_submitted_hq | order_hq_decision ({ action, reason }) */
async function notifyOrderEvent(req, orderId, event, extra = {}) {
  try {
    const { data: o } = await supabase
      .from('orders')
      .select('id, order_no, quotation_id, quotations(id, quotation_no, metrics_summary, organizations(name))')
      .eq('id', orderId)
      .maybeSingle();
    if (!o) return 0;
    const q = o.quotations || {};
    const ms = q.metrics_summary || {};
    const deal = ms.so_deal_meta || {};
    const who = req?.user?.fullName || 'Someone';
    const customer = q.organizations?.name || 'customer';
    const base = { entityType: 'order', entityId: o.id, link: '/marketing/order-placement' };

    if (event === 'order_submitted_hq') {
      return notify(req, { ...base, type: event, recipients: await hqApprovers(),
        title: `Sales Order ${o.order_no} awaiting HQ review`, message: `${who} submitted the order for ${customer}.` });
    }
    if (event === 'order_hq_decision') {
      const verb = { Accept: 'accepted', Reject: 'rejected', Hold: 'put on hold' }[extra.action] || extra.action;
      return notify(req, { ...base, type: `order_hq_${String(extra.action || '').toLowerCase()}`,
        recipients: [deal.submitted_to_corp_by, deal.submitted_to_bm_by, deal.bm_approved_by, ...quoteOwners(ms)],
        title: `HQ ${verb} Sales Order ${o.order_no}`, message: `${who}${extra.reason ? `: ${extra.reason}` : ''} (${customer})` });
    }
    return 0;
  } catch (err) {
    console.warn('[notifyOrderEvent]', event, err.message);
    return 0;
  }
}

module.exports = { notify, notifyQuoteEvent, notifyOrderEvent, branchManagersOf, hqApprovers, opsApprovers, loadDirectory };
