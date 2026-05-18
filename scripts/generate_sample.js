const XLSX = require('xlsx');
const path = require('path');

const data = [
  { 
    'Full Name': 'Samuel Jackson', 
    'Reference ID': 'MEM-24-001', 
    'Organization ID': 3, 
    'Department ID': 6, 
    'Mobile': '9876543210',
    'Gender': 'Male'
  },
  { 
    'Full Name': 'Alice Cooper', 
    'Reference ID': 'MEM-24-002', 
    'Organization ID': 3, 
    'Department ID': 6, 
    'Mobile': '9123456789',
    'Gender': 'Female'
  },
  { 
    'Full Name': 'Robert Downy', 
    'Reference ID': 'MEM-24-003', 
    'Organization ID': 3, 
    'Department ID': 6, 
    'Mobile': '9555444333',
    'Gender': 'Male'
  }
];

const ws = XLSX.utils.json_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Registry_Import');

const filePath = path.join(process.cwd(), 'Entity_Bulk_Import.xlsx');
XLSX.writeFile(wb, filePath);
console.log(`Successfully generated ${filePath}`);
