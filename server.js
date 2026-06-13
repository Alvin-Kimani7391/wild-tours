const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const passport = require('passport');
const path = require('path');
require('dotenv').config();

// Route imports
const authRoutes = require('./routes/auth');
const tourRoutes = require('./routes/tours');
const volunteerRoutes = require('./routes/volunteer');
const bookingRoutes = require('./routes/bookings');
const applicationRoutes = require('./routes/applications');
const paymentRoutes = require('./routes/payments');
const userRoutes = require('./routes/users');
const reviewRoutes = require('./routes/reviews');
const blogRoutes = require('./routes/blog');
const dashboardRoutes = require('./routes/dashboard');
const uploadRoutes = require('./routes/uploads');

// Passport config
require('./config/passport')(passport);

const app = express();

const corsOptions = {
  origin: [
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    process.env.CLIENT_URL
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));


// ── SECURITY MIDDLEWARE ──────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(mongoSanitize());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, message: 'Too many requests, please try again later.' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts, please try again in 15 minutes.' }
});
app.use('/api/', limiter);
app.use('/api/auth/', authLimiter);


app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(passport.initialize());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ── STATIC FILES ─────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── ROUTES ───────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/tours', tourRoutes);
app.use('/api/volunteer', volunteerRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/blog', blogRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/uploads', uploadRoutes);

// ── HEALTH CHECK ─────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'WildRoots Africa API is running', timestamp: new Date().toISOString() });
});

// ── 404 HANDLER ──────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ── GLOBAL ERROR HANDLER ─────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ── DATABASE & START ─────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
.then(() => {
  console.log('✅ MongoDB Connected');
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 WildRoots API running on port ${PORT} [${process.env.NODE_ENV}]`);
  });
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  process.exit(1);
});

module.exports = app;