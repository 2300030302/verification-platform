const db = require('../config/database');

/**
 * Normalizes document type labels into customer-friendly strings
 */
function formatDocTypeName(type) {
  switch ((type || '').toLowerCase()) {
    case 'government_id':
      return 'Government-issued ID (Passport / National ID / Driver\'s License)';
    case 'bank_statement':
      return 'Bank Statement (Recent 3 months)';
    case 'address_proof':
      return 'Proof of Address (Utility Bill / Council Tax)';
    case 'supporting_document':
      return 'Supporting Document';
    default:
      return type ? type.replace(/_/g, ' ') : 'Unknown Document';
  }
}

/**
 * Retrieves the minimal, customer-safe verification context from MySQL.
 * Strictly redacts internal risk scores, risk tiers, officer notes, and audit logs.
 *
 * @param {number|string} userId
 * @returns {Promise<Object>}
 */
async function getCustomerSafeContext(userId) {
  const pool = db.getDatabasePool();
  await db.ensureUsersTable();
  await db.ensureDocumentsTable();
  await db.ensureVerificationCasesTable();
  await db.ensureValidationResultsTable();

  // 1. Fetch customer user details
  const [users] = await pool.query(
    'SELECT id, name, email FROM users WHERE id = ?',
    [userId]
  );
  if (users.length === 0) {
    throw new Error(`Customer with ID #${userId} not found.`);
  }
  const user = users[0];

  // 2. Fetch or create active verification case
  const verificationCase = await db.getOrCreateVerificationCase(userId);

  // 3. Fetch customer's uploaded documents (safe metadata only)
  const [docs] = await pool.query(
    `SELECT id, document_type, original_filename, status, mime_type, created_at 
     FROM documents 
     WHERE user_id = ? 
     ORDER BY created_at ASC`,
    [userId]
  );

  const uploadedTypes = new Set(docs.map((d) => (d.document_type || '').toLowerCase()));
  const requiredTypes = ['government_id', 'bank_statement', 'address_proof'];
  const missingDocuments = requiredTypes.filter((t) => !uploadedTypes.has(t));

  // 4. Fetch customer-facing validation findings (sanitized, no internal weights)
  const [valResults] = await pool.query(
    `SELECT check_type, status, severity, message 
     FROM validation_results 
     WHERE verification_id = ? 
     ORDER BY id ASC`,
    [verificationCase.id]
  );

  const sanitizedFindings = valResults.map((r) => ({
    checkType: r.check_type,
    status: (r.status || '').toUpperCase(),
    severity: (r.severity || '').toLowerCase(),
    message: r.message,
  }));

  return {
    customerId: user.id,
    customerName: user.name,
    customerEmail: user.email,
    verificationId: verificationCase.id,
    caseStatus: (verificationCase.status || 'DRAFT').toUpperCase(),
    documentsCount: docs.length,
    documents: docs.map((d) => ({
      id: d.id,
      type: (d.document_type || '').toLowerCase(),
      typeName: formatDocTypeName(d.document_type),
      originalFilename: d.original_filename,
      status: (d.status || '').toUpperCase(),
      uploadedAt: d.created_at,
    })),
    missingDocuments,
    missingDocumentNames: missingDocuments.map(formatDocTypeName),
    validationFindings: sanitizedFindings,
  };
}

/**
 * Intelligent, grounded domain rule fallback engine.
 * Answers all customer verification questions accurately using real customer facts.
 * Never hallucinates or invents data.
 *
 * @param {string} userMessage
 * @param {Object} context - Customer safe context
 * @returns {string}
 */
function generateGroundedFallbackResponse(userMessage, context) {
  const msg = (userMessage || '').toLowerCase();
  const name = context.customerName || 'valued customer';

  // 1. "What documents do I need?" / Required documents inquiry
  if (
    msg.includes('what document') ||
    msg.includes('which document') ||
    msg.includes('documents do i need') ||
    msg.includes('required document') ||
    msg.includes('document requirement')
  ) {
    let response = `Hello ${name}, for customer identity verification at BNP Paribas, you need to provide the following 3 standard documents:\n\n`;
    response += `1. **Government-issued ID**: A valid, unexpired Passport, National Identity Card, or Driver's License.\n`;
    response += `2. **Bank Statement**: An official statement from the last 3 months displaying your full name, recent transactions, and running balance.\n`;
    response += `3. **Proof of Address**: A recent utility bill (gas, water, electric) or council tax bill issued within the last 3 months matching your registered residential address.\n\n`;

    if (context.missingDocuments && context.missingDocuments.length > 0) {
      response += `📌 **Your Current Progress**: You have uploaded **${context.documentsCount} of 3** required documents. You still need to upload:\n`;
      context.missingDocumentNames.forEach((docName) => {
        response += `- ${docName}\n`;
      });
      response += `\nYou can submit these directly via the **My Documents** page.`;
    } else {
      response += `✅ Great news! You have already submitted all 3 primary required documents.`;
    }
    return response;
  }

  // 2. "What is address proof?" / Acceptable address proof
  if (
    msg.includes('address proof') ||
    msg.includes('proof of address') ||
    msg.includes('valid address') ||
    msg.includes('acceptable address')
  ) {
    return (
      `**Proof of Address Guidelines**:\n\n` +
      `To verify your residential address, we accept official documents issued within the **last 3 months** (90 days) that clearly show:\n` +
      `• Your full legal name\n` +
      `• Your residential address (must match your account registration)\n` +
      `• Official issuer logo and date of issue\n\n` +
      `**Eligible Documents**:\n` +
      `✅ Utility Bill (Electricity, Gas, Water, Landline Internet)\n` +
      `✅ Bank or Building Society Statement\n` +
      `✅ Council Tax Statement or Local Authority Letter\n\n` +
      `*Note: Mobile phone bills, hand-written documents, and envelopes are not accepted.*`
    );
  }

  // 3. "Why was my document flagged?" / "Why is my document not accepted?"
  if (
    msg.includes('flagged') ||
    msg.includes('not accepted') ||
    msg.includes('rejected') ||
    msg.includes('why is my') ||
    msg.includes('why was my') ||
    msg.includes('issue with my') ||
    msg.includes('problem with my')
  ) {
    const issues = (context.validationFindings || []).filter(
      (f) => f.status === 'FAILED' || f.status === 'REVIEW_NEEDED' || f.status === 'WARNING'
    );

    const failedDocs = (context.documents || []).filter(
      (d) => d.status === 'EXTRACTION_FAILED'
    );

    if (issues.length === 0 && failedDocs.length === 0) {
      return (
        `Good news, ${name}! There are **no negative flags or discrepancies** detected on your submitted documents.\n\n` +
        `Your verification case is currently in status: **${context.caseStatus}**. All submitted documentation is intact and awaiting human compliance officer review.`
      );
    }

    let response = `Here is what our automated consistency checks identified regarding your submitted documents:\n\n`;

    if (failedDocs.length > 0) {
      response += `⚠️ **Document Extraction Notice**:\n`;
      failedDocs.forEach((d) => {
        response += `• "${d.originalFilename}" (${d.typeName}): The file could not be legibly read by OCR. Please ensure the scan is clear, well-lit, and not blurred, then re-upload.\n`;
      });
      response += `\n`;
    }

    if (issues.length > 0) {
      response += `📋 **Validation Findings for Review**:\n`;
      issues.forEach((issue) => {
        response += `• **${issue.checkType.replace(/_/g, ' ')}**: ${issue.message}\n`;
      });
      response += `\n💡 **How to resolve**: Please check that your full legal name and address are spelled identically across all documents, and ensure your ID is not expired. You can upload updated files on the **My Documents** tab.`;
    }

    return response;
  }

  // 4. "What is my verification status?" / Status check
  if (
    msg.includes('my status') ||
    msg.includes('verification status') ||
    msg.includes('current status') ||
    msg.includes('what is my status')
  ) {
    const status = context.caseStatus;
    let explanation = '';

    switch (status) {
      case 'APPROVED':
        explanation = '🎉 **Your verification has been APPROVED!** Your identity and documents have been confirmed, and your onboarding is complete.';
        break;
      case 'NEEDS_REVIEW':
        explanation = '📋 **Status: Needs Review.** A compliance officer has reviewed your submission and requested additional clarification or an updated document. Please check the **Verification Status** page for specific items to re-submit.';
        break;
      case 'FLAGGED':
        explanation = '⚠️ **Status: Under Investigation.** Your submission contains one or more data inconsistencies that are currently undergoing manual review by our compliance team.';
        break;
      case 'REJECTED':
        explanation = '🚫 **Status: Application Declined.** Your verification could not be approved based on the submitted documentation. Please contact customer support for further assistance.';
        break;
      case 'IN_REVIEW':
        explanation = '⏳ **Status: In Review.** Your documents have been uploaded and processed. A compliance officer will review your dossier shortly.';
        break;
      case 'SUBMITTED':
        explanation = '📤 **Status: Submitted.** We have received your documentation and automated consistency checks are active.';
        break;
      case 'DRAFT':
      default:
        explanation = '📝 **Status: In Progress (Draft).** You have begun your verification. Once all required documents are uploaded, your case will proceed to compliance review.';
        break;
    }

    return (
      `Hello ${name}, your verification case (**Case #${context.verificationId}**) is currently: **${status}**.\n\n` +
      `${explanation}\n\n` +
      `Submitted Documents: **${context.documentsCount}** | Missing Required: **${context.missingDocuments.length}**.`
    );
  }

  // 5. "What should I upload next?" / Next steps
  if (
    msg.includes('upload next') ||
    msg.includes('what next') ||
    msg.includes('next step') ||
    msg.includes('what should i do')
  ) {
    if (context.missingDocuments && context.missingDocuments.length > 0) {
      let response = `Based on your case records, you still need to upload:\n\n`;
      context.missingDocumentNames.forEach((docName, idx) => {
        response += `${idx + 1}. **${docName}**\n`;
      });
      response += `\nTo upload these, navigate to the **My Documents** page and select the corresponding document type from the dropdown.`;
      return response;
    }

    if (context.caseStatus === 'APPROVED') {
      return `All required documents have been approved! You do not need to upload any further documents at this time.`;
    }

    if (context.caseStatus === 'NEEDS_REVIEW') {
      return `You have submitted the initial documents, but a compliance officer requested an update. Please check the **Verification Status** tab for any flagged items requiring a clearer scan or updated statement.`;
    }

    return `You have uploaded all 3 primary required documents. Your submission is now in compliance review. No further uploads are needed unless requested by a compliance officer!`;
  }

  // 6. "What happens after I submit my documents?" / Process explanation
  if (
    msg.includes('what happens') ||
    msg.includes('after submit') ||
    msg.includes('after i submit') ||
    msg.includes('how long') ||
    msg.includes('review process')
  ) {
    return (
      `**What happens after you submit your documents**:\n\n` +
      `1. **Automated Extraction & Consistency Check**: Our platform immediately reads your documents via secure OCR and checks that your name, address, and document dates match consistently.\n` +
      `2. **Compliance Officer Review**: An authorized human compliance officer evaluates your dossier and reviews any discrepancies.\n` +
      `3. **Status Determination**: The officer determines whether your application is **Approved**, **Needs Review** (if a clearer file is needed), or requires additional information.\n` +
      `4. **Real-time Notification**: Your Customer Dashboard will update in real time as soon as the determination is recorded.`
    );
  }

  // 7. General Greeting or Fallback Assistance
  return (
    `Hello ${name}! I am your **BNP Paribas Customer Verification Assistant**.\n\n` +
    `I can help you with:\n` +
    `• **"What documents do I need?"** - Core requirements and guidelines\n` +
    `• **"What is address proof?"** - Acceptable utility and council tax bills\n` +
    `• **"What is my verification status?"** - Real-time case tracking\n` +
    `• **"What should I upload next?"** - Missing items checklist\n` +
    `• **"Why was my document flagged?"** - Consistency checks explanation\n` +
    `• **"What happens after I submit?"** - Review lifecycle overview\n\n` +
    `How can I assist you with your verification today?`
  );
}

/**
 * Main AI Assistant service entry point.
 * Tries external LLM provider if configured in .env (OpenAI or Gemini),
 * otherwise gracefully falls back to the deterministic context engine.
 *
 * @param {string} userMessage
 * @param {Object} context - Customer safe context
 * @param {Array} [chatHistory] - Recent conversation messages
 * @returns {Promise<string>}
 */
async function generateResponse(userMessage, context, chatHistory = []) {
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  // 1. Try OpenAI if API key is present
  if (openaiKey && openaiKey.trim().length > 10) {
    try {
      const systemPrompt = `You are the official BNP Paribas Customer Verification Assistant. 
You help onboarding customers understand document requirements and verification statuses.
Customer Details:
- Name: ${context.customerName}
- Status: ${context.caseStatus}
- Uploaded Documents: ${JSON.stringify(context.documents)}
- Missing Required: ${JSON.stringify(context.missingDocuments)}
- Validation Findings: ${JSON.stringify(context.validationFindings)}

Rules:
- Professional, supportive, polite, and banking-compliant.
- Ground all facts in the customer's actual verification records.
- Never invent document requirements, dates, or verification decisions.
- Do NOT reveal internal risk scores, risk levels, officer notes, or internal audit trails.
- Final decisions are made by human compliance officers.`;

      const messages = [
        { role: 'system', content: systemPrompt },
        ...chatHistory.slice(-4).map((m) => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.message,
        })),
        { role: 'user', content: userMessage },
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
          temperature: 0.3,
          max_tokens: 500,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const reply = data?.choices?.[0]?.message?.content;
        if (reply && reply.trim().length > 0) {
          return reply.trim();
        }
      }
    } catch (llmErr) {
      console.warn('[aiAssistantService] OpenAI call failed or timed out, falling back to grounded rule engine:', llmErr.message);
    }
  }

  // 2. Try Gemini if API key is present
  if (geminiKey && geminiKey.trim().length > 10) {
    try {
      const systemPrompt = `You are the BNP Paribas Customer Verification Assistant.
Customer: ${context.customerName}, Status: ${context.caseStatus}.
Missing docs: ${JSON.stringify(context.missingDocuments)}.
Findings: ${JSON.stringify(context.validationFindings)}.
Answer concisely, helpfully, and politely. Never reveal internal risk scores or officer notes.`;

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
                { text: systemPrompt },
                { text: `User inquiry: "${userMessage}"` },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply && reply.trim().length > 0) {
          return reply.trim();
        }
      }
    } catch (geminiErr) {
      console.warn('[aiAssistantService] Gemini call failed or timed out, falling back to grounded rule engine:', geminiErr.message);
    }
  }

  // 3. Robust, grounded domain rule fallback engine
  return generateGroundedFallbackResponse(userMessage, context);
}

module.exports = {
  getCustomerSafeContext,
  generateGroundedFallbackResponse,
  generateResponse,
  formatDocTypeName,
};
