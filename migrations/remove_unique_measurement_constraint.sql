-- Allow multiple rows per student to support history and staged approvals
ALTER TABLE measurements DROP CONSTRAINT IF EXISTS measurements_student_id_key;
ALTER TABLE measurements DROP CONSTRAINT IF EXISTS measurements_member_id_key;
