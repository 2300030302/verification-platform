const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const officerController = require('../controllers/officerController');

// All officer routes require authentication
router.use(authMiddleware);

// Strict officer role-based access control
router.use((req, res, next) => {
  const role = (req.user && req.user.role ? req.user.role : '').toLowerCase();
  if (role !== 'officer') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Compliance officer privileges required.',
    });
  }
  next();
});

// Case queue
router.get('/cases', officerController.getCases);

// Full case details
router.get('/cases/:verificationId', officerController.getCaseById);

// Verification decision (APPROVED, NEEDS_REVIEW, FLAGGED, REJECTED)
router.post('/cases/:verificationId/decision', officerController.submitDecision);

// Compliance review notes
router.post('/cases/:verificationId/notes', officerController.addCaseNote);
router.get('/cases/:verificationId/notes', officerController.getCaseNotes);

// Audit trail
router.get('/cases/:verificationId/audit-trail', officerController.getCaseAuditTrail);

// AI Compliance Copilot
router.post('/cases/:verificationId/copilot', officerController.askCopilot);
router.get('/cases/:verificationId/copilot/history', officerController.getCopilotHistory);
router.delete('/cases/:verificationId/copilot/history', officerController.clearCopilotHistory);

module.exports = router;
