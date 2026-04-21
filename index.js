require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5000;

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const userRoutes = require('./routes/user');
const schoolRoutes = require('./routes/school');
const { authMiddleware } = require('./middleware/authMiddleware');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/employees', require('./routes/employee'));
app.use('/api/measurements', require('./routes/measurement'));
app.use('/api/products', require('./routes/product'));
app.use('/api/templates', require('./routes/template'));
app.use('/api/inventory', require('./routes/inventory'));

// Protected routes example
app.get('/api/user/profile', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Backend API' });
});

// Export app for Vercel serverless environment
module.exports = app;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}
