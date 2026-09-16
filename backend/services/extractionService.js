/**
 * Structured Field Extraction Service
 * Parses raw OCR/document text into structured key-value fields based on document type.
 */

function cleanValue(val) {
  if (!val || typeof val !== 'string') return '';
  return val
    .replace(/^[:\s\-]+/, '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
}

/**
 * Extracts structured fields for GOVERNMENT_ID
 */
function extractGovernmentId(text) {
  const fields = [];
  const textNormalized = text || '';

  // 1. Name
  const nameMatch = textNormalized.match(
    /(?:Full\s*Name|Given\s*Names?|Surname|Name|Holder(?:\s*Name)?)[:\s]+([A-Za-z\s.,'-]{2,60})(?=\n|\r|DOB|Date|ID|No|Address|Country|Sex|Gender|$)/i
  );
  if (nameMatch && cleanValue(nameMatch[1])) {
    fields.push({
      field_name: 'name',
      field_value: cleanValue(nameMatch[1]),
      confidence: 0.92,
    });
  }

  // 2. Date of Birth
  const dobMatch = textNormalized.match(
    /(?:DOB|Date\s*of\s*Birth|Birth\s*Date|D\.O\.B\.?)[:\s]+(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})/i
  );
  if (dobMatch && cleanValue(dobMatch[1])) {
    fields.push({
      field_name: 'date_of_birth',
      field_value: cleanValue(dobMatch[1]),
      confidence: 0.95,
    });
  }

  // 3. ID Number
  const idMatch = textNormalized.match(
    /(?:ID\s*Number|ID\s*No|Passport\s*No|Driver'?s?\s*License\s*No|License\s*No|Document\s*No|ID#|Identification\s*No)[:\s]+([A-Z0-9-]{5,25})/i
  );
  if (idMatch && cleanValue(idMatch[1])) {
    fields.push({
      field_name: 'id_number',
      field_value: cleanValue(idMatch[1]),
      confidence: 0.94,
    });
  }

  // 4. Address
  const addressMatch = textNormalized.match(
    /(?:Residential\s*Address|Permanent\s*Address|Address)[:\s]+([^\n\r]+?)(?=\s*(?:\r?\n|Country|Nationality|Expiry|Valid|DOB|Date|$))/i
  );
  if (addressMatch && cleanValue(addressMatch[1])) {
    fields.push({
      field_name: 'address',
      field_value: cleanValue(addressMatch[1]),
      confidence: 0.88,
    });
  }

  // 5. Country
  const countryMatch = textNormalized.match(
    /(?:Country|Nationality|Country\s*of\s*Issue)[:\s]+([A-Za-z\s]{2,40}?)(?=\s*(?:\r?\n|Expiry|Valid|Date|$))/i
  );
  if (countryMatch && cleanValue(countryMatch[1])) {
    fields.push({
      field_name: 'country',
      field_value: cleanValue(countryMatch[1]),
      confidence: 0.90,
    });
  } else {
    // Detect common countries in document
    const knownCountries = ['United States', 'USA', 'Canada', 'United Kingdom', 'India', 'Australia', 'Germany', 'Singapore'];
    for (const c of knownCountries) {
      if (new RegExp(`\\b${c}\\b`, 'i').test(textNormalized)) {
        fields.push({
          field_name: 'country',
          field_value: c,
          confidence: 0.80,
        });
        break;
      }
    }
  }

  // 6. Expiry Date
  const expiryMatch = textNormalized.match(
    /(?:Expiry\s*Date|Expiration\s*Date|Expires|Valid\s*Until|EXP|Expiry)[:\s]+(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})/i
  );
  if (expiryMatch && cleanValue(expiryMatch[1])) {
    fields.push({
      field_name: 'expiry_date',
      field_value: cleanValue(expiryMatch[1]),
      confidence: 0.92,
    });
  }

  return fields;
}

/**
 * Extracts structured fields for BANK_STATEMENT
 */
function extractBankStatement(text) {
  const fields = [];
  const textNormalized = text || '';

  // 1. Account Holder Name
  const holderMatch = textNormalized.match(
    /(?:Account\s*Holder(?:\s*Name)?|Customer\s*Name|Account\s*Name|Name)[:\s]+([A-Za-z\s.,'-]{2,60})(?=\n|\r|Account|Date|Bank|$)/i
  );
  if (holderMatch && cleanValue(holderMatch[1])) {
    fields.push({
      field_name: 'account_holder_name',
      field_value: cleanValue(holderMatch[1]),
      confidence: 0.92,
    });
  }

  // 2. Account Number
  const acctMatch = textNormalized.match(
    /(?:Account\s*Number|Account\s*No|A\/C\s*No|Acct\s*No|Account\s*#)[:\s]+([0-9X*-]{6,25})/i
  );
  if (acctMatch && cleanValue(acctMatch[1])) {
    fields.push({
      field_name: 'account_number',
      field_value: cleanValue(acctMatch[1]),
      confidence: 0.94,
    });
  }

  // 3. Bank Name
  const bankMatch = textNormalized.match(
    /(?:Bank\s*Name|Financial\s*Institution|Bank)[:\s]+([A-Za-z0-9\s.,'-]{2,50})(?=\n|\r|Account|Date|$)/i
  );
  if (bankMatch && cleanValue(bankMatch[1])) {
    fields.push({
      field_name: 'bank_name',
      field_value: cleanValue(bankMatch[1]),
      confidence: 0.90,
    });
  } else {
    const knownBanks = ['Chase', 'Bank of America', 'Wells Fargo', 'Citibank', 'Barclays', 'HSBC', 'PNC Bank', 'TD Bank', 'Capital One', 'HDFC Bank', 'ICICI Bank', 'State Bank of India'];
    for (const b of knownBanks) {
      if (new RegExp(`\\b${b}\\b`, 'i').test(textNormalized)) {
        fields.push({
          field_name: 'bank_name',
          field_value: b,
          confidence: 0.85,
        });
        break;
      }
    }
  }

  // 4. Transaction Date
  const txnDateMatch = textNormalized.match(
    /(?:Transaction\s*Date|Txn\s*Date|Date)[:\s]+(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})/i
  );
  if (txnDateMatch && cleanValue(txnDateMatch[1])) {
    fields.push({
      field_name: 'transaction_date',
      field_value: cleanValue(txnDateMatch[1]),
      confidence: 0.88,
    });
  }

  // 5. Description
  const descMatch = textNormalized.match(
    /(?:Description|Details|Narrative|Particulars|Memo)[:\s]+([^\n\r]+)/i
  );
  if (descMatch && cleanValue(descMatch[1])) {
    fields.push({
      field_name: 'description',
      field_value: cleanValue(descMatch[1]),
      confidence: 0.85,
    });
  }

  // 6. Credit
  const creditMatch = textNormalized.match(
    /(?:Credit|Deposit|Deposits|CR)[:\s]+[$€£]?\s*([0-9,]+\.[0-9]{2})/i
  );
  if (creditMatch && cleanValue(creditMatch[1])) {
    fields.push({
      field_name: 'credit',
      field_value: cleanValue(creditMatch[1]),
      confidence: 0.90,
    });
  }

  // 7. Debit
  const debitMatch = textNormalized.match(
    /(?:Debit|Withdrawal|Withdrawals|DR)[:\s]+[$€£]?\s*([0-9,]+\.[0-9]{2})/i
  );
  if (debitMatch && cleanValue(debitMatch[1])) {
    fields.push({
      field_name: 'debit',
      field_value: cleanValue(debitMatch[1]),
      confidence: 0.90,
    });
  }

  // 8. Balance
  const balanceMatch = textNormalized.match(
    /(?:Ending\s*Balance|Current\s*Balance|Available\s*Balance|Closing\s*Balance|Total\s*Balance|Balance)[:\s]+[$€£]?\s*([0-9,]+\.[0-9]{2})/i
  );
  if (balanceMatch && cleanValue(balanceMatch[1])) {
    fields.push({
      field_name: 'balance',
      field_value: cleanValue(balanceMatch[1]),
      confidence: 0.92,
    });
  }

    return fields;
}

/**
 * Normalizes common date strings into YYYY-MM-DD format, or returns null.
 */
function normalizeTransactionDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const cleaned = dateStr.trim();

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = cleaned.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // DD/MM/YYYY or MM/DD/YYYY
  const slashMatch = cleaned.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (slashMatch) {
    const p1 = parseInt(slashMatch[1], 10);
    const p2 = parseInt(slashMatch[2], 10);
    const y = slashMatch[3];
    if (p1 > 12) {
      // p1 is day, p2 is month
      return `${y}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
    } else {
      // default MM-DD
      return `${y}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
    }
  }

  // DD Mon YYYY (e.g. 15 Jan 2024)
  const monthNames = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    january: '01', february: '02', march: '03', april: '04', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
  };
  const textDateMatch = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (textDateMatch) {
    const d = textDateMatch[1].padStart(2, '0');
    const mStr = textDateMatch[2].toLowerCase();
    const m = monthNames[mStr];
    const y = textDateMatch[3];
    if (m) return `${y}-${m}-${d}`;
  }

  const dObj = new Date(cleaned);
  if (!isNaN(dObj.getTime())) {
    try {
      return dObj.toISOString().split('T')[0];
    } catch (_) {}
  }

  return null;
}

/**
 * Parses numeric currency amount safely.
 */
function parseCurrency(str) {
  if (!str) return 0;
  const cleaned = String(str).replace(/[$€£,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.abs(num);
}

/**
 * Extracts list of transaction records from bank statement OCR text.
 * Only extracts real transaction data actually present in text; never invents transactions.
 *
 * @param {string} text - Raw OCR / document text
 * @returns {Array<{ transactionDate: string|null, description: string, credit: number, debit: number, balance: number|null }>}
 */
function extractTransactions(text) {
  if (!text || typeof text !== 'string') return [];
  const transactions = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Pattern A: Tabular rows with date, description, amounts
  // Examples:
  // 2024-03-01 Salary Deposit +3500.00 5000.00
  // 03/15/2024 Amazon Purchase Debit $85.50 Balance $4914.50
  // 2024-03-20 Wire Transfer CR 1200.00 6114.50
  // 2024-03-25 Grocery Store -150.00 5964.50
  const rowDatePattern = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\s+(.+)$/i;

  for (const line of lines) {
    const dateMatch = line.match(rowDatePattern);
    if (!dateMatch) continue;

    const rawDate = dateMatch[1];
    const rest = dateMatch[2].trim();

    // Check if rest contains numbers/amounts
    const amountMatches = [...rest.matchAll(/(?:([+-])?\s*[$€£]?\s*([0-9,]+\.[0-9]{2}))/g)];
    if (amountMatches.length === 0) continue;

    // Check for explicit Credit / Debit / Deposit / Withdrawal indicators
    const isCredit = /\b(?:credit|deposit|deposits|cr|\+)\b/i.test(rest);
    const isDebit = /\b(?:debit|withdrawal|withdrawals|dr|-)\b/i.test(rest);

    let credit = 0;
    let debit = 0;
    let balance = null;

    // Extract description (text before first amount)
    const firstAmountIndex = rest.search(/[$€£+-]?\s*[0-9,]+\.[0-9]{2}/);
    let description = firstAmountIndex > 0 ? rest.substring(0, firstAmountIndex).trim() : rest;
    description = description
      .replace(/\b(?:credit|debit|deposit|withdrawal|balance|cr|dr)\b/gi, '')
      .replace(/[:|\-]+/g, ' ')
      .trim();
    if (!description) description = 'Bank Transaction';

    if (amountMatches.length === 1) {
      const amt = parseCurrency(amountMatches[0][2]);
      const sign = amountMatches[0][1];
      if (sign === '+' || isCredit) {
        credit = amt;
      } else if (sign === '-' || isDebit) {
        debit = amt;
      } else {
        // Default to debit if no sign or credit keyword
        debit = amt;
      }
    } else if (amountMatches.length >= 2) {
      const amt1 = parseCurrency(amountMatches[0][2]);
      const amt2 = parseCurrency(amountMatches[1][2]);

      if (amountMatches.length >= 3) {
        // [Debit, Credit, Balance] or [Amount, ..., Balance]
        const amt3 = parseCurrency(amountMatches[2][2]);
        balance = amt3;
        if (isCredit) {
          credit = amt2 || amt1;
        } else {
          debit = amt1;
        }
      } else {
        // 2 amounts: likely [Amount, Balance]
        balance = amt2;
        if (isCredit) {
          credit = amt1;
        } else {
          debit = amt1;
        }
      }
    }

    transactions.push({
      transactionDate: normalizeTransactionDate(rawDate),
      description: cleanValue(description),
      credit: Number(credit.toFixed(2)),
      debit: Number(debit.toFixed(2)),
      balance: balance !== null ? Number(balance.toFixed(2)) : null,
    });
  }

  // Fallback: If no multi-line table matches, check if single fields were extracted
  if (transactions.length === 0) {
    const singleFields = extractBankStatement(text);
    const dateField = singleFields.find((f) => f.field_name === 'transaction_date');
    const descField = singleFields.find((f) => f.field_name === 'description');
    const creditField = singleFields.find((f) => f.field_name === 'credit');
    const debitField = singleFields.find((f) => f.field_name === 'debit');
    const balanceField = singleFields.find((f) => f.field_name === 'balance');

    const creditVal = creditField ? parseCurrency(creditField.field_value) : 0;
    const debitVal = debitField ? parseCurrency(debitField.field_value) : 0;
    const balanceVal = balanceField ? parseCurrency(balanceField.field_value) : null;

    if (creditVal > 0 || debitVal > 0 || balanceVal !== null) {
      transactions.push({
        transactionDate: dateField ? normalizeTransactionDate(dateField.field_value) : null,
        description: descField && descField.field_value ? cleanValue(descField.field_value) : 'Bank Transaction',
        credit: Number(creditVal.toFixed(2)),
        debit: Number(debitVal.toFixed(2)),
        balance: balanceVal !== null ? Number(balanceVal.toFixed(2)) : null,
      });
    }
  }

  return transactions;
}

/**
 * Extracts structured fields for ADDRESS_PROOF
 */
function extractAddressProof(text) {
  const fields = [];
  const textNormalized = text || '';

  // 1. Name
  const nameMatch = textNormalized.match(
    /(?:Customer\s*Name|Account\s*Holder|Name|Billed\s*To|Addressee)[:\s]+([A-Za-z\s.,'-]{2,60}?)(?=\s*(?:\r?\n|Service|Billing|Address|Date|Bill|$))/i
  );
  if (nameMatch && cleanValue(nameMatch[1])) {
    fields.push({
      field_name: 'name',
      field_value: cleanValue(nameMatch[1]),
      confidence: 0.92,
    });
  }

  // 2. Address
  const addressMatch = textNormalized.match(
    /(?:Service\s*Address|Billing\s*Address|Property\s*Address|Address)[:\s]+([^\n\r]+?)(?=\s*(?:\r?\n|Statement|Bill|Issue|Date|$))/i
  );
  if (addressMatch && cleanValue(addressMatch[1])) {
    fields.push({
      field_name: 'address',
      field_value: cleanValue(addressMatch[1]),
      confidence: 0.90,
    });
  }

  // 3. Document Date
  const dateMatch = textNormalized.match(
    /(?:Statement\s*Date|Bill\s*Date|Issue\s*Date|Date\s*of\s*Issue|Document\s*Date|Date)[:\s]+(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})/i
  );
  if (dateMatch && cleanValue(dateMatch[1])) {
    fields.push({
      field_name: 'document_date',
      field_value: cleanValue(dateMatch[1]),
      confidence: 0.90,
    });
  }

  return fields;
}

/**
 * Extracts structured fields for SUPPORTING_DOCUMENT
 */
function extractSupportingDocument(text) {
  const fields = [];
  const textNormalized = text || '';

  // 1. Detected Title (first non-empty line)
  const lines = textNormalized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length > 0) {
    fields.push({
      field_name: 'detected_title',
      field_value: lines[0].substring(0, 150),
      confidence: 0.80,
    });
  }

  // 2. Detected Date
  const dateMatch = textNormalized.match(
    /\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\b/
  );
  if (dateMatch) {
    fields.push({
      field_name: 'detected_date',
      field_value: dateMatch[1],
      confidence: 0.75,
    });
  }

  // 3. Summary snippet
  if (lines.length > 1) {
    const summary = lines.slice(1, 4).join(' ').substring(0, 300);
    fields.push({
      field_name: 'summary',
      field_value: summary,
      confidence: 0.70,
    });
  }

  return fields;
}

/**
 * Main dispatcher for extracting structured fields based on document type
 *
 * @param {string} rawText - Raw OCR text extracted from the document
 * @param {string} documentType - Standardized document type (e.g. GOVERNMENT_ID, BANK_STATEMENT, etc.)
 * @returns {Array<{ field_name: string, field_value: string, confidence: number }>}
 */
function extractStructuredFields(rawText, documentType) {
  const normalizedType = (documentType || '').toUpperCase().trim().replace(/[\s-]+/g, '_');
  let extracted = [];

  switch (normalizedType) {
    case 'GOVERNMENT_ID':
    case 'GOVERNMENT':
    case 'ID':
      extracted = extractGovernmentId(rawText);
      break;

    case 'BANK_STATEMENT':
      extracted = extractBankStatement(rawText);
      break;

    case 'ADDRESS_PROOF':
      extracted = extractAddressProof(rawText);
      break;

    case 'SUPPORTING_DOCUMENT':
    default:
      extracted = extractSupportingDocument(rawText);
      break;
  }

  // Always preserve raw text as a field for downstream verification
  if (rawText && rawText.trim().length > 0) {
    extracted.push({
      field_name: 'raw_text',
      field_value: rawText.trim(),
      confidence: 1.0,
    });
  }

  return extracted;
}

module.exports = {
  extractStructuredFields,
  extractGovernmentId,
  extractBankStatement,
  extractAddressProof,
  extractSupportingDocument,
  extractTransactions,
};
