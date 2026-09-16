const db = require('../config/database');
const { getExtractedDataByDocument } = require('../services/documentProcessingService');

/**
 * Get extracted data for a specific document.
 * Enforces ownership: only the document owner or an authorized OFFICER can access.
 * GET /api/extracted-data/:documentId
 */
const getExtractedData = async (req, res) => {
  try {
    // 1. Authenticated user check
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication is required.',
      });
    }

    const { documentId } = req.params;
    if (!documentId || isNaN(Number(documentId))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid document ID parameter.',
      });
    }

    const pool = db.getDatabasePool();

    // 2. Fetch document record to verify ownership
    const [docs] = await pool.query(
      'SELECT id, user_id, document_type, original_filename, stored_filename, status, created_at FROM documents WHERE id = ?',
      [documentId]
    );

    if (docs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Document not found.',
      });
    }

    const document = docs[0];

    // 3. Security Check: owner or officer only
    const isOwner = Number(req.user.id) === Number(document.user_id);
    const isOfficer = (req.user.role || '').toLowerCase() === 'officer';

    if (!isOwner && !isOfficer) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You do not have permission to view extracted data for this document.',
      });
    }

    // 4. Retrieve extracted fields
    const { fields, fieldMap } = await getExtractedDataByDocument(documentId);

    return res.json({
      success: true,
      document: {
        id: document.id,
        userId: document.user_id,
        documentType: document.document_type,
        originalFilename: document.original_filename,
        status: document.status,
        createdAt: document.created_at,
      },
      extractedData: fieldMap,
      fields,
    });
  } catch (error) {
    console.error('[ExtractedDataController] Error fetching extracted data:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve extracted data.',
      details: error.message,
    });
  }
};

module.exports = {
  getExtractedData,
};
