console.log('[INDEX] Booting...');
setInterval(() => {}, 60000); // Keep-alive anchor
require('dotenv').config();
const express = require('express');
const cors = require('cors');
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

// Protected routes example
app.get('/api/user/profile', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Backend API - V3' });
});

// Export app for Vercel serverless environment
module.exports = app;

console.log('[INDEX] Attempting to listen on port', PORT);
const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
console.log('[INDEX] Bootstrap complete');
