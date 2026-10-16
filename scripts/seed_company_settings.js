const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const supabase = require('../config/supabase');

async function seedCompanySettings() {
  const companyData = {
    id: 1,
    company_name: "Forma Apparels",
    address: "63/3608, CD Tower, Arayidathupalam, Kozhikode, Kerala - 673 004, India",
    phone: "(+91) 7902 499 990 | 0495 2 922 992",
    email: "info@formaapparels.com",
    website: "www.formaapparels.com",
    bank_name: "HDFC BANK",
    account_no: "50200076116064",
    branch_name: "MAJESTIC CENTER",
    ifsc_code: "HDFC0001255",
    upi_id: "7902 499 991"
  };

  try {
    console.log("Upserting company_settings with Forma Apparels details...");
    const { data, error } = await supabase
      .from('company_settings')
      .upsert(companyData)
      .select()
      .single();

    if (error) {
      console.error("❌ Error upserting company_settings:", error);
      process.exit(1);
    }

    console.log("✅ Successfully updated company_settings in database:");
    console.log("Company Name:", data.company_name);
    console.log("Address:", data.address);
    console.log("Phone:", data.phone);
    console.log("Email:", data.email);
    console.log("Website:", data.website);
    console.log("Bank Name:", data.bank_name);
    console.log("A/c No:", data.account_no);
    console.log("Branch:", data.branch_name);
    console.log("IFSC:", data.ifsc_code);
    console.log("UPI:", data.upi_id);
    console.log("QR Image Present:", !!data.qr_image);
  } catch (err) {
    console.error("❌ Exception:", err.message);
    process.exit(1);
  }
}

seedCompanySettings();
