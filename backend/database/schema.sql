-- AI-Powered Customer Verification & Risk Assessment Platform
-- Local MVP database schema. Run this file with a MySQL account that can create databases.

CREATE DATABASE IF NOT EXISTS verification_platform
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE verification_platform;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('CUSTOMER', 'OFFICER') NOT NULL DEFAULT 'CUSTOMER',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS verification_cases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'FLAGGED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_verification_cases_user_id (user_id),
  KEY idx_verification_cases_status (status),
  CONSTRAINT fk_verification_cases_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  verification_id BIGINT UNSIGNED NOT NULL,
  document_type ENUM('GOVERNMENT_ID', 'BANK_STATEMENT', 'ADDRESS_PROOF', 'SUPPORTING_DOCUMENT') NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  status ENUM('UPLOADED', 'PROCESSING', 'ACCEPTED', 'REJECTED', 'NEEDS_REVIEW') NOT NULL DEFAULT 'UPLOADED',
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_documents_verification_id (verification_id),
  KEY idx_documents_type_status (document_type, status),
  CONSTRAINT fk_documents_verification
    FOREIGN KEY (verification_id) REFERENCES verification_cases (id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS extracted_data (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_id BIGINT UNSIGNED NOT NULL,
  extracted_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_extracted_data_document_id (document_id),
  CONSTRAINT fk_extracted_data_document
    FOREIGN KEY (document_id) REFERENCES documents (id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS validation_results (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  verification_id BIGINT UNSIGNED NOT NULL,
  check_type VARCHAR(100) NOT NULL,
  status ENUM('PASS', 'FAIL', 'WARNING', 'NEEDS_REVIEW') NOT NULL,
  message VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_validation_results_verification_id (verification_id),
  KEY idx_validation_results_status (status),
  CONSTRAINT fk_validation_results_verification
    FOREIGN KEY (verification_id) REFERENCES verification_cases (id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  verification_id BIGINT UNSIGNED NOT NULL,
  transaction_date DATE NOT NULL,
  description VARCHAR(500) NOT NULL,
  credit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  debit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  balance DECIMAL(15, 2) NULL,
  PRIMARY KEY (id),
  KEY idx_transactions_verification_date (verification_id, transaction_date),
  CONSTRAINT fk_transactions_verification
    FOREIGN KEY (verification_id) REFERENCES verification_cases (id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS risk_assessments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  verification_id BIGINT UNSIGNED NOT NULL,
  risk_score TINYINT UNSIGNED NOT NULL,
  risk_level ENUM('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH') NOT NULL,
  factors_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_risk_assessments_verification_id (verification_id),
  KEY idx_risk_assessments_risk_level (risk_level),
  CONSTRAINT chk_risk_assessments_score CHECK (risk_score <= 100),
  CONSTRAINT fk_risk_assessments_verification
    FOREIGN KEY (verification_id) REFERENCES verification_cases (id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS chat_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  session_type ENUM('CUSTOMER', 'OFFICER') NOT NULL,
  verification_id BIGINT UNSIGNED NULL,
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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id BIGINT UNSIGNED NOT NULL,
  sender ENUM('USER', 'ASSISTANT', 'SYSTEM') NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_chat_messages_session_created_at (session_id, created_at),
  CONSTRAINT fk_chat_messages_session
    FOREIGN KEY (session_id) REFERENCES chat_sessions (id)
    ON DELETE CASCADE
) ENGINE=InnoDB;
