const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const transactionController = require('../controllers/transactionController');

// All financial analysis endpoints require JWT authentication
router.use(authMiddleware);

// GET /api/financial-analysis/my - Active customer's sanitized summary
router.get('/my', transactionController.getMyFinancialAnalysis);

// GET /api/financial-analysis/:verificationId - Role-based financial analysis
router.get('/:verificationId', transactionController.getFinancialAnalysisByCaseId);

module.exports = router;
