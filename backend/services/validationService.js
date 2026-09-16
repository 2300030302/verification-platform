const db = require('../config/database');

/**
 * Normalizes a human name for comparison.
 */
function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes a street address for comparison.
 */
function normalizeAddress(addr) {
  if (!addr || typeof addr !== 'string') return '';
  return addr
    .toLowerCase()
    .replace(/[,.#]/g, ' ')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\broad\b/g, 'rd')
    .replace(/\bterrace\b/g, 'terr')
    .replace(/\bapartment\b/g, 'apt')
    .replace(/\bsuite\b/g, 'ste')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compares names extracted across multiple documents.
 * Handles single-document scenarios safely without false mismatches.
 */
function compareNames(nameEntries) {
  if (!nameEntries || nameEntries.length < 2) {
    return {
      check_type: 'NAME_CONSISTENCY',
      status: 'passed',
      severity: 'low',
      message: 'Identity verification pending additional document uploads.',
      details: {
        comparisonCount: nameEntries ? nameEntries.length : 0,
        namesFound: nameEntries || [],
      },
    };
  }

  const normalized = nameEntries.map((e) => ({
    ...e,
    clean: normalizeName(e.value),
    tokens: normalizeName(e.value).split(' ').filter(Boolean),
  }));

  // Check all pairs against the first document's name
  const base = normalized[0];
  let hasMismatch = false;
  let hasVariation = false;

  for (let i = 1; i < normalized.length; i++) {
    const curr = normalized[i];

    if (base.clean === curr.clean) {
      continue;
    }

    // Check if one name contains the other (e.g. middle name omitted or re-ordered)
    const baseContainsCurr = curr.tokens.every((t) => base.tokens.includes(t));
    const currContainsBase = base.tokens.every((t) => curr.tokens.includes(t));

    if (baseContainsCurr || currContainsBase) {
      hasVariation = true;
      continue;
    }

    // Check token overlap
    const commonTokens = curr.tokens.filter((t) => base.tokens.includes(t));
    if (commonTokens.length > 0) {
      hasVariation = true;
    } else {
      hasMismatch = true;
    }
  }

  if (hasMismatch) {
    return {
      check_type: 'NAME_CONSISTENCY',
      status: 'failed',
      severity: 'high',
      message: 'Name mismatch detected between submitted documents.',
      details: {
        namesByDocument: nameEntries,
      },
    };
  }

  if (hasVariation) {
    return {
      check_type: 'NAME_CONSISTENCY',
      status: 'warning',
      severity: 'low',
      message: 'Minor name variation detected between documents.',
      details: {
        namesByDocument: nameEntries,
      },
    };
  }

  return {
    check_type: 'NAME_CONSISTENCY',
    status: 'passed',
    severity: 'low',
    message: 'Identity and name match across submitted documents.',
    details: {
      namesByDocument: nameEntries,
    },
  };
}

/**
 * Compares addresses extracted across documents.
 * Handles missing/incomplete addresses safely.
 */
function compareAddresses(addressEntries) {
  if (!addressEntries || addressEntries.length < 2) {
    return {
      check_type: 'ADDRESS_CONSISTENCY',
      status: 'passed',
      severity: 'low',
      message: 'Address comparison pending additional documents.',
      details: {
        comparisonCount: addressEntries ? addressEntries.length : 0,
        addressesFound: addressEntries || [],
      },
    };
  }

  const normalized = addressEntries.map((e) => {
    const clean = normalizeAddress(e.value);
    const numbers = clean.match(/\b\d+\b/g) || [];
    const tokens = clean.split(' ').filter((t) => t.length > 2);
    return { ...e, clean, numbers, tokens };
  });

  const base = normalized[0];
  let hasMismatch = false;
  let hasVariation = false;

  for (let i = 1; i < normalized.length; i++) {
    const curr = normalized[i];

    if (base.clean === curr.clean) {
      continue;
    }

    // Compare street/building numbers if present
    const sameNumbers =
      base.numbers.length > 0 &&
      curr.numbers.length > 0 &&
      base.numbers.some((n) => curr.numbers.includes(n));

    // Compare street name tokens
    const commonTokens = curr.tokens.filter((t) => base.tokens.includes(t));
    const tokenOverlapRatio =
      commonTokens.length / Math.max(1, Math.min(base.tokens.length, curr.tokens.length));

    if (sameNumbers && tokenOverlapRatio >= 0.75) {
      // High confidence match
      continue;
    } else if (sameNumbers && tokenOverlapRatio >= 0.4) {
      hasVariation = true;
    } else {
      hasMismatch = true;
    }
  }

  if (hasMismatch) {
    return {
      check_type: 'ADDRESS_CONSISTENCY',
      status: 'warning',
      severity: 'high',
      message: 'Address mismatch detected between Government ID and Address Proof.',
      details: {
        addressesByDocument: addressEntries,
      },
    };
  }

  if (hasVariation) {
    return {
      check_type: 'ADDRESS_CONSISTENCY',
      status: 'warning',
      severity: 'medium',
      message: 'Address variation detected between documents; review suggested.',
      details: {
        addressesByDocument: addressEntries,
      },
    };
  }

  return {
    check_type: 'ADDRESS_CONSISTENCY',
    status: 'passed',
    severity: 'low',
    message: 'Addresses match across submitted documents.',
    details: {
      addressesByDocument: addressEntries,
    },
  };
}

/**
 * Validates document expiration date.
 */
function checkDocumentExpiry(expiryEntries) {
  if (!expiryEntries || expiryEntries.length === 0) {
    return {
      check_type: 'DOCUMENT_EXPIRY',
      status: 'passed',
      severity: 'low',
      message: 'No document expiration detected.',
      details: {},
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const entry of expiryEntries) {
    const rawVal = entry.value || entry.expiryDate;
    const parsedDate = new Date(rawVal);
    if (!isNaN(parsedDate.getTime())) {
      parsedDate.setHours(0, 0, 0, 0);

      // Check if already expired
      if (parsedDate < today) {
        return {
          check_type: 'DOCUMENT_EXPIRY',
          status: 'failed',
          severity: 'high',
          message: `Government ID appears to be expired (Expiry: ${entry.value}).`,
          details: {
            expiryDate: entry.value,
            isExpired: true,
          },
        };
      }

      // Check if expiring soon (within 30 days)
      const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      if (parsedDate <= thirtyDaysFromNow) {
        return {
          check_type: 'DOCUMENT_EXPIRY',
          status: 'warning',
          severity: 'medium',
          message: `Government ID expires soon on ${entry.value}.`,
          details: {
            expiryDate: entry.value,
            expiresSoon: true,
          },
        };
      }

      return {
        check_type: 'DOCUMENT_EXPIRY',
        status: 'passed',
        severity: 'low',
        message: `Document is valid and unexpired (Expiry: ${entry.value}).`,
        details: {
          expiryDate: entry.value,
          isExpired: false,
        },
      };
    }
  }

  return {
    check_type: 'DOCUMENT_EXPIRY',
    status: 'passed',
    severity: 'low',
    message: 'Document expiry format not recognized as expired.',
    details: { expiryEntries },
  };
}

/**
 * Validates that all required documents are present.
 */
function checkRequiredDocuments(uploadedDocs) {
  const requiredTypes = ['GOVERNMENT_ID', 'BANK_STATEMENT', 'ADDRESS_PROOF'];
  const presentTypes = new Set(
    (uploadedDocs || []).map((d) => (d.document_type || '').toUpperCase().trim())
  );

  const missing = requiredTypes.filter((t) => !presentTypes.has(t));

  const formatDocName = (t) => {
    switch (t) {
      case 'GOVERNMENT_ID':
        return 'Government ID';
      case 'BANK_STATEMENT':
        return 'Bank Statement';
      case 'ADDRESS_PROOF':
        return 'Address Proof';
      default:
        return t;
    }
  };

  if (missing.length === 0) {
    return {
      check_type: 'REQUIRED_DOCUMENTS',
      status: 'passed',
      severity: 'low',
      message: 'All required verification documents have been uploaded.',
      details: {
        required: requiredTypes,
        present: Array.from(presentTypes),
        missing: [],
      },
    };
  }

  return {
    check_type: 'REQUIRED_DOCUMENTS',
    status: 'warning',
    severity: 'medium',
    message: `Missing required documents: ${missing.map(formatDocName).join(', ')}.`,
    details: {
      required: requiredTypes,
      present: Array.from(presentTypes),
      missing,
    },
  };
}

/**
 * Executes cross-document validation for a given verification case ID.
 * Stores results into MySQL validation_results.
 *
 * @param {number|string} verificationId - ID of verification_cases row
 * @returns {Promise<{ verificationId: number, overallStatus: string, checks: Array }>}
 */
async function validateVerificationCase(verificationId) {
  const pool = db.getDatabasePool();
  await db.ensureValidationResultsTable();

  // 1. Fetch verification case
  const [cases] = await pool.query('SELECT id, user_id, status FROM verification_cases WHERE id = ?', [
    verificationId,
  ]);

  if (cases.length === 0) {
    throw new Error(`Verification case #${verificationId} not found.`);
  }

  const vCase = cases[0];

  // 2. Fetch all documents for this user
  const [documents] = await pool.query(
    'SELECT id, user_id, document_type, original_filename, status FROM documents WHERE user_id = ?',
    [vCase.user_id]
  );

  // 3. Fetch extracted fields for each document
  const nameEntries = [];
  const addressEntries = [];
  const expiryEntries = [];

  for (const doc of documents) {
    // Only consider documents that have been uploaded/processed
    if (doc.status === 'EXTRACTION_FAILED') continue;

    const [fields] = await pool.query(
      'SELECT field_name, field_value, confidence FROM extracted_data WHERE document_id = ?',
      [doc.id]
    );

    for (const f of fields) {
      if (!f.field_value || !f.field_value.trim()) continue;

      if (f.field_name === 'name' || f.field_name === 'account_holder_name') {
        nameEntries.push({
          documentId: doc.id,
          documentType: doc.document_type,
          fieldName: f.field_name,
          value: f.field_value.trim(),
        });
      }

      if (f.field_name === 'address') {
        addressEntries.push({
          documentId: doc.id,
          documentType: doc.document_type,
          fieldName: f.field_name,
          value: f.field_value.trim(),
        });
      }

      if (f.field_name === 'expiry_date') {
        expiryEntries.push({
          documentId: doc.id,
          documentType: doc.document_type,
          fieldName: f.field_name,
          value: f.field_value.trim(),
        });
      }
    }
  }

  // 4. Run the four validation checks
  const checks = [
    checkRequiredDocuments(documents),
    compareNames(nameEntries),
    compareAddresses(addressEntries),
    checkDocumentExpiry(expiryEntries),
  ];

  // 5. Store validation results in MySQL (idempotent)
  await pool.query('DELETE FROM validation_results WHERE verification_id = ?', [verificationId]);

  if (checks.length > 0) {
    const insertValues = checks.map((c) => [
      verificationId,
      c.check_type,
      c.status,
      c.severity,
      c.message,
      JSON.stringify(c.details || {}),
    ]);

    await pool.query(
      'INSERT INTO validation_results (verification_id, check_type, status, severity, message, details) VALUES ?',
      [insertValues]
    );
  }

  // 6. Compute overall status
  let overallStatus = 'PASSED';
  if (checks.some((c) => c.status === 'failed')) {
    overallStatus = 'NEEDS_REVIEW';
  } else if (checks.some((c) => c.status === 'warning')) {
    overallStatus = 'WARNING';
  }

  return {
    verificationId: Number(verificationId),
    userId: vCase.user_id,
    overallStatus,
    checks,
  };
}

/**
 * Retrieves stored validation results for a verification case.
 */
async function getValidationResults(verificationId) {
  const pool = db.getDatabasePool();
  await db.ensureValidationResultsTable();

  const [rows] = await pool.query(
    'SELECT id, verification_id, check_type, status, severity, message, details, created_at, updated_at FROM validation_results WHERE verification_id = ? ORDER BY id ASC',
    [verificationId]
  );

  const checks = rows.map((r) => {
    let details = {};
    if (r.details) {
      try {
        details = typeof r.details === 'string' ? JSON.parse(r.details) : r.details;
      } catch (_) {}
    }
    return {
      id: r.id,
      checkType: r.check_type,
      status: r.status,
      severity: r.severity,
      message: r.message,
      details,
      createdAt: r.created_at,
    };
  });

  let overallStatus = 'PASSED';
  if (checks.some((c) => c.status === 'failed')) {
    overallStatus = 'NEEDS_REVIEW';
  } else if (checks.some((c) => c.status === 'warning')) {
    overallStatus = 'WARNING';
  }

  return {
    verificationId: Number(verificationId),
    overallStatus,
    checks,
  };
}

module.exports = {
  compareNames,
  compareAddresses,
  checkDocumentExpiry,
  checkRequiredDocuments,
  validateVerificationCase,
  getValidationResults,
  normalizeName,
  normalizeAddress,
};
