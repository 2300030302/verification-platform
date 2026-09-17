-- ==============================================================================
-- PRODUCTION SCHEMA FOR TIDB CLOUD & MYSQL
-- Verification Platform - Production Database Schema
-- Compatible with TiDB Serverless & MySQL 8.0+
-- Non-destructive: Uses CREATE TABLE IF NOT EXISTS
-- ==============================================================================

-- Ensure database is selected (replace or ensure active database is verification_platform)
-- USE verification_platform;

-- 1. USERS TABLE
-- Core identity and authentication table for customers and compliance officers
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. VERIFICATION CASES TABLE
-- Top-level container tracking customer onboarding review lifecycle
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. DOCUMENTS TABLE
-- Uploaded identity, financial, and address verification files and metadata
CREATE TABLE IF NOT EXISTS documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  verification_case_id BIGINT UNSIGNED DEFAULT NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. EXTRACTED DATA TABLE
-- Structured OCR and regex-extracted fields linked to documents
CREATE TABLE IF NOT EXISTS extracted_data (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_id BIGINT UNSIGNED NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  field_value TEXT,
  confidence DECIMAL(5, 2) NOT NULL DEFAULT '1.00',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_extracted_data_document_id (document_id),
  KEY idx_extracted_data_field (document_id, field_name),
  CONSTRAINT fk_extracted_data_document
    FOREIGN KEY (document_id) REFERENCES documents (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. VALIDATION RESULTS TABLE
-- Cross-document consistency checks (name, address, expiry, required presence)
CREATE TABLE IF NOT EXISTS validation_results (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  verification_id BIGINT UNSIGNED NOT NULL,
  check_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  severity VARCHAR(50) NOT NULL DEFAULT 'low',
  message VARCHAR(1000) NOT NULL,
  details JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_validation_results_verification_id (verification_id),
  KEY idx_validation_results_check_type (verification_id, check_type),
  CONSTRAINT fk_validation_results_verification
    FOREIGN KEY (verification_id) REFERENCES verification_cases (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. TRANSACTIONS TABLE
-- Financial statement transactions extracted for cashflow and anomaly profiling
CREATE TABLE IF NOT EXISTS transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  verification_id BIGINT UNSIGNED NOT NULL,
  document_id BIGINT UNSIGNED DEFAULT NULL,
  transaction_date DATE DEFAULT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  credit DECIMAL(15, 2) NOT NULL DEFAULT '0.00',
  debit DECIMAL(15, 2) NOT NULL DEFAULT '0.00',
  balance DECIMAL(15, 2) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_transactions_verification_date (verification_id, transaction_date),
  KEY idx_transactions_document_id (document_id),
  CONSTRAINT fk_transactions_document
    FOREIGN KEY (document_id) REFERENCES documents (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_transactions_verification
    FOREIGN KEY (verification_id) REFERENCES verification_cases (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. RISK ASSESSMENTS TABLE
-- Automated numeric risk score (0-100) and advisory tier (LOW, MEDIUM, HIGH, VERY_HIGH)
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
  CONSTRAINT fk_risk_assessments_verification
    FOREIGN KEY (verification_id) REFERENCES verification_cases (id)
    ON DELETE CASCADE,
  CONSTRAINT chk_risk_assessments_score
    CHECK (risk_score <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. CASE NOTES TABLE
-- Compliance review notes and draft audit trails recorded by compliance officers
CREATE TABLE IF NOT EXISTS case_notes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  verification_id BIGINT UNSIGNED NOT NULL,
  officer_id BIGINT UNSIGNED NOT NULL,
  officer_name VARCHAR(120) NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_case_notes_verification (verification_id, created_at),
  KEY idx_case_notes_officer (officer_id),
  CONSTRAINT fk_case_notes_verification
    FOREIGN KEY (verification_id) REFERENCES verification_cases (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_case_notes_officer
    FOREIGN KEY (officer_id) REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. CASE AUDIT LOGS TABLE
-- Immutable compliance event history (case views, decision submissions, status updates)
CREATE TABLE IF NOT EXISTS case_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  verification_id BIGINT UNSIGNED NOT NULL,
  officer_id BIGINT UNSIGNED DEFAULT NULL,
  officer_name VARCHAR(120) NOT NULL DEFAULT 'System',
  action VARCHAR(100) NOT NULL,
  details TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_verification (verification_id, created_at),
  CONSTRAINT fk_case_audit_verification
    FOREIGN KEY (verification_id) REFERENCES verification_cases (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. CHAT SESSIONS TABLE
-- Optional top-level grouping for customer assistant or officer copilot conversations
CREATE TABLE IF NOT EXISTS chat_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  session_type ENUM('CUSTOMER', 'OFFICER') NOT NULL,
  verification_id BIGINT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_chat_sessions_user_id (user_id),
  KEY idx_chat_sessions_verification_id (verification_id),
  CONSTRAINT fk_chat_sessions_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_chat_sessions_verification
    FOREIGN KEY (verification_id) REFERENCES verification_cases (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. CHAT MESSAGES TABLE
-- Conversational history for Customer AI Assistant and Officer AI Copilot
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  verification_id BIGINT UNSIGNED DEFAULT NULL,
  sender ENUM('user', 'assistant') NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_chat_user (user_id),
  KEY idx_chat_verification (verification_id),
  CONSTRAINT fk_chat_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_chat_verification
    FOREIGN KEY (verification_id) REFERENCES verification_cases (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
