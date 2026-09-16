const db = require('../config/database');
const riskAssessmentService = require('../services/riskAssessmentService');

/**
 * GET /api/risk/:verificationId
 * Enforces role-based visibility:
 * - Compliance Officers receive the full numeric risk score, tier, contributing factors, and manual review recommendation.
 * - Customers receive a sanitized verification status without exposing internal scoring heuristics or weights.
 */
const getRiskByCaseId = async (req, res) => {
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
    const isOwner = Number(req.user.id) === Number(vCase.user_id);
    const isOfficer = (req.user.role || '').toLowerCase() === 'officer';

    if (!isOwner && !isOfficer) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You do not have permission to view this risk assessment.',
      });
    }

    const assessment = await riskAssessmentService.getRiskAssessment(verificationId);

    // Officers receive the full explainable risk breakdown
    if (isOfficer) {
      return res.json({
        success: true,
        verificationId: Number(verificationId),
        userId: vCase.user_id,
        role: 'officer',
        riskScore: assessment.riskScore,
        riskLevel: assessment.riskLevel,
        riskFactors: assessment.riskFactors,
        explanation: assessment.explanation,
        recommendation: assessment.recommendation,
        createdAt: assessment.createdAt,
        updatedAt: assessment.updatedAt,
      });
    }

    // Customers receive a sanitized verification status (no internal risk weights)
    return res.json({
      success: true,
      verificationId: Number(verificationId),
      role: 'customer',
      verificationStatus: vCase.status === 'APPROVED' ? 'COMPLETED' : 'IN_REVIEW',
      message: 'Your verification is being reviewed. We will notify you once processing is complete.',
    });
  } catch (error) {
    console.error('[RiskController] Error fetching risk assessment:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve risk assessment.',
      details: error.message,
    });
  }
};

/**
 * POST /api/risk/:verificationId/calculate
 * Calculates/recalculates risk assessment for a verification case.
 */
const calculateRiskByCaseId = async (req, res) => {
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
    const isOwner = Number(req.user.id) === Number(vCase.user_id);
    const isOfficer = (req.user.role || '').toLowerCase() === 'officer';

    if (!isOwner && !isOfficer) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You do not have permission to run risk calculation for this case.',
      });
    }

    const assessment = await riskAssessmentService.assessRiskForCase(verificationId);

    if (isOfficer) {
      return res.json({
        success: true,
        message: 'Risk assessment calculated successfully.',
        verificationId: Number(verificationId),
        userId: vCase.user_id,
        role: 'officer',
        riskScore: assessment.riskScore,
        riskLevel: assessment.riskLevel,
        riskFactors: assessment.riskFactors,
        explanation: assessment.explanation,
        recommendation: assessment.recommendation,
      });
    }

    return res.json({
      success: true,
      message: 'Verification evaluation updated.',
      verificationId: Number(verificationId),
      role: 'customer',
      verificationStatus: 'IN_REVIEW',
    });
  } catch (error) {
    console.error('[RiskController] Error calculating risk assessment:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to calculate risk assessment.',
      details: error.message,
    });
  }
};

/**
 * GET /api/risk/my
 * Customer-safe endpoint to check active verification review status.
 */
const getMyRisk = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication is required.',
      });
    }

    const vCase = await db.getOrCreateVerificationCase(req.user.id);

    return res.json({
      success: true,
      verificationId: vCase.id,
      role: 'customer',
      verificationStatus: vCase.status === 'APPROVED' ? 'COMPLETED' : 'IN_REVIEW',
      message: 'Your verification is being reviewed. We will notify you once processing is complete.',
    });
  } catch (error) {
    console.error('[RiskController] Error fetching customer risk status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve your verification status.',
      details: error.message,
    });
  }
};

module.exports = {
  getRiskByCaseId,
  calculateRiskByCaseId,
  getMyRisk,
};
