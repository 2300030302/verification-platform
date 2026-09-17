import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './context/useAuth';
import { useLanguage } from './i18n/LanguageContext';
import { validationAPI, documentAPI } from './services/api';
import './Dashboard.css';

function Dashboard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [caseStatus, setCaseStatus] = useState('IN_PROGRESS');
  const [documents, setDocuments] = useState([]);

  useEffect(() => {
    let isMounted = true;
    async function loadDashboardData() {
      try {
        const [valRes, docRes] = await Promise.all([
          validationAPI.getMyValidation().catch(() => null),
          documentAPI.getMyDocuments().catch(() => null),
        ]);
        if (isMounted) {
          if (valRes && valRes.success) {
            setCaseStatus(valRes.caseStatus || valRes.overallStatus || 'IN_PROGRESS');
          }
          if (docRes && docRes.success && Array.isArray(docRes.documents)) {
            setDocuments(docRes.documents);
          }
        }
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      }
    }
    loadDashboardData();
    return () => {
      isMounted = false;
    };
  }, []);

  const requiredDocTypes = ['GOVERNMENT_ID', 'BANK_STATEMENT', 'ADDRESS_PROOF'];

  const getDocForType = (type) =>
    documents.find((d) => d.documentType === type || d.document_type === type);

  const isDocUploaded = (type) => {
    const doc = getDocForType(type);
    return Boolean(doc && doc.status && doc.status.toUpperCase() !== 'PENDING');
  };

  const allRequiredUploaded = requiredDocTypes.every(isDocUploaded);

  const getDocStatusClass = (type) => {
    const doc = getDocForType(type);
    if (!doc || !doc.status) return 'missing';
    const s = doc.status.toUpperCase();
    if (s === 'PROCESSED' || s === 'UPLOADED') return 'uploaded';
    if (s === 'PROCESSING') return 'pending';
    return 'missing';
  };

  const getDocStatusLabel = (type) => {
    const doc = getDocForType(type);
    if (!doc || !doc.status) return t('documents.pendingBadge', {}, 'Pending');
    const s = doc.status.toUpperCase();
    if (s === 'PROCESSED') return t('documents.processedBadge', {}, 'Processed');
    if (s === 'PROCESSING') return t('documents.processingBadge', {}, 'Processing...');
    if (s === 'UPLOADED') return t('documents.uploadedBadge', {}, 'Uploaded');
    return t('documents.pendingBadge', {}, 'Pending');
  };

  const getStatusBadge = () => {
    switch (caseStatus) {
      case 'APPROVED':
        return {
          text: t('dashboard.approvedBadge', {}, 'Approved'),
          className: 'approved',
          desc: t('dashboard.approvedDesc', {}, 'Congratulations! Your identity and documents have been fully approved.'),
        };
      case 'NEEDS_REVIEW':
        return {
          text: t('dashboard.needsReviewBadge', {}, 'Needs Review'),
          className: 'needs-review',
          desc: t('dashboard.needsReviewDesc', {}, 'Action required: Additional review is needed on your submitted documents.'),
        };
      case 'FLAGGED':
        return {
          text: t('dashboard.flaggedBadge', {}, 'Flagged for Review'),
          className: 'flagged',
          desc: t('dashboard.flaggedDesc', {}, 'Your verification is undergoing enhanced compliance review.'),
        };
      case 'REJECTED':
        return {
          text: t('dashboard.rejectedBadge', {}, 'Declined'),
          className: 'rejected',
          desc: t('dashboard.rejectedDesc', {}, 'We were unable to approve your verification. Please contact support.'),
        };
      case 'IN_REVIEW':
      default:
        return {
          text: t('dashboard.inProgressBadge', {}, 'In Progress'),
          className: 'in-progress',
          desc: t('dashboard.inProgressDesc', {}, 'Your verification is currently in progress. Please complete all required document uploads.'),
        };
    }
  };

  const statusInfo = getStatusBadge();

  return (
    <div className="content-wrapper">
      {/* Welcome Section */}
      <section className="welcome-section">
        <h2 className="welcome-title">
          {t('dashboard.welcomeTitle', { name: user?.name || 'Customer' }, `Welcome back, ${user?.name || 'Customer'}!`)}
        </h2>
        <p className="welcome-subtitle">
          {t('dashboard.welcomeSubtitle', {}, 'Complete your verification to access all banking features')}
        </p>
      </section>

      {/* Verification Status Card */}
      <section className="status-card">
        <div className="status-header">
          <h3 className="status-title">{t('dashboard.statusCardTitle', {}, 'Verification Status')}</h3>
          <span className={`status-badge ${statusInfo.className}`}>{statusInfo.text}</span>
        </div>
        <p className="status-description">{statusInfo.desc}</p>
      </section>

      {/* Next Step Section */}
      <section className="next-step-section">
        <div className={`next-step-card ${allRequiredUploaded ? 'ready' : 'action-needed'}`}>
          <div className="next-step-content">
            <div className="next-step-header">
              <span className="next-step-badge">
                {allRequiredUploaded ? '✅' : '👉'} {t('dashboard.nextStepHeading', {}, 'Next Step')}
              </span>
            </div>
            <h3 className="next-step-title">
              {allRequiredUploaded
                ? t('dashboard.nextStepReadyTitle', {}, 'Your required documents are complete. You can now check your verification status.')
                : t('dashboard.nextStepMissingTitle', {}, 'Please upload your remaining required documents to continue your verification.')}
            </h3>
            <p className="next-step-desc">
              {allRequiredUploaded
                ? t('dashboard.nextStepReadyDesc', {}, 'All required documents have been uploaded and processed. Proceed to check your verification progress.')
                : t('dashboard.nextStepMissingDesc', {}, 'Identity verification requires Government ID, Bank Statement, and Proof of Address.')}
            </p>
          </div>
          <button
            type="button"
            className="next-step-btn"
            onClick={() => navigate(allRequiredUploaded ? '/status' : '/documents')}
          >
            {allRequiredUploaded
              ? t('dashboard.continueStatusBtn', {}, 'Continue to Verification Status →')
              : t('dashboard.goToDocsBtn', {}, 'Go to My Documents →')}
          </button>
        </div>
      </section>

      {/* Required Documents Section */}
      <section className="documents-section">
        <h3 className="section-title">{t('dashboard.requiredDocsTitle', {}, 'Required Documents')}</h3>
        <div className="documents-list">
          <div className={`document-item ${getDocStatusClass('GOVERNMENT_ID')}`}>
            <div className="document-info">
              <span className="document-name">{t('documents.govtIdName', {}, 'Government ID')}</span>
              <span className={`document-status ${getDocStatusClass('GOVERNMENT_ID')}`}>
                {getDocStatusLabel('GOVERNMENT_ID')}
              </span>
            </div>
          </div>
          <div className={`document-item ${getDocStatusClass('BANK_STATEMENT')}`}>
            <div className="document-info">
              <span className="document-name">{t('documents.bankStmtName', {}, 'Bank Statement')}</span>
              <span className={`document-status ${getDocStatusClass('BANK_STATEMENT')}`}>
                {getDocStatusLabel('BANK_STATEMENT')}
              </span>
            </div>
          </div>
          <div className={`document-item ${getDocStatusClass('ADDRESS_PROOF')}`}>
            <div className="document-info">
              <span className="document-name">{t('documents.addressProofName', {}, 'Address Proof')}</span>
              <span className={`document-status ${getDocStatusClass('ADDRESS_PROOF')}`}>
                {getDocStatusLabel('ADDRESS_PROOF')}
              </span>
            </div>
          </div>
          <div className={`document-item ${getDocStatusClass('SUPPORTING_DOCUMENT')}`}>
            <div className="document-info">
              <span className="document-name">{t('documents.supportingDocName', {}, 'Supporting Document')}</span>
              <span className={`document-status ${getDocStatusClass('SUPPORTING_DOCUMENT')}`}>
                {getDocStatusLabel('SUPPORTING_DOCUMENT')}
              </span>
            </div>
          </div>
        </div>
        <button className="dashboard-upload-btn" onClick={() => navigate('/documents')}>
          {t('dashboard.uploadDocBtn', {}, 'Upload Document')}
        </button>
      </section>

      {/* Help Section */}
      <section className="help-section">
        <h3 className="section-title">{t('dashboard.needHelpTitle', {}, 'Need Help?')}</h3>
        <p className="help-description">
          {t('dashboard.needHelpDesc', {}, 'Our AI Assistant is here to help you with any questions about the verification process.')}
        </p>
        <button className="dashboard-help-btn" onClick={() => navigate('/help')}>
          {t('dashboard.openAiBtn', {}, 'Open AI Assistant →')}
        </button>
      </section>
    </div>
  );
}

export default Dashboard;