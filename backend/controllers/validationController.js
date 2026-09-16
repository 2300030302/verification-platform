const db = require('../config/database');
const validationService = require('../services/validationService');
const riskAssessmentService = require('../services/riskAssessmentService');

/**
 * Builds customer-friendly summary findings without exposing internal officer-only details.
 */
function buildCustomerFindings(checks) {
  return checks.map((c) => {
    let icon = '✅';
    let label = '';

    if (c.status === 'passed') {
      icon = '✅';
    } else if (c.status === 'warning') {
      icon = '⚠️';
    } else {
      icon = '❌';
    }

    switch (c.checkType || c.check_type) {
      case 'NAME_CONSISTENCY':
        label =
          c.status === 'passed'
            ? 'Identity information matches'
            : c.status === 'warning'
            ? 'Identity information has minor variation'
            : 'Identity information needs review';
        break;

      case 'ADDRESS_CONSISTENCY':
        label =
          c.status === 'passed'
            ? 'Address information matches'
            : 'Address information needs review';
        break;

      case 'DOCUMENT_EXPIRY':
        label =
          c.status === 'passed'
            ? 'Identification document is valid'
            : c.status === 'warning'
            ? 'Identification document expiring soon'
            : 'Identification document expired';
        break;

      case 'REQUIRED_DOCUMENTS':
      default:
        label =
          c.status === 'passed'
            ? 'All required documents submitted'
            : 'Required documents pending';
        break;
    }

    return {
      icon,
      checkType: c.checkType || c.check_type,
      label,
      status: c.status,
      message: c.message,
    };
  });
}

/**
 * GET /api/validation/:verificationId
 * Access restricted to case owner or authorized officer.
 */
const getValidationByCaseId = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication is required.',
      });
    }

    const { verificationId } = req.params;
    if (!verificationId || isNaN(Number(verificationId))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification ID parameter.',
      });
    }

    const pool = db.getDatabasePool();
    const [cases] = await pool.query(
      'SELECT id, user_id, status FROM verification_cases WHERE id = ?',
      [verificationId]
    );

    if (cases.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Verification case not found.',
      });
    }

    const vCase = cases[0];

    // Security Authorization Check: Owner or Officer
    const isOwner = Number(req.user.id) === Number(vCase.user_id);
    const isOfficer = (req.user.role || '').toLowerCase() === 'officer';

    if (!isOwner && !isOfficer) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You do not have permission to view this verification case.',
      });
    }

    // Retrieve or run validation
    let results = await validationService.getValidationResults(verificationId);
    if (!results || results.checks.length === 0) {
      results = await validationService.validateVerificationCase(verificationId);
    }

    const customerFindings = buildCustomerFindings(results.checks);

    return res.json({
      success: true,
      verificationId: Number(verificationId),
      overallStatus: results.overallStatus,
      checks: results.checks,
      findings: customerFindings,
    });
  } catch (error) {
    console.error('[ValidationController] Error fetching validation:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve validation results.',
      details: error.message,
    });
  }
};

/**
 * POST /api/validation/:verificationId/run
 * Re-runs cross-document validation for the specified case.
 */
const runValidationByCaseId = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication is required.',
      });
    }

    const { verificationId } = req.params;
    if (!verificationId || isNaN(Number(verificationId))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification ID parameter.',
      });
    }

    const pool = db.getDatabasePool();
    const [cases] = await pool.query(
      'SELECT id, user_id, status FROM verification_cases WHERE id = ?',
      [verificationId]
    );

    if (cases.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Verification case not found.',
      });
    }

    const vCase = cases[0];

    // Security Authorization Check: Owner or Officer
    const isOwner = Number(req.user.id) === Number(vCase.user_id);
    const isOfficer = (req.user.role || '').toLowerCase() === 'officer';

    if (!isOwner && !isOfficer) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You do not have permission to run validation for this verification case.',
      });
    }

    const results = await validationService.validateVerificationCase(verificationId);
    try {
      await riskAssessmentService.assessRiskForCase(verificationId);
    } catch (riskErr) {
      console.error('[Validation] Risk assessment trigger error:', riskErr.message);
    }
    const customerFindings = buildCustomerFindings(results.checks);

    return res.json({
      success: true,
      message: 'Cross-document validation executed successfully.',
      verificationId: Number(verificationId),
      overallStatus: results.overallStatus,
      checks: results.checks,
      findings: customerFindings,
    });
  } catch (error) {
    console.error('[ValidationController] Error running validation:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to run cross-document validation.',
      details: error.message,
    });
  }
};

/**
 * GET /api/validation/my
 * Convenience endpoint for the logged-in customer's active verification case.
 */
const getMyValidation = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication is required.',
      });
    }

    // Get or create customer's active case
    const vCase = await db.getOrCreateVerificationCase(req.user.id);

    let results = await validationService.getValidationResults(vCase.id);
    if (!results || results.checks.length === 0) {
      results = await validationService.validateVerificationCase(vCase.id);
    }

    const customerFindings = buildCustomerFindings(results.checks);

    return res.json({
      success: true,
      verificationId: vCase.id,
      caseStatus: vCase.status,
      overallStatus: results.overallStatus,
      checks: results.checks,
      findings: customerFindings,
    });
  } catch (error) {
    console.error('[ValidationController] Error fetching my validation:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve your verification status.',
      details: error.message,
    });
  }
};

module.exports = {
  getValidationByCaseId,
  runValidationByCaseId,
  getMyValidation,
};
