const XLSX = require('xlsx');
const path = require('path');

const data = [
  { 
    'Full Name': 'Samuel Jackson', 
    'Department / Class': 'Grade 5-A',
    'Reference ID': 'MEM-24-001', 
    'Organization ID': 3, 
    'Mobile': '9876543210',
    'Gender': 'Male'
  },
  { 
    'Full Name': 'Alice Cooper', 
    'Department / Class': 'Grade 10-B',
    'Reference ID': 'MEM-24-002', 
    'Organization ID': 3, 
    'Mobile': '',
    'Gender': 'Female'
  },
  { 
    'Full Name': 'Robert Downy', 
    'Department / Class': 'Cardiology',
    'Reference ID': '', 
    'Organization ID': 3, 
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
