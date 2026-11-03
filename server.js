const express = require('express');
const path = require('path');
const cors = require('cors');
const envPath = path.resolve(__dirname, '.env');
require('dotenv').config({ path: envPath });

const app = express();
const configuredOrigins = (process.env.FRONTEND_URL || process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const allowedOrigins = new Set(configuredOrigins);

if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.add('http://localhost:3000');
  allowedOrigins.add('http://localhost:3001');
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('CORS origin is not allowed.'));
  },
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.get('/', (req, res) => {
  res.json({ success: true, message: 'GVP Alumni API is running.' });
});

const connectDB = require('./config/database');
app.use('/api', async (req, res, next) => {
  try {
    await connectDB();
    return next();
  } catch (error) {
    if (
      process.env.NODE_ENV !== 'production' &&
      req.path.startsWith('/contacts')
    ) {
      return next();
    }

    console.error('Database connection unavailable:', error.message);
    return res.status(503).json({ success: false, message: 'Database unavailable.' });
  }
});

const authRoutes = require('./routes/authRoutes');
const contentRoutes = require('./routes/contentRoutes');
const alumniStackRoutes = require('./routes/alumniStackRoutes');
const eventRoutes = require('./routes/eventRoutes');
const contactRoutes = require('./routes/contactRoutes');
const heritageRoutes = require('./routes/heritageRoutes');
const galleryRoutes = require('./routes/galleryRoutes');
const sponsorRoutes = require('./routes/sponsorRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const entrepreneurRoutes = require('./routes/entrepreneurRoutes');
const alumniStoryRoutes = require('./routes/alumniStoryRoutes');
const subscriberRoutes = require('./routes/subscriberRoutes');
const userRoutes = require('./routes/userRoutes');
const alumniRecordRoutes = require('./routes/alumniRecordRoutes');
const alumniVerificationRoutes = require('./routes/alumniVerificationRoutes');
const uploadRoutes = require('./routes/uploadRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/auth/users', userRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/sponsors', sponsorRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/stories', alumniStoryRoutes);
app.use('/api/alumni', alumniStackRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/heritage', heritageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/entrepreneurs', entrepreneurRoutes);
app.use('/api/subscribers', subscriberRoutes);
app.use('/api/alumni-records', alumniRecordRoutes);
app.use('/api/alumni-verification', alumniVerificationRoutes);
app.use('/api/uploads', uploadRoutes);

app.use((err, req, res, next) => {
  console.error('Unhandled request error:', err);
  const status = err.status || 500;
  return res.status(status).json({
    success: false,
    message: err.message || 'Internal server error.',
  });
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 5000;
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

module.exports = app;
