const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const validationController = require('../controllers/validationController');

// All validation endpoints require authentication
router.use(authMiddleware);

// GET /api/validation/my - Logged-in customer's verification findings
router.get('/my', validationController.getMyValidation);

// GET /api/validation/:verificationId - Specific case validation results
router.get('/:verificationId', validationController.getValidationByCaseId);

// POST /api/validation/:verificationId/run - Re-run validation for a case
router.post('/:verificationId/run', validationController.runValidationByCaseId);

module.exports = router;
