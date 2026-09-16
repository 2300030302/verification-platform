import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { officerAPI } from '../services/api';
import './OfficerDashboard.css';

export default function OfficerDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Queue state
  const [cases, setCases] = useState([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [queueError, setQueueError] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected case state
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [caseDetails, setCaseDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  // Active tab in review view
  const [activeTab, setActiveTab] = useState('overview');

  // Decision state
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  // Note creation state
  const [newNoteText, setNewNoteText] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  // Document file preview state
  const [previewingDocId, setPreviewingDocId] = useState(null);

  // AI Copilot state
  const [copilotMessages, setCopilotMessages] = useState([]);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotInput, setCopilotInput] = useState('');
  const [copilotError, setCopilotError] = useState('');
  const copilotEndRef = useRef(null);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  // 1. Fetch Queue Cases
  const loadCases = useCallback(async () => {
    setLoadingCases(true);
    setQueueError('');
    try {
      const res = await officerAPI.getCases();
      if (res.success) {
        setCases(res.cases || []);
      } else {
        setQueueError(res.error || 'Failed to load case queue.');
      }
    } catch (err) {
      setQueueError(
        err.response?.data?.error || err.response?.data?.message || 'Error loading verification cases.'
      );
    } finally {
      setLoadingCases(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    officerAPI
      .getCases()
      .then((res) => {
        if (!isMounted) return;
        if (res.success) {
          setCases(res.cases || []);
        } else {
          setQueueError(res.error || 'Failed to load case queue.');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setQueueError(
          err.response?.data?.error || err.response?.data?.message || 'Error loading verification cases.'
        );
      })
      .finally(() => {
        if (isMounted) setLoadingCases(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Fetch Selected Case Details
  const loadCaseDetails = useCallback(async (verificationId) => {
    setLoadingDetails(true);
    setDetailsError('');
    try {
      const res = await officerAPI.getCaseDetails(verificationId);
      if (res.success) {
        setCaseDetails(res.caseDetails || res.case);
      } else {
        setDetailsError(res.error || `Failed to load details for case #${verificationId}.`);
      }
    } catch (err) {
      setDetailsError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          `Error retrieving case #${verificationId}.`
      );
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  // 2b. Fetch Case Copilot Chat History
  const loadCopilotHistory = useCallback(async (verificationId) => {
    if (!verificationId) return;
    setCopilotLoading(true);
    setCopilotError('');
    try {
      const res = await officerAPI.getCopilotHistory(verificationId);
      if (res.success && Array.isArray(res.history)) {
        setCopilotMessages(res.history);
      }
    } catch (err) {
      console.warn('[OfficerDashboard] Failed to load copilot history:', err);
    } finally {
      setCopilotLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'copilot') {
      copilotEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [copilotMessages, activeTab]);

  const handleSelectCase = (id) => {
    setSelectedCaseId(id);
    setActiveTab('overview');
    setStatusMessage(null);
    setDecisionNote('');
    setCopilotMessages([]);
    setCopilotInput('');
    setCopilotError('');
    loadCaseDetails(id);
    loadCopilotHistory(id);
  };

  const handleBackToQueue = () => {
    setSelectedCaseId(null);
    setCaseDetails(null);
    setStatusMessage(null);
    setCopilotMessages([]);
    setCopilotInput('');
    setCopilotError('');
    loadCases();
  };

  // 3. Submit Verification Decision
  const handleSubmitDecision = async (status) => {
    if (!selectedCaseId) return;
    setDecisionSubmitting(true);
    setStatusMessage(null);
    try {
      const res = await officerAPI.submitDecision(selectedCaseId, status, decisionNote);
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: `Determination recorded: Case #${selectedCaseId} is now ${status}.`,
        });
        setDecisionNote('');
        await loadCaseDetails(selectedCaseId);
        await loadCases();
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Failed to submit decision.',
        });
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err.response?.data?.error || 'Failed to record compliance determination.',
      });
    } finally {
      setDecisionSubmitting(false);
    }
  };

  // 4. Post Compliance Note
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNoteText.trim() || !selectedCaseId) return;
    setNoteSubmitting(true);
    try {
      const res = await officerAPI.addNote(selectedCaseId, newNoteText.trim());
      if (res.success) {
        setNewNoteText('');
        await loadCaseDetails(selectedCaseId);
      } else {
        alert(res.error || 'Failed to add review note.');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Error saving review note.');
    } finally {
      setNoteSubmitting(false);
    }
  };

  // 5. Securely Stream Document File for Preview
  const handlePreviewDocument = async (documentId, originalFilename) => {
    try {
      setPreviewingDocId(documentId);
      const blob = await officerAPI.getDocumentBlob(documentId);
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch (err) {
      alert(err.response?.data?.error || `Failed to open document "${originalFilename}".`);
    } finally {
      setPreviewingDocId(null);
    }
  };

  // 6. AI Compliance Copilot Handlers
  const handleSendCopilot = async (messageText) => {
    const textToSend = messageText || copilotInput;
    if (!textToSend || !textToSend.trim() || !selectedCaseId || copilotLoading) return;

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      message: textToSend.trim(),
      createdAt: new Date(),
    };

    setCopilotMessages((prev) => [...prev, userMsg]);
    setCopilotInput('');
    setCopilotLoading(true);
    setCopilotError('');

    try {
      const res = await officerAPI.askCopilot(selectedCaseId, textToSend.trim());
      if (res.success && res.data) {
        const assistantMsg = {
          id: Date.now() + 1,
          sender: 'assistant',
          message: res.data.response,
          createdAt: res.data.generatedAt || new Date(),
        };
        setCopilotMessages((prev) => [...prev, assistantMsg]);
      } else {
        setCopilotError(res.error || 'Failed to receive AI Copilot response.');
      }
    } catch (err) {
      setCopilotError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          'Error communicating with AI Compliance Copilot.'
      );
    } finally {
      setCopilotLoading(false);
    }
  };

  const handleClearCopilot = async () => {
    if (!selectedCaseId) return;
    try {
      await officerAPI.clearCopilotHistory(selectedCaseId);
      setCopilotMessages([]);
      setCopilotError('');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to clear Copilot history.');
    }
  };

  const handleInsertDraftNote = (draftText) => {
    if (!draftText) return;
    setDecisionNote((prev) => (prev ? `${prev}\n\n${draftText}` : draftText));
    setStatusMessage({
      type: 'success',
      text: 'Draft Compliance Audit Note copied into Determination Notes above. You can review, edit, and sign off.',
    });
    window.scrollTo({ top: 350, behavior: 'smooth' });
  };

  // Badges & styling helpers
  const getStatusBadge = (status) => {
    const s = (status || '').toUpperCase();
    switch (s) {
      case 'APPROVED':
        return <span className="officer-status-badge status-approved">Approved</span>;
      case 'NEEDS_REVIEW':
        return <span className="officer-status-badge status-needs-review">Needs Review</span>;
      case 'FLAGGED':
        return <span className="officer-status-badge status-flagged">Flagged</span>;
      case 'REJECTED':
        return <span className="officer-status-badge status-rejected">Rejected</span>;
      case 'IN_REVIEW':
        return <span className="officer-status-badge status-in-review">In Review</span>;
      case 'SUBMITTED':
        return <span className="officer-status-badge status-submitted">Submitted</span>;
      default:
        return <span className="officer-status-badge status-draft">{status || 'Draft'}</span>;
    }
  };

  const getTierBadge = (tier) => {
    const t = (tier || '').toUpperCase();
    switch (t) {
      case 'LOW':
        return <span className="officer-tier-badge tier-low">LOW</span>;
      case 'MEDIUM':
        return <span className="officer-tier-badge tier-medium">MEDIUM</span>;
      case 'HIGH':
        return <span className="officer-tier-badge tier-high">HIGH</span>;
      case 'VERY_HIGH':
        return <span className="officer-tier-badge tier-very-high">VERY HIGH</span>;
      default:
        return <span className="officer-tier-badge tier-unknown">{tier || 'N/A'}</span>;
    }
  };

  // Filter cases in queue
  const filteredCases = cases.filter((c) => {
    const matchesStatus =
      statusFilter === 'ALL' || (c.status || '').toUpperCase() === statusFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      String(c.id).includes(q) ||
      (c.customerName || '').toLowerCase().includes(q) ||
      (c.customerEmail || '').toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="officer-container">
      {/* Top Navigation Header */}
      <header className="officer-header">
        <div className="officer-header-content">
          <div className="officer-app-name">
            <span className="officer-brand-icon">🛡️</span>
            <span>BNP Paribas Verification</span>
            <span className="officer-portal-tag">Compliance Officer Workspace</span>
          </div>
          <div className="officer-user-info">
            <div className="officer-avatar-block">
              <span className="officer-avatar">👮</span>
              <div>
                <div className="officer-user-name">{user?.name || 'Officer'}</div>
                <div className="officer-user-role">Compliance Officer</div>
              </div>
            </div>
            <button className="officer-logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="officer-body">
        {/* ===================== VIEW 1: CASE QUEUE ===================== */}
        {!selectedCaseId && (
          <div className="officer-queue-section">
            <div className="queue-header-row">
              <div>
                <h1 className="queue-main-title">Verification Cases Queue</h1>
                <p className="queue-main-subtitle">
                  Inspect customer submissions, evaluate risk models, and execute compliance lifecycle determinations.
                </p>
              </div>
              <button className="queue-refresh-btn" onClick={loadCases} disabled={loadingCases}>
                {loadingCases ? 'Refreshing...' : '🔄 Refresh Queue'}
              </button>
            </div>

            {/* Queue Metrics Bar */}
            <div className="queue-metrics-bar">
              <div className="metric-pill">
                <span className="metric-num">{cases.length}</span>
                <span className="metric-lbl">Total Cases</span>
              </div>
              <div className="metric-pill">
                <span className="metric-num">
                  {cases.filter((c) => ['SUBMITTED', 'IN_REVIEW', 'NEEDS_REVIEW'].includes(c.status)).length}
                </span>
                <span className="metric-lbl">Pending Review</span>
              </div>
              <div className="metric-pill">
                <span className="metric-num">
                  {cases.filter((c) => ['HIGH', 'VERY_HIGH'].includes(c.riskLevel)).length}
                </span>
                <span className="metric-lbl">Elevated Risk</span>
              </div>
              <div className="metric-pill">
                <span className="metric-num">
                  {cases.filter((c) => c.status === 'APPROVED').length}
                </span>
                <span className="metric-lbl">Approved</span>
              </div>
            </div>

            {/* Filters & Search Toolbar */}
            <div className="queue-toolbar">
              <div className="search-box">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search by customer name, email, or Case ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
                {searchQuery && (
                  <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
                    ✕
                  </button>
                )}
              </div>

              <div className="filter-group">
                <label className="filter-label">Filter Status:</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="ALL">All Statuses ({cases.length})</option>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="IN_REVIEW">In Review</option>
                  <option value="NEEDS_REVIEW">Needs Review</option>
                  <option value="FLAGGED">Flagged</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>
            </div>

            {queueError && <div className="officer-error-banner">{queueError}</div>}

            {/* Queue Table */}
            <div className="queue-table-card">
              {loadingCases ? (
                <div className="queue-loading-state">
                  <div className="loading-spinner"></div>
                  <p>Loading compliance verification queue...</p>
                </div>
              ) : filteredCases.length === 0 ? (
                <div className="queue-empty-state">
                  <div className="empty-icon">📭</div>
                  <h3>No verification cases found</h3>
                  <p>
                    {searchQuery || statusFilter !== 'ALL'
                      ? 'No cases match your active search or filter criteria.'
                      : 'No verification submissions are currently awaiting review.'}
                  </p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="officer-table">
                    <thead>
                      <tr>
                        <th>Case ID</th>
                        <th>Customer</th>
                        <th>Submitted</th>
                        <th>Docs</th>
                        <th>Risk Score</th>
                        <th>Risk Tier</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCases.map((c) => (
                        <tr key={c.id} className="case-table-row">
                          <td className="case-id-cell">
                            <strong>#{c.id}</strong>
                          </td>
                          <td className="customer-cell">
                            <div className="customer-name">{c.customerName || 'Unknown Customer'}</div>
                            <div className="customer-email">{c.customerEmail}</div>
                          </td>
                          <td className="date-cell">
                            {c.submissionDate
                              ? new Date(c.submissionDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })
                              : '—'}
                          </td>
                          <td className="docs-cell">
                            <span className="docs-count-pill">{c.documentCount} docs</span>
                          </td>
                          <td className="score-cell">
                            {c.riskScore !== null ? (
                              <span className="score-val">{c.riskScore}/100</span>
                            ) : (
                              <span className="text-muted">Unassessed</span>
                            )}
                          </td>
                          <td className="tier-cell">{getTierBadge(c.riskLevel)}</td>
                          <td className="status-cell">{getStatusBadge(c.status)}</td>
                          <td className="action-cell">
                            <button
                              className="review-case-btn"
                              onClick={() => handleSelectCase(c.id)}
                            >
                              Review Case →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================== VIEW 2: CASE REVIEW WORKSPACE ===================== */}
        {selectedCaseId && (
          <div className="officer-review-section">
            {/* Top Back Navigation Bar */}
            <div className="review-top-bar">
              <button className="back-to-queue-btn" onClick={handleBackToQueue}>
                ← Back to Case Queue
              </button>
              <div className="review-case-title">
                Case #{selectedCaseId}:{' '}
                <span className="case-title-customer">
                  {caseDetails?.customer?.name || 'Customer'}
                </span>
              </div>
              <div className="review-header-actions">
                <button
                  className="queue-refresh-btn-sm"
                  onClick={() => loadCaseDetails(selectedCaseId)}
                  disabled={loadingDetails}
                >
                  {loadingDetails ? 'Refreshing...' : '🔄 Refresh Case'}
                </button>
              </div>
            </div>

            {statusMessage && (
              <div className={`officer-alert-banner alert-${statusMessage.type}`}>
                {statusMessage.type === 'success' ? '✅ ' : '⚠️ '}
                {statusMessage.text}
              </div>
            )}

            {detailsError && <div className="officer-error-banner">{detailsError}</div>}

            {loadingDetails && !caseDetails ? (
              <div className="queue-loading-state">
                <div className="loading-spinner"></div>
                <p>Loading full verification case dossier...</p>
              </div>
            ) : caseDetails ? (
              <>
                {/* Customer Info & Case Overview Header Card */}
                <div className="case-hero-card">
                  <div className="hero-left">
                    <div className="hero-customer-avatar">
                      {caseDetails.customer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="hero-customer-name">{caseDetails.customer.name}</h2>
                      <div className="hero-meta-row">
                        <span>📧 {caseDetails.customer.email}</span>
                        <span>•</span>
                        <span>Case #{caseDetails.verificationId}</span>
                        <span>•</span>
                        <span>
                          Submitted:{' '}
                          {new Date(caseDetails.submissionDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="hero-right">
                    <div className="hero-status-box">
                      <div className="hero-status-lbl">Current Lifecycle Status</div>
                      <div className="hero-status-val">{getStatusBadge(caseDetails.status)}</div>
                    </div>
                    {caseDetails.riskAssessment && (
                      <div className="hero-risk-box">
                        <div className="hero-status-lbl">Advisory Risk</div>
                        <div className="hero-risk-val">
                          <span className="risk-score-display">
                            {caseDetails.riskAssessment.riskScore}
                          </span>
                          <span className="risk-score-denom">/100</span>
                          {getTierBadge(caseDetails.riskAssessment.riskLevel)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Human Compliance Determination Controls */}
                <div className="decision-controls-card">
                  <div className="decision-card-header">
                    <div>
                      <h3 className="decision-title">⚖️ Compliance Determination Controls</h3>
                      <p className="decision-subtitle">
                        Record final review determination. Updates the verification lifecycle and synchronizes customer portal status.
                      </p>
                    </div>
                    <div className="decision-authority-badge">Human-in-the-Loop Authority</div>
                  </div>

                  <div className="decision-note-box">
                    <label htmlFor="decisionNote" className="decision-input-label">
                      Review Determination Note / Compliance Rationale (optional):
                    </label>
                    <textarea
                      id="decisionNote"
                      rows={2}
                      className="decision-textarea"
                      placeholder="e.g. Identity verified via matching Passport and Utility Bill. Low risk financial profile. Approved for onboarding."
                      value={decisionNote}
                      onChange={(e) => setDecisionNote(e.target.value)}
                    />
                  </div>

                  <div className="decision-actions-row">
                    <button
                      className="decision-btn btn-approve"
                      onClick={() => handleSubmitDecision('APPROVED')}
                      disabled={decisionSubmitting}
                    >
                      ✅ Approve Case
                    </button>
                    <button
                      className="decision-btn btn-needs-review"
                      onClick={() => handleSubmitDecision('NEEDS_REVIEW')}
                      disabled={decisionSubmitting}
                    >
                      📋 Request Further Review
                    </button>
                    <button
                      className="decision-btn btn-flag"
                      onClick={() => handleSubmitDecision('FLAGGED')}
                      disabled={decisionSubmitting}
                    >
                      ⚠️ Flag for Investigation
                    </button>
                    <button
                      className="decision-btn btn-reject"
                      onClick={() => handleSubmitDecision('REJECTED')}
                      disabled={decisionSubmitting}
                    >
                      🚫 Reject Application
                    </button>
                  </div>
                </div>

                {/* Tab Navigation */}
                <div className="review-tabs-bar">
                  <button
                    className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
                    onClick={() => setActiveTab('overview')}
                  >
                    🎯 Overview & Risk Engine
                  </button>
                  <button
                    className={`tab-button ${activeTab === 'documents' ? 'active' : ''}`}
                    onClick={() => setActiveTab('documents')}
                  >
                    📄 Submitted Documents & OCR ({caseDetails.documents?.length || 0})
                  </button>
                  <button
                    className={`tab-button ${activeTab === 'validation' ? 'active' : ''}`}
                    onClick={() => setActiveTab('validation')}
                  >
                    🔍 Validation & Financial Profile
                  </button>
                  <button
                    className={`tab-button ${activeTab === 'notes' ? 'active' : ''}`}
                    onClick={() => setActiveTab('notes')}
                  >
                    📝 Review Notes & Audit Trail ({caseDetails.notes?.length || 0})
                  </button>
                  <button
                    className={`tab-button ${activeTab === 'copilot' ? 'active' : ''}`}
                    onClick={() => setActiveTab('copilot')}
                  >
                    🤖 AI Compliance Copilot
                  </button>
                </div>

                {/* ================= TAB 1: OVERVIEW & RISK ================= */}
                {activeTab === 'overview' && (
                  <div className="tab-content-pane">
                    {caseDetails.riskAssessment ? (
                      <div className="risk-overview-grid">
                        <div className="risk-score-overview-card">
                          <div className="score-summary-row">
                            <div className="score-card">
                              <div className="score-label">Risk Score</div>
                              <div className="score-number">
                                {caseDetails.riskAssessment.riskScore}
                                <span className="score-max">/100</span>
                              </div>
                            </div>
                            <div className="tier-card">
                              <div className="score-label">Risk Level</div>
                              <div>{getTierBadge(caseDetails.riskAssessment.riskLevel)}</div>
                            </div>
                            <div className="recommendation-card">
                              <div className="score-label">Advisory Recommendation</div>
                              <div className="recommendation-text">
                                {caseDetails.riskAssessment.recommendation}
                              </div>
                            </div>
                          </div>

                          <div className="factors-section">
                            <h4 className="factors-heading">Contributing Risk Factors:</h4>
                            {caseDetails.riskAssessment.riskFactors &&
                            caseDetails.riskAssessment.riskFactors.length > 0 ? (
                              <ul className="factors-list">
                                {caseDetails.riskAssessment.riskFactors.map((f, idx) => (
                                  <li key={idx} className="factor-item">
                                    <div className="factor-info">
                                      <span className="factor-warning-icon">⚠️</span>
                                      <div>
                                        <strong>{f.name}</strong>
                                        <p className="factor-desc">{f.description}</p>
                                      </div>
                                    </div>
                                    <span className="factor-points">+{f.points} pts</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div className="no-factors-box">
                                ✅ No adverse risk flags detected. Low-risk verification application.
                              </div>
                            )}
                          </div>

                          <div className="human-review-notice">
                            ⚖️ <strong>Compliance Policy Notice:</strong> The automated risk engine is advisory. The system does not automatically approve or reject customers; final decision authority rests with the compliance officer.
                          </div>
                        </div>

                        {/* Customer Dossier Card */}
                        <div className="customer-dossier-card">
                          <h4 className="dossier-title">Customer Dossier</h4>
                          <div className="dossier-rows">
                            <div className="dossier-row">
                              <span className="dossier-lbl">Customer Name:</span>
                              <span className="dossier-val">{caseDetails.customer.name}</span>
                            </div>
                            <div className="dossier-row">
                              <span className="dossier-lbl">Email Address:</span>
                              <span className="dossier-val">{caseDetails.customer.email}</span>
                            </div>
                            <div className="dossier-row">
                              <span className="dossier-lbl">Account Role:</span>
                              <span className="dossier-val">{caseDetails.customer.role}</span>
                            </div>
                            <div className="dossier-row">
                              <span className="dossier-lbl">Account Created:</span>
                              <span className="dossier-val">
                                {caseDetails.customer.registeredAt
                                  ? new Date(caseDetails.customer.registeredAt).toLocaleDateString()
                                  : '—'}
                              </span>
                            </div>
                            <div className="dossier-row">
                              <span className="dossier-lbl">Total Documents:</span>
                              <span className="dossier-val">{caseDetails.documents?.length || 0}</span>
                            </div>
                            <div className="dossier-row">
                              <span className="dossier-lbl">Review Notes:</span>
                              <span className="dossier-val">{caseDetails.notes?.length || 0}</span>
                            </div>
                            <div className="dossier-row">
                              <span className="dossier-lbl">Audit Log Events:</span>
                              <span className="dossier-val">{caseDetails.auditTrail?.length || 0}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="empty-state-card">
                        <p>No automated risk assessment has been calculated for this case yet.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ================= TAB 2: DOCUMENTS & OCR ================= */}
                {activeTab === 'documents' && (
                  <div className="tab-content-pane">
                    <h3 className="section-title">
                      Customer Submitted Documents & Extracted OCR Data
                    </h3>
                    <p className="section-desc">
                      Review document authenticity, inspect OCR-extracted key-value pairs with confidence scores, and stream raw file previews.
                    </p>

                    {caseDetails.documents && caseDetails.documents.length > 0 ? (
                      <div className="documents-review-grid">
                        {caseDetails.documents.map((doc) => (
                          <div key={doc.id} className="officer-doc-card">
                            <div className="doc-card-top">
                              <div>
                                <div className="doc-type-pill">
                                  {doc.documentType?.replace(/_/g, ' ').toUpperCase()}
                                </div>
                                <h4 className="doc-filename" title={doc.originalFilename}>
                                  {doc.originalFilename}
                                </h4>
                                <div className="doc-meta-sub">
                                  <span>
                                    {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(1)} KB` : 'Unknown size'}
                                  </span>
                                  <span>•</span>
                                  <span>{doc.mimeType}</span>
                                </div>
                              </div>
                              <div className="doc-top-actions">
                                <span className={`doc-status-badge status-${(doc.status || '').toLowerCase()}`}>
                                  {doc.status}
                                </span>
                                <button
                                  className="view-doc-stream-btn"
                                  onClick={() => handlePreviewDocument(doc.id, doc.originalFilename)}
                                  disabled={previewingDocId === doc.id}
                                >
                                  {previewingDocId === doc.id ? 'Opening...' : '👁️ View File'}
                                </button>
                              </div>
                            </div>

                            {/* Extracted Fields Table */}
                            <div className="extracted-fields-box">
                              <div className="fields-box-title">Extracted OCR Fields & Confidence:</div>
                              {doc.extractedFields && doc.extractedFields.length > 0 ? (
                                <table className="extracted-fields-table">
                                  <thead>
                                    <tr>
                                      <th>Field</th>
                                      <th>Extracted Value</th>
                                      <th>Confidence</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {doc.extractedFields.map((f, fIdx) => (
                                      <tr key={fIdx}>
                                        <td className="field-name-cell">
                                          <code>{f.fieldName}</code>
                                        </td>
                                        <td className="field-val-cell">{f.fieldValue}</td>
                                        <td className="field-conf-cell">
                                          <span
                                            className={`conf-pill ${
                                              f.confidence >= 0.85
                                                ? 'conf-high'
                                                : f.confidence >= 0.65
                                                ? 'conf-med'
                                                : 'conf-low'
                                            }`}
                                          >
                                            {Math.round(f.confidence * 100)}%
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <div className="no-fields-notice">
                                  No structured fields extracted or document extraction pending.
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state-card">
                        <p>No documents have been uploaded for this verification case.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ================= TAB 3: VALIDATION & FINANCIALS ================= */}
                {activeTab === 'validation' && (
                  <div className="tab-content-pane">
                    {/* Cross Document Validation */}
                    <div className="validation-section-card">
                      <div className="section-card-header">
                        <div>
                          <h3 className="section-title">Cross-Document Consistency Checks</h3>
                          <p className="section-desc">
                            Automated validation comparing identity, address, and expiry integrity across submitted documents.
                          </p>
                        </div>
                        {caseDetails.validation && (
                          <span
                            className={`val-overall-pill ${
                              caseDetails.validation.overallStatus === 'VALID'
                                ? 'val-valid'
                                : 'val-review'
                            }`}
                          >
                            Overall: {caseDetails.validation.overallStatus}
                          </span>
                        )}
                      </div>

                      {caseDetails.validation?.checks && caseDetails.validation.checks.length > 0 ? (
                        <div className="validation-checks-list">
                          {caseDetails.validation.checks.map((check, idx) => (
                            <div
                              key={idx}
                              className={`val-check-item check-${(check.status || 'info').toLowerCase()}`}
                            >
                              <div className="check-status-col">
                                {check.status === 'PASS' && <span className="check-icon pass">✅</span>}
                                {check.status === 'REVIEW_NEEDED' && <span className="check-icon review">⚠️</span>}
                                {check.status === 'FAILED' && <span className="check-icon fail">❌</span>}
                                {check.status === 'INFO' && <span className="check-icon info">ℹ️</span>}
                              </div>
                              <div className="check-content-col">
                                <div className="check-name-row">
                                  <strong>{check.ruleName || check.checkName || 'Validation Check'}</strong>
                                  <span className={`check-badge badge-${(check.status || '').toLowerCase()}`}>
                                    {check.status}
                                  </span>
                                </div>
                                <p className="check-message">{check.message || check.details}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="no-data-card">
                          No cross-document validation checks found for this case.
                        </div>
                      )}
                    </div>

                    {/* Financial Analysis Profile */}
                    {caseDetails.financialAnalysis && caseDetails.financialAnalysis.summary ? (
                      <div className="financial-analysis-section-card">
                        <h3 className="section-title">📊 Bank Statement Financial Analysis</h3>
                        <p className="section-desc">
                          Calculated metrics derived exclusively from extracted bank statement transaction records.
                        </p>

                        <div className="financial-grid">
                          <div className="fin-card">
                            <div className="fin-label">Total Credits</div>
                            <div className="fin-val fin-credit">
                              ${Number(caseDetails.financialAnalysis.summary.totalCredits || 0).toLocaleString(
                                undefined,
                                { minimumFractionDigits: 2 }
                              )}
                            </div>
                          </div>
                          <div className="fin-card">
                            <div className="fin-label">Total Debits</div>
                            <div className="fin-val fin-debit">
                              ${Number(caseDetails.financialAnalysis.summary.totalDebits || 0).toLocaleString(
                                undefined,
                                { minimumFractionDigits: 2 }
                              )}
                            </div>
                          </div>
                          <div className="fin-card">
                            <div className="fin-label">Transaction Count</div>
                            <div className="fin-val">
                              {caseDetails.financialAnalysis.summary.transactionCount}
                            </div>
                          </div>
                          <div className="fin-card">
                            <div className="fin-label">Average Transaction</div>
                            <div className="fin-val">
                              ${Number(
                                caseDetails.financialAnalysis.summary.averageTransaction || 0
                              ).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div className="fin-card">
                            <div className="fin-label">Average Balance</div>
                            <div className="fin-val">
                              {caseDetails.financialAnalysis.summary.averageBalance !== null
                                ? `$${Number(
                                    caseDetails.financialAnalysis.summary.averageBalance
                                  ).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                                : 'N/A'}
                            </div>
                          </div>
                          <div className="fin-card">
                            <div className="fin-label">Balance Trend</div>
                            <div
                              className={`fin-trend-badge trend-${(
                                caseDetails.financialAnalysis.summary.balanceTrend || ''
                              ).toLowerCase()}`}
                            >
                              {caseDetails.financialAnalysis.summary.balanceTrend || 'INSUFFICIENT_DATA'}
                            </div>
                          </div>
                        </div>

                        {/* Anomalies */}
                        <div className="anomalies-box">
                          <h4 className="anomalies-title">⚠️ Potential Financial Anomalies</h4>
                          {caseDetails.financialAnalysis.anomalies &&
                          caseDetails.financialAnalysis.anomalies.length > 0 ? (
                            <div className="anomalies-list">
                              {caseDetails.financialAnalysis.anomalies.map((anom, idx) => (
                                <div key={idx} className="anomaly-item">
                                  <div className="anomaly-header">
                                    <span
                                      className={`anomaly-badge anomaly-${(
                                        anom.severity || 'medium'
                                      ).toLowerCase()}`}
                                    >
                                      {anom.type.replace(/_/g, ' ')}
                                    </span>
                                    <span className="anomaly-severity">Severity: {anom.severity}</span>
                                  </div>
                                  <p className="anomaly-desc">{anom.description}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="no-anomalies-msg">
                              ✅ No financial anomalies or unusual transaction velocity detected.
                            </div>
                          )}
                          <div className="financial-disclaimer">
                            ℹ️ {caseDetails.financialAnalysis.disclaimer}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="no-data-card" style={{ marginTop: '1.5rem' }}>
                        No bank statement financial transactions detected for analysis.
                      </div>
                    )}
                  </div>
                )}

                {/* ================= TAB 4: NOTES & AUDIT TRAIL ================= */}
                {activeTab === 'notes' && (
                  <div className="tab-content-pane">
                    <div className="notes-audit-grid">
                      {/* Left: Review Notes */}
                      <div className="notes-column">
                        <div className="notes-header-row">
                          <h3 className="section-title">📝 Compliance Review Notes</h3>
                          <span className="notes-count-badge">
                            {caseDetails.notes?.length || 0} notes
                          </span>
                        </div>

                        {/* Add Note Form */}
                        <form onSubmit={handleAddNote} className="add-note-form">
                          <textarea
                            rows={3}
                            placeholder="Add an internal compliance observation or note..."
                            value={newNoteText}
                            onChange={(e) => setNewNoteText(e.target.value)}
                            className="note-input"
                            required
                          />
                          <button
                            type="submit"
                            className="add-note-submit-btn"
                            disabled={noteSubmitting || !newNoteText.trim()}
                          >
                            {noteSubmitting ? 'Posting...' : 'Post Review Note'}
                          </button>
                        </form>

                        {/* Notes List */}
                        <div className="notes-stream">
                          {caseDetails.notes && caseDetails.notes.length > 0 ? (
                            caseDetails.notes.map((n) => (
                              <div key={n.id} className="note-card">
                                <div className="note-meta-row">
                                  <span className="note-author">
                                    👮 {n.officer_name || 'Compliance Officer'}
                                  </span>
                                  <span className="note-date">
                                    {new Date(n.created_at).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                                <div className="note-text-body">{n.note}</div>
                              </div>
                            ))
                          ) : (
                            <div className="no-notes-msg">
                              No review notes have been recorded for this case yet.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Chronological Audit Trail */}
                      <div className="audit-column">
                        <div className="notes-header-row">
                          <h3 className="section-title">📋 Case Audit Trail</h3>
                          <span className="audit-count-badge">Immutable Log</span>
                        </div>

                        <div className="audit-timeline">
                          {caseDetails.auditTrail && caseDetails.auditTrail.length > 0 ? (
                            caseDetails.auditTrail.map((log) => (
                              <div key={log.id} className="timeline-item">
                                <div className="timeline-dot"></div>
                                <div className="timeline-content">
                                  <div className="timeline-header">
                                    <span className={`timeline-action-badge action-${log.action.toLowerCase()}`}>
                                      {log.action.replace(/_/g, ' ')}
                                    </span>
                                    <span className="timeline-date">
                                      {new Date(log.created_at).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </span>
                                  </div>
                                  <p className="timeline-details">{log.details}</p>
                                  <div className="timeline-officer">
                                    Actor: {log.officer_name || 'System'}
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="no-notes-msg">No audit logs recorded yet.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ================= TAB 5: AI COMPLIANCE COPILOT ================= */}
                {activeTab === 'copilot' && (
                  <div className="tab-content-pane">
                    <div className="copilot-workspace-card">
                      <div className="copilot-header-bar">
                        <div className="copilot-header-title-group">
                          <span className="copilot-header-icon">🤖</span>
                          <div>
                            <h3 className="copilot-header-title">AI Compliance Copilot (Advisory Mode)</h3>
                            <p className="copilot-header-subtitle">
                              Grounded case synthesis, explainable risk decomposition, discrepancy auditing, and audit note drafting.
                            </p>
                          </div>
                        </div>
                        <div className="copilot-header-actions">
                          <span className="copilot-advisory-badge">Advisory Only • Human Sign-off Mandatory</span>
                          <button
                            type="button"
                            className="copilot-clear-btn"
                            onClick={handleClearCopilot}
                            title="Clear copilot conversation for this case"
                          >
                            🗑️ Clear Chat
                          </button>
                        </div>
                      </div>

                      {/* Suggested Inquiry Prompt Chips */}
                      <div className="copilot-prompts-bar">
                        <span className="copilot-prompts-label">Suggested Analyses:</span>
                        <div className="copilot-chips-row">
                          <button
                            type="button"
                            className="copilot-chip"
                            disabled={copilotLoading}
                            onClick={() => handleSendCopilot('Provide a complete case summary for this customer.')}
                          >
                            📋 Case Summary
                          </button>
                          <button
                            type="button"
                            className="copilot-chip"
                            disabled={copilotLoading}
                            onClick={() => handleSendCopilot('Explain how the risk score was calculated and show contributing factors.')}
                          >
                            🛡️ Explain Risk Score
                          </button>
                          <button
                            type="button"
                            className="copilot-chip"
                            disabled={copilotLoading}
                            onClick={() => handleSendCopilot('Highlight all document discrepancies and mismatches between submitted documents.')}
                          >
                            🔍 Document Discrepancies
                          </button>
                          <button
                            type="button"
                            className="copilot-chip"
                            disabled={copilotLoading}
                            onClick={() => handleSendCopilot('Analyze the bank statement financial transactions and explain any anomalies.')}
                          >
                            💳 Financial Analysis
                          </button>
                          <button
                            type="button"
                            className="copilot-chip"
                            disabled={copilotLoading}
                            onClick={() => handleSendCopilot('Draft a compliance audit note with preliminary determination recommendations for this case.')}
                          >
                            📝 Draft Audit Note
                          </button>
                          <button
                            type="button"
                            className="copilot-chip"
                            disabled={copilotLoading}
                            onClick={() => handleSendCopilot('Provide review guidance and compliance checklist for this case.')}
                          >
                            💡 Review Guidance
                          </button>
                        </div>
                      </div>

                      {/* Copilot Chat Feed */}
                      <div className="copilot-chat-feed">
                        {copilotMessages.length === 0 ? (
                          <div className="copilot-welcome-box">
                            <div className="copilot-welcome-icon">🛡️</div>
                            <h4>Welcome to Case Compliance AI Copilot</h4>
                            <p>
                              Your assistant has ingested the complete dossier for <strong>{caseDetails.customer.name}</strong> (Case #{caseDetails.verificationId}), including OCR extractions, cross-document validation findings, financial profiling, and risk scoring.
                            </p>
                            <p className="copilot-welcome-hint">
                              Select one of the suggested analysis buttons above, or enter a specific inquiry below.
                            </p>
                          </div>
                        ) : (
                          copilotMessages.map((msg, index) => (
                            <div
                              key={msg.id || index}
                              className={`copilot-msg-row ${msg.sender === 'user' ? 'msg-user' : 'msg-copilot'}`}
                            >
                              {msg.sender === 'assistant' && (
                                <div className="copilot-avatar">🤖</div>
                              )}
                              <div className={`copilot-bubble ${msg.sender === 'user' ? 'bubble-user' : 'bubble-copilot'}`}>
                                <div className="copilot-bubble-meta">
                                  <span className="bubble-sender">
                                    {msg.sender === 'user' ? `👮 ${user?.name || 'Compliance Officer'}` : '🤖 AI Compliance Copilot'}
                                  </span>
                                  <span className="bubble-time">
                                    {msg.createdAt
                                      ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                      : ''}
                                  </span>
                                </div>
                                <div className="copilot-bubble-content">
                                  {msg.message.split('\n').map((line, lIdx) => (
                                    <p key={lIdx} className="copilot-line">
                                      {line}
                                    </p>
                                  ))}
                                </div>

                                {/* Direct Insertion into Determination Note if Draft Note */}
                                {msg.sender === 'assistant' && (msg.message.includes('[DRAFT COMPLIANCE AUDIT NOTE]') || msg.message.toLowerCase().includes('draft note')) && (
                                  <div className="copilot-draft-action-box">
                                    <button
                                      type="button"
                                      className="btn-insert-draft"
                                      onClick={() => handleInsertDraftNote(msg.message)}
                                      title="Populate this draft into Determination Notes above"
                                    >
                                      📋 Insert Draft into Determination Note
                                    </button>
                                  </div>
                                )}
                              </div>
                              {msg.sender === 'user' && (
                                <div className="copilot-avatar user-avatar">👮</div>
                              )}
                            </div>
                          ))
                        )}

                        {copilotLoading && (
                          <div className="copilot-msg-row msg-copilot">
                            <div className="copilot-avatar">🤖</div>
                            <div className="copilot-bubble bubble-copilot bubble-loading">
                              <div className="copilot-typing">
                                <span></span>
                                <span></span>
                                <span></span>
                              </div>
                              <span className="copilot-loading-text">Analyzing verification dossier...</span>
                            </div>
                          </div>
                        )}

                        <div ref={copilotEndRef} />
                      </div>

                      {copilotError && (
                        <div className="copilot-error-banner">
                          ⚠️ {copilotError}
                        </div>
                      )}

                      {/* Input bar */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleSendCopilot();
                        }}
                        className="copilot-input-form"
                      >
                        <input
                          type="text"
                          className="copilot-input-field"
                          placeholder="Ask Copilot about identity checks, addresses, anomalies, or risk rationale..."
                          value={copilotInput}
                          onChange={(e) => setCopilotInput(e.target.value)}
                          disabled={copilotLoading}
                        />
                        <button
                          type="submit"
                          className="copilot-send-btn"
                          disabled={copilotLoading || !copilotInput.trim()}
                        >
                          {copilotLoading ? 'Analyzing...' : '➤ Send Inquiry'}
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
