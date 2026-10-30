const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY in inlanduniform/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('🚀 Starting Shirt Measurements & Readymades Seeding...');

  // ==========================================
  // 1. VERIFY / SEED SHIRT MEASUREMENTS IN measurement_config
  // ==========================================
  console.log('\n--- 1. Checking measurement_config for SHIRT (product_type_id: 31) ---');
  const requiredShirtMetrics = [
    { label: 'CHEST', unit: 'Inches', display_order: 1, is_required: true, product_type_id: 31, description: 'The circumference around the fullest part of the chest' },
    { label: 'LENGTH', unit: 'Inches', display_order: 2, is_required: true, product_type_id: 31, description: 'Length from high shoulder point near collar seam down to bottom hem' },
    { label: 'SHOULDER', unit: 'Inches', display_order: 3, is_required: true, product_type_id: 31, description: 'Distance across the back from shoulder seam to shoulder seam' },
    { label: 'SLEEVE LENGTH', unit: 'Inches', display_order: 4, is_required: true, product_type_id: 31, description: 'Length from shoulder point down outer arm to wrist cuff edge' },
    { label: 'NECK', unit: 'Inches', display_order: 5, is_required: true, product_type_id: 31, description: 'Circumference around the base of the neck where collar fastens' },
    { label: 'WAIST', unit: 'Inches', display_order: 6, is_required: false, product_type_id: 31, description: 'Circumference around the natural midsection / waist' },
    { label: 'BICEP', unit: 'Inches', display_order: 7, is_required: false, product_type_id: 31, description: 'Circumference around the fullest part of the upper arm' },
    { label: 'CUFF', unit: 'Inches', display_order: 8, is_required: false, product_type_id: 31, description: 'Circumference around the sleeve cuff opening' },
    { label: 'BOTTOM HEM', unit: 'Inches', display_order: 9, is_required: false, product_type_id: 31, description: 'Circumference around the bottom hem sweep of the shirt' }
  ];

  const { data: existingConfigs } = await supabase
    .from('measurement_config')
    .select('id, label, display_order')
    .eq('product_type_id', 31);

  const existingConfigLabels = new Set((existingConfigs || []).map(c => c.label.toUpperCase()));

  for (const metric of requiredShirtMetrics) {
    if (!existingConfigLabels.has(metric.label.toUpperCase())) {
      const { data: inserted, error: insertErr } = await supabase
        .from('measurement_config')
        .insert([metric])
        .select()
        .single();
      if (insertErr) {
        console.error(`Failed to insert config ${metric.label}:`, insertErr.message);
      } else {
        console.log(`+ Added measurement_config: ${inserted.label} (Order: ${inserted.display_order})`);
      }
    } else {
      console.log(`✓ measurement_config '${metric.label}' already active`);
    }
  }

  // ==========================================
  // 2. SEED SIZE CHARTS FOR SHIRTS
  // ==========================================
  console.log('\n--- 2. Checking / Seeding size_charts ---');
  const sizeChartsData = [
    {
      name: "Men's Standard Shirt Size Chart (Regular Fit)",
      gender: 'Men',
      measurements: {
        '36 (XS)': { CHEST: 38, LENGTH: 28.5, SHOULDER: 17.0, 'SLEEVE LENGTH': 24.0, NECK: 15.0, WAIST: 36.0, BICEP: 14.5, CUFF: 8.5, 'BOTTOM HEM': 38.0 },
        '38 (S)':  { CHEST: 40, LENGTH: 29.0, SHOULDER: 17.75, 'SLEEVE LENGTH': 24.5, NECK: 15.5, WAIST: 38.0, BICEP: 15.0, CUFF: 8.75, 'BOTTOM HEM': 40.0 },
        '40 (M)':  { CHEST: 42, LENGTH: 30.0, SHOULDER: 18.5, 'SLEEVE LENGTH': 25.0, NECK: 16.0, WAIST: 40.0, BICEP: 15.5, CUFF: 9.0, 'BOTTOM HEM': 42.0 },
        '42 (L)':  { CHEST: 44, LENGTH: 30.5, SHOULDER: 19.25, 'SLEEVE LENGTH': 25.5, NECK: 16.5, WAIST: 42.0, BICEP: 16.25, CUFF: 9.5, 'BOTTOM HEM': 44.0 },
        '44 (XL)': { CHEST: 46, LENGTH: 31.0, SHOULDER: 20.0, 'SLEEVE LENGTH': 26.0, NECK: 17.0, WAIST: 44.5, BICEP: 17.0, CUFF: 9.75, 'BOTTOM HEM': 46.5 },
        '46 (XXL)':{ CHEST: 48, LENGTH: 31.5, SHOULDER: 20.75, 'SLEEVE LENGTH': 26.5, NECK: 17.5, WAIST: 47.0, BICEP: 17.75, CUFF: 10.0, 'BOTTOM HEM': 49.0 }
      }
    },
    {
      name: "Women's Executive Shirt Size Chart (Regular Fit)",
      gender: 'Women',
      measurements: {
        '32 (XS)': { CHEST: 34, LENGTH: 25.0, SHOULDER: 14.5, 'SLEEVE LENGTH': 22.5, NECK: 13.5, WAIST: 29.5, BICEP: 12.5, CUFF: 7.5, 'BOTTOM HEM': 35.0 },
        '34 (S)':  { CHEST: 36, LENGTH: 25.5, SHOULDER: 15.0, 'SLEEVE LENGTH': 23.0, NECK: 14.0, WAIST: 31.5, BICEP: 13.0, CUFF: 7.75, 'BOTTOM HEM': 37.0 },
        '36 (M)':  { CHEST: 38, LENGTH: 26.5, SHOULDER: 15.5, 'SLEEVE LENGTH': 23.5, NECK: 14.5, WAIST: 33.5, BICEP: 13.5, CUFF: 8.0, 'BOTTOM HEM': 39.0 },
        '38 (L)':  { CHEST: 40, LENGTH: 27.0, SHOULDER: 16.0, 'SLEEVE LENGTH': 24.0, NECK: 15.0, WAIST: 35.5, BICEP: 14.25, CUFF: 8.25, 'BOTTOM HEM': 41.0 },
        '40 (XL)': { CHEST: 42, LENGTH: 27.5, SHOULDER: 16.5, 'SLEEVE LENGTH': 24.5, NECK: 15.5, WAIST: 38.0, BICEP: 15.0, CUFF: 8.5, 'BOTTOM HEM': 43.5 }
      }
    }
  ];

  const sizeChartMap = {};

  for (const chart of sizeChartsData) {
    const { data: found } = await supabase
      .from('size_charts')
      .select('id, name')
      .eq('name', chart.name)
      .maybeSingle();

    if (found) {
      sizeChartMap[chart.gender] = found.id;
      console.log(`✓ size_chart '${chart.name}' exists (ID: ${found.id})`);
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('size_charts')
        .insert([chart])
        .select()
        .single();
      if (insertErr) {
        console.error(`Failed to insert size_chart ${chart.name}:`, insertErr.message);
      } else {
        sizeChartMap[chart.gender] = inserted.id;
        console.log(`+ Added size_chart: ${inserted.name} (ID: ${inserted.id})`);
      }
    }
  }

  // ==========================================
  // 3. SEED DIVERSE READYMADE SHIRTS
  // ==========================================
  console.log('\n--- 3. Seeding Diverse Readymade Shirts with Real Measurements ---');

  const shirtProducts = [
    {
      name: "Men's Classic Executive Oxford Shirt",
      art_number: "1A-1000-R2",
      product_type_id: 31,
      category: "top_wear",
      gender: "Male",
      base_size: "40",
      fit: "Regular Fit",
      allowance: "2",
      base_price: 1250,
      sam_value: 22.5,
      retail_sam_value: 26.0,
      size_chart_id: sizeChartMap['Men'] || null,
      measurements: ['CHEST', 'LENGTH', 'SHOULDER', 'SLEEVE LENGTH', 'NECK', 'WAIST', 'BICEP', 'CUFF', 'BOTTOM HEM'],
      specLines: [
        "100% Combed Compact Cotton Oxford Weave",
        "140 GSM Breathable All-Weather Fabric",
        "Classic Button-Down Collar with Fusible Interlining",
        "Double-Button Barrel Cuffs with Single Sleeve Pleat",
        "Liquid Ammonia Wrinkle-Resistant Easy-Iron Finish"
      ],
      description: "Timeless long-sleeve corporate Oxford shirt crafted from 100% combed compact cotton. Engineered in Regular Fit with a calibrated 2-inch allowance for day-long office comfort. Tailored with single-needle construction, reinforced split yoke, and durable horn buttons.",
      realMeasurementsText: "Base Size 40 (M) Real Garment Measurements:\n• Chest: 42.0\"\n• Length: 30.0\"\n• Shoulder: 18.5\"\n• Sleeve Length: 25.0\"\n• Neck / Collar: 16.0\"\n• Waist: 40.0\"\n• Bottom Hem Sweep: 42.0\"\n• Bicep: 15.5\"\n• Cuff Opening: 9.0\"",
      images: [
        "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=800&q=80"
      ],
      fabricMeters: 1.6,
      dressCode: '1A',
      genderCode: '1',
      patternCode: '000',
      allowanceCode: '2'
    },
    {
      name: "Men's Royal Twill Cutaway Formal Shirt",
      art_number: "4J-1012-R2",
      product_type_id: 31,
      category: "top_wear",
      gender: "Male",
      base_size: "42",
      fit: "Regular Fit",
      allowance: "2",
      base_price: 1650,
      sam_value: 24.0,
      retail_sam_value: 28.0,
      size_chart_id: sizeChartMap['Men'] || null,
      measurements: ['CHEST', 'LENGTH', 'SHOULDER', 'SLEEVE LENGTH', 'NECK', 'WAIST', 'BICEP', 'CUFF', 'BOTTOM HEM'],
      specLines: [
        "100% Two-Ply Giza Long-Staple Egyptian Cotton",
        "135 GSM Fine Micro-Stripe Diagonal Twill",
        "English Cutaway Stiffened Collar for Wide Tie Knots",
        "Convertible French / Barrel Cuffs (Cufflink Compatible)",
        "Silky Lustre Yarn-Dyed Pre-Shrunk Finish"
      ],
      description: "Prestigious executive dress shirt spun from two-ply Egyptian Giza cotton in a subtle striped twill weave. Features a broad spread cutaway collar, tailored back darts, and dual-purpose convertible cuffs for formal corporate banquets and board meetings.",
      realMeasurementsText: "Base Size 42 (L) Real Garment Measurements:\n• Chest: 44.0\"\n• Length: 30.5\"\n• Shoulder: 19.25\"\n• Sleeve Length: 25.5\"\n• Neck / Collar: 16.5\"\n• Waist: 42.0\"\n• Bottom Hem Sweep: 44.0\"\n• Bicep: 16.25\"\n• Cuff Opening: 9.5\"",
      images: [
        "https://images.unsplash.com/photo-1620012253295-c15c429f66bf?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80"
      ],
      fabricMeters: 1.65,
      dressCode: '4J',
      genderCode: '1',
      patternCode: '012',
      allowanceCode: '2'
    },
    {
      name: "Men's Short Sleeve Corporate Utility Shirt",
      art_number: "1A-1045-R2.5",
      product_type_id: 31,
      category: "top_wear",
      gender: "Male",
      base_size: "40",
      fit: "Regular Fit",
      allowance: "2.5",
      base_price: 890,
      sam_value: 18.5,
      retail_sam_value: 21.0,
      size_chart_id: sizeChartMap['Men'] || null,
      measurements: ['CHEST', 'LENGTH', 'SHOULDER', 'SLEEVE LENGTH', 'NECK', 'WAIST', 'BICEP', 'BOTTOM HEM'],
      specLines: [
        "65% High-Tenacity Polyester / 35% Combed Cotton",
        "155 GSM Heavy-Duty Workwear Sheeting",
        "Short Sleeve with 1-Inch Double-Needle Hem",
        "Twin Flap Chest Pockets with Dedicated Pen Slot",
        "Stain-Release & Industrial Laundry Certified"
      ],
      description: "Rugged and functional short-sleeve corporate workwear shirt engineered for operational managers, engineers, and facility staff. Features twin chest utility pockets with pencil division, action back pleats, and industrial-grade soil release finish.",
      realMeasurementsText: "Base Size 40 (M) Real Garment Measurements:\n• Chest: 42.5\"\n• Length: 29.5\"\n• Shoulder: 18.5\"\n• Sleeve Length: 9.75\" (Half Sleeve)\n• Neck / Collar: 16.0\"\n• Waist: 41.5\"\n• Bottom Hem Sweep: 42.5\"\n• Bicep: 16.0\"\n• Arm Opening: 14.5\"",
      images: [
        "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=800&q=80"
      ],
      fabricMeters: 1.35,
      dressCode: '1A',
      genderCode: '1',
      patternCode: '045',
      allowanceCode: '2.5'
    },
    {
      name: "Men's Mandarin Collar Casual Linen Shirt",
      art_number: "4J-1046-R2",
      product_type_id: 31,
      category: "top_wear",
      gender: "Male",
      base_size: "38",
      fit: "Regular Fit",
      allowance: "2",
      base_price: 1350,
      sam_value: 20.5,
      retail_sam_value: 24.0,
      size_chart_id: sizeChartMap['Men'] || null,
      measurements: ['CHEST', 'LENGTH', 'SHOULDER', 'SLEEVE LENGTH', 'NECK', 'WAIST', 'BICEP', 'CUFF', 'BOTTOM HEM'],
      specLines: [
        "55% Pure French Flax Linen / 45% Organic Cotton",
        "145 GSM Lightweight Breathable Slub Texture",
        "Band / Mandarin Grandad Collar with Button Closure",
        "Curved Shirttail Hem Engineered for Untucked Wear",
        "Enzyme Bio-Washed for Zero Shrinkage & Feather Softness"
      ],
      description: "Modern smart-casual resort shirt featuring a tailored band (mandarin) collar and curved hem. Natural flax linen slub provides superior thermal airflow, while the pre-washed cotton blend maintains structural drape throughout hot climates.",
      realMeasurementsText: "Base Size 38 (S) Real Garment Measurements:\n• Chest: 40.0\"\n• Length: 29.0\"\n• Shoulder: 17.75\"\n• Sleeve Length: 24.5\"\n• Neck / Collar: 15.5\"\n• Waist: 38.0\"\n• Bottom Hem Sweep: 40.0\"\n• Bicep: 15.0\"\n• Cuff Opening: 8.75\"",
      images: [
        "https://images.unsplash.com/photo-1589310243389-96a5483213a8?auto=format&fit=crop&w=800&q=80"
      ],
      fabricMeters: 1.55,
      dressCode: '4J',
      genderCode: '1',
      patternCode: '046',
      allowanceCode: '2'
    },
    {
      name: "Women's Executive Tailored Stretch Shirt",
      art_number: "1A-2000-R2",
      product_type_id: 31,
      category: "top_wear",
      gender: "Female",
      base_size: "36",
      fit: "Regular Fit",
      allowance: "2",
      base_price: 1290,
      sam_value: 21.0,
      retail_sam_value: 25.0,
      size_chart_id: sizeChartMap['Women'] || null,
      measurements: ['CHEST', 'LENGTH', 'SHOULDER', 'SLEEVE LENGTH', 'NECK', 'WAIST', 'BICEP', 'CUFF', 'BOTTOM HEM'],
      specLines: [
        "97% Compact Gassed Cotton / 3% Spandex Elastane",
        "130 GSM High-Flex Comfort Stretch Poplin",
        "Princess Darts Contoured to Feminine Torso",
        "Concealed Clean-Finish Front Placket",
        "Anti-Gap Bust Button Placement System"
      ],
      description: "Crisp, tailored women's executive dress shirt constructed with flexible stretch poplin. Thoughtfully tailored with anti-gap bust closure, contoured waist darts, and clean narrow collar for high-performing professional women.",
      realMeasurementsText: "Base Size 36 (M) Real Garment Measurements:\n• Bust / Chest: 38.0\"\n• Length: 26.5\"\n• Shoulder: 15.5\"\n• Sleeve Length: 23.5\"\n• Neck / Collar: 14.5\"\n• Waist: 33.5\"\n• Bottom Hem Sweep: 39.0\"\n• Bicep: 13.5\"\n• Cuff Opening: 8.0\"",
      images: [
        "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80"
      ],
      fabricMeters: 1.4,
      dressCode: '1A',
      genderCode: '2',
      patternCode: '000',
      allowanceCode: '2'
    },
    {
      name: "Boys' Classic School Uniform Shirt",
      art_number: "1A-3000-R2",
      product_type_id: 31,
      category: "top_wear",
      gender: "Boys",
      base_size: "32",
      fit: "Regular Fit",
      allowance: "2",
      base_price: 590,
      sam_value: 17.5,
      retail_sam_value: 20.0,
      size_chart_id: null,
      measurements: ['CHEST', 'LENGTH', 'SHOULDER', 'SLEEVE LENGTH', 'NECK', 'WAIST', 'BICEP', 'CUFF', 'BOTTOM HEM'],
      specLines: [
        "65% Polyester / 35% Combed Cotton High-Count Sheeting",
        "140 GSM High-Cycle Term Uniform Fabric",
        "Fused Interlined Standard Point Collar",
        "Single Left Chest Patch Pocket with Bartack Reinforcement",
        "Colorfast Chlorine & Sunlight Resistant Finish"
      ],
      description: "High-durability student formal full-sleeve uniform shirt made for daily school wear. Features dual shoulder yoke, reinforced pocket stitching, break-resistant cross-stitched buttons, and stain-guard easy-wash finish.",
      realMeasurementsText: "Base Size 32 Real Garment Measurements:\n• Chest: 34.0\"\n• Length: 25.0\"\n• Shoulder: 14.0\"\n• Sleeve Length: 20.5\"\n• Neck / Collar: 13.5\"\n• Waist: 33.0\"\n• Bottom Hem Sweep: 34.0\"\n• Bicep: 12.0\"\n• Cuff Opening: 7.5\"",
      images: [
        "https://images.unsplash.com/photo-1503919545889-aef636e10ad4?auto=format&fit=crop&w=800&q=80"
      ],
      fabricMeters: 1.2,
      dressCode: '1A',
      genderCode: '3',
      patternCode: '000',
      allowanceCode: '2'
    }
  ];

  for (const item of shirtProducts) {
    console.log(`\nProcessing article: ${item.art_number} (${item.name})...`);

    // 1. Format materials with serialized description and clean multi-line specs
    const rawSpecs = item.specLines.join('\n');
    const materialsPayload = `[Description: ${item.description}]\n${rawSpecs}`;

    // 2. Format remarks with revision info & real measurements breakdown
    const remarksPayload = [
      {
        title: "Garment Real Measurements Specification",
        text: item.realMeasurementsText,
        changes: `Base Size ${item.base_size} with Allowance +${item.allowance}" (${item.fit})`,
        added: "Standard production pattern measurements calibrated to grade specs.",
        removed: "",
        images: []
      },
      {
        title: "BOM Fabric Consumption & Make Specs",
        text: `Main Fabric Consumption: ${item.fabricMeters} meters per garment. Standard SAM: ${item.sam_value}m, Retail SAM: ${item.retail_sam_value}m.`,
        changes: "Initial production release",
        added: "Standard industrial trims and stitching",
        removed: "",
        images: []
      }
    ];

    // 3. Format trims
    const trimsPayload = [
      { category: "Buttons", name: "4-Hole Poly Pearl Button (18L/24L)", count: 8, uom: "Pcs" },
      { category: "Thread", name: "High-Tenacity Spun Polyester Core Thread 40/2", count: 120, uom: "Mtr" },
      { category: "Interlining", name: "Fusible High-Density Woven Collar & Cuff Interlining", count: 0.35, uom: "Mtr" }
    ];

    const classConsumptionPayload = {
      _base_main_fabric: item.fabricMeters,
      _base_trims: trimsPayload,
      _base_attachment_fabrics: [],
      Corporate: {
        main_fabric: item.fabricMeters
      }
    };

    // 4. Register in art_numbers table if not already present
    const { data: existingArt } = await supabase
      .from('art_numbers')
      .select('id')
      .eq('code', item.art_number)
      .maybeSingle();

    if (!existingArt) {
      // Find IDs for dress, gender, pattern, fit
      const { data: dressObj } = await supabase.from('art_dresses').select('id').eq('code', item.dressCode).maybeSingle();
      const { data: genderObj } = await supabase.from('art_genders').select('id').eq('code', item.genderCode).maybeSingle();
      const { data: patternObj } = await supabase.from('art_patterns').select('id').eq('code', item.patternCode).maybeSingle();
      const { data: fitObj } = await supabase.from('art_fits').select('id').eq('code', 'R').maybeSingle();

      if (dressObj && genderObj) {
        await supabase.from('art_numbers').insert([{
          code: item.art_number,
          art_number: item.art_number,
          dress_id: dressObj.id,
          gender_id: genderObj.id,
          pattern_id: patternObj ? patternObj.id : null,
          fit_id: fitObj ? fitObj.id : 2,
          fit: item.fit,
          base_size: item.base_size,
          allowance: item.allowanceCode,
          category: item.category
        }]);
        console.log(`  + Registered art number in art_numbers: ${item.art_number}`);
      }
    } else {
      console.log(`  ✓ Art number ${item.art_number} registered`);
    }

    // 5. Check if product already exists
    const { data: existingProd } = await supabase
      .from('products')
      .select('id, art_number')
      .eq('art_number', item.art_number)
      .maybeSingle();

    const productRecord = {
      name: item.name,
      art_number: item.art_number,
      product_type_id: item.product_type_id,
      category: item.category,
      gender: item.gender,
      base_size: item.base_size,
      fit: item.fit,
      allowance: item.allowance,
      base_price: item.base_price,
      sam_value: item.sam_value,
      retail_sam_value: item.retail_sam_value,
      measurements: item.measurements,
      materials: materialsPayload,
      remarks: remarksPayload,
      images: item.images,
      class_fabric_consumption: classConsumptionPayload,
      is_active: true,
      product_type: 'readymade',
      measurement_type: 'readymade'
    };

    if (existingProd) {
      console.log(`  Updating existing product ID ${existingProd.id}...`);
      const { data: updated, error: updateErr } = await supabase
        .from('products')
        .update(productRecord)
        .eq('id', existingProd.id)
        .select('id, art_number, name')
        .single();
      if (updateErr) {
        console.error(`  Error updating ${item.art_number}:`, updateErr.message);
      } else {
        console.log(`  ✓ Successfully updated product ${updated.art_number}`);
      }
    } else {
      console.log(`  Inserting new product ${item.art_number}...`);
      const { data: inserted, error: insertErr } = await supabase
        .from('products')
        .insert([productRecord])
        .select('id, art_number, name')
        .single();
      if (insertErr) {
        console.error(`  Error inserting ${item.art_number}:`, insertErr.message);
      } else {
        console.log(`  ✓ Successfully created product ID ${inserted.id} (${inserted.art_number})`);
      }
    }
  }

  console.log('\n🎉 Finished seeding shirt measurements & readymade products!');
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
