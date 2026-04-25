const XLSX = require('xlsx');
const path = require('path');

const data = [
  {
    full_name: 'John Doe',
    admission_no: 'ADM1001',
    school_id: 1,
    class_id: 1,
    contact_mobile: '9876543210',
    gender: 'Male'
  },
  {
    full_name: 'Jane Smith',
    admission_no: 'ADM1002',
    school_id: 1,
    class_id: 1,
    contact_mobile: '9876543211',
    gender: 'Female'
  }
];

const ws = XLSX.utils.json_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Students");

const outputPath = path.join(__dirname, '../../student_bulk_upload_template.xlsx');
XLSX.writeFile(wb, outputPath);
console.log('Template generated at:', outputPath);
