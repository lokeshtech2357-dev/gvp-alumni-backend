const express = require("express");
const mongoose = require("mongoose");
const dns = require("dns");
const cors = require("cors");
const path = require('path');
const envPath = path.resolve(__dirname, '.env');
require("dotenv").config({ path: envPath });

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const app = express();

// middleware
app.use(cors({
  origin: ["https://gvp-alumni-frontend.vercel.app"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));


// simple request logger to help debug uploads
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()}  ${req.method} ${req.url}`);
  next();
});

// Serve frontend public images so backend-generated image URLs work
app.use('/images', express.static(path.join(__dirname, '..', 'frontend', 'public', 'images')));

// Serve uploaded files from backend
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// test route
app.get("/", (req, res) => {
  res.send("Backend Running 🚀");
});

const authRoutes = require("./routes/authRoutes");
const contentRoutes = require("./routes/contentRoutes");
const alumniStackRoutes = require("./routes/alumniStackRoutes");
const eventRoutes = require("./routes/eventRoutes");
const contactRoutes = require("./routes/contactRoutes");
const heritageRoutes = require("./routes/heritageRoutes");
const galleryRoutes = require("./routes/galleryRoutes");
const sponsorRoutes = require("./routes/sponsorRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const entrepreneurRoutes = require("./routes/entrepreneurRoutes");
const alumniStoryRoutes = require("./routes/alumniStoryRoutes");
const subscriberRoutes = require("./routes/subscriberRoutes");
const userRoutes = require("./routes/userRoutes");
const alumniRecordRoutes = require("./routes/alumniRecordRoutes");
const alumniVerificationRoutes = require('./routes/alumniVerificationRoutes');

// auth routes
app.use("/api/auth", authRoutes);
app.use('/api/auth/users', userRoutes);

// gallery routes
app.use("/api/gallery", galleryRoutes);

// sponsor routes
app.use("/api/sponsors", sponsorRoutes);

// content routes
app.use("/api/content", contentRoutes);

// alumni stories routes
app.use("/api/stories", alumniStoryRoutes);

// alumni stack routes
app.use("/api/alumni", alumniStackRoutes);

// events routes
app.use("/api/events", eventRoutes);

// contact routes
app.use("/api/contacts", contactRoutes);

// heritage routes
app.use("/api/heritage", heritageRoutes);

// notification routes
app.use('/api/notifications', notificationRoutes);

// entrepreneur routes
app.use('/api/entrepreneurs', entrepreneurRoutes);

// subscriber routes (newsletter)
app.use('/api/subscribers', subscriberRoutes);
app.use('/api/alumni-records', alumniRecordRoutes);
app.use('/api/alumni-verification', alumniVerificationRoutes);

// DB connect
const connectDB = require('./config/database');
connectDB();

// global error handler — log full details and return JSON
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const status = err && err.status ? err.status : 500;
  res.status(status).json({ success: false, message: err && err.message ? err.message : String(err) });
});

// server start
app.listen(5000, () => {
  console.log("Server running on port 5000");
});