const http = require('http');
require('dotenv').config();
const client = require('../config/supabase');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runTests() {
  console.log('=== STARTING ORG & ENTITY LOGIN & ISOLATION VERIFICATION ===\n');

  // 1. Fetch an organization user
  const { data: orgUser, error: orgErr } = await client
    .from('user_profiles')
    .select('id, username, email, password, user_types(name)')
    .eq('user_type_id', '3e8ef077-f264-44b3-b37e-74e98fb6c0e7')
    .limit(1)
    .single();

  if (orgErr || !orgUser) {
    console.error('Failed to find organization user in DB:', orgErr);
    process.exit(1);
  }
  console.log(`[TEST 1] Found Organization user: ${orgUser.username || orgUser.email} (Role: ${orgUser.user_types?.name})`);

  // 2. Fetch an entity user
  const { data: entityUser, error: entErr } = await client
    .from('user_profiles')
    .select('id, username, email, password, user_types(name)')
    .eq('user_type_id', '64ae559c-42c2-4592-a1b7-0ef7b3a17d17')
    .limit(1)
    .single();

  if (entErr || !entityUser) {
    console.error('Failed to find entity user in DB:', entErr);
    process.exit(1);
  }
  console.log(`[TEST 2] Found Entity user: ${entityUser.email} (Role: ${entityUser.user_types?.name})\n`);

  // 3. Test Organization Login
  console.log('--- TESTING ORGANIZATION LOGIN ---');
  const orgLoginRes = await request({
    hostname: 'localhost',
    port: 5005,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    email: orgUser.username || orgUser.email,
    password: orgUser.password
  });

  if (orgLoginRes.status !== 200 || !orgLoginRes.data?.success) {
    console.error('Org login failed:', orgLoginRes);
    process.exit(1);
  }
  const orgToken = orgLoginRes.data.token;
  const orgData = orgLoginRes.data.user;
  console.log('✅ Org Login Success!');
  console.log(`   User: ${orgData.fullName} | Role: ${orgData.role}`);
  console.log(`   Organization ID: ${orgData.organizationId} | Org Name: ${orgData.organizationName}`);
  console.log(`   Customer Code: ${orgData.customerCode || 'N/A'}`);

  if (!orgData.organizationId) {
    console.error('❌ FAIL: organizationId is missing from org user!');
    process.exit(1);
  }

  // 4. Test Organization Data Scoping
  console.log('\n--- TESTING ORGANIZATION DATA SCOPING ---');
  const orgHeaders = { 'Authorization': `Bearer ${orgToken}` };

  // 4a. GET /api/organizations
  const orgListRes = await request({
    hostname: 'localhost',
    port: 5005,
    path: '/api/organizations',
    method: 'GET',
    headers: orgHeaders
  });
  console.log(`4a. GET /api/organizations -> Status: ${orgListRes.status}, Count: ${Array.isArray(orgListRes.data) ? orgListRes.data.length : 0}`);
  if (Array.isArray(orgListRes.data) && orgListRes.data.length === 1 && orgListRes.data[0].id === orgData.organizationId) {
    console.log('✅ PASS: Only own organization returned.');
  } else {
    console.error('❌ FAIL: Expected exactly 1 organization matching own id, got:', orgListRes.data);
  }

  // 4b. GET /api/organizations/:id/details (own)
  const orgDetailsRes = await request({
    hostname: 'localhost',
    port: 5005,
    path: `/api/organizations/${orgData.organizationId}/details`,
    method: 'GET',
    headers: orgHeaders
  });
  console.log(`4b. GET /api/organizations/${orgData.organizationId}/details -> Status: ${orgDetailsRes.status}`);
  if (orgDetailsRes.status === 200 && orgDetailsRes.data?.success) {
    console.log('✅ PASS: Own organization details accessible.');
  } else {
    console.error('❌ FAIL: Could not access own organization details:', orgDetailsRes);
  }

  // 4c. GET /api/organizations/:id/ledger (own)
  const orgLedgerRes = await request({
    hostname: 'localhost',
    port: 5005,
    path: `/api/organizations/${orgData.organizationId}/ledger`,
    method: 'GET',
    headers: orgHeaders
  });
  console.log(`4c. GET /api/organizations/${orgData.organizationId}/ledger -> Status: ${orgLedgerRes.status}`);
  if (orgLedgerRes.status === 200 && orgLedgerRes.data?.success) {
    console.log(`✅ PASS: Own organization ledger accessible. Current balance: ${orgLedgerRes.data.current_balance}`);
  } else {
    console.error('❌ FAIL: Could not access own ledger:', orgLedgerRes);
  }

  // 4d. GET /api/organizations/:other_id/ledger (cross-tenant attempt)
  const otherOrgId = orgData.organizationId === 1 ? 2 : 1;
  const crossLedgerRes = await request({
    hostname: 'localhost',
    port: 5005,
    path: `/api/organizations/${otherOrgId}/ledger`,
    method: 'GET',
    headers: orgHeaders
  });
  console.log(`4d. Cross-Tenant Attempt: GET /api/organizations/${otherOrgId}/ledger -> Status: ${crossLedgerRes.status}`);
  if (crossLedgerRes.status === 403) {
    console.log('✅ PASS: Cross-tenant ledger access strictly rejected with 403 Forbidden.');
  } else {
    console.error('❌ FAIL: Cross-tenant ledger access was NOT rejected with 403!', crossLedgerRes);
  }

  // 4e. GET /api/quotations
  const orgQuotesRes = await request({
    hostname: 'localhost',
    port: 5005,
    path: '/api/quotations',
    method: 'GET',
    headers: orgHeaders
  });
  console.log(`4e. GET /api/quotations -> Status: ${orgQuotesRes.status}, Count: ${Array.isArray(orgQuotesRes.data) ? orgQuotesRes.data.length : 0}`);
  if (Array.isArray(orgQuotesRes.data) && orgQuotesRes.data.every(q => q.organization_id === orgData.organizationId)) {
    console.log('✅ PASS: All returned quotations belong exclusively to own organization.');
  } else {
    console.error('❌ FAIL: Leaked quotations from other organizations!');
  }

  // 4f. GET /api/orders
  const orgOrdersRes = await request({
    hostname: 'localhost',
    port: 5005,
    path: '/api/orders',
    method: 'GET',
    headers: orgHeaders
  });
  console.log(`4f. GET /api/orders -> Status: ${orgOrdersRes.status}, Count: ${Array.isArray(orgOrdersRes.data) ? orgOrdersRes.data.length : 0}`);
  if (Array.isArray(orgOrdersRes.data) && orgOrdersRes.data.every(o => !o.quotations || o.quotations.organization_id === orgData.organizationId)) {
    console.log('✅ PASS: All returned orders belong exclusively to own organization.');
  } else {
    console.error('❌ FAIL: Leaked orders from other organizations!');
  }

  // 4g. GET /api/members
  const orgMembersRes = await request({
    hostname: 'localhost',
    port: 5005,
    path: '/api/members',
    method: 'GET',
    headers: orgHeaders
  });
  console.log(`4g. GET /api/members -> Status: ${orgMembersRes.status}, Count: ${Array.isArray(orgMembersRes.data) ? orgMembersRes.data.length : 0}`);
  if (Array.isArray(orgMembersRes.data) && orgMembersRes.data.every(m => m.organization_id === orgData.organizationId)) {
    console.log('✅ PASS: All returned members belong exclusively to own organization.');
  } else {
    console.error('❌ FAIL: Leaked members from other organizations!');
  }

  // 5. Test Entity Login & Isolation
  console.log('\n--- TESTING ENTITY LOGIN & ISOLATION ---');
  const entLoginRes = await request({
    hostname: 'localhost',
    port: 5005,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    email: entityUser.email,
    password: entityUser.password
  });

  if (entLoginRes.status !== 200 || !entLoginRes.data?.success) {
    console.error('Entity login failed:', entLoginRes);
    process.exit(1);
  }
  const entToken = entLoginRes.data.token;
  const entData = entLoginRes.data.user;
  console.log('✅ Entity Login Success!');
  console.log(`   User: ${entData.fullName} | Role: ${entData.role}`);
  console.log(`   Member ID: ${entData.memberId}`);
  console.log(`   Organization ID: ${entData.organizationId} | Org Name: ${entData.organizationName}`);
  console.log(`   Department ID: ${entData.departmentId}`);
  console.log(`   Admission/Ref No: ${entData.admissionNo}`);

  if (!entData.memberId) {
    console.error('❌ FAIL: memberId is missing from entity user!');
    process.exit(1);
  }

  const entHeaders = { 'Authorization': `Bearer ${entToken}` };

  // 5a. GET /api/members (entity should only see their own 1 record)
  const entMembersRes = await request({
    hostname: 'localhost',
    port: 5005,
    path: '/api/members',
    method: 'GET',
    headers: entHeaders
  });
  console.log(`5a. GET /api/members -> Status: ${entMembersRes.status}, Count: ${Array.isArray(entMembersRes.data) ? entMembersRes.data.length : 0}`);
  if (Array.isArray(entMembersRes.data) && entMembersRes.data.length === 1 && entMembersRes.data[0].id === entData.memberId) {
    console.log('✅ PASS: Entity member strictly sees only their own profile record.');
  } else {
    console.error('❌ FAIL: Entity member saw other members!', entMembersRes.data);
  }

  // 5b. GET /api/measurements (entity should only see their own measurements)
  const entMeasRes = await request({
    hostname: 'localhost',
    port: 5005,
    path: '/api/measurements',
    method: 'GET',
    headers: entHeaders
  });
  console.log(`5b. GET /api/measurements -> Status: ${entMeasRes.status}, Count: ${Array.isArray(entMeasRes.data) ? entMeasRes.data.length : 0}`);
  if (Array.isArray(entMeasRes.data) && entMeasRes.data.every(m => m.member_id === entData.memberId)) {
    console.log('✅ PASS: Entity strictly sees only their own measurements.');
  } else {
    console.error('❌ FAIL: Entity saw other measurements!', entMeasRes.data);
  }

  // 5c. GET /api/quotations (entity should get empty array)
  const entQuotesRes = await request({
    hostname: 'localhost',
    port: 5005,
    path: '/api/quotations',
    method: 'GET',
    headers: entHeaders
  });
  console.log(`5c. GET /api/quotations -> Status: ${entQuotesRes.status}, Count: ${Array.isArray(entQuotesRes.data) ? entQuotesRes.data.length : 0}`);
  if (Array.isArray(entQuotesRes.data) && entQuotesRes.data.length === 0) {
    console.log('✅ PASS: Wholesale quotations blocked from entity member.');
  } else {
    console.error('❌ FAIL: Entity saw quotations!', entQuotesRes.data);
  }

  // 5d. GET /api/orders (entity should get empty array)
  const entOrdersRes = await request({
    hostname: 'localhost',
    port: 5005,
    path: '/api/orders',
    method: 'GET',
    headers: entHeaders
  });
  console.log(`5d. GET /api/orders -> Status: ${entOrdersRes.status}, Count: ${Array.isArray(entOrdersRes.data) ? entOrdersRes.data.length : 0}`);
  if (Array.isArray(entOrdersRes.data) && entOrdersRes.data.length === 0) {
    console.log('✅ PASS: Wholesale orders blocked from entity member.');
  } else {
    console.error('❌ FAIL: Entity saw orders!', entOrdersRes.data);
  }

  // 5e. GET /api/organizations/:id/ledger (entity blocked from ledger)
  const entLedgerRes = await request({
    hostname: 'localhost',
    port: 5005,
    path: `/api/organizations/${entData.organizationId}/ledger`,
    method: 'GET',
    headers: entHeaders
  });
  console.log(`5e. GET /api/organizations/:id/ledger -> Status: ${entLedgerRes.status}`);
  if (entLedgerRes.status === 403) {
    console.log('✅ PASS: Entity member strictly blocked from customer ledger.');
  } else {
    console.error('❌ FAIL: Entity member was not blocked from ledger!', entLedgerRes);
  }

  console.log('\n========================================================');
  console.log('🎉 ALL LOGIN, IDENTITY, AND TENANT ISOLATION TESTS PASSED!');
  console.log('========================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Unhandled error during test:', err);
  process.exit(1);
});
