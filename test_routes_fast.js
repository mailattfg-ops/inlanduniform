const fetch = globalThis.fetch;

async function checkRoute(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return { ok: true, status: res.status };
  } catch (err) {
    clearTimeout(timeoutId);
    return { ok: false, error: err.name === 'AbortError' ? 'TIMEOUT (compiling)' : err.message };
  }
}

async function run() {
  const routes = [
    '/login',
    '/dashboard',
    '/branches/outlets',
    '/branches/inventory',
    '/branches/transfers',
    '/marketing/quotations',
    '/marketing/operation-team',
    '/marketing/initial-payment',
    '/marketing/order-placement',
    '/factory/job-cards',
    '/factory/production-queue',
    '/billing/delivery-challans',
    '/billing/invoices',
    '/measurements/entry',
    '/measurements/tokens',
    '/measurements/history',
    '/admin/approvals/measurements'
  ];

  console.log('Testing frontend Next.js compilation status on localhost:3000:');
  for (const r of routes) {
    const res = await checkRoute(`http://localhost:3000${r}`);
    console.log(`Route ${r.padEnd(32)} => ${res.ok ? `STATUS ${res.status}` : `ERR: ${res.error}`}`);
  }
}

run();
