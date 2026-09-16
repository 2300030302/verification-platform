const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const extractedDataController = require('../controllers/extractedDataController');

// All extracted-data endpoints require a valid JWT
router.use(authMiddleware);

// GET /api/extracted-data/:documentId
router.get('/:documentId', extractedDataController.getExtractedData);

module.exports = router;
