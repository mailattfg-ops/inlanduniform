console.log('[INDEX] Booting...');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pingSupabase = require('./scripts/ping_supabase');

const app = express();
const PORT = process.env.PORT || 5000;
const { authMiddleware } = require('./middleware/authMiddleware');

const authRoutes = require('./routes/auth');
const memberRoutes = require('./routes/member');
const userRoutes = require('./routes/user');
const organizationRoutes = require('./routes/organization.js');
const departmentRoutes = require('./routes/department.js');
const industryRoutes = require('./routes/industry.js');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes); 
app.use('/api/students', memberRoutes); // Alias for legacy support
app.use('/api/organizations', organizationRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/industries', industryRoutes);
app.use('/api/users', userRoutes);
app.use('/api/user', userRoutes); // Alias for consistency with some frontend calls
app.use('/api/employees', require('./routes/employee.js'));
app.use('/api/measurements', require('./routes/measurement.js'));
app.use('/api/products', require('./routes/product.js'));
app.use('/api/product-types', require('./routes/productType.js'));
app.use('/api/art-number-hub', require('./routes/artNumberHub.js'));
app.use('/api/templates', require('./routes/template.js'));
app.use('/api/staff-measurements', require('./routes/staffMeasurement.js'));
app.use('/api/inventory', require('./routes/inventory.js'));
app.use('/api/dashboard', require('./routes/dashboard.js'));
app.use('/api/size-charts', require('./routes/size-charts.js'));
app.use('/api/audit', require('./routes/audit.js'));
app.use('/api/quotations', require('./routes/quotation.js'));
app.use('/api/payments', require('./routes/payment.js'));
app.use('/api/orders', require('./routes/order.js'));
app.use('/api/sam-management', require('./routes/samManagement.js'));
app.use('/api/company-settings', require('./routes/companySettings.js'));
app.use('/api/vendors', require('./routes/vendors.js'));
app.use('/api/leads', require('./routes/leads.js'));
app.use('/api/branches', require('./routes/branches.js'));
app.use('/api/job-cards', require('./routes/jobCard.js'));
app.use('/api/invoices', require('./routes/invoices.js'));
app.use('/api/delivery-challans', require('./routes/deliveryChallans.js'));
app.use('/api/measurement-tokens', require('./routes/measurementTokens.js'));

// Protected routes example
app.get('/api/user/profile', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/ping', async (req, res) => {
  const success = await pingSupabase();
  if (success) {
    res.json({ success: true, message: 'Ping successful, database is active' });
  } else {
    res.status(500).json({ success: false, error: 'Ping failed' });
  }
});

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Backend API - V3' });
});

// Periodic database keep-alive ping when running as standalone server
if (require.main === module) {
  const PING_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours
  setInterval(() => {
    pingSupabase();
  }, PING_INTERVAL);

  setTimeout(() => {
    pingSupabase();
  }, 5000);

  console.log('[INDEX] Attempting to listen on port', PORT);
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
  console.log('[INDEX] Bootstrap complete');
}

// Export app for Vercel serverless environment
module.exports = app;

