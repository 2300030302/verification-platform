const db = require('../config/database');
const financialAnalysisService = require('../services/financialAnalysisService');

/**
 * GET /api/transactions/:verificationId
 * Returns extracted transactions for a verification case.
 * RBAC: Owner customer or any compliance officer.
 */
const getTransactionsByCaseId = async (req, res) => {
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
        error: 'Access denied. You do not have permission to view transactions for this case.',
      });
    }

    const transactions = await financialAnalysisService.getTransactions(verificationId);

    return res.json({
      success: true,
      verificationId: Number(verificationId),
      role: isOfficer ? 'officer' : 'customer',
      count: transactions.length,
      transactions,
    });
  } catch (error) {
    console.error('[TransactionController] Error getting transactions:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve transactions.',
      details: error.message,
    });
  }
};

/**
 * GET /api/financial-analysis/:verificationId
 * Returns financial analysis profile for a verification case.
 * RBAC & Privacy:
 * - Officers receive full analysis including summary, potential anomalies, and review disclaimers.
 * - Customers receive sanitized summary metrics without internal fraud/anomaly indicators.
 */
const getFinancialAnalysisByCaseId = async (req, res) => {
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
        error: 'Access denied. You do not have permission to view financial analysis for this case.',
      });
    }

    const analysis = await financialAnalysisService.analyzeVerificationCase(verificationId);

    // Officers receive full financial analysis including anomalies and compliance notes
    if (isOfficer) {
      return res.json({
        success: true,
        verificationId: Number(verificationId),
        userId: vCase.user_id,
        role: 'officer',
        summary: analysis.summary,
        hasAnomalies: analysis.hasAnomalies,
        anomalies: analysis.anomalies,
        disclaimer: analysis.disclaimer,
      });
    }

    // Customers receive sanitized summary metrics (no internal fraud flags or risk scoring heuristics)
    return res.json({
      success: true,
      verificationId: Number(verificationId),
      role: 'customer',
      summary: {
        totalCredits: analysis.summary.totalCredits,
        totalDebits: analysis.summary.totalDebits,
        transactionCount: analysis.summary.transactionCount,
        averageTransaction: analysis.summary.averageTransaction,
        averageBalance: analysis.summary.averageBalance,
        balanceTrend: analysis.summary.balanceTrend,
      },
    });
  } catch (error) {
    console.error('[TransactionController] Error getting financial analysis:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve financial analysis.',
      details: error.message,
    });
  }
};

/**
 * GET /api/transactions/my
 * Customer-convenience endpoint to fetch their own transactions.
 */
const getMyTransactions = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication is required.',
      });
    }

    const vCase = await db.getOrCreateVerificationCase(req.user.id);
    const transactions = await financialAnalysisService.getTransactions(vCase.id);

    return res.json({
      success: true,
      verificationId: vCase.id,
      role: 'customer',
      count: transactions.length,
      transactions,
    });
  } catch (error) {
    console.error('[TransactionController] Error getting my transactions:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve your transactions.',
      details: error.message,
    });
  }
};

/**
 * GET /api/financial-analysis/my
 * Customer-convenience endpoint to fetch their sanitized financial summary.
 */
const getMyFinancialAnalysis = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication is required.',
      });
    }

    const vCase = await db.getOrCreateVerificationCase(req.user.id);
    const analysis = await financialAnalysisService.analyzeVerificationCase(vCase.id);

    return res.json({
      success: true,
      verificationId: vCase.id,
      role: 'customer',
      summary: {
        totalCredits: analysis.summary.totalCredits,
        totalDebits: analysis.summary.totalDebits,
        transactionCount: analysis.summary.transactionCount,
        averageTransaction: analysis.summary.averageTransaction,
        averageBalance: analysis.summary.averageBalance,
        balanceTrend: analysis.summary.balanceTrend,
      },
    });
  } catch (error) {
    console.error('[TransactionController] Error getting my financial analysis:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve your financial analysis.',
      details: error.message,
    });
  }
};

module.exports = {
  getTransactionsByCaseId,
  getFinancialAnalysisByCaseId,
  getMyTransactions,
  getMyFinancialAnalysis,
};
