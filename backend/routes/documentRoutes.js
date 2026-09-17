const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middleware/authMiddleware');
const documentController = require('../controllers/documentController');

const os = require('os');

// Ensure uploads directory exists (use temp directory if running on serverless Vercel)
const uploadsDir = process.env.VERCEL
  ? path.join(os.tmpdir(), 'verification_uploads')
  : path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (_) {}
}

// Multer disk storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  },
});

// File filter: accept only PDF, JPG, PNG
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, JPG, and PNG are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// Middleware to handle Multer upload errors gracefully
const handleUpload = (req, res, next) => {
  upload.single('document')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: 'File size exceeds the 10MB limit.',
          });
        }
        return res.status(400).json({
          success: false,
          error: err.message,
        });
      }
      if (err.message && err.message.includes('Invalid file type')) {
        return res.status(400).json({
          success: false,
          error: err.message,
        });
      }
      return res.status(400).json({
        success: false,
        error: err.message || 'File upload failed.',
      });
    }
    next();
  });
};

// All document routes require authentication
router.use(authMiddleware);

// Upload a document
router.post('/upload', handleUpload, documentController.uploadDocument);

// Get my documents
router.get('/my', documentController.getMyDocuments);

// Secure document file preview/download
router.get('/:documentId/file', documentController.getDocumentFile);

module.exports = router;
