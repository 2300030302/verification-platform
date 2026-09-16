import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { validationAPI } from './services/api';
import './VerificationStatus.css';

function VerificationStatus() {
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
            setError(res?.error || 'Unable to load verification status.');
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err.response?.data?.error ||
              err.response?.data?.message ||
              'Failed to load verification status.'
          );
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
        return 'Verification Passed';
      case 'NEEDS_REVIEW':
        return 'Needs Review';
      case 'WARNING':
      default:
        return 'In Progress';
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

  return (
    <div className="verification-status-container">
      <div className="status-header-section">
        <h1 className="status-page-title">Verification Status & Findings</h1>
        <p className="status-page-subtitle">
          Real-time cross-document consistency checks and verification progress
        </p>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          Loading verification status...
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
              <h3>Overall Verification Progress</h3>
              <p>
                {data.overallStatus === 'PASSED'
                  ? 'All identity, address, and document consistency checks have been satisfied.'
                  : data.overallStatus === 'NEEDS_REVIEW'
                  ? 'Some document inconsistencies require attention or manual review.'
                  : 'Your verification is underway. Upload remaining documents to complete review.'}
              </p>
            </div>
            <div className={`overall-badge ${getOverallClass(data.overallStatus)}`}>
              {getOverallBadgeText(data.overallStatus)}
            </div>
          </div>

          {/* Action Bar */}
          <div className="status-actions-bar">
            <h2 className="section-subheading">Verification Findings</h2>
            <button className="rerun-btn" onClick={handleRerun} disabled={running}>
              {running ? 'Re-running Checks...' : '🔄 Re-run Consistency Checks'}
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
                      <span className="finding-title">{f.label}</span>
                      <span className={`finding-status-tag ${f.status}`}>
                        {f.status === 'passed'
                          ? 'Passed'
                          : f.status === 'warning'
                          ? 'Warning'
                          : 'Review Needed'}
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
              <h4>Need to update or add documents?</h4>
              <p>
                You can upload missing items or replace existing documents at any time from My
                Documents.
              </p>
            </div>
            <Link to="/documents" className="cta-link-btn">
              Manage Documents →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default VerificationStatus;