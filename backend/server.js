const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const { checkDatabaseConnection } = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const documentRoutes = require('./routes/documentRoutes');
const extractedDataRoutes = require('./routes/extractedDataRoutes');
const validationRoutes = require('./routes/validationRoutes');
const riskRoutes = require('./routes/riskRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const financialAnalysisRoutes = require('./routes/financialAnalysisRoutes');
const officerRoutes = require('./routes/officerRoutes');
const chatRoutes = require('./routes/chatRoutes');
const app = express();
const PORT = process.env.PORT || 3001;

// Configurable CORS supporting local dev and Vercel production
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:4173',
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL.replace(/\/$/, ''));
}
if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(process.env.CORS_ORIGIN.replace(/\/$/, ''));
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (/vercel\.app$/.test(origin)) return callback(null, true);
    // Allow same-origin and cloud deployments by default
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Add body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoints (accessible both with and without /api prefix)
app.get(['/api/health', '/health'], (req, res) => {
  res.json({ status: 'ok', service: 'backend' });
});

// Checks the real MySQL connection without exposing database credentials.
app.get(['/api/health/database', '/health/database'], async (req, res) => {
  const databaseStatus = await checkDatabaseConnection();

  res.status(databaseStatus.connected ? 200 : 503).json({
    status: databaseStatus.connected ? 'ok' : 'unavailable',
    database: databaseStatus,
  });
});

// Test endpoint to verify routing
app.get(['/api/test', '/test'], (req, res) => {
  res.json({ message: 'Test endpoint working', path: req.path });
});

// Authentication routes (mount on both /api/auth and /auth for universal Vercel rewrite compatibility)
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);

// Document management routes
app.use('/api/documents', documentRoutes);
app.use('/documents', documentRoutes);

// Extracted data routes
app.use('/api/extracted-data', extractedDataRoutes);
app.use('/extracted-data', extractedDataRoutes);

// Validation routes
app.use('/api/validation', validationRoutes);
app.use('/validation', validationRoutes);

// Risk assessment routes
app.use('/api/risk', riskRoutes);
app.use('/risk', riskRoutes);

// Transaction routes
app.use('/api/transactions', transactionRoutes);
app.use('/transactions', transactionRoutes);

// Financial analysis routes
app.use('/api/financial-analysis', financialAnalysisRoutes);
app.use('/financial-analysis', financialAnalysisRoutes);

// Compliance officer workspace routes
app.use('/api/officer', officerRoutes);
app.use('/officer', officerRoutes);

// Customer AI assistant chat routes
app.use('/api/chat', chatRoutes);
app.use('/chat', chatRoutes);

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('[Server Error]', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File size exceeds the 10MB limit'
      });
    }
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
  
  if (error.message && error.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
  
  if (!res.headersSent) {
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
