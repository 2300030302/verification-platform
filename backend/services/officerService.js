const db = require('../config/database');
const validationService = require('./validationService');
const financialAnalysisService = require('./financialAnalysisService');
const riskAssessmentService = require('./riskAssessmentService');

const VALID_DECISIONS = ['APPROVED', 'NEEDS_REVIEW', 'FLAGGED', 'REJECTED'];

/**
 * Returns the queue of verification cases for compliance officers.
 * Includes customer name, case ID, submission date, status, risk score, and risk tier.
 *
 * @returns {Promise<Array<Object>>}
 */
async function listCases() {
  const pool = db.getDatabasePool();
  await db.ensureVerificationCasesTable();
  await db.ensureUsersTable();
  await db.ensureRiskAssessmentsTable();
  await db.ensureDocumentsTable();

  const [rows] = await pool.query(`
    SELECT 
      vc.id,
      vc.user_id,
      vc.status,
      vc.created_at,
      vc.updated_at,
      u.name AS customer_name,
      u.email AS customer_email,
      ra.risk_score,
      ra.risk_level,
      (SELECT COUNT(*) FROM documents d WHERE d.user_id = vc.user_id) AS document_count
    FROM verification_cases vc
    JOIN users u ON vc.user_id = u.id
    LEFT JOIN risk_assessments ra ON ra.verification_id = vc.id
    ORDER BY vc.created_at DESC
  `);

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    status: r.status,
    submissionDate: r.created_at,
    updatedAt: r.updated_at,
    documentCount: Number(r.document_count || 0),
    riskScore: r.risk_score !== null ? Number(r.risk_score) : null,
    riskLevel: r.risk_level || 'UNKNOWN',
  }));
}

/**
 * Retrieves full case review details for an authorized compliance officer:
 * - Customer basic info
 * - Submitted documents & metadata
 * - Extracted OCR field values with confidence
 * - Cross-document validation findings
 * - Financial analysis & anomaly profiling
 * - Stored risk score, tier, and factors
 * - Compliance review notes history
 * - Full audit trail
 *
 * @param {number|string} verificationId
 * @param {Object} officerUser
 * @returns {Promise<Object>}
 */
async function getCaseDetails(verificationId, officerUser) {
  const pool = db.getDatabasePool();
  await db.ensureVerificationCasesTable();
  await db.ensureUsersTable();
  await db.ensureDocumentsTable();
  await db.ensureExtractedDataTable();

  // 1. Fetch case & customer identity
  const [cases] = await pool.query(
    `SELECT vc.id, vc.user_id, vc.status, vc.created_at, vc.updated_at,
            u.name AS customer_name, u.email AS customer_email, u.role, u.created_at AS customer_registered_at
     FROM verification_cases vc
     JOIN users u ON vc.user_id = u.id
     WHERE vc.id = ?`,
    [verificationId]
  );

  if (cases.length === 0) {
    throw new Error(`Verification case #${verificationId} not found.`);
  }

  const vCase = cases[0];

  // 2. Fetch submitted documents and their extracted fields
  const [docs] = await pool.query(
    `SELECT id, user_id, document_type, original_filename, stored_filename, mime_type, file_size, status, created_at, updated_at
     FROM documents
     WHERE user_id = ?
     ORDER BY created_at ASC`,
    [vCase.user_id]
  );

  const documentDetails = [];
  for (const doc of docs) {
    const [fields] = await pool.query(
      `SELECT field_name, field_value, confidence, created_at 
       FROM extracted_data 
       WHERE document_id = ? 
       ORDER BY id ASC`,
      [doc.id]
    );

    documentDetails.push({
      id: doc.id,
      userId: doc.user_id,
      documentType: doc.document_type,
      originalFilename: doc.original_filename,
      storedFilename: doc.stored_filename,
      mimeType: doc.mime_type,
      fileSize: doc.file_size,
      status: doc.status,
      fileUrl: `/api/documents/${doc.id}/file`,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
      extractedFields: fields.map((f) => ({
        fieldName: f.field_name,
        fieldValue: f.field_value,
        confidence: Number(f.confidence),
      })),
    });
  }

  // 3. Fetch cross-document validation results
  let validation = null;
  try {
    validation = await validationService.getValidationResults(verificationId);
    if (!validation || validation.checks.length === 0) {
      validation = await validationService.validateVerificationCase(verificationId);
    }
  } catch (valErr) {
    console.warn(`[OfficerService] Validation lookup error for case #${verificationId}:`, valErr.message);
  }

  // 4. Fetch financial analysis & anomalies
  let financialAnalysis = null;
  try {
    financialAnalysis = await financialAnalysisService.analyzeVerificationCase(verificationId);
  } catch (finErr) {
    console.warn(`[OfficerService] Financial analysis error for case #${verificationId}:`, finErr.message);
  }

  // 5. Fetch risk assessment
  let riskAssessment = null;
  try {
    riskAssessment = await riskAssessmentService.getRiskAssessment(verificationId);
  } catch (riskErr) {
    console.warn(`[OfficerService] Risk assessment error for case #${verificationId}:`, riskErr.message);
  }

  // 6. Log audit event for case review opening
  if (officerUser && officerUser.name) {
    await db.addAuditLog(
      verificationId,
      officerUser.id || null,
      officerUser.name,
      'CASE_VIEWED',
      `Case #${verificationId} viewed in workspace by ${officerUser.name}`
    );
  }

  // 7. Fetch review notes & audit logs (including the CASE_VIEWED event just recorded)
  const notes = await db.getCaseNotes(verificationId);
  const auditTrail = await db.getCaseAuditLogs(verificationId);

  return {
    verificationId: vCase.id,
    status: vCase.status,
    submissionDate: vCase.created_at,
    updatedAt: vCase.updated_at,
    customer: {
      id: vCase.user_id,
      name: vCase.customer_name,
      email: vCase.customer_email,
      role: vCase.role,
      registeredAt: vCase.customer_registered_at,
    },
    documents: documentDetails,
    validation: validation
      ? {
          overallStatus: validation.overallStatus,
          checks: validation.checks,
        }
      : null,
    financialAnalysis,
    riskAssessment: riskAssessment
      ? {
          riskScore: riskAssessment.riskScore,
          riskLevel: riskAssessment.riskLevel,
          riskFactors: riskAssessment.riskFactors,
          explanation: riskAssessment.explanation,
          recommendation: riskAssessment.recommendation,
        }
      : null,
    notes,
    auditTrail,
  };
}

/**
 * Executes an official compliance determination for a case:
 * APPROVED, NEEDS_REVIEW, FLAGGED, or REJECTED.
 *
 * @param {number|string} verificationId
 * @param {string} status - One of APPROVED, NEEDS_REVIEW, FLAGGED, REJECTED
 * @param {string} [note] - Optional compliance review note
 * @param {Object} officerUser
 * @returns {Promise<Object>}
 */
async function updateCaseDecision(verificationId, status, note, officerUser) {
  const normalizedStatus = (status || '').trim().toUpperCase();

  if (!VALID_DECISIONS.includes(normalizedStatus)) {
    throw new Error(
      `Invalid decision status "${status}". Allowed values: ${VALID_DECISIONS.join(', ')}.`
    );
  }

  const pool = db.getDatabasePool();
  await db.ensureVerificationCasesTable();

  // 1. Verify case exists
  const [cases] = await pool.query('SELECT id, status FROM verification_cases WHERE id = ?', [
    verificationId,
  ]);
  if (cases.length === 0) {
    throw new Error(`Verification case #${verificationId} not found.`);
  }

  const previousStatus = cases[0].status;

  // 2. Update status in verification_cases
  await pool.query('UPDATE verification_cases SET status = ? WHERE id = ?', [
    normalizedStatus,
    verificationId,
  ]);

  // 3. Save review note if provided
  let addedNote = null;
  if (note && note.trim().length > 0) {
    addedNote = await db.addCaseNote(
      verificationId,
      officerUser?.id || 1,
      officerUser?.name || 'Compliance Officer',
      note.trim()
    );
  }

  // 4. Log audit trail entry
  const auditAction = 'DECISION_MADE';
  const auditDetails = `Status changed from ${previousStatus} to ${normalizedStatus} by ${
    officerUser?.name || 'Compliance Officer'
  }.${addedNote ? ` Note: "${addedNote.note}"` : ''}`;

  await db.addAuditLog(
    verificationId,
    officerUser?.id || null,
    officerUser?.name || 'Compliance Officer',
    auditAction,
    auditDetails
  );

  return {
    success: true,
    verificationId: Number(verificationId),
    previousStatus,
    status: normalizedStatus,
    note: addedNote,
    updatedAt: new Date(),
  };
}

/**
 * Adds a compliance review note to a case and records audit event.
 *
 * @param {number|string} verificationId
 * @param {string} noteText
 * @param {Object} officerUser
 * @returns {Promise<Object>}
 */
async function addCaseNote(verificationId, noteText, officerUser) {
  if (!noteText || typeof noteText !== 'string' || noteText.trim().length === 0) {
    throw new Error('Review note text cannot be empty.');
  }

  const pool = db.getDatabasePool();
  await db.ensureVerificationCasesTable();

  const [cases] = await pool.query('SELECT id FROM verification_cases WHERE id = ?', [
    verificationId,
  ]);
  if (cases.length === 0) {
    throw new Error(`Verification case #${verificationId} not found.`);
  }

  const cleanNote = noteText.trim();
  const savedNote = await db.addCaseNote(
    verificationId,
    officerUser?.id || 1,
    officerUser?.name || 'Compliance Officer',
    cleanNote
  );

  await db.addAuditLog(
    verificationId,
    officerUser?.id || null,
    officerUser?.name || 'Compliance Officer',
    'NOTE_ADDED',
    `Note added by ${officerUser?.name || 'Officer'}: "${cleanNote.substring(0, 120)}${
      cleanNote.length > 120 ? '...' : ''
    }"`
  );

  return savedNote;
}

/**
 * Retrieves all notes for a case.
 */
async function getCaseNotes(verificationId) {
  return db.getCaseNotes(verificationId);
}

/**
 * Retrieves all audit logs for a case.
 */
async function getCaseAuditTrail(verificationId) {
  return db.getCaseAuditLogs(verificationId);
}

module.exports = {
  listCases,
  getCaseDetails,
  updateCaseDecision,
  addCaseNote,
  getCaseNotes,
  getCaseAuditTrail,
  VALID_DECISIONS,
};
