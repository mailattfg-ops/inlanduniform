// "Own records only" scope for salespeople (Marketing / Sales Executive).
// They see only: leads assigned to them, customers they are relationship manager of,
// quotes/deals they created or submitted (or for their customers), and orders/invoices/payments under those.
// Everyone else (Admin, Branch Manager, managers, HQ) keeps their existing branch/global view.
const supabase = require('../config/supabase');

const ADMIN_ROLES = ['admin', 'super admin', 'superadmin', 'system administrator', 'system admin'];

// Controlled from Admin > Roles: tick "View Own Records Only" on a role (e.g. Marketing Executive)
function isOwnScopeUser(user) {
  if (!user) return false;
  const role = String(user.role || '');
  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  if (ADMIN_ROLES.includes(role.toLowerCase()) || perms.includes('all')) return false;
  return perms.includes('view_own_records_only');
}

const toNum = (v) => (v !== null && v !== undefined && /^\d+$/.test(String(v)) ? Number(v) : null);

/**
 * null = not restricted. Otherwise { userId, empId, orgIds:Set, quoteIds:Set }.
 * Resolved once per request and cached on req.
 */
async function getOwnScope(req) {
  if (!isOwnScopeUser(req.user)) return null;
  if (req._ownScope) return req._ownScope;

  const userId = req.user?.id != null ? String(req.user.id) : null;
  const empId = toNum(req.user?.employeeRecordId);

  // Customers: relationship manager = me
  let orgIds = [];
  if (empId) {
    const { data } = await supabase.from('organizations').select('id').eq('relationship_manager_id', empId);
    orgIds = (data || []).map(o => o.id);
  }

  // Quotes/deals: I created or submitted them, or they are for my customers
  const ors = [];
  if (userId) {
    ors.push(`metrics_summary->>created_by_id.eq.${userId}`);
    ors.push(`metrics_summary->>submitted_to_bm_by.eq.${userId}`);
  }
  if (orgIds.length) ors.push(`organization_id.in.(${orgIds.join(',')})`);
  let quoteIds = [];
  if (ors.length) {
    const { data, error } = await supabase.from('quotations').select('id').or(ors.join(','));
    if (error) console.warn('[ownScope] quote lookup failed:', error.message);
    quoteIds = (data || []).map(q => q.id);
  }

  req._ownScope = { userId, empId, orgIds: new Set(orgIds.map(String)), quoteIds: new Set(quoteIds.map(String)) };
  return req._ownScope;
}

const ids = (set) => [...set];

/** Single-record checks for detail endpoints (true = allowed). */
async function canSeeQuote(req, quote) {
  const s = await getOwnScope(req);
  if (!s) return true;
  return s.quoteIds.has(String(quote.id)) || s.orgIds.has(String(quote.organization_id));
}
async function canSeeOrganization(req, orgId) {
  const s = await getOwnScope(req);
  if (!s) return true;
  return s.orgIds.has(String(orgId));
}
async function canSeeLead(req, lead) {
  const s = await getOwnScope(req);
  if (!s) return true;
  return s.empId != null && String(lead.assigned_staff_id) === String(s.empId);
}

/** HQ approval of deals / sales orders: only HQ staff given "approve_hq_deals" in Admin > Roles (and Admins). */
function canHqApprove(user) {
  if (!user) return false;
  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  return ADMIN_ROLES.includes(String(user.role || '').toLowerCase()) || perms.includes('all') || perms.includes('approve_hq_deals');
}

module.exports = { isOwnScopeUser, getOwnScope, ids, canSeeQuote, canSeeOrganization, canSeeLead, canHqApprove };
