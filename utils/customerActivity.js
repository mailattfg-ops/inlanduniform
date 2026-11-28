const supabase = require('../config/supabase');

// No proforma invoice for 6 months -> back into Feeds; 1 year -> Inactive
const DORMANT_DAYS = 182;
const INACTIVE_DAYS = 365;
const PAGE = 1000; // PostgREST row cap per request

const daysSince = (date) => (Date.now() - new Date(date).getTime()) / (24 * 60 * 60 * 1000);

// null = never had proforma/invoice (prospect), so no marking
function customerActivity(lastProformaDate) {
    if (!lastProformaDate) return null;
    return daysSince(lastProformaDate) >= INACTIVE_DAYS ? 'Inactive' : 'Active';
}

function computeMonthGap(dateStr) {
    if (!dateStr) return { months: null, label: null };
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { months: null, label: null };
    const now = new Date();
    let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    if (now.getDate() < d.getDate()) months--;
    months = Math.max(0, months);

    let label;
    if (months === 0) label = '< 1 mo';
    else if (months === 1) label = '1 mo';
    else if (months < 12) label = `${months} mos`;
    else {
        const yrs = Math.floor(months / 12);
        const rem = months % 12;
        if (rem === 0) label = `${yrs} ${yrs === 1 ? 'yr' : 'yrs'}`;
        else label = `${yrs} ${yrs === 1 ? 'yr' : 'yrs'} ${rem} ${rem === 1 ? 'mo' : 'mos'}`;
    }
    return { months, label };
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

// { [organization_id]: 'YYYY-MM-DD' } calculated from quotations (Proforma Invoice),
// with fallback to invoices for legacy accounts.
async function getLastProformaDates() {
    const datesByOrg = {};

    try {
        // 1. Fetch latest quotations (Proforma Invoices) per organization
        const quotes = await fetchAll(() => supabase
            .from('quotations')
            .select('organization_id, created_at')
            .not('organization_id', 'is', null)
            .order('created_at', { ascending: false }));

        for (const q of quotes || []) {
            if (!q.organization_id || !q.created_at) continue;
            const d = q.created_at.slice(0, 10);
            if (!datesByOrg[q.organization_id] || d > datesByOrg[q.organization_id]) {
                datesByOrg[q.organization_id] = d;
            }
        }
    } catch (err) {
        console.warn('[customerActivity] quotations fetch error:', err.message);
    }

    try {
        // 2. Fetch invoice dates as fallback / check if more recent
        const invoiceRows = await fetchAll(() => supabase
            .from('organization_last_invoice')
            .select('organization_id, last_invoice_date')
            .order('organization_id', { ascending: true }));

        for (const inv of invoiceRows || []) {
            if (!inv.organization_id || !inv.last_invoice_date) continue;
            const d = inv.last_invoice_date.slice(0, 10);
            if (!datesByOrg[inv.organization_id] || d > datesByOrg[inv.organization_id]) {
                datesByOrg[inv.organization_id] = d;
            }
        }
    } catch (err) {
        console.warn('[customerActivity] organization_last_invoice fetch error:', err.message);
    }

    return datesByOrg;
}

// Backward-compatible alias
const getLastInvoiceDates = getLastProformaDates;

module.exports = {
    DORMANT_DAYS,
    INACTIVE_DAYS,
    daysSince,
    customerActivity,
    computeMonthGap,
    fetchAll,
    getLastProformaDates,
    getLastInvoiceDates
};
