const db = require('../config/database');

/**
 * Normalizes document type labels into customer-friendly strings
 */
function formatDocTypeName(type, lang = 'en') {
  const t = (type || '').toLowerCase();
  if (lang === 'hi') {
    switch (t) {
      case 'government_id': return 'सरकारी पहचान पत्र (Government ID)';
      case 'bank_statement': return 'बैंक स्टेटमेंट (Bank Statement)';
      case 'address_proof': return 'पते का प्रमाण (Address Proof)';
      case 'supporting_document': return 'सहायक दस्तावेज़ (Supporting Document)';
      default: return type ? type.replace(/_/g, ' ') : 'दस्तावेज़';
    }
  }
  if (lang === 'te') {
    switch (t) {
      case 'government_id': return 'ప్రభుత్వ గుర్తింపు పత్రం (Government ID)';
      case 'bank_statement': return 'బ్యాంక్ స్టేట్‌మెంట్ (Bank Statement)';
      case 'address_proof': return 'చిరునామా రుజువు (Address Proof)';
      case 'supporting_document': return 'సహాయక పత్రం (Supporting Document)';
      default: return type ? type.replace(/_/g, ' ') : 'పత్రం';
    }
  }
  switch (t) {
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
    missingDocumentNames: missingDocuments.map((t) => formatDocTypeName(t, 'en')),
    validationFindings: sanitizedFindings,
  };
}

/**
 * Intelligent, grounded domain rule fallback engine supporting English and Indian languages.
 * Grounded in real customer records. Never hallucinates or invents data.
 *
 * @param {string} userMessage
 * @param {Object} context - Customer safe context
 * @param {string} language - ISO language code (e.g. 'en', 'hi', 'te', 'ta', etc.)
 * @returns {string}
 */
function generateGroundedFallbackResponse(userMessage, context, language = 'en') {
  const rawMsg = userMessage || '';
  const msg = rawMsg.toLowerCase();
  const name = context.customerName || 'Customer';
  const lang = (language || 'en').toLowerCase();

  // Detect script/language intent
  const isHindi = lang === 'hi' || /[\u0900-\u097F]/.test(rawMsg);
  const isTelugu = lang === 'te' || /[\u0C00-\u0C7F]/.test(rawMsg);
  const isTamil = lang === 'ta' || /[\u0B80-\u0BFF]/.test(rawMsg);
  const isKannada = lang === 'kn' || /[\u0C80-\u0CFF]/.test(rawMsg);
  const isBengali = lang === 'bn' || /[\u0980-\u09FF]/.test(rawMsg);
  const isMalayalam = lang === 'ml' || /[\u0D00-\u0D7F]/.test(rawMsg);
  const isMarathi = lang === 'mr';
  const isGujarati = lang === 'gu' || /[\u0A80-\u0AFF]/.test(rawMsg);
  const isPunjabi = lang === 'pa' || /[\u0A00-\u0A7F]/.test(rawMsg);

  // Intent classification
  const isDocInquiry =
    msg.includes('what document') ||
    msg.includes('which document') ||
    msg.includes('documents do i need') ||
    msg.includes('required document') ||
    msg.includes('document requirement') ||
    msg.includes('दस्तावेज़') ||
    msg.includes('दस्तावेज') ||
    msg.includes('పత్రాలు') ||
    msg.includes('డాక్యుమెంట్') ||
    msg.includes('ஆவணம்') ||
    msg.includes('ದಾಖಲೆ') ||
    msg.includes('নথি') ||
    msg.includes('രേഖകൾ');

  const isAddressProofInquiry =
    msg.includes('address proof') ||
    msg.includes('proof of address') ||
    msg.includes('valid address') ||
    msg.includes('acceptable address') ||
    msg.includes('पते का प्रमाण') ||
    msg.includes('पते के प्रमाण') ||
    msg.includes('पता') ||
    msg.includes('చిరునామా') ||
    msg.includes('చిరునామా రుజువు') ||
    msg.includes('రుజువు') ||
    msg.includes('முகவரி') ||
    msg.includes('விళಾಸ') ||
    msg.includes('ঠিকানা') ||
    msg.includes('മേൽവിലാస');

  const isFlaggedInquiry =
    msg.includes('flagged') ||
    msg.includes('not accepted') ||
    msg.includes('rejected') ||
    msg.includes('why is my') ||
    msg.includes('why was my') ||
    msg.includes('issue with my') ||
    msg.includes('problem with my') ||
    msg.includes('फ़्लैग') ||
    msg.includes('फ्लैग') ||
    msg.includes('चिह्नित') ||
    msg.includes('ఫ్లాగ్') ||
    msg.includes('గుర్తించబడింది') ||
    msg.includes('கொடியிடப்பட்டது') ||
    msg.includes('ఫ్ల్యಾಗ್') ||
    msg.includes('ফ্ল্যাগ');

  const isStatusInquiry =
    msg.includes('my status') ||
    msg.includes('verification status') ||
    msg.includes('current status') ||
    msg.includes('what is my status') ||
    msg.includes('स्थिति') ||
    msg.includes('ధృవీకరణ స్థితి') ||
    msg.includes('స్థితి') ||
    msg.includes('நிலை') ||
    msg.includes('ಸ್ಥಿತಿ') ||
    msg.includes('স্থিতি') ||
    msg.includes('സ്ഥിതി');

  const isUploadNextInquiry =
    msg.includes('upload next') ||
    msg.includes('what next') ||
    msg.includes('next step') ||
    msg.includes('what should i do') ||
    msg.includes('आगे क्या') ||
    msg.includes('तదుపరి') ||
    msg.includes('తర్వాత ఏమి') ||
    msg.includes('அடுத்து') ||
    msg.includes('ಮುಂದೆ') ||
    msg.includes('পরবর্তী');

  const isSubmissionLifecycleInquiry =
    msg.includes('what happens') ||
    msg.includes('after submit') ||
    msg.includes('after i submit') ||
    msg.includes('how long') ||
    msg.includes('review process') ||
    msg.includes('बाद क्या') ||
    msg.includes('తర్వాత ఏమి జరుగుతుంది') ||
    msg.includes('సమర్పించిన తర్వాత') ||
    msg.includes('சమర్పించిన');

  // ==========================================
  // HINDI RESPONSES (हिंदी)
  // ==========================================
  if (isHindi) {
    if (isDocInquiry) {
      let resp = `नमस्ते ${name}, बीएनपी परिबा (BNP Paribas) में ग्राहक पहचान सत्यापन के लिए आपको निम्नलिखित 3 मानक दस्तावेज़ प्रस्तुत करने होंगे:\n\n`;
      resp += `1. **सरकारी पहचान पत्र (Government ID)**: वैध, गैर-समाप्त पासपोर्ट, राष्ट्रीय पहचान पत्र, या ड्राइविंग लाइसेंस।\n`;
      resp += `2. **बैंक विवरण (Bank Statement)**: पिछले 3 महीनों का आधिकारिक बैंक स्टेटमेंट जिसमें खाता गतिविधि और आपका नाम स्पष्ट हो।\n`;
      resp += `3. **पते का प्रमाण (Address Proof)**: पिछले 3 महीनों में जारी बिजली/पानी/गैस का बिल या म्युनिसिपल टैक्स बिल।\n\n`;
      if (context.missingDocuments && context.missingDocuments.length > 0) {
        resp += `📌 **आपकी वर्तमान प्रगति**: आपने 3 में से **${context.documentsCount} दस्तावेज़** अपलोड किए हैं। अभी भी आवश्यक हैं:\n`;
        context.missingDocuments.forEach((docType) => {
          resp += `- ${formatDocTypeName(docType, 'hi')}\n`;
        });
        resp += `\nआप इन्हें सीधे **My Documents (मेरे दस्तावेज़)** पेज पर जाकर अपलोड कर सकते हैं।`;
      } else {
        resp += `✅ बहुत बढ़िया! आपने पहले ही सभी 3 आवश्यक प्राथमिक दस्तावेज़ जमा कर दिए हैं।`;
      }
      return resp;
    }

    if (isAddressProofInquiry) {
      return (
        `**पते के प्रमाण के दिशानिर्देश (Address Proof Guidelines)**:\n\n` +
        `आवासीय पते को सत्यापित करने के लिए, हम **पिछले 3 महीनों (90 दिन)** के भीतर जारी आधिकारिक दस्तावेज़ स्वीकार करते हैं:\n` +
        `• आपका पूरा कानूनी नाम\n` +
        `• आपका पंजीकृत आवासीय पता\n` +
        `• जारीकर्ता का आधिकारिक लोगो और जारी करने की तिथि\n\n` +
        `**मान्य दस्तावेज़**:\n` +
        `✅ उपयोगिता बिल (बिजली, पानी, पाइप गैस, लैंडलाइन/ब्रॉडबैंड)\n` +
        `✅ बैंक या वित्तीय संस्थान का खाता विवरण\n` +
        `✅ नगर निगम संपत्ति कर रसीद (Council Tax)\n\n` +
        `*नोट: मोबाइल फोन बिल और हस्तलिखित पर्चियां स्वीकार्य नहीं हैं।*`
      );
    }

    if (isFlaggedInquiry) {
      const issues = (context.validationFindings || []).filter(
        (f) => f.status === 'FAILED' || f.status === 'REVIEW_NEEDED' || f.status === 'WARNING'
      );
      const failedDocs = (context.documents || []).filter(
        (d) => d.status === 'EXTRACTION_FAILED'
      );
      if (issues.length === 0 && failedDocs.length === 0) {
        return (
          `नमस्ते ${name}! आपके जमा किए गए दस्तावेज़ों पर **कोई नकारात्मक समस्या या विसंगति नहीं पाई गई है**।\n\n` +
          `आपकी सत्यापन स्थिति वर्तमान में: **${context.caseStatus}** है। आपके सभी दस्तावेज़ सुरक्षित हैं और अनुपालन समीक्षा के लिए प्रतीक्षारत हैं।`
        );
      }
      let resp = `आपके सबमिट किए गए दस्तावेज़ों पर स्वचालित जांच द्वारा पहचानी गई जानकारियां निम्न हैं:\n\n`;
      if (failedDocs.length > 0) {
        resp += `⚠️ **दस्तावेज़ पाठ निष्कर्षण सूचना**:\n`;
        failedDocs.forEach((d) => {
          resp += `• "${d.originalFilename}": OCR द्वारा दस्तावेज़ स्पष्ट रूप से पढ़ा नहीं जा सका। कृपया स्पष्ट और साफ स्कैन दोबारा अपलोड करें।\n`;
        });
        resp += `\n`;
      }
      if (issues.length > 0) {
        resp += `📋 **समीक्षा के लिए पहचानी गई विसंगतियां**:\n`;
        issues.forEach((issue) => {
          resp += `• **${issue.checkType}**: ${issue.message}\n`;
        });
        resp += `\n💡 **समाधान**: कृपया सुनिश्चित करें कि आपका पूरा नाम और पता सभी दस्तावेज़ों में समान रूप से लिखा हो। आप **My Documents** पेज से अपडेटेड फ़ाइल अपलोड कर सकते हैं।`;
      }
      return resp;
    }

    if (isStatusInquiry) {
      return (
        `नमस्ते ${name}, आपके सत्यापन मामले (**केस #${context.verificationId}**) की वर्तमान स्थिति: **${context.caseStatus}** है।\n\n` +
        `अपलोड किए गए दस्तावेज़: **${context.documentsCount}** | शेष आवश्यक दस्तावेज़: **${context.missingDocuments.length}**।\n\n` +
        `सत्यापन प्रगति की विस्तृत जांच के लिए कृपया **Verification Status** पृष्ठ देखें।`
      );
    }

    if (isUploadNextInquiry) {
      if (context.missingDocuments && context.missingDocuments.length > 0) {
        let resp = `आपके रिकॉर्ड के अनुसार, आपको अभी भी निम्नलिखित दस्तावेज़ अपलोड करने होंगे:\n\n`;
        context.missingDocuments.forEach((docType, idx) => {
          resp += `${idx + 1}. **${formatDocTypeName(docType, 'hi')}**\n`;
        });
        resp += `\nअपलोड करने के लिए कृपया **My Documents** पेज पर जाएं।`;
        return resp;
      }
      return `आपने सभी 3 प्राथमिक आवश्यक दस्तावेज़ अपलोड कर दिए हैं। आपकी फाइल अनुपालन समीक्षा में है।`;
    }

    if (isSubmissionLifecycleInquiry) {
      return (
        `**दस्तावेज़ जमा करने के बाद क्या होता है**:\n\n` +
        `1. **स्वचालित क्रॉस-सत्यापन**: सिस्टम सुरक्षित OCR के माध्यम से नाम, पता और वैधता की स्वचालित जांच करता है।\n` +
        `2. **अनुपालन अधिकारी समीक्षा**: एक अधिकृत अनुपालन अधिकारी आपके आवेदन की पूरी समीक्षा करता है।\n` +
        `3. **अंतिम स्थिति निर्धारण**: अधिकारी द्वारा आपके सत्यापन को स्वीकृत (Approved) या समीक्षाधीन (Needs Review) घोषित किया जाता है।\n` +
        `4. **वास्तविक समय अपडेट**: स्थिति बदलते ही आपका पोर्टल डैशबोर्ड तुरंत अपडेट हो जाता है।`
      );
    }

    return (
      `नमस्ते ${name}! मैं आपका **बीएनपी परिबा ग्राहक सत्यापन सहायक** हूँ।\n\n` +
      `मैं आपकी सहायता कर सकता हूँ:\n` +
      `• **"मुझे किन दस्तावेजों की आवश्यकता है?"** - मानक आवश्यकताएं\n` +
      `• **"पते का प्रमाण क्या है?"** - मान्य उपयोगिता बिल\n` +
      `• **"मेरी सत्यापन स्थिति क्या है?"** - लाइव केस ट्रैकिंग\n` +
      `• **"मुझे आगे क्या अपलोड करना चाहिए?"** - शेष दस्तावेज़\n` +
      `• **"मेरा दस्तावेज़ क्यों फ़्लैग किया गया था?"** - विसंगति स्पष्टीकरण\n` +
      `• **"जमा करने के बाद क्या होता है?"** - समीक्षा प्रक्रिया\n\n` +
      `आज मैं आपके दस्तावेज़ सत्यापन में क्या सहायता कर सकता हूँ?`
    );
  }

  // ==========================================
  // TELUGU RESPONSES (తెలుగు)
  // ==========================================
  if (isTelugu) {
    if (isDocInquiry) {
      let resp = `నమస్కారం ${name}, BNP Paribas గుర్తింపు ధృవీకరణ కోసం మీరు క్రింది 3 ప్రామాణిక పత్రాలను సమర్పించాల్సి ఉంటుంది:\n\n`;
      resp += `1. **ప్రభుత్వ గుర్తింపు పత్రం (Government ID)**: చెల్లుబాటు అయ్యే పాస్‌పోర్ట్, డ్రైవింగ్ లైసెన్స్ లేదా జాతీయ గుర్తింపు కార్డు.\n`;
      resp += `2. **బ్యాంక్ స్టేట్‌మెంట్ (Bank Statement)**: పూర్తి పేరు మరియు లావాదేవీలు స్పష్టంగా కనిపించే గత 3 నెలల అధికారిక స్టేట్‌మెంట్.\n`;
      resp += `3. **చిరునామా రుజువు (Address Proof)**: గత 3 నెలల్లో జారీ చేయబడిన తాజా విద్యుత్, నీరు లేదా గ్యాస్ బిల్లు.\n\n`;
      if (context.missingDocuments && context.missingDocuments.length > 0) {
        resp += `📌 **మీ ప్రస్తుత పురోగతి**: మీరు 3 అవసరమైన పత్రాలలో **${context.documentsCount} పత్రాలు** అప్‌లోడ్ చేశారు. ఇంకా అవసరమైనవి:\n`;
        context.missingDocuments.forEach((docType) => {
          resp += `- ${formatDocTypeName(docType, 'te')}\n`;
        });
        resp += `\nవీటిని మీరు నేరుగా **My Documents (నా పత్రాలు)** పేజీ నుండి అప్‌లోడ్ చేయవచ్చు.`;
      } else {
        resp += `✅ అభినందనలు! మీరు అవసరమైన 3 ప్రాథమిక పత్రాలను ఇప్పటికే సమర్పించారు.`;
      }
      return resp;
    }

    if (isAddressProofInquiry) {
      return (
        `**చిరునామా రుజువు మార్గదర్శకాలు (Address Proof Guidelines)**:\n\n` +
        `మీ నివాస చిరునామాను ధృవీకరించడానికి, గత **3 నెలల్లో (90 రోజులు)** జారీ చేయబడిన అధికారిక పత్రాలను మేము ఆమోదిస్తాము:\n` +
        `• మీ పూర్తి చట్టపరమైన పేరు\n` +
        `• మీ నమోదిత నివాస చిరునామా\n` +
        `• జారీ చేసిన సంస్థ లోగో మరియు తేదీ స్పష్టంగా ఉండాలి\n\n` +
        `**ఆమోదించబడే పత్రాలు**:\n` +
        `✅ యుటిలిటీ బిల్లు (విద్యుత్, నీరు, గ్యాస్ లేదా ల్యాండ్‌లైన్ ఇంటర్నెట్ బిల్లు)\n` +
        `✅ బ్యాంక్ ఖాతా స్టేట్‌మెంట్\n` +
        `✅ మున్సిపల్ టాక్స్ రసీదు\n\n` +
        `*గమనిక: మొబైల్ ఫోన్ బిల్లులు మరియు చేతితో రాసిన పత్రాలు ఆమోదించబడవు.*`
      );
    }

    if (isFlaggedInquiry) {
      const issues = (context.validationFindings || []).filter(
        (f) => f.status === 'FAILED' || f.status === 'REVIEW_NEEDED' || f.status === 'WARNING'
      );
      const failedDocs = (context.documents || []).filter(
        (d) => d.status === 'EXTRACTION_FAILED'
      );
      if (issues.length === 0 && failedDocs.length === 0) {
        return (
          `నమస్కారం ${name}! మీరు సమర్పించిన పత్రాలలో **ఎటువంటి లోపాలు లేదా వ్యత్యాసాలు కనుగొనబడలేదు**.\n\n` +
          `మీ కేస్ స్థితి ప్రస్తుతం: **${context.caseStatus}**. మీ పత్రాలు సురక్షితంగా ఉన్నాయి మరియు అధికారి సమీక్ష కోసం సిద్ధంగా ఉన్నాయి.`
        );
      }
      let resp = `మీరు సమర్పించిన పత్రాలపై గుర్తింపు పొందిన అంశాలు క్రింది విధంగా ఉన్నాయి:\n\n`;
      if (failedDocs.length > 0) {
        resp += `⚠️ **పత్ర పఠన నోటీసు**:\n`;
        failedDocs.forEach((d) => {
          resp += `• "${d.originalFilename}": OCR ద్వారా పత్రం స్పష్టంగా చదవబడలేదు. దయచేసి స్పష్టమైన స్కాన్ కాపీని తిరిగి అప్‌లోడ్ చేయండి.\n`;
        });
        resp += `\n`;
      }
      if (issues.length > 0) {
        resp += `📋 **సమీక్షించవలసిన అంశాలు**:\n`;
        issues.forEach((issue) => {
          resp += `• **${issue.checkType}**: ${issue.message}\n`;
        });
        resp += `\n💡 **పరిష్కారం**: అన్ని పత్రాలలో మీ పూర్తి పేరు మరియు చిరునామా సరిపోలేలా చూసుకోండి. మీరు **My Documents** పేజీలో అప్‌డేట్ చేసిన పత్రాలను సమర్పించవచ్చు.`;
      }
      return resp;
    }

    if (isStatusInquiry) {
      return (
        `నమస్కారం ${name}, మీ ధృవీకరణ కేస్ (**కేస్ #${context.verificationId}**) ప్రస్తుత స్థితి: **${context.caseStatus}**.\n\n` +
        `సమర్పించిన పత్రాలు: **${context.documentsCount}** | ఇంకా అవసరమైనవి: **${context.missingDocuments.length}**.\n\n` +
        `పూర్తి వివరాల కోసం దయచేసి **Verification Status** పేజీని సందర్శించండి.`
      );
    }

    if (isUploadNextInquiry) {
      if (context.missingDocuments && context.missingDocuments.length > 0) {
        let resp = `మీ రికార్డుల ప్రకారం, మీరు ఇంకా క్రింది పత్రాలను అప్‌లోడ్ చేయాల్సి ఉంది:\n\n`;
        context.missingDocuments.forEach((docType, idx) => {
          resp += `${idx + 1}. **${formatDocTypeName(docType, 'te')}**\n`;
        });
        resp += `\nవీటిని అప్‌లోడ్ చేయడానికి దయచేసి **My Documents** పేజీకి వెళ్లండి.`;
        return resp;
      }
      return `మీరు అవసరమైన 3 ప్రాథమిక పత్రాలను అప్‌లోడ్ చేశారు. మీ దరఖాస్తు సమీక్షలో ఉంది.`;
    }

    if (isSubmissionLifecycleInquiry) {
      return (
        `**పత్రాలు సమర్పించిన తర్వాత ఏమి జరుగుతుంది**:\n\n` +
        `1. **ఆటోమేటెడ్ ధృవీకరణ**: సిస్టమ్ OCR ద్వారా మీ పేరు, చిరునామా మరియు వివరాలను తనిఖీ చేస్తుంది.\n` +
        `2. **అధికారి సమీక్ష**: ధృవీకరణ అధికారి మీ దరఖాస్తును సమగ్రంగా పరిశీలిస్తారు.\n` +
        `3. **స్థితి నిర్ణయం**: అధికారి మీ దరఖాస్తును ఆమోదిస్తారు (Approved) లేదా అదనపు సమాచారం అడుగుతారు (Needs Review).\n` +
        `4. **రియల్-టైమ్ నోటిఫికేషన్**: నిర్ణయం తీసుకోబడగానే మీ డ్యాష్‌బోర్డ్ రియల్ టైమ్‌లో అప్‌డేట్ అవుతుంది.`
      );
    }

    return (
      `నమస్కారం ${name}! నేను మీ **BNP Paribas ధృవీకరణ సహాయకుడిని**.\n\n` +
      `నేను మీకు ఈ క్రింది అంశాలలో సహాయం చేయగలను:\n` +
      `• **"నాకు ఏ పత్రాలు అవసరం?"** - అవసరమైన పత్రాల మార్గదర్శకాలు\n` +
      `• **"చిరునామా రుజువు అంటే ఏమిటి?"** - ఆమోదించబడే బిల్లుల వివరాలు\n` +
      `• **"నా ధృవీకరణ స్థితి ఏమిటి?"** - ప్రత్యక్ష కేస్ స్థితి\n` +
      `• **"నేను తర్వాత ఏమి అప్‌లోడ్ చేయాలి?"** - మిగిలిన పత్రాల జాబితా\n` +
      `• **"నా పత్రం ఎందుకు ఫ్లాగ్ చేయబడింది?"** - పరిశీలన వివరాలు\n` +
      `• **"సమర్పించిన తర్వాత ఏమి జరుగుతుంది?"** - తదుపరి ప్రక్రియ\n\n` +
      `ఈరోజు మీ ధృవీకరణలో నేను మీకు ఎలా సహాయపడగలను?`
    );
  }

  // ==========================================
  // ENGLISH DEFAULT RESPONSES
  // ==========================================
  // 1. "What documents do I need?"
  if (isDocInquiry) {
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

  // 2. "What is address proof?"
  if (isAddressProofInquiry) {
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

  // 3. "Why was my document flagged?"
  if (isFlaggedInquiry) {
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

  // 4. "What is my verification status?"
  if (isStatusInquiry) {
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

  // 5. "What should I upload next?"
  if (isUploadNextInquiry) {
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

  // 6. "What happens after I submit my documents?"
  if (isSubmissionLifecycleInquiry) {
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
 * otherwise gracefully falls back to the deterministic multilingual context engine.
 *
 * @param {string} userMessage
 * @param {Object} context - Customer safe context
 * @param {Array} [chatHistory] - Recent conversation messages
 * @param {string} [language='en'] - Customer language preference
 * @returns {Promise<string>}
 */
async function generateResponse(userMessage, context, chatHistory = [], language = 'en') {
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
- User Language: ${language}

Rules:
- Professional, supportive, polite, and banking-compliant.
- Ground all facts in the customer's actual verification records.
- Respond in the customer's preferred language (${language}).
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
Preferred Language: ${language}. Respond in ${language}.
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

  // 3. Robust, grounded multilingual domain rule fallback engine
  return generateGroundedFallbackResponse(userMessage, context, language);
}

module.exports = {
  getCustomerSafeContext,
  generateGroundedFallbackResponse,
  generateResponse,
  formatDocTypeName,
};
