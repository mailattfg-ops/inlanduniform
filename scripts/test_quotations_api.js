require('dotenv').config();
const controllers = require('../controllers/quotationController');

async function testControllerCompilation() {
  console.log('--- Testing Quotation Controller Compilation ---');
  try {
    // 1. Verify all expected functions are exported
    const expectedMethods = [
      'listQuotations',
      'getQuotationDetails',
      'createQuotation',
      'deleteQuotation',
      'calculateOrgMeasurements'
    ];

    let allFine = true;
    expectedMethods.forEach(method => {
      if (typeof controllers[method] === 'function') {
        console.log(`✅ Method '${method}' compiled and exported successfully!`);
      } else {
        console.error(`❌ Method '${method}' is MISSING or not a function!`);
        allFine = false;
      }
    });

    if (!allFine) {
      process.exit(1);
    }

    // 2. Perform a test run of 'calculateOrgMeasurements' using a mock organization
    console.log('\n--- Running dry-run check for calculateOrgMeasurements ---');
    const mockReq = {
      params: { orgId: '12' } // Let's test organization 12 (seeded members)
    };
    
    const mockRes = {
      status(code) {
        console.log(`[HTTP STATUS] ${code}`);
        return this;
      },
      json(data) {
        console.log('✅ calculation response returned successfully!');
        console.log('Sizing Distribution tally:', data.size_distribution);
        console.log('Total entity members detected:', data.total_entities);
        console.log('Measured ratio:', `${data.measured_count} completed / ${data.missing_count} missing`);
        console.log('First 2 member sizing audits:', data.entities.slice(0, 2));
      }
    };

    await controllers.calculateOrgMeasurements(mockReq, mockRes);

  } catch (err) {
    console.error('❌ Compilation or dry-run failed with error:', err);
    process.exit(1);
  }
}

testControllerCompilation();
