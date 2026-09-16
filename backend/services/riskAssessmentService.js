const db = require('../config/database');

/**
 * Maps a numeric score (0-100) to its corresponding risk tier.
 * Tiers:
 *   0 - 25  = LOW
 *  26 - 50  = MEDIUM
 *  51 - 75  = HIGH
 *  76 - 100 = VERY_HIGH
 */
function determineRiskTier(score) {
  const s = Math.min(100, Math.max(0, Number(score) || 0));
  if (s <= 25) return 'LOW';
  if (s <= 50) return 'MEDIUM';
  if (s <= 75) return 'HIGH';
  return 'VERY_HIGH';
}

/**
 * Calculates rule-based demo risk score, risk level, and contributing factors.
 *
 * Demo Rules:
 * 1. Identity mismatch: +25
 * 2. Address mismatch: +20
 * 3. Expired document: +20
 * 4. Unusual transaction finding: +20
 * 5. Poor document quality: +10
 *
 * Maximum score = 100.
 *
 * @param {Array} validationChecks - Array of validation check records
 * @param {Object} documentMetrics - Document stats (e.g. poor quality, failed extractions)
 * @returns {{ riskScore: number, riskLevel: string, riskFactors: Array, explanation: string, recommendation: string }}
 */
function calculateRiskScore(validationChecks = [], documentMetrics = {}) {
  const checks = Array.isArray(validationChecks) ? validationChecks : [];
  const metrics = documentMetrics && typeof documentMetrics === 'object' ? documentMetrics : {};
  const factors = [];
  let totalScore = 0;

  // 1. Identity mismatch (+25)
  const identityCheck = checks.find(
    (c) => c && (c.check_type || c.checkType) === 'NAME_CONSISTENCY'
  );
  if (identityCheck && identityCheck.status === 'failed') {
    factors.push({
      rule: 'IDENTITY_MISMATCH',
      name: 'Identity mismatch',
      points: 25,
      severity: 'HIGH',
      description: identityCheck.message || 'Conflicting names detected across submitted documents.',
    });
    totalScore += 25;
  }

  // 2. Address mismatch (+20)
  const addressCheck = checks.find(
    (c) => c && (c.check_type || c.checkType) === 'ADDRESS_CONSISTENCY'
  );
  if (
    addressCheck &&
    (addressCheck.status === 'failed' ||
      (addressCheck.status === 'warning' && addressCheck.severity === 'high'))
  ) {
    factors.push({
      rule: 'ADDRESS_MISMATCH',
      name: 'Address mismatch',
      points: 20,
      severity: 'HIGH',
      description: addressCheck.message || 'Address mismatch detected between Government ID and Address Proof.',
    });
    totalScore += 20;
  }

  // 3. Expired document (+20)
  const expiryCheck = checks.find(
    (c) => c && (c.check_type || c.checkType) === 'DOCUMENT_EXPIRY'
  );
  if (expiryCheck && expiryCheck.status === 'failed') {
    factors.push({
      rule: 'EXPIRED_DOCUMENT',
      name: 'Expired document',
      points: 20,
      severity: 'HIGH',
      description: expiryCheck.message || 'Government identification document has expired.',
    });
    totalScore += 20;
  }

  // 4. Unusual transaction finding (+20)
  const txnCheck = checks.find(
    (c) =>
      c &&
      ((c.check_type || c.checkType) === 'UNUSUAL_TRANSACTIONS' ||
        (c.check_type || c.checkType) === 'TRANSACTION_ANOMALY')
  );
  if ((txnCheck && txnCheck.status === 'failed') || metrics.unusualTransactions) {
    factors.push({
      rule: 'UNUSUAL_TRANSACTIONS',
      name: 'Unusual transaction finding',
      points: 20,
      severity: 'MEDIUM',
      description:
        (txnCheck && txnCheck.message) ||
        metrics.unusualTransactionMessage ||
        'Unusual high-value velocity or outlier transactions flagged.',
    });
    totalScore += 20;
  }

  // 5. Poor document quality (+10)
  const hasLowConfidence =
    typeof metrics.averageConfidence === 'number' &&
    metrics.averageConfidence > 0 &&
    metrics.averageConfidence < 0.6;

  if (metrics.hasPoorQuality || metrics.hasExtractionFailed || hasLowConfidence) {
    factors.push({
      rule: 'POOR_DOCUMENT_QUALITY',
      name: 'Poor document quality',
      points: 10,
      severity: 'LOW',
      description:
        metrics.qualityMessage ||
        'Document image resolution or OCR confidence was low, hindering automated verification.',
    });
    totalScore += 10;
  }

  // Enforce score bounds [0, 100]
  const finalScore = Math.min(100, Math.max(0, totalScore));
  const riskLevel = determineRiskTier(finalScore);

  let explanation = '';
  if (factors.length === 0) {
    explanation = 'Score: 0 | Risk: LOW. No adverse risk factors or document discrepancies detected.';
  } else {
    explanation = `Score: ${finalScore} | Risk: ${riskLevel}. ${factors.length} contributing factor(s): ${factors
      .map((f) => `${f.name} (+${f.points})`)
      .join(', ')}.`;
  }

  const recommendation =
    finalScore <= 25
      ? 'Low risk profile. Standard verification procedures apply.'
      : 'Manual review required. A human compliance officer must evaluate flagged risk factors before making a decision.';

  return {
    riskScore: finalScore,
    riskLevel,
    riskFactors: factors,
    explanation,
    recommendation,
  };
}

/**
 * Assesses and stores risk for a verification case in MySQL.
 *
 * @param {number|string} verificationId - ID of verification_cases row
 * @returns {Promise<Object>}
 */
async function assessRiskForCase(verificationId) {
  const pool = db.getDatabasePool();
  await db.ensureRiskAssessmentsTable();

  // 1. Fetch case
  const [cases] = await pool.query('SELECT id, user_id, status FROM verification_cases WHERE id = ?', [
    verificationId,
  ]);
  if (cases.length === 0) {
    throw new Error(`Verification case #${verificationId} not found.`);
  }
  const vCase = cases[0];

  // 1b. Run financial analysis on extracted transactions to ensure anomaly findings are synced
  try {
    const financialAnalysisService = require('./financialAnalysisService');
    await financialAnalysisService.analyzeVerificationCase(verificationId);
  } catch (finErr) {
    console.warn(`[RiskAssessment] Financial analysis sync warning for case #${verificationId}:`, finErr.message);
  }

  // 2. Fetch validation findings
  const [validationRows] = await pool.query(
    'SELECT check_type, status, severity, message FROM validation_results WHERE verification_id = ?',
    [verificationId]
  );

  // 3. Fetch documents and OCR confidence metrics
  const [docs] = await pool.query(
    'SELECT id, document_type, status FROM documents WHERE user_id = ?',
    [vCase.user_id]
  );

  let hasExtractionFailed = docs.some((d) => d.status === 'EXTRACTION_FAILED');
  let totalConfidence = 0;
  let confidenceCount = 0;

  for (const doc of docs) {
    const [fields] = await pool.query(
      'SELECT confidence FROM extracted_data WHERE document_id = ?',
      [doc.id]
    );
    for (const f of fields) {
      if (typeof f.confidence === 'number' || !isNaN(Number(f.confidence))) {
        totalConfidence += Number(f.confidence);
        confidenceCount++;
      }
    }
  }

  const averageConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 1.0;
  const documentMetrics = {
    hasExtractionFailed,
    averageConfidence,
  };

  // 4. Calculate score
  const assessment = calculateRiskScore(validationRows, documentMetrics);

  // 5. Idempotently insert/update risk_assessments in MySQL
  const [existing] = await pool.query(
    'SELECT id FROM risk_assessments WHERE verification_id = ?',
    [verificationId]
  );

  if (existing.length > 0) {
    await pool.query(
      'UPDATE risk_assessments SET risk_score = ?, risk_level = ?, risk_factors = ? WHERE verification_id = ?',
      [
        assessment.riskScore,
        assessment.riskLevel,
        JSON.stringify(assessment.riskFactors),
        verificationId,
      ]
    );
  } else {
    await pool.query(
      'INSERT INTO risk_assessments (verification_id, risk_score, risk_level, risk_factors) VALUES (?, ?, ?, ?)',
      [
        verificationId,
        assessment.riskScore,
        assessment.riskLevel,
        JSON.stringify(assessment.riskFactors),
      ]
    );
  }

  return {
    verificationId: Number(verificationId),
    userId: vCase.user_id,
    ...assessment,
  };
}

/**
 * Retrieves the stored risk assessment for a verification case.
 *
 * @param {number|string} verificationId
 * @returns {Promise<Object>}
 */
async function getRiskAssessment(verificationId) {
  const pool = db.getDatabasePool();
  await db.ensureRiskAssessmentsTable();

  const [rows] = await pool.query(
    'SELECT id, verification_id, risk_score, risk_level, risk_factors, created_at, updated_at FROM risk_assessments WHERE verification_id = ?',
    [verificationId]
  );

  if (rows.length === 0) {
    // If not calculated yet, run assessment
    return assessRiskForCase(verificationId);
  }

  const row = rows[0];
  let factors = [];
  if (row.risk_factors) {
    try {
      factors = typeof row.risk_factors === 'string' ? JSON.parse(row.risk_factors) : row.risk_factors;
    } catch (_) {}
  }

  const score = Number(row.risk_score);
  const level = row.risk_level;

  let explanation = '';
  if (factors.length === 0) {
    explanation = 'Score: 0 | Risk: LOW. No adverse risk factors or document discrepancies detected.';
  } else {
    explanation = `Score: ${score} | Risk: ${level}. ${factors.length} contributing factor(s): ${factors
      .map((f) => `${f.name} (+${f.points})`)
      .join(', ')}.`;
  }

  const recommendation =
    score <= 25
      ? 'Low risk profile. Standard verification procedures apply.'
      : 'Manual review required. A human compliance officer must evaluate flagged risk factors before making a decision.';

  return {
    verificationId: Number(verificationId),
    riskScore: score,
    riskLevel: level,
    riskFactors: factors,
    explanation,
    recommendation,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  determineRiskTier,
  calculateRiskScore,
  assessRiskForCase,
  getRiskAssessment,
};
