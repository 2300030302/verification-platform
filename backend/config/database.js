const mysql = require('mysql2/promise');

const requiredVariables = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_PORT'];
let pool;

function getMissingDatabaseVariables() {
  return requiredVariables.filter((variable) => !process.env[variable]);
}

function getDatabasePool() {
  const missingVariables = getMissingDatabaseVariables();

  if (missingVariables.length > 0) {
    throw new Error(`Database configuration is incomplete: ${missingVariables.join(', ')}`);
  }

  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: Number(process.env.DB_PORT),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }

  return pool;
}

async function ensureUsersTable() {
  const currentPool = getDatabasePool();
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(255) NOT NULL,
      password VARCHAR(255) NOT NULL,
      role ENUM('CUSTOMER', 'OFFICER') NOT NULL DEFAULT 'CUSTOMER',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_users_email (email),
      KEY idx_users_role (role)
    ) ENGINE=InnoDB;
  `;
  await currentPool.query(createTableQuery);
}

async function ensureDocumentsTable() {
  const currentPool = getDatabasePool();
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS documents (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      verification_case_id BIGINT UNSIGNED NULL,
      document_type VARCHAR(50) NOT NULL,
      original_filename VARCHAR(255) NOT NULL,
      stored_filename VARCHAR(255) NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      file_size BIGINT UNSIGNED NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'UPLOADED',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_documents_user_id (user_id),
      KEY idx_documents_user_type (user_id, document_type),
      CONSTRAINT fk_documents_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `;
  await currentPool.query(createTableQuery);
}

async function ensureExtractedDataTable() {
  const currentPool = getDatabasePool();
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS extracted_data (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      document_id BIGINT UNSIGNED NOT NULL,
      field_name VARCHAR(100) NOT NULL,
      field_value TEXT NULL,
      confidence DECIMAL(5, 2) NOT NULL DEFAULT 1.00,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_extracted_data_document_id (document_id),
      KEY idx_extracted_data_field (document_id, field_name),
      CONSTRAINT fk_extracted_data_document
        FOREIGN KEY (document_id) REFERENCES documents (id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `;
  await currentPool.query(createTableQuery);
}

async function ensureVerificationCasesTable() {
  const currentPool = getDatabasePool();
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS verification_cases (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      status ENUM('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'NEEDS_REVIEW', 'APPROVED', 'FLAGGED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_verification_cases_user_id (user_id),
      KEY idx_verification_cases_status (status),
      CONSTRAINT fk_verification_cases_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `;
  await currentPool.query(createTableQuery);

  try {
    await currentPool.query(`
      ALTER TABLE verification_cases 
      MODIFY COLUMN status ENUM('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'NEEDS_REVIEW', 'APPROVED', 'FLAGGED', 'REJECTED') NOT NULL DEFAULT 'DRAFT'
    `);
  } catch (_) {}
}

async function ensureValidationResultsTable() {
  const currentPool = getDatabasePool();
  // Ensure parent table exists first
  await ensureVerificationCasesTable();

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS validation_results (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      verification_id BIGINT UNSIGNED NOT NULL,
      check_type VARCHAR(100) NOT NULL,
      status VARCHAR(50) NOT NULL,
      severity VARCHAR(50) NOT NULL DEFAULT 'low',
      message VARCHAR(1000) NOT NULL,
      details JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_validation_results_verification_id (verification_id),
      KEY idx_validation_results_check_type (verification_id, check_type),
      CONSTRAINT fk_validation_results_verification
        FOREIGN KEY (verification_id) REFERENCES verification_cases (id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `;
  await currentPool.query(createTableQuery);
}

async function getOrCreateVerificationCase(userId) {
  const currentPool = getDatabasePool();
  await ensureVerificationCasesTable();

  const [rows] = await currentPool.query(
    'SELECT id, user_id, status, created_at, updated_at FROM verification_cases WHERE user_id = ? ORDER BY id DESC LIMIT 1',
    [userId]
  );

  if (rows.length > 0) {
    return rows[0];
  }

  const [insertResult] = await currentPool.query(
    'INSERT INTO verification_cases (user_id, status) VALUES (?, ?)',
    [userId, 'DRAFT']
  );

  return {
    id: insertResult.insertId,
    user_id: userId,
    status: 'DRAFT',
    created_at: new Date(),
    updated_at: new Date(),
  };
}

async function ensureRiskAssessmentsTable() {
  const currentPool = getDatabasePool();
  await ensureVerificationCasesTable();

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS risk_assessments (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      verification_id BIGINT UNSIGNED NOT NULL,
      risk_score TINYINT UNSIGNED NOT NULL,
      risk_level ENUM('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH') NOT NULL,
      risk_factors JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_risk_assessments_verification_id (verification_id),
      KEY idx_risk_assessments_risk_level (risk_level),
      CONSTRAINT chk_risk_assessments_score CHECK (risk_score <= 100),
      CONSTRAINT fk_risk_assessments_verification
        FOREIGN KEY (verification_id) REFERENCES verification_cases (id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `;
  await currentPool.query(createTableQuery);
}

async function ensureTransactionsTable() {
  const currentPool = getDatabasePool();
  await ensureVerificationCasesTable();
  await ensureDocumentsTable();

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS transactions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      verification_id BIGINT UNSIGNED NOT NULL,
      document_id BIGINT UNSIGNED NULL,
      transaction_date DATE NULL,
      description VARCHAR(500) NOT NULL DEFAULT '',
      credit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      debit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      balance DECIMAL(15, 2) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_transactions_verification_date (verification_id, transaction_date),
      KEY idx_transactions_document_id (document_id),
      CONSTRAINT fk_transactions_verification
        FOREIGN KEY (verification_id) REFERENCES verification_cases (id)
        ON DELETE CASCADE,
      CONSTRAINT fk_transactions_document
        FOREIGN KEY (document_id) REFERENCES documents (id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `;
  await currentPool.query(createTableQuery);
}

async function ensureCaseNotesTable() {
  const currentPool = getDatabasePool();
  await ensureVerificationCasesTable();
  await ensureUsersTable();

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS case_notes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      verification_id BIGINT UNSIGNED NOT NULL,
      officer_id BIGINT UNSIGNED NOT NULL,
      officer_name VARCHAR(120) NOT NULL,
      note TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_case_notes_verification (verification_id, created_at),
      CONSTRAINT fk_case_notes_verification
        FOREIGN KEY (verification_id) REFERENCES verification_cases (id)
        ON DELETE CASCADE,
      CONSTRAINT fk_case_notes_officer
        FOREIGN KEY (officer_id) REFERENCES users (id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `;
  await currentPool.query(createTableQuery);
}

async function ensureCaseAuditLogsTable() {
  const currentPool = getDatabasePool();
  await ensureVerificationCasesTable();

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS case_audit_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      verification_id BIGINT UNSIGNED NOT NULL,
      officer_id BIGINT UNSIGNED NULL,
      officer_name VARCHAR(120) NOT NULL DEFAULT 'System',
      action VARCHAR(100) NOT NULL,
      details TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_audit_verification (verification_id, created_at),
      CONSTRAINT fk_case_audit_verification
        FOREIGN KEY (verification_id) REFERENCES verification_cases (id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `;
  await currentPool.query(createTableQuery);
}

async function addCaseNote(verificationId, officerId, officerName, note) {
  const currentPool = getDatabasePool();
  await ensureCaseNotesTable();
  const [res] = await currentPool.query(
    'INSERT INTO case_notes (verification_id, officer_id, officer_name, note) VALUES (?, ?, ?, ?)',
    [verificationId, officerId, officerName || 'Compliance Officer', note]
  );
  return {
    id: res.insertId,
    verificationId: Number(verificationId),
    officerId: Number(officerId),
    officerName: officerName || 'Compliance Officer',
    officer_name: officerName || 'Compliance Officer',
    note,
    createdAt: new Date(),
    created_at: new Date(),
  };
}

async function getCaseNotes(verificationId) {
  const currentPool = getDatabasePool();
  await ensureCaseNotesTable();
  const [rows] = await currentPool.query(
    'SELECT id, verification_id, officer_id, officer_name, note, created_at FROM case_notes WHERE verification_id = ? ORDER BY created_at ASC',
    [verificationId]
  );
  return rows.map((r) => ({
    id: r.id,
    verificationId: r.verification_id,
    officerId: r.officer_id,
    officerName: r.officer_name,
    officer_name: r.officer_name,
    note: r.note,
    createdAt: r.created_at,
    created_at: r.created_at,
  }));
}

async function addAuditLog(verificationId, officerId, officerName, action, details) {
  const currentPool = getDatabasePool();
  await ensureCaseAuditLogsTable();
  const detailsStr = typeof details === 'object' ? JSON.stringify(details) : details ? String(details) : '';
  const [res] = await currentPool.query(
    'INSERT INTO case_audit_logs (verification_id, officer_id, officer_name, action, details) VALUES (?, ?, ?, ?, ?)',
    [verificationId, officerId || null, officerName || 'System', action, detailsStr]
  );
  return {
    id: res.insertId,
    verificationId: Number(verificationId),
    officerId: officerId || null,
    officerName: officerName || 'System',
    officer_name: officerName || 'System',
    action,
    details: detailsStr,
    createdAt: new Date(),
    created_at: new Date(),
  };
}

async function getCaseAuditLogs(verificationId) {
  const currentPool = getDatabasePool();
  await ensureCaseAuditLogsTable();
  const [rows] = await currentPool.query(
    'SELECT id, verification_id, officer_id, officer_name, action, details, created_at FROM case_audit_logs WHERE verification_id = ? ORDER BY created_at ASC',
    [verificationId]
  );
  return rows.map((r) => ({
    id: r.id,
    verificationId: r.verification_id,
    officerId: r.officer_id,
    officerName: r.officer_name,
    officer_name: r.officer_name,
    action: r.action,
    details: r.details,
    createdAt: r.created_at,
    created_at: r.created_at,
  }));
}

async function checkDatabaseConnection() {
  const missingVariables = getMissingDatabaseVariables();

  if (missingVariables.length > 0) {
    return {
      connected: false,
      message: 'Database configuration is incomplete.',
      missingVariables,
    };
  }

  let connection;

  try {
    connection = await getDatabasePool().getConnection();
    await connection.query('SELECT 1');
    await ensureUsersTable();
    await ensureDocumentsTable();
    await ensureExtractedDataTable();
    await ensureVerificationCasesTable();
    await ensureValidationResultsTable();
    await ensureRiskAssessmentsTable();
    await ensureTransactionsTable();
    await ensureCaseNotesTable();
    await ensureCaseAuditLogsTable();
    await ensureChatMessagesTable();

    return {
      connected: true,
      message: 'Database connection successful.',
    };
  } catch (error) {
    console.error('Database connection failed:', error.code || error.message);

    return {
      connected: false,
      message: 'Unable to connect to the database.',
      errorCode: error.code || 'CONNECTION_ERROR',
    };
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function ensureChatMessagesTable() {
  const currentPool = getDatabasePool();
  await ensureUsersTable();
  await ensureVerificationCasesTable();

  await currentPool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      verification_id BIGINT UNSIGNED NULL,
      sender ENUM('user', 'assistant') NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_chat_user (user_id),
      INDEX idx_chat_verification (verification_id),
      CONSTRAINT fk_chat_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_chat_verification FOREIGN KEY (verification_id) REFERENCES verification_cases(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function saveChatMessage(userId, verificationId, sender, message) {
  const currentPool = getDatabasePool();
  await ensureChatMessagesTable();
  const [res] = await currentPool.query(
    'INSERT INTO chat_messages (user_id, verification_id, sender, message) VALUES (?, ?, ?, ?)',
    [userId, verificationId || null, sender, message]
  );
  return {
    id: res.insertId,
    userId: Number(userId),
    verificationId: verificationId ? Number(verificationId) : null,
    sender,
    message,
    createdAt: new Date(),
  };
}

async function getChatHistory(userId, limit = 50) {
  const currentPool = getDatabasePool();
  await ensureChatMessagesTable();
  const [rows] = await currentPool.query(
    'SELECT id, user_id, verification_id, sender, message, created_at FROM chat_messages WHERE user_id = ? ORDER BY id ASC LIMIT ?',
    [userId, Number(limit)]
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    verificationId: r.verification_id,
    sender: r.sender,
    message: r.message,
    createdAt: r.created_at,
  }));
}

async function clearChatHistory(userId) {
  const currentPool = getDatabasePool();
  await ensureChatMessagesTable();
  await currentPool.query('DELETE FROM chat_messages WHERE user_id = ?', [userId]);
  return true;
}

async function getCaseChatHistory(userId, verificationId, limit = 50) {
  const currentPool = getDatabasePool();
  await ensureChatMessagesTable();
  const [rows] = await currentPool.query(
    'SELECT id, user_id, verification_id, sender, message, created_at FROM chat_messages WHERE user_id = ? AND verification_id = ? ORDER BY id ASC LIMIT ?',
    [Number(userId), Number(verificationId), Number(limit)]
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    verificationId: r.verification_id,
    sender: r.sender,
    message: r.message,
    createdAt: r.created_at,
  }));
}

async function clearCaseChatHistory(userId, verificationId) {
  const currentPool = getDatabasePool();
  await ensureChatMessagesTable();
  await currentPool.query(
    'DELETE FROM chat_messages WHERE user_id = ? AND verification_id = ?',
    [Number(userId), Number(verificationId)]
  );
  return true;
}

module.exports = {
  checkDatabaseConnection,
  getDatabasePool,
  ensureUsersTable,
  ensureDocumentsTable,
  ensureExtractedDataTable,
  ensureVerificationCasesTable,
  ensureValidationResultsTable,
  ensureRiskAssessmentsTable,
  ensureTransactionsTable,
  ensureCaseNotesTable,
  ensureCaseAuditLogsTable,
  ensureChatMessagesTable,
  addCaseNote,
  getCaseNotes,
  addAuditLog,
  getCaseAuditLogs,
  getOrCreateVerificationCase,
  saveChatMessage,
  getChatHistory,
  clearChatHistory,
  getCaseChatHistory,
  clearCaseChatHistory,
};
