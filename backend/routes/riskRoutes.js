const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const riskController = require('../controllers/riskController');

// All risk endpoints require valid JWT authentication
router.use(authMiddleware);

// GET /api/risk/my - Logged-in customer sanitized review status
router.get('/my', riskController.getMyRisk);

// GET /api/risk/:verificationId - Role-based risk evaluation endpoint
router.get('/:verificationId', riskController.getRiskByCaseId);

// POST /api/risk/:verificationId/calculate - Re-calculate risk score & factors
router.post('/:verificationId/calculate', riskController.calculateRiskByCaseId);

module.exports = router;
