-- Migration 07: Seed Default System Roles and Granular Permissions into user_types
-- This ensures all roles are visible, editable, and manageable from the Admin Controls User Roles page.

-- 1. Ensure unique constraint on name in user_types if not present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'user_types_name_unique'
    ) THEN
        ALTER TABLE user_types ADD CONSTRAINT user_types_name_unique UNIQUE (name);
    END IF;
EXCEPTION
    WHEN duplicate_table THEN NULL;
    WHEN others THEN NULL;
END $$;

-- 2. Upsert standard roles with their baseline permissions
INSERT INTO user_types (id, name, permissions)
VALUES 
       -- Admin
    (
        COALESCE((SELECT id FROM user_types WHERE name = 'Admin' LIMIT 1), gen_random_uuid()),
        'Admin',
        '["all"]'::jsonb
    ),
    -- Branch Manager: Full branch transaction & store operations authority
    (
        COALESCE((SELECT id FROM user_types WHERE name = 'Branch Manager' LIMIT 1), gen_random_uuid()),
        'Branch Manager',
        '["branch_inventory", "branch_sales", "branch_transfers", "view_employees", "view_organizations", "manage_schools", "view_schools", "manage_classes", "manage_departments", "view_students", "register_students", "manage_students", "view_products", "manage_products", "view_measurements", "manage_measurements", "manage_quotations", "view_quotations", "manage_invoices", "view_invoices"]'::jsonb
    ),
    -- Branch Staff: Counter POS sales, fittings, measurements, stock view
    (
        COALESCE((SELECT id FROM user_types WHERE name = 'Branch Staff' LIMIT 1), gen_random_uuid()),
        'Branch Staff',
        '["branch_inventory", "branch_sales", "view_organizations", "view_schools", "view_students", "register_students", "view_products", "view_measurements", "manage_measurements", "view_quotations", "view_invoices"]'::jsonb
    ),
    -- Factory PO Handler: Job Cards, PO review, allocation & production tracking
    (
        COALESCE((SELECT id FROM user_types WHERE name = 'Factory PO Handler' LIMIT 1), gen_random_uuid()),
        'Factory PO Handler',
        '["factory_po_handler", "factory_floor", "view_inventory", "manage_inventory"]'::jsonb
    ),
    -- Factory Production Staff: Production queue, floor execution, cutting, stitching
    (
        COALESCE((SELECT id FROM user_types WHERE name = 'Factory Production Staff' LIMIT 1), gen_random_uuid()),
        'Factory Production Staff',
        '["factory_floor"]'::jsonb
    ),
    -- Marketing Executive: Quotations, proposals, sales leads
    (
        COALESCE((SELECT id FROM user_types WHERE name = 'Marketing Executive' LIMIT 1), gen_random_uuid()),
        'Marketing Executive',
        '["manage_quotations", "view_quotations", "branch_sales", "view_organizations", "view_schools", "view_products"]'::jsonb
    ),
    -- Inventory Manager: Central warehouse, fabrics, trims, catalog
    (
        COALESCE((SELECT id FROM user_types WHERE name = 'Inventory Manager' LIMIT 1), gen_random_uuid()),
        'Inventory Manager',
        '["view_inventory", "manage_inventory", "view_products", "manage_products", "view_size_charts", "manage_size_charts"]'::jsonb
    ),
    -- Corporate Approver: Triage Sales Orders (Accept, Reject, Hold) from Branch Managers
    (
        COALESCE((SELECT id FROM user_types WHERE name = 'Corporate Approver' LIMIT 1), gen_random_uuid()),
        'Corporate Approver',
        '["corporate_approver", "view_quotations", "view_organizations", "view_schools", "view_products"]'::jsonb
    ),
    -- Organisation (School / Corporate Client Portal)
    (
        COALESCE((SELECT id FROM user_types WHERE name = 'Organisation' LIMIT 1), gen_random_uuid()),
        'Organisation',
        '["view_schools", "view_own_students", "manage_classes", "view_own_measurements"]'::jsonb
    ),
    -- Entity (Individual Student / Staff Client Portal)
    (
        COALESCE((SELECT id FROM user_types WHERE name = 'Entity' LIMIT 1), gen_random_uuid()),
        'Entity',
        '["view_own_students", "view_own_measurements"]'::jsonb
    )
ON CONFLICT (name) DO UPDATE 
SET permissions = EXCLUDED.permissions;
