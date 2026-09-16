const db = require('../config/database');
const officerService = require('./officerService');

/**
 * Normalizes document type labels into officer-friendly strings
 */
function formatDocTypeName(type) {
  switch ((type || '').toLowerCase()) {
    case 'government_id':
      return 'Government-issued ID (Passport / National ID / Driver\'s License)';
    case 'bank_statement':
      return 'Bank Statement';
    case 'address_proof':
      return 'Proof of Address (Utility Bill / Council Tax)';
    case 'supporting_document':
      return 'Supporting Document';
    default:
      return type ? type.replace(/_/g, ' ') : 'Unknown Document';
  }
}

/**
 * Aggregates complete case dossier from officerService and database
 * for the AI Copilot to analyze.
 *
 * @param {number|string} verificationId
 * @returns {Promise<Object>}
 */
async function getCaseCopilotDossier(verificationId) {
  // Retrieve comprehensive case details without triggering an audit log view event
  const details = await officerService.getCaseDetails(verificationId, null);

  const docs = details.documents || [];
  const uploadedTypes = new Set(docs.map((d) => (d.documentType || '').toLowerCase()));
  const requiredTypes = ['government_id', 'bank_statement', 'address_proof'];
  const missingTypes = requiredTypes.filter((t) => !uploadedTypes.has(t));

  return {
    verificationId: details.verificationId,
    status: (details.status || 'SUBMITTED').toUpperCase(),
    submissionDate: details.submissionDate,
    updatedAt: details.updatedAt,
    customer: details.customer || {},
    documents: docs.map((d) => ({
      id: d.id,
      documentType: d.documentType,
      documentTypeName: formatDocTypeName(d.documentType),
      originalFilename: d.originalFilename,
      status: (d.status || '').toUpperCase(),
      mimeType: d.mimeType,
      fileSize: d.fileSize,
      extractedFields: d.extractedFields || [],
    })),
    missingDocuments: missingTypes,
    missingDocumentNames: missingTypes.map(formatDocTypeName),
    validation: details.validation || { overallStatus: 'NOT_RUN', checks: [] },
    financialAnalysis: details.financialAnalysis || null,
    riskAssessment: details.riskAssessment || null,
    notes: details.notes || [],
    auditTrail: details.auditTrail || [],
  };
}

/**
 * Deterministic, grounded compliance analysis engine.
 * Generates accurate, highly structured explanations and audit drafts
 * using only real verified facts from the case dossier.
 *
 * @param {string} prompt
 * @param {Object} dossier
 * @returns {string}
 */
function generateGroundedCopilotResponse(prompt, dossier) {
  const p = (prompt || '').trim().toLowerCase();
  const customerName = dossier.customer?.name || 'Customer';
  const customerEmail = dossier.customer?.email || 'N/A';
  const vId = dossier.verificationId;
  const status = dossier.status;

  const riskScore = dossier.riskAssessment?.riskScore ?? 'N/A';
  const riskLevel = dossier.riskAssessment?.riskLevel || 'NOT_ASSESSED';
  const riskFactors = dossier.riskAssessment?.riskFactors || [];

  const checks = dossier.validation?.checks || [];
  const failedChecks = checks.filter((c) => ['MISMATCH', 'FLAGGED', 'EXPIRED', 'FAIL'].includes((c.status || '').toUpperCase()));
  const passedChecks = checks.filter((c) => ['MATCH', 'PASS', 'VALID'].includes((c.status || '').toUpperCase()));

  const fin = dossier.financialAnalysis;
  const summary = fin?.summary || null;
  const anomalies = fin?.anomalies || [];

  // ================= 1. DRAFT AUDIT NOTE =================
  if (
    p.includes('audit note') ||
    p.includes('draft note') ||
    p.includes('compliance note') ||
    p.includes('draft audit') ||
    p.includes('generate note') ||
    p.includes('determination note') ||
    p.includes('draft determination')
  ) {
    let recommendation = 'NEEDS_REVIEW';
    if (riskLevel === 'LOW' && failedChecks.length === 0 && (dossier.missingDocuments || []).length === 0) {
      recommendation = 'APPROVED';
    } else if (riskLevel === 'CRITICAL' || riskScore >= 75) {
      recommendation = 'FLAGGED';
    } else if (failedChecks.some((c) => (c.checkType || '').includes('EXPIR') || (c.status || '').includes('EXPIRED'))) {
      recommendation = 'REJECTED (Expired Credentials)';
    }

    const docSummaryList = dossier.documents.map((d) => `- ${d.documentTypeName}: "${d.originalFilename}" (${d.status})`).join('\n');
    const missingDocsText = dossier.missingDocuments.length > 0
      ? `\n- ⚠️ Missing Required Documents: ${dossier.missingDocumentNames.join(', ')}`
      : '\n- ✅ All mandatory verification documents submitted.';

    const valSummary = failedChecks.length > 0
      ? failedChecks.map((c) => `- ⚠️ [${c.severity || 'WARNING'}] ${c.checkType}: ${c.message}`).join('\n')
      : '- ✅ Cross-document validation checks passed without discrepancy.';

    const finSummary = summary
      ? `- Net Flow: €${((summary.totalCredits || 0) - (summary.totalDebits || 0)).toFixed(2)} across ${summary.transactionCount || 0} transactions (Ending Balance: €${Number(summary.endingBalance || 0).toFixed(2)})\n- Anomalies: ${anomalies.length > 0 ? `${anomalies.length} anomaly flag(s) identified` : 'None detected'}`
      : '- Financial profile: No bank statement transaction records available.';

    return `[DRAFT COMPLIANCE AUDIT NOTE]

Case Reference: Case #${vId} | Customer: ${customerName} (${customerEmail})
Assessment Date: ${new Date().toISOString().split('T')[0]} | Lifecycle Status: ${status}
Risk Rating: Score ${riskScore}/100 [Tier: ${riskLevel}]

1. DOCUMENT SUBMISSIONS & INTEGRITY:
${docSummaryList}${missingDocsText}

2. CROSS-DOCUMENT VALIDATION FINDINGS:
${valSummary}

3. FINANCIAL & TRANSACTION ANALYSIS:
${finSummary}

4. COMPLIANCE ASSESSMENT & RECOMMENDATION:
- Preliminary Determination: ${recommendation}
- Rationale: Risk score is rated ${riskLevel} (${riskScore}/100) with ${failedChecks.length} validation discrepancy(ies) and ${anomalies.length} transaction anomaly flag(s).
- Required Next Action: ${
      failedChecks.length > 0
        ? 'Request customer clarification / updated documentation for discrepancies noted above.'
        : anomalies.length > 0
        ? 'Verify source of funds and purpose for flagged transaction volume.'
        : 'Case meets standard compliance criteria. Human officer sign-off recommended.'
    }

Prepared by: AI Compliance Copilot (Advisory Mode)
Officer Sign-off: _______________________ Date: ____________`;
  }

  // ================= 2. RISK EXPLANATION =================
  if (
    p.includes('risk') ||
    p.includes('score') ||
    p.includes('tier') ||
    p.includes('why is the score') ||
    p.includes('factor')
  ) {
    let factorsList = '';
    if (riskFactors.length > 0) {
      factorsList = riskFactors
        .map((f, i) => `${i + 1}. **${f.factor || f.name || 'Risk Factor'}** (+${f.weight || f.points || 0} pts)\n   - Description: ${f.description || f.message || 'Contributed to overall case risk'}`)
        .join('\n');
    } else {
      factorsList = '- No active risk penalty factors detected (0 points added).';
    }

    return `### 🛡️ Risk Assessment Explanation for Case #${vId}

**Current Advisory Risk Score**: \`${riskScore} / 100\`
**Assigned Risk Tier**: \`${riskLevel}\`

#### 📊 Contributing Factors Breakdown:
${factorsList}

#### ⚙️ Demo Risk Scoring Methodology:
Our demo compliance risk engine applies explainable rule-based scoring (maximum 100 points):
- **Identity Mismatch**: +25 points (discrepancy between ID and statements)
- **Address Mismatch**: +20 points (discrepancy between proof of address and ID)
- **Expired Document**: +20 points (expired identification or statement older than 90 days)
- **Unusual Transaction**: +20 points (high-velocity, negative balance, or spike anomaly)
- **Poor Document Quality**: +10 points (OCR confidence < 70% or illegible document)

#### 🎯 Risk Thresholds:
- **0 – 24**: LOW (standard approval path)
- **25 – 49**: MEDIUM (standard manual review recommended)
- **50 – 74**: HIGH (escalated compliance inquiry required)
- **75 – 100**: CRITICAL (immediate freeze / senior MLRO review)

*Disclaimer: These rules reflect the hackathon demo scoring model and are purely advisory. Final verification determinations remain the sole responsibility of authorized compliance officers.*`;
  }

  // ================= 3. DOCUMENT DISCREPANCIES =================
  if (
    p.includes('discrepanc') ||
    p.includes('mismatch') ||
    p.includes('inconsisten') ||
    p.includes('conflict') ||
    p.includes('difference') ||
    p.includes('document check') ||
    p.includes('cross-document')
  ) {
    let discrepancyDetails = '';
    if (failedChecks.length > 0) {
      discrepancyDetails = failedChecks
        .map((c, i) => {
          return `${i + 1}. **${c.checkType.replace(/_/g, ' ')}** [Severity: \`${(c.severity || 'MEDIUM').toUpperCase()}\`]\n   - **Status**: ${c.status}\n   - **Observation**: ${c.message}\n   - **Action Item**: Verify raw document image against extracted metadata.`;
        })
        .join('\n\n');
    } else {
      discrepancyDetails = '✅ **No cross-document discrepancies detected.** All extracted identity attributes, addresses, and document validity checks match across submitted records.';
    }

    let missingSection = '';
    if (dossier.missingDocuments.length > 0) {
      missingSection = `\n\n⚠️ **Missing Mandatory Documents**:\n${dossier.missingDocumentNames.map((n) => `- ${n}`).join('\n')}`;
    }

    return `### 🔍 Cross-Document Discrepancy Analysis for Case #${vId}

**Subject**: ${customerName} | **Lifecycle Status**: ${status}
**Total Validation Checks Run**: ${checks.length} (${passedChecks.length} Passed, ${failedChecks.length} Flagged)

#### 📋 Discrepancy Findings:
${discrepancyDetails}${missingSection}

#### 💡 Guidance for Discrepancy Resolution:
- If a name variation is due to middle names or maiden names, verify official supporting records.
- For address formatting differences (e.g. "St" vs "Street"), confirm street number and postal code alignment.
- When an expired document is identified, request a re-upload of a current credential.`;
  }

  // ================= 4. FINANCIAL ANALYSIS & TRANSACTIONS =================
  if (
    p.includes('financial') ||
    p.includes('transaction') ||
    p.includes('bank statement') ||
    p.includes('cash flow') ||
    p.includes('credit') ||
    p.includes('debit') ||
    p.includes('balance') ||
    p.includes('anomal')
  ) {
    if (!fin || !summary) {
      return `### 💳 Financial & Transaction Profiling for Case #${vId}

**Status**: No extracted bank statement financial profile is available for this case.

**Details**:
- Either no Bank Statement has been submitted by ${customerName}, or the uploaded document did not yield structured transaction data.
- **Recommended Action**: If financial verification is required for this customer tier, request a PDF bank statement covering the last 3 calendar months.`;
    }

    let anomalyText = '';
    if (anomalies.length > 0) {
      anomalyText = anomalies
        .map((a, i) => `${i + 1}. **${(a.type || a.anomalyType || 'Anomaly').replace(/_/g, ' ')}** [${(a.severity || 'WARNING').toUpperCase()}]\n   - ${a.description || a.message || 'Suspicious financial pattern detected'}`)
        .join('\n');
    } else {
      anomalyText = '✅ No unusual transaction spikes, rapid outflows, or negative balances detected.';
    }

    return `### 💳 Financial & Transaction Profiling for Case #${vId}

**Customer**: ${customerName}
**Account Holder**: ${fin.accountDetails?.accountHolder || customerName}
**Bank / Institution**: ${fin.accountDetails?.bankName || 'Identified Bank'}
**Account / IBAN**: ${fin.accountDetails?.accountNumber || 'Extracted on file'}

#### 📈 Financial Metrics Summary:
- **Total Inflow (Credits)**: €${Number(summary.totalCredits || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
- **Total Outflow (Debits)**: €${Number(summary.totalDebits || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
- **Net Cash Flow**: €${Number((summary.totalCredits || 0) - (summary.totalDebits || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
- **Ending Balance**: €${Number(summary.endingBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
- **Transaction Count**: ${summary.transactionCount || 0} transactions
- **Average Transaction**: €${Number(summary.averageTransactionAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}

#### 🚨 Detected Transaction Anomalies:
${anomalyText}

*Note: Transaction analytics are extracted directly from customer-submitted statements without fabrication or synthetic extrapolation.*`;
  }

  // ================= 5. REVIEW GUIDANCE =================
  if (
    p.includes('guidance') ||
    p.includes('checklist') ||
    p.includes('what should i check') ||
    p.includes('how to review') ||
    p.includes('action') ||
    p.includes('recommendation')
  ) {
    return `### 📋 Case Review Guidance & Compliance Checklist for Case #${vId}

**Customer**: ${customerName} | **Current Status**: ${status} | **Risk**: ${riskLevel} (${riskScore}/100)

Follow this standardized 5-step review procedure before issuing a determination:

1. **Identity Credential Verification**:
   - Confirm photo clarity, full name spelling, and date of birth match registration details.
   - Verify government ID expiration date is in the future.

2. **Address Corroboration**:
   - Check proof of address date (utility bills or bank statements should be dated within the last 90 days).
   - Verify street name, postal code, and city correspond with customer profile.

3. **Financial Statement Scrutiny**:
   ${summary ? `- Review ${summary.transactionCount} transactions; inspect flagged items (${anomalies.length} anomalies flagged).` : '- Note: No bank statement is currently uploaded for this case.'}
   - Verify recurring salary or verified income source where relevant.

4. **Investigate Flagged Validation Checks**:
   ${failedChecks.length > 0 ? `- ⚠️ Address ${failedChecks.length} open discrepancy flags before final approval.` : '- ✅ No automated validation flags are open.'}

5. **Record Official Decision**:
   - Provide clear determination notes in the compliance decision panel.
   - Use the **AI Copilot "Draft Audit Note"** prompt to generate a pre-formatted audit entry.

*Regulatory Notice: The AI Compliance Copilot does NOT execute automated approvals or rejections. Human compliance sign-off is required.*`;
  }

  // ================= 6. CASE SUMMARY (DEFAULT) =================
  const docList = dossier.documents.map((d) => `- **${d.documentTypeName}**: \`${d.originalFilename}\` (${d.status}, ${d.extractedFields.length} fields extracted)`).join('\n');
  const missingText = dossier.missingDocuments.length > 0
    ? `\n- ⚠️ **Missing Required**: ${dossier.missingDocumentNames.join(', ')}`
    : '\n- ✅ All mandatory document categories submitted.';

  return `### 📋 Verification Case Dossier Summary: Case #${vId}

**Customer**: ${customerName} (${customerEmail})
**Lifecycle Status**: \`${status}\` | **Submitted**: ${new Date(dossier.submissionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
**Advisory Risk**: \`${riskLevel}\` (Score: ${riskScore}/100)

---

#### 1. 📄 Document Submission Portfolio:
${docList || '- No documents uploaded yet.'}${missingText}

#### 2. 🔍 Cross-Document Validation:
- **Overall Status**: \`${dossier.validation?.overallStatus || 'NOT_RUN'}\`
- **Passed Checks**: ${passedChecks.length}
- **Flagged Discrepancies**: ${failedChecks.length}
${failedChecks.map((c) => `  - ⚠️ [${c.severity || 'WARN'}] ${c.checkType}: ${c.message}`).join('\n')}

#### 3. 💳 Financial Analysis Profile:
${
  summary
    ? `- Total Credits: €${Number(summary.totalCredits || 0).toFixed(2)} | Total Debits: €${Number(summary.totalDebits || 0).toFixed(2)}
- Ending Balance: €${Number(summary.endingBalance || 0).toFixed(2)} (${summary.transactionCount} transactions)
- Anomaly Flags: ${anomalies.length > 0 ? `${anomalies.length} flag(s) identified` : 'None detected'}`
    : '- No bank statement transaction records available for analysis.'
}

#### 4. ⚖️ Compliance Advisory Recommendation:
${
  dossier.missingDocuments.length > 0
    ? '• **Action Required**: Customer has pending required documents. Request upload before final approval.'
    : failedChecks.length > 0
    ? '• **Manual Review Required**: Review the identified validation discrepancies before proceeding.'
    : riskScore >= 50
    ? '• **Elevated Risk**: High risk score detected. Enhanced due diligence recommended.'
    : '• **Standard Risk**: Case meets documentation criteria. Ready for compliance officer determination.'
}

*This AI summary is advisory. Official determinations require compliance officer execution via the decision controls above.*`;
}

/**
 * Generates an AI Copilot response for an officer reviewing a verification case.
 * Incorporates external LLM (OpenAI / Gemini) if configured, with graceful
 * fallback to the deterministic, grounded compliance analysis engine.
 *
 * @param {number|string} verificationId
 * @param {Object} officerUser
 * @param {string} prompt
 * @param {Array} [chatHistory]
 * @returns {Promise<Object>}
 */
async function generateCopilotResponse(verificationId, officerUser, prompt, chatHistory = []) {
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error('Inquiry message is required.');
  }

  const cleanPrompt = prompt.trim();

  // 1. Fetch complete case dossier
  const dossier = await getCaseCopilotDossier(verificationId);

  // 2. Check for OpenAI or Gemini API Keys
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  let reply = null;

  // Try OpenAI if configured
  if (openaiKey && openaiKey.trim().length > 10) {
    try {
      const systemInstruction = `You are the BNP Paribas Compliance AI Copilot assisting a Compliance Officer reviewing Verification Case #${verificationId}.
Customer: ${dossier.customer?.name} (${dossier.customer?.email}), Status: ${dossier.status}.
Risk: ${dossier.riskAssessment?.riskScore}/100 [Tier: ${dossier.riskAssessment?.riskLevel}].
Documents: ${JSON.stringify(dossier.documents.map((d) => ({ type: d.documentType, file: d.originalFilename, status: d.status })))}.
Missing: ${JSON.stringify(dossier.missingDocuments)}.
Validation Checks: ${JSON.stringify(dossier.validation?.checks || [])}.
Financial: ${JSON.stringify(dossier.financialAnalysis?.summary || 'N/A')}, Anomalies: ${JSON.stringify(dossier.financialAnalysis?.anomalies || [])}.

Role Guidelines:
- You are an advisory assistant for human compliance officers.
- Provide objective, grounded analysis strictly based on the provided dossier. Never invent transactions, customers, or facts.
- If drafting an audit note, ALWAYS label it prominently with "[DRAFT COMPLIANCE AUDIT NOTE]".
- Never approve or reject cases automatically; emphasize that the officer makes the final decision.
- Answer clearly in GitHub-flavored markdown.`;

      const messages = [
        { role: 'system', content: systemInstruction },
        ...chatHistory.slice(-6).map((m) => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.message,
        })),
        { role: 'user', content: cleanPrompt },
      ];

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.2,
          max_tokens: 700,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (content && content.trim().length > 0) {
          reply = content.trim();
        }
      }
    } catch (llmErr) {
      console.warn('[OfficerCopilotService] OpenAI call failed or timed out, falling back to grounded rule engine:', llmErr.message);
    }
  }

  // Try Gemini if configured and OpenAI was not used
  if (!reply && geminiKey && geminiKey.trim().length > 10) {
    try {
      const systemInstruction = `You are the BNP Paribas Compliance AI Copilot assisting a Compliance Officer reviewing Verification Case #${verificationId}.
Customer: ${dossier.customer?.name} (${dossier.customer?.email}), Status: ${dossier.status}.
Risk: ${dossier.riskAssessment?.riskScore}/100 [Tier: ${dossier.riskAssessment?.riskLevel}].
Documents: ${JSON.stringify(dossier.documents.map((d) => ({ type: d.documentType, file: d.originalFilename, status: d.status })))}.
Missing: ${JSON.stringify(dossier.missingDocuments)}.
Validation Checks: ${JSON.stringify(dossier.validation?.checks || [])}.
Financial: ${JSON.stringify(dossier.financialAnalysis?.summary || 'N/A')}, Anomalies: ${JSON.stringify(dossier.financialAnalysis?.anomalies || [])}.

Role Guidelines:
- You are an advisory assistant for human compliance officers.
- Provide objective, grounded analysis strictly based on the provided dossier. Never invent transactions or facts.
- If drafting an audit note, ALWAYS label it prominently with "[DRAFT COMPLIANCE AUDIT NOTE]".
- Never approve or reject cases automatically; emphasize that the officer makes the final decision.`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: systemInstruction },
                { text: `Officer inquiry: "${cleanPrompt}"` },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content && content.trim().length > 0) {
          reply = content.trim();
        }
      }
    } catch (geminiErr) {
      console.warn('[OfficerCopilotService] Gemini call failed or timed out, falling back to grounded rule engine:', geminiErr.message);
    }
  }

  // 3. Fallback to Grounded Domain Rule Compliance Engine
  if (!reply) {
    reply = generateGroundedCopilotResponse(cleanPrompt, dossier);
  }

  // 4. Save both Officer message and Copilot response in database
  const officerUserId = officerUser?.id || null;
  if (officerUserId) {
    await db.saveChatMessage(officerUserId, verificationId, 'user', cleanPrompt);
    await db.saveChatMessage(officerUserId, verificationId, 'assistant', reply);
  }

  return {
    verificationId: Number(verificationId),
    prompt: cleanPrompt,
    response: reply,
    generatedAt: new Date(),
  };
}

module.exports = {
  getCaseCopilotDossier,
  generateGroundedCopilotResponse,
  generateCopilotResponse,
  formatDocTypeName,
};
