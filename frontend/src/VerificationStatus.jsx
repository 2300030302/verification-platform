import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from './i18n/LanguageContext';
import { validationAPI } from './services/api';
import './VerificationStatus.css';

function VerificationStatus() {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function fetchValidation() {
      try {
        const res = await validationAPI.getMyValidation();
        if (isMounted) {
          if (res && res.success) {
            setData(res);
          } else {
            let errorMsg = res?.error || 'Unable to load verification status.';
            if (typeof errorMsg === 'object' && errorMsg !== null) {
              errorMsg = errorMsg.message || JSON.stringify(errorMsg);
            }
            setError(String(errorMsg));
          }
        }
      } catch (err) {
        if (isMounted) {
          let rawError =
            err.response?.data?.error ||
            err.response?.data?.message ||
            err.message ||
            'Failed to load verification status.';
          if (typeof rawError === 'object' && rawError !== null) {
            rawError = rawError.message || JSON.stringify(rawError);
          }
          setError(String(rawError));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchValidation();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleRerun = async () => {
    if (!data?.verificationId) return;
    try {
      setRunning(true);
      const res = await validationAPI.runValidation(data.verificationId);
      if (res && res.success) {
        setData(res);
      }
    } catch (err) {
      console.error('Error re-running validation:', err);
    } finally {
      setRunning(false);
    }
  };

  const getOverallBadgeText = (status) => {
    switch (status) {
      case 'PASSED':
        return t('status.overallPassed', null, 'Verification Passed');
      case 'NEEDS_REVIEW':
        return t('status.overallNeedsReview', null, 'Needs Review');
      case 'WARNING':
      default:
        return t('status.overallWarning', null, 'In Progress');
    }
  };

  const getOverallClass = (status) => {
    switch (status) {
      case 'PASSED':
        return 'passed';
      case 'NEEDS_REVIEW':
        return 'needs_review';
      case 'WARNING':
      default:
        return 'warning';
    }
  };

  const getFindingTitle = (finding) => {
    const type = finding.checkType || finding.type;
    switch (type) {
      case 'REQUIRED_DOCUMENTS':
        return t('status.checkRequired', null, finding.label || 'Required Documents');
      case 'NAME_CONSISTENCY':
        return t('status.checkName', null, finding.label || 'Name Consistency');
      case 'ADDRESS_CONSISTENCY':
        return t('status.checkAddress', null, finding.label || 'Address Consistency');
      case 'DOCUMENT_EXPIRY':
        return t('status.checkExpiry', null, finding.label || 'Document Validity & Expiry');
      default:
        return finding.label || t('status.checkUnknown', null, 'Consistency Check');
    }
  };

  const getFindingStatusTag = (status) => {
    switch (status) {
      case 'passed':
        return t('status.statusPassed', null, 'Passed');
      case 'warning':
        return t('status.statusWarning', null, 'Warning');
      default:
        return t('status.statusFailed', null, 'Review Needed');
    }
  };

  return (
    <div className="verification-status-container">
      <div className="status-header-section">
        <h1 className="status-page-title">{t('status.pageTitle', null, 'Verification Status & Findings')}</h1>
        <p className="status-page-subtitle">
          {t('status.pageSubtitle', null, 'Real-time cross-document consistency checks and verification progress')}
        </p>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          {t('status.loadingStatus', null, 'Loading verification status...')}
        </div>
      )}

      {error && !loading && (
        <div
          style={{
            background: '#fee2e2',
            color: '#b91c1c',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1.5rem',
          }}
        >
          {error}
        </div>
      )}

      {!loading && data && (
        <>
          {/* Overall Status Card */}
          <div className="overall-status-card">
            <div className="overall-status-info">
              <h3>{t('status.findingsTitle', null, 'Overall Verification Progress')}</h3>
              <p>
                {data.overallStatus === 'PASSED'
                  ? t('status.overallPassedDesc', null, 'All identity, address, and document consistency checks have been satisfied.')
                  : data.overallStatus === 'NEEDS_REVIEW'
                  ? t('status.overallReviewDesc', null, 'Some document inconsistencies require attention or manual review.')
                  : t('status.overallProgressDesc', null, 'Your verification is underway. Upload remaining documents to complete review.')}
              </p>
            </div>
            <div className={`overall-badge ${getOverallClass(data.overallStatus)}`}>
              {getOverallBadgeText(data.overallStatus)}
            </div>
          </div>

          {/* Action Bar */}
          <div className="status-actions-bar">
            <h2 className="section-subheading">{t('status.findingsTitle', null, 'Verification Findings')}</h2>
            <button className="rerun-btn" onClick={handleRerun} disabled={running}>
              {running ? t('status.runningBtn', null, 'Running Validation...') : `🔄 ${t('status.reRunBtn', null, 'Re-run Consistency Checks')}`}
            </button>
          </div>

          {/* Findings List */}
          <div className="findings-list">
            {data.findings && data.findings.length > 0 ? (
              data.findings.map((f, idx) => (
                <div key={idx} className={`finding-card ${f.status}`}>
                  <div className="finding-icon">{f.icon}</div>
                  <div className="finding-content">
                    <div className="finding-header">
                      <span className="finding-title">{getFindingTitle(f)}</span>
                      <span className={`finding-status-tag ${f.status}`}>
                        {getFindingStatusTag(f.status)}
                      </span>
                    </div>
                    <p className="finding-message">{f.message}</p>
                  </div>
                </div>
              ))
            ) : (
              <p style={{ color: '#6b7280' }}>No findings available yet.</p>
            )}
          </div>

          {/* CTA Section */}
          <div className="upload-cta-card">
            <div className="upload-cta-info">
              <h4>{t('documents.uploadCardTitle', null, 'Need to update or add documents?')}</h4>
              <p>
                {t('documents.uploadCardDesc', null, 'You can upload missing items or replace existing documents at any time from My Documents.')}
              </p>
            </div>
            <Link to="/documents" className="cta-link-btn">
              {t('nav.myDocuments', null, 'Manage Documents')} →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default VerificationStatus;