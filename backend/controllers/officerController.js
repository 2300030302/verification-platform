const officerService = require('../services/officerService');
const officerCopilotService = require('../services/officerCopilotService');
const db = require('../config/database');

/**
 * GET /api/officer/cases
 * Returns case queue list for compliance officers.
 */
const getCases = async (req, res) => {
  try {
    const cases = await officerService.listCases();
    return res.json({
      success: true,
      count: cases.length,
      cases,
    });
  } catch (error) {
    console.error('[OfficerController] Error fetching cases:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve cases queue.',
      details: error.message,
    });
  }
};

/**
 * GET /api/officer/cases/:verificationId
 * Returns full details of a verification case.
 */
const getCaseById = async (req, res) => {
  try {
    const { verificationId } = req.params;
    if (!verificationId || isNaN(Number(verificationId))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification ID parameter.',
      });
    }

    const caseDetails = await officerService.getCaseDetails(verificationId, req.user);
    return res.json({
      success: true,
      case: caseDetails,
      caseDetails,
    });
  } catch (error) {
    console.error('[OfficerController] Error fetching case details:', error);
    const status = error.message.includes('not found') ? 404 : 500;
    return res.status(status).json({
      success: false,
      error: error.message || 'Failed to retrieve case details.',
    });
  }
};

/**
 * POST /api/officer/cases/:verificationId/decision
 * Executes an official compliance determination (APPROVED, NEEDS_REVIEW, FLAGGED, REJECTED).
 */
const submitDecision = async (req, res) => {
  try {
    const { verificationId } = req.params;
    const { status, note } = req.body;

    if (!verificationId || isNaN(Number(verificationId))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification ID parameter.',
      });
    }

    if (!status || typeof status !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Status is required (APPROVED, NEEDS_REVIEW, FLAGGED, or REJECTED).',
      });
    }

    const result = await officerService.updateCaseDecision(
      verificationId,
      status,
      note,
      req.user
    );

    return res.json({
      success: true,
      message: `Case #${verificationId} status updated to ${result.status}.`,
      case: { id: Number(verificationId), status: result.status },
      ...result,
    });
  } catch (error) {
    console.error('[OfficerController] Error submitting decision:', error);
    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to update case decision.',
    });
  }
};

/**
 * POST /api/officer/cases/:verificationId/notes
 * Adds a compliance review note to a case.
 */
const addCaseNote = async (req, res) => {
  try {
    const { verificationId } = req.params;
    const { note } = req.body;

    if (!verificationId || isNaN(Number(verificationId))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification ID parameter.',
      });
    }

    if (!note || typeof note !== 'string' || note.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Note content is required.',
      });
    }

    const savedNote = await officerService.addCaseNote(verificationId, note, req.user);

    return res.status(201).json({
      success: true,
      message: 'Review note added successfully.',
      note: savedNote,
    });
  } catch (error) {
    console.error('[OfficerController] Error adding note:', error);
    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to add review note.',
    });
  }
};

/**
 * GET /api/officer/cases/:verificationId/notes
 * Returns all review notes for a case.
 */
const getCaseNotes = async (req, res) => {
  try {
    const { verificationId } = req.params;
    if (!verificationId || isNaN(Number(verificationId))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification ID parameter.',
      });
    }

    const notes = await officerService.getCaseNotes(verificationId);
    return res.json({
      success: true,
      count: notes.length,
      notes,
    });
  } catch (error) {
    console.error('[OfficerController] Error fetching notes:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve notes.',
      details: error.message,
    });
  }
};

/**
 * GET /api/officer/cases/:verificationId/audit-trail
 * Returns audit trail logs for a case.
 */
const getCaseAuditTrail = async (req, res) => {
  try {
    const { verificationId } = req.params;
    if (!verificationId || isNaN(Number(verificationId))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification ID parameter.',
      });
    }

    const auditTrail = await officerService.getCaseAuditTrail(verificationId);
    return res.json({
      success: true,
      count: auditTrail.length,
      auditTrail,
    });
  } catch (error) {
    console.error('[OfficerController] Error fetching audit trail:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve audit trail.',
      details: error.message,
    });
  }
};

/**
 * POST /api/officer/cases/:verificationId/copilot
 * Processes an AI Copilot inquiry for a verification case.
 */
const askCopilot = async (req, res) => {
  try {
    const { verificationId } = req.params;
    const { message } = req.body;

    if (!verificationId || isNaN(Number(verificationId))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification ID parameter.',
      });
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Inquiry message is required.',
      });
    }

    // Retrieve previous case chat history for conversation continuity
    const history = await db.getCaseChatHistory(req.user.id, verificationId, 10);

    const result = await officerCopilotService.generateCopilotResponse(
      verificationId,
      req.user,
      message,
      history
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[OfficerController] Error processing copilot request:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to process AI Copilot request.',
    });
  }
};

/**
 * GET /api/officer/cases/:verificationId/copilot/history
 * Returns the chat history for this officer and verification case.
 */
const getCopilotHistory = async (req, res) => {
  try {
    const { verificationId } = req.params;
    if (!verificationId || isNaN(Number(verificationId))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification ID parameter.',
      });
    }

    const history = await db.getCaseChatHistory(req.user.id, verificationId);
    return res.json({
      success: true,
      count: history.length,
      history,
    });
  } catch (error) {
    console.error('[OfficerController] Error fetching copilot history:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve copilot history.',
      details: error.message,
    });
  }
};

/**
 * DELETE /api/officer/cases/:verificationId/copilot/history
 * Clears the chat history for this officer and verification case.
 */
const clearCopilotHistory = async (req, res) => {
  try {
    const { verificationId } = req.params;
    if (!verificationId || isNaN(Number(verificationId))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification ID parameter.',
      });
    }

    await db.clearCaseChatHistory(req.user.id, verificationId);
    return res.json({
      success: true,
      message: 'Copilot chat history cleared successfully.',
    });
  } catch (error) {
    console.error('[OfficerController] Error clearing copilot history:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to clear copilot history.',
      details: error.message,
    });
  }
};

module.exports = {
  getCases,
  getCaseById,
  submitDecision,
  addCaseNote,
  getCaseNotes,
  getCaseAuditTrail,
  askCopilot,
  getCopilotHistory,
  clearCopilotHistory,
};

