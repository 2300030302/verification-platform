const db = require('../config/database');

const DEMO_DISCLAIMER =
  'Demo anomaly indicators for compliance officer review only. Not proof of fraud. No assumptions about customer profession, income source, criminality, or background.';

/**
 * Calculates financial metrics across a list of transaction records.
 * Handles empty or missing transaction data safely without crashing.
 *
 * @param {Array<Object>} transactions
 * @returns {Object} Calculated metrics
 */
function calculateFinancialMetrics(transactions = []) {
  const list = Array.isArray(transactions) ? transactions : [];

  if (list.length === 0) {
    return {
      totalCredits: 0,
      totalDebits: 0,
      transactionCount: 0,
      averageTransaction: 0,
      averageBalance: null,
      largestCredit: null,
      largestDebit: null,
      transactionFrequency: 'INSUFFICIENT_DATA',
      balanceTrend: 'INSUFFICIENT_DATA',
    };
  }

  let totalCredits = 0;
  let totalDebits = 0;
  let totalBalance = 0;
  let balanceCount = 0;

  let largestCredit = null;
  let largestDebit = null;

  const validDates = [];
  const balancePoints = [];

  for (const t of list) {
    const credit = typeof t.credit === 'number' ? Math.max(0, t.credit) : Number(t.credit) || 0;
    const debit = typeof t.debit === 'number' ? Math.max(0, t.debit) : Number(t.debit) || 0;
    const desc = t.description || 'Transaction';
    const date = t.transaction_date || t.transactionDate || null;

    totalCredits += credit;
    totalDebits += debit;

    if (credit > 0) {
      if (!largestCredit || credit > largestCredit.amount) {
        largestCredit = {
          amount: Number(credit.toFixed(2)),
          date,
          description: desc,
        };
      }
    }

    if (debit > 0) {
      if (!largestDebit || debit > largestDebit.amount) {
        largestDebit = {
          amount: Number(debit.toFixed(2)),
          date,
          description: desc,
        };
      }
    }

    const rawBal = t.balance !== undefined && t.balance !== null ? Number(t.balance) : null;
    if (rawBal !== null && !isNaN(rawBal)) {
      totalBalance += rawBal;
      balanceCount++;
      if (date) {
        balancePoints.push({ date, balance: rawBal });
      }
    }

    if (date) {
      validDates.push(date);
    }
  }

  const transactionCount = list.length;
  const totalVolume = totalCredits + totalDebits;
  const averageTransaction =
    transactionCount > 0 ? Number((totalVolume / transactionCount).toFixed(2)) : 0;
  const averageBalance =
    balanceCount > 0 ? Number((totalBalance / balanceCount).toFixed(2)) : null;

  // Transaction Frequency qualitative evaluation
  let transactionFrequency = 'MODERATE';
  const uniqueDates = new Set(validDates);
  if (uniqueDates.size >= 2) {
    const avgPerDay = transactionCount / uniqueDates.size;
    if (avgPerDay > 3) transactionFrequency = 'HIGH';
    else if (avgPerDay < 1) transactionFrequency = 'LOW';
    else transactionFrequency = 'MODERATE';
  } else if (transactionCount >= 4) {
    transactionFrequency = 'HIGH';
  } else if (transactionCount === 0) {
    transactionFrequency = 'INSUFFICIENT_DATA';
  }

  // Balance Trend calculation
  let balanceTrend = 'INSUFFICIENT_DATA';
  if (balancePoints.length >= 2) {
    const first = balancePoints[0].balance;
    const last = balancePoints[balancePoints.length - 1].balance;
    const diff = last - first;
    if (diff > 50) {
      balanceTrend = 'INCREASING';
    } else if (diff < -50) {
      balanceTrend = 'DECREASING';
    } else {
      balanceTrend = 'STABLE';
    }
  }

  return {
    totalCredits: Number(totalCredits.toFixed(2)),
    totalDebits: Number(totalDebits.toFixed(2)),
    transactionCount,
    averageTransaction,
    averageBalance,
    largestCredit,
    largestDebit,
    transactionFrequency,
    balanceTrend,
  };
}

/**
 * Detects demo compliance anomalies for compliance officer review.
 * Anomaly indicators are review suggestions, NOT proof of fraud.
 *
 * @param {Array<Object>} transactions
 * @param {Object} metrics
 * @returns {{ hasAnomalies: boolean, anomalies: Array<Object>, disclaimer: string }}
 */
function detectAnomalies(transactions = [], metrics = {}) {
  const list = Array.isArray(transactions) ? transactions : [];
  const anomalies = [];

  if (list.length === 0) {
    return {
      hasAnomalies: false,
      anomalies: [],
      disclaimer: DEMO_DISCLAIMER,
    };
  }

  const avgTxn = metrics.averageTransaction || 0;

  // 1. Unusually Large Transactions
  // Flag if transaction amount > 3x average (minimum $500 threshold to prevent false alarms on low activity)
  // or if transaction >= $5,000
  for (const t of list) {
    const credit = Number(t.credit) || 0;
    const debit = Number(t.debit) || 0;
    const maxAmt = Math.max(credit, debit);
    const desc = t.description || 'Transaction';
    const date = t.transaction_date || t.transactionDate || 'Unknown date';

    const isMultiplierOutlier = avgTxn > 0 && maxAmt > avgTxn * 3 && maxAmt >= 500;
    const isAbsoluteOutlier = maxAmt >= 5000;

    if (isMultiplierOutlier || isAbsoluteOutlier) {
      const typeStr = credit > debit ? 'credit' : 'debit';
      anomalies.push({
        type: 'LARGE_TRANSACTION',
        severity: maxAmt >= 5000 ? 'HIGH' : 'MEDIUM',
        description: `Unusually large ${typeStr} of $${maxAmt.toFixed(2)} detected (${desc} on ${date}).`,
        details: {
          amount: maxAmt,
          type: typeStr,
          description: desc,
          date,
          multipleOfAverage: avgTxn > 0 ? Number((maxAmt / avgTxn).toFixed(1)) : null,
        },
      });
    }
  }

  // 2. Sudden Balance Changes
  // Flag if single transaction drops balance by > 50% or by > $5,000
  for (let i = 1; i < list.length; i++) {
    const prevBal = list[i - 1].balance !== null && list[i - 1].balance !== undefined ? Number(list[i - 1].balance) : null;
    const currBal = list[i].balance !== null && list[i].balance !== undefined ? Number(list[i].balance) : null;

    if (prevBal !== null && currBal !== null && prevBal > 0) {
      const drop = prevBal - currBal;
      const dropPct = (drop / prevBal) * 100;
      if (dropPct >= 50 || drop >= 5000) {
        anomalies.push({
          type: 'SUDDEN_BALANCE_CHANGE',
          severity: 'HIGH',
          description: `Sudden balance drop detected: decreased by $${drop.toFixed(2)} (${dropPct.toFixed(0)}%) to $${currBal.toFixed(2)}.`,
          details: {
            previousBalance: prevBal,
            currentBalance: currBal,
            dropAmount: Number(drop.toFixed(2)),
            percentageDrop: Number(dropPct.toFixed(1)),
          },
        });
      }
    }
  }

  // 3. Unusually High Transaction Frequency (Bursts)
  // Flag if > 4 transactions occur on the same calendar day
  const dateCounts = {};
  for (const t of list) {
    const date = t.transaction_date || t.transactionDate;
    if (date) {
      dateCounts[date] = (dateCounts[date] || 0) + 1;
    }
  }

  for (const [d, count] of Object.entries(dateCounts)) {
    if (count > 4) {
      anomalies.push({
        type: 'HIGH_TRANSACTION_FREQUENCY',
        severity: 'MEDIUM',
        description: `Unusually high transaction frequency detected: ${count} transactions recorded on ${d}.`,
        details: {
          date: d,
          count,
        },
      });
    }
  }

  return {
    hasAnomalies: anomalies.length > 0,
    anomalies,
    disclaimer: DEMO_DISCLAIMER,
  };
}

/**
 * Saves extracted transactions to the MySQL transactions table for a verification case.
 *
 * @param {number|string} verificationId
 * @param {number|string|null} documentId
 * @param {Array<Object>} transactions
 * @returns {Promise<number>} Count of transactions saved
 */
async function saveTransactions(verificationId, documentId, transactions = []) {
  if (!verificationId) return 0;
  const pool = db.getDatabasePool();
  await db.ensureTransactionsTable();

  const list = Array.isArray(transactions) ? transactions : [];

  // Delete prior transactions for this document for clean idempotency
  if (documentId) {
    await pool.query('DELETE FROM transactions WHERE verification_id = ? AND document_id = ?', [
      verificationId,
      documentId,
    ]);
  } else {
    await pool.query('DELETE FROM transactions WHERE verification_id = ?', [verificationId]);
  }

  if (list.length === 0) return 0;

  const values = list.map((t) => [
    verificationId,
    documentId || null,
    t.transactionDate || t.transaction_date || null,
    t.description || '',
    Number(t.credit) || 0.0,
    Number(t.debit) || 0.0,
    t.balance !== null && t.balance !== undefined && !isNaN(Number(t.balance))
      ? Number(t.balance)
      : null,
  ]);

  await pool.query(
    'INSERT INTO transactions (verification_id, document_id, transaction_date, description, credit, debit, balance) VALUES ?',
    [values]
  );

  return values.length;
}

/**
 * Retrieves all stored transactions for a verification case.
 *
 * @param {number|string} verificationId
 * @returns {Promise<Array<Object>>}
 */
async function getTransactions(verificationId) {
  if (!verificationId) return [];
  const pool = db.getDatabasePool();
  await db.ensureTransactionsTable();

  const [rows] = await pool.query(
    `SELECT id, verification_id, document_id, 
            DATE_FORMAT(transaction_date, '%Y-%m-%d') as transaction_date,
            description, credit, debit, balance, created_at
     FROM transactions 
     WHERE verification_id = ? 
     ORDER BY transaction_date ASC, id ASC`,
    [verificationId]
  );

  return rows.map((r) => ({
    id: r.id,
    verificationId: r.verification_id,
    documentId: r.document_id,
    transactionDate: r.transaction_date,
    description: r.description,
    credit: Number(Number(r.credit).toFixed(2)),
    debit: Number(Number(r.debit).toFixed(2)),
    balance: r.balance !== null ? Number(Number(r.balance).toFixed(2)) : null,
    createdAt: r.created_at,
  }));
}

/**
 * Analyzes stored transactions for a verification case and syncs findings with validation_results.
 *
 * @param {number|string} verificationId
 * @returns {Promise<Object>} Analysis profile and anomaly findings
 */
async function analyzeVerificationCase(verificationId) {
  const pool = db.getDatabasePool();
  await db.ensureTransactionsTable();
  await db.ensureValidationResultsTable();

  const txns = await getTransactions(verificationId);
  const metrics = calculateFinancialMetrics(txns);
  const anomalyReport = detectAnomalies(txns, metrics);

  // Sync anomaly findings with validation_results table
  if (anomalyReport.hasAnomalies) {
    const message = anomalyReport.anomalies.map((a) => a.description).join(' | ');

    // Idempotent upsert into validation_results for UNUSUAL_TRANSACTIONS
    const [existing] = await pool.query(
      'SELECT id FROM validation_results WHERE verification_id = ? AND check_type = ?',
      [verificationId, 'UNUSUAL_TRANSACTIONS']
    );

    if (existing.length > 0) {
      await pool.query(
        'UPDATE validation_results SET status = ?, severity = ?, message = ?, details = ? WHERE id = ?',
        ['failed', 'medium', message, JSON.stringify(anomalyReport.anomalies), existing[0].id]
      );
    } else {
      await pool.query(
        'INSERT INTO validation_results (verification_id, check_type, status, severity, message, details) VALUES (?, ?, ?, ?, ?, ?)',
        [
          verificationId,
          'UNUSUAL_TRANSACTIONS',
          'failed',
          'medium',
          message,
          JSON.stringify(anomalyReport.anomalies),
        ]
      );
    }
  } else {
    // If no anomalies, remove or pass UNUSUAL_TRANSACTIONS finding
    await pool.query(
      'DELETE FROM validation_results WHERE verification_id = ? AND check_type = ?',
      [verificationId, 'UNUSUAL_TRANSACTIONS']
    );
  }

  return {
    verificationId: Number(verificationId),
    summary: metrics,
    anomalies: anomalyReport.anomalies,
    hasAnomalies: anomalyReport.hasAnomalies,
    disclaimer: anomalyReport.disclaimer,
  };
}

module.exports = {
  calculateFinancialMetrics,
  detectAnomalies,
  saveTransactions,
  getTransactions,
  analyzeVerificationCase,
  DEMO_DISCLAIMER,
};
