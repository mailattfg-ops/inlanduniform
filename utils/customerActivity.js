const supabase = require('../config/supabase');

// No invoice for 6 months -> back into Feeds; 1 year -> Inactive
const DORMANT_DAYS = 182;
const INACTIVE_DAYS = 365;
const PAGE = 1000; // PostgREST row cap per request

const daysSince = (date) => (Date.now() - new Date(date).getTime()) / (24 * 60 * 60 * 1000);

// null = never invoiced (prospect), so no marking
function customerActivity(lastInvoiceDate) {
    if (!lastInvoiceDate) return null;
    return daysSince(lastInvoiceDate) >= INACTIVE_DAYS ? 'Inactive' : 'Active';
}

async function fetchAll(buildQuery) {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await buildQuery().range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < PAGE) return rows;
    }
}

// { [organization_id]: 'YYYY-MM-DD' } from the organization_last_invoice view
async function getLastInvoiceDates() {
    const rows = await fetchAll(() => supabase
        .from('organization_last_invoice')
        .select('organization_id, last_invoice_date')
        .order('organization_id', { ascending: true }));
    return Object.fromEntries(rows.map(r => [r.organization_id, r.last_invoice_date]));
}

module.exports = { DORMANT_DAYS, INACTIVE_DAYS, daysSince, customerActivity, fetchAll, getLastInvoiceDates };
