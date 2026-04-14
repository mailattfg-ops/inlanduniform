# 🟢 Backend Rules (Express + Supabase)

---

## 📁 Project Structure
- `routes/` → API endpoints
- `controllers/` → request handling
- `services/` → business logic
- `migrations/` → database schema changes
- `config/` → setup files (Supabase, env)

---

## 🗄️ Database & Migration Rules

### 1. 📦 Separate Migration per Feature/Module
- Each module MUST have its own migration file.

Examples:
- `create_users_table.sql`
- `create_orders_table.sql`
- `create_products_table.sql`

❌ **Do NOT** combine multiple modules in one migration file  
✅ **One responsibility** per migration

---

### 2. 🔗 Maintain Proper Table Relationships
- Always define relationships clearly using:
  - Foreign Keys
  - Constraints
  - Indexes

Example:
- `orders.user_id` → `users.id`
- `order_items.order_id` → `orders.id`
