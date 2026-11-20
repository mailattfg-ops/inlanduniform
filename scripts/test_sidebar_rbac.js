// Test sidebar RBAC logic against all system roles
const modules = [
  {
    label: 'Dashboard', href: '/dashboard',
    subsections: []
  },
  {
    label: 'Customer & Lead Management', href: '/organizations/registry',
    subsections: [
      { label: 'Leads Registry', href: '/organizations/leads' },
      { label: 'Organization', href: '/organizations/registry' },
    ]
  },
  {
    label: 'Measurements', href: '/measurements/entry',
    subsections: [
      { label: 'Record Entry', href: '/measurements/entry' },
      { label: 'History', href: '/measurements/history' },
      { label: 'Industry Templates', href: '/measurements/templates' },
      { label: 'Fitting Tokens', href: '/measurements/tokens' }
    ]
  },
  {
    label: 'Admin Controls', href: '/admin/settings',
    subsections: [
      { label: 'Industry Sectors', href: '/admin/industries' },
      { label: 'Measurement Setup', href: '/admin/measures' },
      { label: 'Measurements Approvals', href: '/admin/approvals/measurements' },
      { label: 'Audit Logs', href: '/admin/audit' },
      { label: 'Staff Management', href: '/admin/employees' },
      { label: 'Company Profile & Bank', href: '/admin/company' },
      { label: 'User Roles', href: '/admin/roles' },
      { label: 'US Size Charts', href: '/admin/size-charts' },
      { label: 'Dress Prefixes', href: '/admin/dress-prefixes' },
      { label: 'Art Number Hub', href: '/admin/art-number-hub' },
      { label: 'Vendors Manager', href: '/admin/vendors' }
    ]
  },
  {
    label: 'Product Management', href: '/admin/products',
    subsections: [
      { label: 'Product Registry', href: '/admin/products' },
      { label: 'Product Types', href: '/admin/product-types' },
      { label: 'Group Design Catalog', href: '/admin/designs' },
      { label: 'Design Number Catalog', href: '/admin/design-numbers' },
      { label: 'Fabric Catalog', href: '/admin/inventory/fabrics' },
      { label: 'Button Catalog', href: '/admin/inventory/buttons' },
      { label: 'Thread Catalog', href: '/admin/inventory/threads' },
      { label: 'Purchase Orders', href: '/admin/purchase-orders' },
    ]
  },
  {
    label: 'Inventory', href: '/admin/inventory/product-stock',
    subsections: [
      { label: 'Product Stock', href: '/admin/inventory/product-stock' },
      { label: 'Fabric Stock', href: '/admin/inventory/fabric-stock' },
      { label: 'Thread Stock', href: '/admin/inventory/thread-stock' },
      { label: 'Button Stock', href: '/admin/inventory/button-stock' }
    ]
  },
  {
    label: 'Marketing', href: '/marketing/quotations',
    subsections: [
      { label: 'Quotation', href: '/marketing/quotations' },
      { label: 'Operation Team', href: '/marketing/operation-team' },
      { label: 'Initial Payment', href: '/marketing/initial-payment' },
      { label: 'Order Placement', href: '/marketing/order-placement' }
    ]
  },
  {
    label: 'SAM Management', href: '/sam-management/calculator',
    subsections: [
      { label: 'SAM Calculator', href: '/sam-management/calculator' },
      { label: 'SAM Configurations', href: '/sam-management/configurations' },
      { label: 'Reports', href: '/sam-management/reports' },
      { label: 'Fabric SAM', href: '/sam-management/fabric' }
    ]
  },
  {
    label: 'Factory Operations', href: '/factory/job-cards',
    subsections: [
      { label: 'Job Cards & PO Handler', href: '/factory/job-cards' },
      { label: 'Production Queue & Fabric', href: '/factory/production-queue' }
    ]
  },
  {
    label: 'Multi-Branch Hub', href: '/branches/outlets',
    subsections: [
      { label: 'Outlets & Credentials', href: '/branches/outlets' },
      { label: 'Branch Stock & Inventory', href: '/branches/inventory' },
      { label: 'Inter-Branch Stock Transfer', href: '/branches/transfers' }
    ]
  },
  {
    label: 'Billing & Invoicing', href: '/billing/invoices',
    subsections: [
      { label: 'Customer Invoices', href: '/billing/invoices' },
      { label: 'Delivery Challans (DC)', href: '/billing/delivery-challans' }
    ]
  }
];

const modulePermissionMap = {
  'Customer & Lead Management': ['view_schools', 'manage_schools', 'view_organizations'],
  'Measurements': ['manage_measurements', 'view_measurements', 'view_own_measurements'],
  'Admin Controls': ['manage_system', 'view_audit_logs'],
  'Product Management': ['manage_inventory', 'view_inventory', 'manage_products', 'view_products'],
  'Product Managment': ['manage_inventory', 'view_inventory', 'manage_products', 'view_products'],
  'Inventory': ['manage_inventory', 'view_inventory'],
  'Marketing': ['manage_quotations', 'view_quotations', 'branch_sales'],
  'SAM Management': ['manage_system', 'manage_sam'],
  'SAM Managment': ['manage_system', 'manage_sam'],
  'Factory Operations': ['manage_system', 'factory_po_handler', 'factory_floor'],
  'Multi-Branch Hub': ['branch_sales', 'manage_system', 'branch_transfers'],
  'Billing & Invoicing': ['manage_quotations', 'manage_system', 'branch_sales', 'manage_invoices', 'view_invoices']
};

const subPermissionMap = {
  'Leads Registry': ['view_schools', 'manage_schools', 'view_organizations', 'branch_sales'],
  'Organization': ['view_schools', 'manage_schools', 'view_organizations'],
  'Record Entry': ['manage_measurements', 'view_measurements'],
  'History': ['view_measurements', 'manage_measurements'],
  'Industry Templates': ['manage_measurements', 'view_measurements'],
  'Fitting Tokens': ['manage_measurements', 'view_measurements'],
  'Industry Sectors': ['manage_system'],
  'Measurement Setup': ['manage_system'],
  'Measurements Approvals': ['manage_system'],
  'Product Registry': ['manage_products', 'view_products'],
  'Product Types': ['manage_products', 'view_products'],
  'Group Design Catalog': ['manage_products', 'view_products'],
  'Design Number Catalog': ['manage_products', 'view_products'],
  'Audit Logs': ['view_audit_logs'],
  'Staff Management': ['manage_employees', 'view_employees'],
  'Company Profile & Bank': ['manage_system'],
  'User Roles': ['manage_system'],
  'US Size Charts': ['manage_size_charts', 'view_size_charts'],
  'Dress Prefixes': ['manage_system'],
  'Art Number Hub': ['manage_system', 'manage_products'],
  'Vendors Manager': ['manage_system'],
  'Fabric Catalog': ['manage_inventory', 'view_inventory'],
  'Button Catalog': ['manage_inventory', 'view_inventory'],
  'Thread Catalog': ['manage_inventory', 'view_inventory'],
  'Product Stock': ['manage_inventory', 'view_inventory'],
  'Fabric Stock': ['manage_inventory', 'view_inventory'],
  'Thread Stock': ['manage_inventory', 'view_inventory'],
  'Button Stock': ['manage_inventory', 'view_inventory'],
  'Purchase Orders': ['manage_inventory', 'view_inventory'],
  'Quotation': ['manage_quotations', 'view_quotations', 'branch_sales'],
  'Operation Team': ['manage_quotations'],
  'Initial Payment': ['manage_quotations', 'view_quotations', 'branch_sales'],
  'Order Placement': ['manage_quotations'],
  'SAM Calculator': ['manage_sam', 'manage_system'],
  'SAM Configurations': ['manage_sam', 'manage_system'],
  'Reports': ['manage_sam', 'manage_system'],
  'Fabric SAM': ['manage_sam', 'manage_system'],
  'Job Cards & PO Handler': ['manage_system', 'factory_po_handler'],
  'Production Queue & Fabric': ['manage_system', 'factory_po_handler', 'factory_floor'],
  'Outlets & Credentials': ['manage_system'],
  'Branch Stock & Inventory': ['branch_inventory', 'manage_system'],
  'Inter-Branch Stock Transfer': ['branch_transfers', 'manage_system'],
  'Customer Invoices': ['manage_quotations', 'manage_system', 'branch_sales', 'manage_invoices', 'view_invoices'],
  'Delivery Challans (DC)': ['manage_system', 'manage_quotations', 'branch_sales', 'manage_invoices', 'view_invoices']
};

function evaluateSidebar(user) {
  const userRole = user.role || '';
  const userPermissions = user.permissions || [];
  const isAdmin = userPermissions.includes('all') || userRole === 'Admin' || userRole === 'Super Admin' || userRole === 'SuperAdmin';
  const isFactoryRole = userRole.includes('Factory');

  const visibleNav = [];

  for (const item of modules) {
    if (isFactoryRole && item.label !== 'Factory Operations' && item.label !== 'Dashboard') {
      continue;
    }
    if (!isFactoryRole && !isAdmin && item.label === 'Factory Operations') {
      continue;
    }

    const requiredPermissions = modulePermissionMap[item.label] || [];
    const hasPermission = isAdmin || requiredPermissions.length === 0 ||
      requiredPermissions.some(rp => userPermissions.includes(rp));

    if (!hasPermission) continue;

    const visibleSubs = [];
    for (const sub of item.subsections) {
      const requiredSubPerms = subPermissionMap[sub.label] || [];
      const hasSubPerm = isAdmin || requiredSubPerms.length === 0 ||
        requiredSubPerms.some(rp => userPermissions.includes(rp));
      if (hasSubPerm) {
        visibleSubs.push(sub.label);
      }
    }

    if (item.subsections.length > 0 && !isAdmin && visibleSubs.length === 0) {
      continue;
    }

    visibleNav.push({
      module: item.label,
      subsections: visibleSubs
    });
  }

  return visibleNav;
}

// Roles from authController.js
const testUsers = {
  'Super Admin': {
    role: 'Admin',
    permissions: ['all']
  },
  'Branch Manager': {
    role: 'Branch Manager',
    permissions: [
      'branch_inventory', 'branch_sales', 'branch_transfers', 'view_employees',
      'view_organizations', 'manage_schools', 'view_schools', 'manage_classes',
      'manage_departments', 'view_students', 'register_students', 'manage_students',
      'view_products', 'manage_products', 'view_measurements', 'manage_measurements',
      'manage_quotations', 'view_quotations', 'manage_invoices', 'view_invoices'
    ]
  },
  'Branch Staff': {
    role: 'Branch Staff',
    permissions: [
      'branch_inventory', 'branch_sales', 'view_organizations', 'view_schools',
      'view_students', 'register_students', 'view_products', 'view_measurements',
      'manage_measurements', 'view_quotations', 'view_invoices'
    ]
  },
  'Factory PO Handler': {
    role: 'Factory PO Handler',
    permissions: ['factory_po_handler', 'factory_floor']
  },
  'Factory Production Staff': {
    role: 'Factory Production Staff',
    permissions: ['factory_floor']
  }
};

console.log('=== SIDEBAR RBAC PERMISSION AUDIT ===\n');
for (const [persona, u] of Object.entries(testUsers)) {
  console.log(`\n========================================`);
  console.log(`PERSONA: ${persona} (Role: ${u.role})`);
  console.log(`========================================`);
  const nav = evaluateSidebar(u);
  for (const n of nav) {
    if (n.subsections.length === 0) {
      console.log(`  [Module] ${n.module}`);
    } else {
      console.log(`  [Module] ${n.module}:`);
      for (const s of n.subsections) {
        console.log(`      └─ ${s}`);
      }
    }
  }
}
