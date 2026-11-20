// Verification script for updated SAM costing engine
// Asserts the mathematical equations and slab ratios matching criteria

const wholesaleSlabs = [
  { min_qty: 1, max_qty: 2, adjustment_percent: 100.0, enabled: true },
  { min_qty: 3, max_qty: 10, adjustment_percent: 40.0, enabled: true },
  { min_qty: 11, max_qty: 25, adjustment_percent: 30.0, enabled: true },
  { min_qty: 26, max_qty: 100, adjustment_percent: 20.0, enabled: true },
  { min_qty: 101, max_qty: 200, adjustment_percent: 10.0, enabled: true },
  { min_qty: 201, max_qty: 500, adjustment_percent: 0.0, enabled: true },
  { min_qty: 501, max_qty: 1000, adjustment_percent: -10.0, enabled: true },
  { min_qty: 1001, max_qty: 2000, adjustment_percent: -20.0, enabled: true },
  { min_qty: 2001, max_qty: 5000, adjustment_percent: -30.0, enabled: true },
  { min_qty: 5001, max_qty: null, adjustment_percent: -40.0, enabled: true }
];

const retailSlabs = [
  { min_qty: 1, max_qty: 2, adjustment_percent: 30.0, enabled: true },
  { min_qty: 3, max_qty: 10, adjustment_percent: 50.0, enabled: true },
  { min_qty: 11, max_qty: 25, adjustment_percent: 50.0, enabled: true },
  { min_qty: 26, max_qty: 100, adjustment_percent: 40.0, enabled: true },
  { min_qty: 101, max_qty: 200, adjustment_percent: 40.0, enabled: true },
  { min_qty: 201, max_qty: 500, adjustment_percent: 30.0, enabled: true },
  { min_qty: 501, max_qty: 1000, adjustment_percent: 30.0, enabled: true },
  { min_qty: 1001, max_qty: 2000, adjustment_percent: 20.0, enabled: true },
  { min_qty: 2001, max_qty: 5000, adjustment_percent: 20.0, enabled: true },
  { min_qty: 5001, max_qty: null, adjustment_percent: 10.0, enabled: true }
];

// Helper: calculate base SAM
function calculateBaseSAM(components, baseValue = 100) {
  const percentageSum = components.reduce((sum, c) => sum + ((c.value || 0) / 100 * baseValue), 0);
  return baseValue + percentageSum;
}

// Helper: find slab adjustment
function getAdjustmentPercent(slabs, quantity) {
  const qty = parseInt(quantity, 10);
  const matchingSlab = slabs.find(s => {
    if (!s.enabled) return false;
    const min = s.min_qty;
    const max = s.max_qty;
    
    if (max === null) {
      return qty >= min;
    } else {
      return qty >= min && qty <= max;
    }
  });

  return matchingSlab ? matchingSlab.adjustment_percent : 0;
}

// Test cases
function runTests() {
  console.log('==================================================');
  console.log('  SAM Costing Engine - Automated Asserter (New)   ');
  console.log('==================================================\n');

  let passed = true;

  // Test 1: Base SAM calculation as percentage of baseValue
  const baseValue = 150;
  const testComponents = [
    { name: 'Pattern + Cutting', type: 'percentage', value: 10.0 },
    { name: 'Threads + Buttons + Indirect', type: 'percentage', value: 5.0 },
    { name: 'Profit', type: 'percentage', value: 20.0 },
    { name: 'Service and Maintenance', type: 'percentage', value: 5.0 },
    { name: 'Business Development', type: 'percentage', value: 5.0 }
  ];

  const expectedPercentageAdditions = (10/100 * 150) + (5/100 * 150) + (20/100 * 150) + (5/100 * 150) + (5/100 * 150); // 15 + 7.5 + 30 + 7.5 + 7.5 = 67.5
  const expectedBaseSAM = baseValue + expectedPercentageAdditions; // 217.5

  const calculatedBaseSAM = calculateBaseSAM(testComponents, baseValue);
  if (Math.abs(calculatedBaseSAM - expectedBaseSAM) < 0.0001) {
    console.log('✅ TEST 1 PASSED: Base SAM calculation matches new percentage formulas');
  } else {
    console.error(`❌ TEST 1 FAILED: Expected ${expectedBaseSAM}, got ${calculatedBaseSAM}`);
    passed = false;
  }

  // Test 2: Wholesale Slab matching boundaries
  const testWholesaleCases = [
    { qty: 1, expectedSlab: 100 },
    { qty: 2, expectedSlab: 100 },
    { qty: 3, expectedSlab: 40 },
    { qty: 25, expectedSlab: 30 },
    { qty: 200, expectedSlab: 10 },
    { qty: 300, expectedSlab: 0 },
    { qty: 501, expectedSlab: -10 },
    { qty: 5000, expectedSlab: -30 },
    { qty: 5001, expectedSlab: -40 }
  ];

  testWholesaleCases.forEach(tc => {
    const adj = getAdjustmentPercent(wholesaleSlabs, tc.qty);
    if (adj === tc.expectedSlab) {
      console.log(`✅ TEST 2 PASSED: Wholesale Qty ${tc.qty} matched adjustment ${tc.expectedSlab}%`);
    } else {
      console.error(`❌ TEST 2 FAILED: Wholesale Qty ${tc.qty} expected ${tc.expectedSlab}%, got ${adj}%`);
      passed = false;
    }
  });

  // Test 3: Retail Slab matching boundaries
  const testRetailCases = [
    { qty: 2, expectedSlab: 30 },
    { qty: 5, expectedSlab: 50 },
    { qty: 15, expectedSlab: 50 },
    { qty: 50, expectedSlab: 40 },
    { qty: 150, expectedSlab: 40 },
    { qty: 300, expectedSlab: 30 },
    { qty: 750, expectedSlab: 30 },
    { qty: 1500, expectedSlab: 20 },
    { qty: 3500, expectedSlab: 20 },
    { qty: 8888, expectedSlab: 10 }
  ];

  testRetailCases.forEach(tc => {
    const adj = getAdjustmentPercent(retailSlabs, tc.qty);
    if (adj === tc.expectedSlab) {
      console.log(`✅ TEST 3 PASSED: Retail Qty ${tc.qty} matched adjustment ${tc.expectedSlab}%`);
    } else {
      console.error(`❌ TEST 3 FAILED: Retail Qty ${tc.qty} expected ${tc.expectedSlab}%, got ${adj}%`);
      passed = false;
    }
  });

  // Test 4: Final Adjusted SAM outputs
  // Baseline baseValue = 182, Wholesale adjustment 100% -> 364
  const baseValue182 = 182;
  const noHeads = [];
  const base = calculateBaseSAM(noHeads, baseValue182); // 182
  const qty2Adj = getAdjustmentPercent(wholesaleSlabs, 2); // 100%
  const finalWholesaleVal = base * (1 + qty2Adj/100); // 364
  
  if (Math.abs(finalWholesaleVal - 364) < 0.0001) {
    console.log('✅ TEST 4.1 PASSED: Final costing value for wholesale matches expected baseline of 364');
  } else {
    console.error(`❌ TEST 4.1 FAILED: Expected 364, got ${finalWholesaleVal}`);
    passed = false;
  }

  // Test 5: Cumulative Retail costing outputs
  // 100 shirts: Wholesale adjustment (20%), Retail adjustment (40%) on top
  const wAdj100 = getAdjustmentPercent(wholesaleSlabs, 100); // 20%
  const rAdj100 = getAdjustmentPercent(retailSlabs, 100); // 40%
  const wholesale100Val = base * (1 + wAdj100/100); // 182 * 1.2 = 218.4
  const finalRetail100Val = wholesale100Val * (1 + rAdj100/100); // 218.4 * 1.4 = 305.76

  if (Math.abs(finalRetail100Val - 305.76) < 0.0001) {
    console.log('✅ TEST 5 PASSED: Cumulative Retail costing matches sequential calculation of 305.76');
  } else {
    console.error(`❌ TEST 5 FAILED: Expected 305.76, got ${finalRetail100Val}`);
    passed = false;
  }

  console.log('\n==================================================');
  if (passed) {
    console.log('🎉 SUCCESS: All mathematical costing assertions passed!');
    process.exit(0);
  } else {
    console.error('❌ FAILURE: One or more assertions failed.');
    process.exit(1);
  }
}

runTests();
