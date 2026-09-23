const supabase = require('../config/supabase');
const crypto = require('crypto');
const { logAction } = require('../utils/logger');

const generatePassword = () => crypto.randomBytes(4).toString('hex').toUpperCase();

// Helper to generate next customer code (CN001, CN002, etc.)
async function generateNextCustomerCodeLocal() {
  try {
      const { data, error } = await supabase
          .from('organizations')
          .select('customer_code')
          .not('customer_code', 'is', null);

      if (error) {
          console.error('Error fetching customer codes:', error.message);
          return 'CN001';
      }

      let maxNum = 0;
      if (data && data.length > 0) {
          data.forEach(item => {
              const c = item.customer_code;
              if (c && c.startsWith('CN')) {
                  const numPart = c.substring(2);
                  const num = parseInt(numPart, 10);
                  if (!isNaN(num) && num > maxNum) {
                      maxNum = num;
                  }
              }
          });
      }

      const nextNum = maxNum + 1;
      const padded = String(nextNum).padStart(3, '0');
      return `CN${padded}`;
  } catch (err) {
      console.error('Exception in generateNextCustomerCodeLocal:', err.message);
      return 'CN001';
  }
}

// --- Organizations Management ---

exports.getOrganizations = async (req, res) => {
  try {
    const { industryId } = req.query;
    const userRole = req.user?.role || '';
    const userBranchId = req.user?.branchId;
    const isAdmin = userRole === 'Admin' || userRole === 'Super Admin' || userRole === 'SuperAdmin';

    let query = supabase
      .from('organizations')
      .select('*, industries(name), relationship_manager:relationship_manager_id(id, full_name, employee_id), assigned_operator:assigned_operator_id(id, full_name, employee_id)')
      .order('created_at', { ascending: false });

    const roleLower = (userRole || '').toLowerCase();
    const userOrgId = req.user?.organizationId;

    if (roleLower === 'organisation' || roleLower === 'organization' || roleLower === 'school' || roleLower === 'entity' || roleLower === 'student' || roleLower === 'member' || userOrgId) {
      if (userOrgId) {
        query = query.eq('id', userOrgId);
      } else {
        return res.json([]);
      }
    } else if (!isAdmin && userBranchId) {
      query = query.eq('branch_id', userBranchId);
    }

    if (industryId) {
      query = query.eq('industry_id', industryId);
    }

    const { data, error } = await query;

    if (error) throw error;
    console.log(`[DB] Fetched ${data.length} organizations`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createOrganization = async (req, res) => {
  const { name, address, username, password, industry_id, relationship_manager_id, customer_code } = req.body;
  
  try {
    // 1. Validate credentials if provided
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required for organization registration.' });
    }

    // 2. Create User Profile first
    const ORG_ROLE_ID = '3e8ef077-f264-44b3-b37e-74e98fb6c0e7'; 
    const { data: userData, error: userError } = await supabase
      .from('user_profiles')
      .insert([{
        full_name: name,
        username: username,
        email: username,
        password: password,
        user_type_id: ORG_ROLE_ID
      }])
      .select()
      .single();

    if (userError) throw userError;

    // Generate next customer code if not provided
    let finalCustomerCode = customer_code;
    if (!finalCustomerCode || finalCustomerCode.trim() === '') {
      finalCustomerCode = await generateNextCustomerCodeLocal();
    }

    // 3. Create Organization and link to user
    const { data, error } = await supabase
      .from('organizations')
      .insert([{ 
        name, 
        address, 
        user_id: userData.id,
        industry_id: industry_id || 1, // Default to 1 (School) for backward compatibility
        customer_code: finalCustomerCode,
        relationship_manager_id: relationship_manager_id || null
      }])
      .select()
      .single();

    if (error) {
      await supabase.from('user_profiles').delete().eq('id', userData.id);
      throw error;
    }

    // 4. Log the action
    await logAction(req.user.id, 'CREATE', 'organization', data.id, { name: data.name });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateOrganization = async (req, res) => {
    const { id } = req.params;
    const { name, address, industry_id, relationship_manager_id, assigned_operator_id, customer_code } = req.body;
    try {
      const { data, error } = await supabase
        .from('organizations')
        .update({ name, address, industry_id, relationship_manager_id, assigned_operator_id, customer_code })
        .eq('id', id)
        .select()
        .single();
  
      if (error) throw error;

      // 2. Log the action
      await logAction(req.user.id, 'UPDATE', 'organization', id, { updated_name: name });

      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
};

exports.getOrganizationDetails = async (req, res) => {
  const { id } = req.params;
  const userOrgId = req.user?.organizationId;
  if (userOrgId && String(userOrgId) !== String(id)) {
    return res.status(403).json({ error: "Access Denied: You cannot view another organization's details" });
  }
  try {
    // 1. Get Departments
    const { data: departments } = await supabase
      .from('departments')
      .select('*')
      .eq('organization_id', id);

    const enrichedDepartments = (departments || []).map(d => ({
      ...d,
      division: d.section
    }));

    // 2. Get Members and Measurement Status
    const { data: members } = await supabase
      .from('registry_members')
      .select('id')
      .eq('organization_id', id);

    let completed = 0;
    let pending = 0;

    if (members && members.length > 0) {
       const memberIds = members.map(m => m.id);
       const { data: measurements } = await supabase
         .from('measurements')
         .select('member_id, status')
         .in('member_id', memberIds);
       
       const measuredMemberIds = new Set();
       if (measurements) {
         measurements.forEach(m => {
           if (m.member_id) {
             measuredMemberIds.add(String(m.member_id));
           }
         });
       }

       completed = measuredMemberIds.size;
       pending = Math.max(0, members.length - completed);
    }

    // 3. Get Orders
    const { data: orders } = await supabase
      .from('orders')
      .select('*, quotations!inner(id, quotation_no, title, final_quote_value, organization_id)')
      .eq('quotations.organization_id', id);

    res.json({
      success: true,
      departments: enrichedDepartments,
      measurements: {
        total: members ? members.length : 0,
        completed,
        pending
      },
      orders: orders || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAssignedStaff = async (req, res) => {
  const { id } = req.params;
  const userOrgId = req.user?.organizationId;
  if (userOrgId && String(userOrgId) !== String(id)) {
    return res.status(403).json({ error: "Access Denied: You cannot view another organization's assigned staff" });
  }
  try {
    const { data, error } = await supabase
      .from('organization_staff')
      .select(`
        id,
        employee_id,
        assigned_at,
        employees (
          full_name,
          employee_id,
          department
        )
      `)
      .eq('organization_id', id);

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.assignStaff = async (req, res) => {
  const { id } = req.params;
  const { employee_ids } = req.body; // Array of employee IDs
  
  try {
    if (!Array.isArray(employee_ids)) {
      return res.status(400).json({ error: 'employee_ids must be an array' });
    }

    // Prepare inserts
    const inserts = employee_ids.map(empId => ({
      organization_id: id,
      employee_id: empId
    }));

    // First delete existing assignments for these employees in this org to avoid unique constraint errors?
    // Actually, it's better to just delete all current assignments and re-insert, or handle it properly.
    // We will do a full sync: delete all existing, insert new ones.
    const { error: deleteError } = await supabase
      .from('organization_staff')
      .delete()
      .eq('organization_id', id);
      
    if (deleteError) throw deleteError;

    if (inserts.length > 0) {
       const { data, error } = await supabase
         .from('organization_staff')
         .insert(inserts)
         .select();
       if (error) throw error;
    }

    res.json({ success: true, message: 'Staff assignments updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteOrganization = async (req, res) => {
    const { id } = req.params;
    try {
      const { data: org } = await supabase
        .from('organizations')
        .select('user_id')
        .eq('id', id)
        .single();

      const { error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', id);
  
      if (error) throw error;

      if (org?.user_id) {
        await supabase.from('user_profiles').delete().eq('id', org.user_id);
      }

      // 4. Log the action
      await logAction(req.user.id, 'DELETE', 'organization', id, { org_id: id });

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
};

exports.resetPassword = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: org } = await supabase
        .from('organizations')
        .select('user_id, user_profiles(username, email)')
        .eq('id', id)
        .single();
        
    if (!org?.user_id) throw new Error('Organization has no login account');

    const newPassword = generatePassword();
    await supabase.from('user_profiles').update({ password: newPassword }).eq('id', org.user_id);

    res.json({ 
        success: true, 
        newPassword,
        username: org.user_profiles?.username || org.user_profiles?.email 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Phase 1 Option B: Customer Account Ledger Statement
exports.getOrganizationLedger = async (req, res) => {
  const { id } = req.params;
  const userOrgId = req.user?.organizationId;
  const userRole = (req.user?.role || '').toLowerCase();

  if (req.user?.memberId || ['entity', 'student', 'member'].includes(userRole)) {
    return res.status(403).json({ error: "Access Denied: Individual members cannot view organization financial ledgers" });
  }

  if (userOrgId && String(userOrgId) !== String(id)) {
    return res.status(403).json({ error: "Access Denied: You cannot view another organization's ledger" });
  }
  try {
    // 1. Fetch organization master details
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .select('id, name, customer_code, address, created_at, industries(name)')
      .eq('id', id)
      .single();

    if (orgErr || !org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // 2. Fetch all quotations for this organization
    const { data: quotations } = await supabase
      .from('quotations')
      .select('id, quotation_no, title, final_quote_value, paid_amount, status, created_at')
      .eq('organization_id', id);

    const quotationIds = (quotations || []).map(q => q.id);

    // 3. Fetch all orders for this organization
    let orders = [];
    if (quotationIds.length > 0) {
      const { data: ordersData } = await supabase
        .from('orders')
        .select('id, quotation_id, order_no, status, created_at')
        .in('quotation_id', quotationIds);
      orders = ordersData || [];
    }
    const orderIds = orders.map(o => o.id);

    // 4. Fetch all invoices for these orders or quotations or matching customer name
    const invMap = new Map();
    if (quotationIds.length > 0) {
      const { data: qInvoices } = await supabase
        .from('invoices')
        .select('id, invoice_no, order_id, quotation_id, total_amount, paid_amount, payment_status, is_tax_inclusive, created_at, notes')
        .in('quotation_id', quotationIds);
      (qInvoices || []).forEach(i => invMap.set(i.id, i));
    }
    if (orderIds.length > 0) {
      const { data: oInvoices } = await supabase
        .from('invoices')
        .select('id, invoice_no, order_id, quotation_id, total_amount, paid_amount, payment_status, is_tax_inclusive, created_at, notes')
        .in('order_id', orderIds);
      (oInvoices || []).forEach(i => invMap.set(i.id, i));
    }
    const { data: nameInvoices } = await supabase
      .from('invoices')
      .select('id, invoice_no, order_id, quotation_id, total_amount, paid_amount, payment_status, is_tax_inclusive, created_at, notes')
      .ilike('customer_name', org.name);
    (nameInvoices || []).forEach(i => invMap.set(i.id, i));

    const invoices = Array.from(invMap.values());

    // 5. Fetch all payments for these quotations
    let payments = [];
    if (quotationIds.length > 0) {
      const { data: payData } = await supabase
        .from('payments')
        .select('id, quotation_id, amount, payment_method, reference_no, notes, paid_at, created_at')
        .in('quotation_id', quotationIds);
      payments = payData || [];
    }

    // 6. Build combined chronological ledger transactions
    const rawTransactions = [];

    // Map Invoices as Debits (amount charged)
    invoices.forEach(inv => {
      const amount = parseFloat(inv.total_amount || 0);
      const linkedOrder = orders.find(o => o.id === inv.order_id);
      const linkedQuote = (quotations || []).find(q => q.id === inv.quotation_id);
      const orderRef = linkedOrder?.order_no || linkedQuote?.quotation_no || 'Direct';

      rawTransactions.push({
        id: `INV-${inv.id}`,
        raw_id: inv.id,
        date: inv.created_at,
        type: 'INVOICE',
        reference_no: inv.invoice_no,
        description: `Tax Invoice for ${orderRef}`,
        order_ref: orderRef,
        debit: amount,
        credit: 0,
        status: inv.payment_status || 'Unpaid',
        payment_mode: null,
        notes: inv.notes
      });
    });

    // Valid confirmed order statuses eligible for debiting the customer ledger
    const CONFIRMED_ORDER_STATUSES = [
      'Corporate Accepted',
      'Placed',
      'In Production',
      'Shipped',
      'Delivered',
      'Completed',
      'Confirmed'
    ];

    // Map Orders as Debits ONLY if confirmed and no formal tax invoice has been generated for them yet
    const invoicedOrderIds = new Set(invoices.filter(i => i.order_id).map(i => i.order_id));
    const invoicedQuotationIds = new Set(invoices.filter(i => i.quotation_id).map(i => i.quotation_id));

    orders.forEach(order => {
      const isConfirmed = CONFIRMED_ORDER_STATUSES.includes(order.status);
      if (isConfirmed && !invoicedOrderIds.has(order.id) && !invoicedQuotationIds.has(order.quotation_id)) {
        const linkedQuote = (quotations || []).find(q => q.id === order.quotation_id);
        const orderAmount = parseFloat(linkedQuote?.final_quote_value || 0);
        if (orderAmount > 0) {
          rawTransactions.push({
            id: `ORD-${order.id}`,
            raw_id: order.id,
            date: order.created_at,
            type: 'ORDER',
            reference_no: order.order_no,
            description: `Sales Order (${order.status}): ${linkedQuote?.title || linkedQuote?.quotation_no || order.order_no}`,
            order_ref: order.order_no,
            debit: orderAmount,
            credit: 0,
            status: order.status || 'Confirmed',
            payment_mode: null,
            notes: order.order_notes
          });
        }
      }
    });

    // In case an organization has an approved quotation with charges but no order yet
    const orderedQuotationIds = new Set(orders.map(o => o.quotation_id));
    (quotations || []).forEach(quote => {
      if (!invoicedQuotationIds.has(quote.id) && !orderedQuotationIds.has(quote.id) && (quote.status === 'Approved' || quote.status === 'Accepted')) {
        const quoteAmount = parseFloat(quote.final_quote_value || 0);
        if (quoteAmount > 0) {
          rawTransactions.push({
            id: `QT-${quote.id}`,
            raw_id: quote.id,
            date: quote.created_at,
            type: 'ORDER',
            reference_no: quote.quotation_no,
            description: `Approved Contract: ${quote.title || quote.quotation_no}`,
            order_ref: quote.quotation_no,
            debit: quoteAmount,
            credit: 0,
            status: quote.status,
            payment_mode: null,
            notes: ''
          });
        }
      }
    });

    // Map Payments as Credits (amount received)
    payments.forEach(pay => {
      const amount = parseFloat(pay.amount || 0);
      const linkedQuote = (quotations || []).find(q => q.id === pay.quotation_id);
      const linkedOrder = orders.find(o => o.quotation_id === pay.quotation_id);
      const orderRef = linkedOrder?.order_no || linkedQuote?.quotation_no || 'Quotation Deposit';

      rawTransactions.push({
        id: `PAY-${pay.id}`,
        raw_id: pay.id,
        date: pay.paid_at || pay.created_at,
        type: 'PAYMENT',
        reference_no: pay.reference_no || `REC-${pay.id}`,
        description: `Payment Received (${pay.payment_method || 'Bank/Cash'}) for ${orderRef}`,
        order_ref: orderRef,
        debit: 0,
        credit: amount,
        status: 'Received',
        payment_mode: pay.payment_method,
        notes: pay.notes
      });
    });

    // Sort transactions chronologically (oldest to newest)
    rawTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate running balance
    let currentBalance = 0;
    const transactions = rawTransactions.map(tx => {
      currentBalance = currentBalance + tx.debit - tx.credit;
      return {
        ...tx,
        running_balance: Math.round(currentBalance * 100) / 100
      };
    });

    // 7. Calculate summary totals
    const totalInvoiced = rawTransactions.reduce((sum, tx) => sum + tx.debit, 0);
    const totalPaid = rawTransactions.reduce((sum, tx) => sum + tx.credit, 0);
    const outstandingBalance = Math.round((totalInvoiced - totalPaid) * 100) / 100;

    let settlementStatus = 'Settled';
    if (outstandingBalance > 0) {
      settlementStatus = totalPaid > 0 ? 'Partially Paid' : 'Unpaid';
    } else if (outstandingBalance < 0) {
      settlementStatus = 'Credit Balance';
    }

    res.json({
      success: true,
      organization: {
        id: org.id,
        name: org.name,
        customer_code: org.customer_code,
        address: org.address,
        phone: null,
        email: null,
        industry: org.industries?.name || 'General',
        created_at: org.created_at
      },
      summary: {
        total_invoiced: Math.round(totalInvoiced * 100) / 100,
        total_paid: Math.round(totalPaid * 100) / 100,
        outstanding_balance: outstandingBalance,
        settlement_status: settlementStatus,
        total_orders: orders.filter(o => CONFIRMED_ORDER_STATUSES.includes(o.status)).length,
        total_invoices: invoices.length,
        total_payments: payments.length
      },
      transactions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

