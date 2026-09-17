const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const documentProcessingService = require('../services/documentProcessingService');
const validationService = require('../services/validationService');
const riskAssessmentService = require('../services/riskAssessmentService');
const storageService = require('../services/storageService');

const VALID_DOCUMENT_TYPES = {
  GOVERNMENT_ID: 'GOVERNMENT_ID',
  BANK_STATEMENT: 'BANK_STATEMENT',
  ADDRESS_PROOF: 'ADDRESS_PROOF',
  SUPPORTING_DOCUMENT: 'SUPPORTING_DOCUMENT',
};

function normalizeDocumentType(input) {
  if (!input || typeof input !== 'string') return null;
  const cleaned = input.trim().toUpperCase().replace(/[\s-]+/g, '_');

  if (cleaned === 'GOVERNMENT_ID' || cleaned === 'GOVERNMENT' || cleaned === 'ID') {
    return VALID_DOCUMENT_TYPES.GOVERNMENT_ID;
  }
  if (cleaned === 'BANK_STATEMENT' || (cleaned.includes('BANK') && cleaned.includes('STATEMENT'))) {
    return VALID_DOCUMENT_TYPES.BANK_STATEMENT;
  }
  if (cleaned === 'ADDRESS_PROOF' || cleaned.includes('ADDRESS')) {
    return VALID_DOCUMENT_TYPES.ADDRESS_PROOF;
  }
  if (cleaned === 'SUPPORTING_DOCUMENT' || cleaned.includes('SUPPORTING')) {
    return VALID_DOCUMENT_TYPES.SUPPORTING_DOCUMENT;
  }

  return null;
}

/**
 * Upload a document for the authenticated customer
 * POST /api/documents/upload
 */
const uploadDocument = async (req, res) => {
  try {
    // 1. Verify user authentication and customer role
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication is required.',
      });
    }

    if ((req.user.role || '').toLowerCase() !== 'customer') {
      return res.status(403).json({
        success: false,
        error: 'Only customers are authorized to upload verification documents.',
      });
    }

    // 2. Validate uploaded file
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded. Please select a PDF, JPG, or PNG file.',
      });
    }

    // 3. Validate and normalize document type
    const rawDocType = req.body.documentType || req.body.document_type;
    const normalizedType = normalizeDocumentType(rawDocType);

    if (!normalizedType) {
      return res.status(400).json({
        success: false,
        error: 'Invalid document type. Allowed types: Government ID, Bank Statement, Address Proof, Supporting Document.',
      });
    }

    // 4. Ensure database table exists
    let pool;
    try {
      pool = db.getDatabasePool();
      if (typeof db.ensureDocumentsTable === 'function') {
        await db.ensureDocumentsTable();
      }
    } catch (configError) {
      return res.status(503).json({
        success: false,
        error: 'Database configuration unavailable.',
        details: configError.message,
      });
    }

    // 5. Get or create active verification case for customer
    const verificationCase = await db.getOrCreateVerificationCase(req.user.id);

    // Save to storage (supports local disk and Vercel Blob cloud storage)
    const storageResult = await storageService.saveFile(req.file);

    // 6. Insert document metadata into MySQL
    const [insertResult] = await pool.query(
      `INSERT INTO documents 
        (user_id, verification_case_id, document_type, original_filename, stored_filename, file_path, mime_type, file_size, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'UPLOADED')`,
      [
        req.user.id,
        verificationCase.id,
        normalizedType,
        req.file.originalname,
        storageResult.storedFilename || req.file.filename,
        storageResult.filePath || req.file.path,
        req.file.mimetype,
        req.file.size,
      ]
    );

    const documentId = insertResult.insertId;

    // 7. Non-blocking OCR and structured data extraction
    let processingResult = null;
    let finalStatus = 'UPLOADED';

    try {
      processingResult = await documentProcessingService.processDocument(
        documentId,
        req.file.path,
        req.file.mimetype,
        normalizedType
      );
      finalStatus = processingResult.status || 'PROCESSED';
    } catch (procErr) {
      console.error(`[Upload] Processing failed for document #${documentId}:`, procErr.message);
      finalStatus = 'EXTRACTION_FAILED';
      try {
        await pool.query('UPDATE documents SET status = ? WHERE id = ?', ['EXTRACTION_FAILED', documentId]);
      } catch (_) {}
    }

    // 8. Trigger cross-document validation across customer documents
    try {
      await validationService.validateVerificationCase(verificationCase.id);
      // 9. Trigger automated risk scoring based on validation results & document metrics
      await riskAssessmentService.assessRiskForCase(verificationCase.id);
    } catch (valErr) {
      console.error(`[Upload] Validation/Risk pipeline error for case #${verificationCase.id}:`, valErr.message);
    }

    return res.status(201).json({
      success: true,
      message:
        finalStatus === 'PROCESSED'
          ? 'Document uploaded and processed successfully.'
          : finalStatus === 'EXTRACTION_FAILED'
          ? 'Document uploaded successfully, but text extraction failed.'
          : 'Document uploaded successfully.',
      document: {
        id: documentId,
        userId: req.user.id,
        verificationCaseId: verificationCase.id,
        documentType: normalizedType,
        originalFilename: req.file.originalname,
        storedFilename: req.file.filename,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        status: finalStatus,
        createdAt: new Date(),
      },
      extractedFieldsCount: processingResult?.fields?.length || 0,
    });
  } catch (error) {
    console.error('Document upload error:', error);
    return res.status(500).json({
      success: false,
      error: 'An error occurred while uploading the document.',
      details: error.message,
    });
  }
};

/**
 * Get all documents for the authenticated customer
 * GET /api/documents/my
 */
const getMyDocuments = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication is required.',
      });
    }

    let pool;
    try {
      pool = db.getDatabasePool();
      if (typeof db.ensureDocumentsTable === 'function') {
        await db.ensureDocumentsTable();
      }
    } catch (configError) {
      return res.status(503).json({
        success: false,
        error: 'Database configuration unavailable.',
        details: configError.message,
      });
    }

    const [rows] = await pool.query(
      `SELECT id, user_id, document_type, original_filename, stored_filename, mime_type, file_size, status, created_at, updated_at
       FROM documents
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    return res.json({
      success: true,
      documents: rows.map((doc) => ({
        id: doc.id,
        userId: doc.user_id,
        documentType: doc.document_type,
        originalFilename: doc.original_filename,
        storedFilename: doc.stored_filename,
        mimeType: doc.mime_type,
        fileSize: doc.file_size,
        status: doc.status,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
      })),
    });
  } catch (error) {
    console.error('Get documents error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve documents.',
      details: error.message,
    });
  }
};

/**
 * GET /api/documents/:documentId/file
 * Secure document file stream.
 * Access restricted to owner customer or authorized officer.
 * Never served via public static URL.
 */
const getDocumentFile = async (req, res) => {
  try {
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
        error: 'Invalid document ID.',
      });
    }

    const pool = db.getDatabasePool();
    const [docs] = await pool.query(
      'SELECT id, user_id, original_filename, stored_filename, file_path, mime_type, file_size FROM documents WHERE id = ?',
      [documentId]
    );

    if (docs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Document not found.',
      });
    }

    const doc = docs[0];
    const isOwner = Number(req.user.id) === Number(doc.user_id);
    const isOfficer = (req.user.role || '').toLowerCase() === 'officer';

    if (!isOwner && !isOfficer) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You do not have permission to view this document.',
      });
    }

    return await storageService.streamDocument(doc, res);
  } catch (error) {
    console.error('[DocumentController] Error streaming document file:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to access document file.',
      details: error.message,
    });
  }
};

module.exports = {
  uploadDocument,
  getMyDocuments,
  getDocumentFile,
  normalizeDocumentType,
};
