-- 1. Add username column to user_profiles
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- 2. Add 'School' to user_types
INSERT INTO user_types (id, name, permissions)
VALUES ('3e8ef077-f264-44b3-b37e-74e98fb6c0e7', 'School', '["view_own_students", "manage_classes", "view_own_measurements"]')
ON CONFLICT (id) DO UPDATE SET permissions = EXCLUDED.permissions;

-- 3. Add user_id to schools table
ALTER TABLE schools
ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL;
