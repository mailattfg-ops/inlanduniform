const supabase = require('../config/supabase');

/**
 * Service to handle core database operations.
 * Assumes tables (schools, classes, students, measurements) exist.
 */

exports.getStudents = async () => {
  const { data, error } = await supabase
    .from('students')
    .select(`
      *,
      schools(name),
      classes(name),
      measurements(*)
    `);
  
  if (error) throw error;
  return data;
};

exports.registerStudent = async (studentData) => {
  const { data, error } = await supabase
    .from('students')
    .insert([studentData])
    .select();
  
  if (error) throw error;
  return data[0];
};

exports.updateMeasurements = async (studentId, measurementData) => {
  const { data, error } = await supabase
    .from('measurements')
    .upsert({
      student_id: studentId,
      ...measurementData,
      last_sync: new Date().toISOString()
    })
    .select();
  
  if (error) throw error;
  return data[0];
};

exports.getSchools = async () => {
    const { data, error } = await supabase.from('schools').select('*');
    if (error) throw error;
    return data;
};
