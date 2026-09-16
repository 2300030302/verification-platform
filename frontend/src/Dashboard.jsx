import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './context/useAuth';
import { validationAPI } from './services/api';
import './Dashboard.css';

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [caseStatus, setCaseStatus] = useState('IN_PROGRESS');

  useEffect(() => {
    let isMounted = true;
    async function loadStatus() {
      try {
        const res = await validationAPI.getMyValidation();
        if (isMounted && res && res.success) {
          setCaseStatus(res.caseStatus || res.overallStatus || 'IN_PROGRESS');
        }
      } catch {
        // Fall back to default IN_PROGRESS status if network or verification call is unavailable
      }
    }
    loadStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  const getStatusBadge = () => {
    switch (caseStatus) {
      case 'APPROVED':
        return { text: 'Approved', className: 'approved', desc: 'Congratulations! Your identity and documents have been fully approved.' };
      case 'NEEDS_REVIEW':
        return { text: 'Needs Review', className: 'needs-review', desc: 'Action required: Additional review is needed on your submitted documents.' };
      case 'FLAGGED':
        return { text: 'Flagged for Review', className: 'flagged', desc: 'Your verification is undergoing enhanced compliance review.' };
      case 'REJECTED':
        return { text: 'Declined', className: 'rejected', desc: 'We were unable to approve your verification. Please contact support.' };
      case 'IN_REVIEW':
      default:
        return { text: 'In Progress', className: 'in-progress', desc: 'Your verification is currently being reviewed. Please complete all required documents.' };
    }
  };

  const statusInfo = getStatusBadge();

  return (
    <div className="content-wrapper">
      {/* Welcome Section */}
      <section className="welcome-section">
        <h2 className="welcome-title">Welcome back, {user?.name || 'Customer'}!</h2>
        <p className="welcome-subtitle">Complete your verification to access all features</p>
      </section>

      {/* Verification Status Card */}
      <section className="status-card">
        <div className="status-header">
          <h3 className="status-title">Verification Status</h3>
          <span className={`status-badge ${statusInfo.className}`}>{statusInfo.text}</span>
        </div>
        <p className="status-description">{statusInfo.desc}</p>
      </section>

            {/* Required Documents Section */}
            <section className="documents-section">
              <h3 className="section-title">Required Documents</h3>
              <div className="documents-list">
                <div className="document-item uploaded">
                  <div className="document-info">
                    <span className="document-name">Government ID</span>
                    <span className="document-status uploaded">Uploaded</span>
                  </div>
                </div>
                <div className="document-item uploaded">
                  <div className="document-info">
                    <span className="document-name">Bank Statement</span>
                    <span className="document-status uploaded">Uploaded</span>
                  </div>
                </div>
                <div className="document-item missing">
                  <div className="document-info">
                    <span className="document-name">Address Proof</span>
                    <span className="document-status missing">Missing</span>
                  </div>
                </div>
                <div className="document-item pending">
                  <div className="document-info">
                    <span className="document-name">Supporting Document</span>
                    <span className="document-status pending">Pending</span>
                  </div>
                </div>
              </div>
              <button className="dashboard-upload-btn" onClick={() => navigate('/upload')}>Upload Document</button>
            </section>

            {/* Help Section */}
            <section className="help-section">
              <h3 className="section-title">Need Help?</h3>
              <p className="help-description">Our AI Assistant is here to help you with any questions about the verification process.</p>
              <button className="dashboard-help-btn" disabled>Coming Soon</button>
            </section>
          </div>
  );
}

export default Dashboard;