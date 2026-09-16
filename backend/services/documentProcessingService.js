const db = require('../config/database');
const ocrService = require('./ocrService');
const extractionService = require('./extractionService');
const financialAnalysisService = require('./financialAnalysisService');

/**
 * Coordinates the full document processing pipeline:
 * 1. Mark document as PROCESSING
 * 2. Run OCR / Text extraction (PDF / Image)
 * 3. Extract structured key-value fields based on document type
 * 4. Save extracted fields to MySQL extracted_data table
 * 5. Update document status to PROCESSED (or EXTRACTION_FAILED on error)
 *
 * @param {number|string} documentId - MySQL ID of the document
 * @param {string} filePath - Absolute path to the stored file
 * @param {string} mimeType - MIME type of the file
 * @param {string} documentType - Category (e.g. GOVERNMENT_ID, BANK_STATEMENT, etc.)
 * @returns {Promise<{ success: boolean, status: string, fields?: Array, error?: string }>}
 */
async function processDocument(documentId, filePath, mimeType, documentType) {
  let pool;
  try {
    pool = db.getDatabasePool();
    if (typeof db.ensureExtractedDataTable === 'function') {
      await db.ensureExtractedDataTable();
    }
  } catch (dbErr) {
    console.error('[DocumentProcessor] Database connection error:', dbErr.message);
    return {
      success: false,
      status: 'EXTRACTION_FAILED',
      error: `Database connection error: ${dbErr.message}`,
    };
  }

  // 1. Mark document status as PROCESSING
  try {
    await pool.query('UPDATE documents SET status = ? WHERE id = ?', ['PROCESSING', documentId]);
  } catch (updateErr) {
    console.error('[DocumentProcessor] Failed to update status to PROCESSING:', updateErr.message);
  }

  // 2. Perform OCR / text extraction
  let ocrResult;
  try {
    console.log(`[DocumentProcessor] Starting text extraction for doc #${documentId} (${documentType}, ${mimeType})...`);
    ocrResult = await ocrService.extractText(filePath, mimeType);
  } catch (ocrErr) {
    console.error(`[DocumentProcessor] OCR extraction failed for doc #${documentId}:`, ocrErr.message);

    await pool.query('UPDATE documents SET status = ? WHERE id = ?', [
      'EXTRACTION_FAILED',
      documentId,
    ]);

    return {
      success: false,
      status: 'EXTRACTION_FAILED',
      error: ocrErr.message,
    };
  }

  // 3. Structured field extraction
  const rawText = (ocrResult && ocrResult.text) ? ocrResult.text : '';
  const fields = extractionService.extractStructuredFields(rawText, documentType);

  // 4. Save structured fields into MySQL extracted_data table
  try {
    // Delete any prior records for idempotency
    await pool.query('DELETE FROM extracted_data WHERE document_id = ?', [documentId]);

    if (fields.length > 0) {
      const values = fields.map((f) => [
        documentId,
        f.field_name,
        f.field_value || '',
        f.confidence || 1.0,
      ]);

      await pool.query(
        'INSERT INTO extracted_data (document_id, field_name, field_value, confidence) VALUES ?',
        [values]
      );
    }

    // 5. If Bank Statement, extract and persist real transactions
    if (documentType === 'BANK_STATEMENT') {
      try {
        const txns = extractionService.extractTransactions(rawText);
        if (txns.length > 0) {
          const [docRows] = await pool.query(
            'SELECT verification_case_id FROM documents WHERE id = ?',
            [documentId]
          );
          const vCaseId = docRows.length > 0 ? docRows[0].verification_case_id : null;
          if (vCaseId) {
            await financialAnalysisService.saveTransactions(vCaseId, documentId, txns);
            await financialAnalysisService.analyzeVerificationCase(vCaseId);
            console.log(
              `[DocumentProcessor] Saved and analyzed ${txns.length} transactions for verification case #${vCaseId}.`
            );
          }
        }
      } catch (txnErr) {
        console.warn(`[DocumentProcessor] Transaction extraction warning for doc #${documentId}:`, txnErr.message);
      }
    }

    // 6. Update document status to PROCESSED
    await pool.query('UPDATE documents SET status = ? WHERE id = ?', ['PROCESSED', documentId]);

    console.log(
      `[DocumentProcessor] Successfully processed doc #${documentId}. Extracted ${fields.length} fields.`
    );

    return {
      success: true,
      status: 'PROCESSED',
      fields,
    };
  } catch (saveErr) {
    console.error(`[DocumentProcessor] Failed to save extracted fields for doc #${documentId}:`, saveErr.message);

    await pool.query('UPDATE documents SET status = ? WHERE id = ?', [
      'EXTRACTION_FAILED',
      documentId,
    ]);

    return {
      success: false,
      status: 'EXTRACTION_FAILED',
      error: `Database save error: ${saveErr.message}`,
    };
  }
}

/**
 * Fetch extracted data records for a document
 *
 * @param {number|string} documentId
 * @returns {Promise<{ fields: Array, fieldMap: Object }>}
 */
async function getExtractedDataByDocument(documentId) {
  const pool = db.getDatabasePool();
  if (typeof db.ensureExtractedDataTable === 'function') {
    await db.ensureExtractedDataTable();
  }

  const [rows] = await pool.query(
    'SELECT id, document_id, field_name, field_value, confidence, created_at FROM extracted_data WHERE document_id = ? ORDER BY id ASC',
    [documentId]
  );

  const fieldMap = {};
  const formattedFields = rows.map((r) => {
    fieldMap[r.field_name] = r.field_value;
    return {
      id: r.id,
      fieldName: r.field_name,
      fieldValue: r.field_value,
      confidence: Number(r.confidence),
      createdAt: r.created_at,
    };
  });

  return {
    fields: formattedFields,
    fieldMap,
  };
}

module.exports = {
  processDocument,
  getExtractedDataByDocument,
};
