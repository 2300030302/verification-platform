import React, { useState, useEffect, useCallback } from 'react';
import DocumentUpload from './DocumentUpload';
import { documentAPI } from './services/api';
import './MyDocuments.css';

const DEFAULT_REQUIRED_DOCUMENTS = [
  {
    id: 1,
    typeKey: 'GOVERNMENT_ID',
    name: 'Government ID',
    description: "Valid government-issued identification (passport, driver's license, or national ID)",
    status: 'Pending',
    uploadedDate: null,
  },
  {
    id: 2,
    typeKey: 'BANK_STATEMENT',
    name: 'Bank Statement',
    description: 'Recent bank statement showing account activity (last 3 months)',
    status: 'Pending',
    uploadedDate: null,
  },
  {
    id: 3,
    typeKey: 'ADDRESS_PROOF',
    name: 'Address Proof',
    description: 'Utility bill or official correspondence showing current address',
    status: 'Pending',
    uploadedDate: null,
  },
  {
    id: 4,
    typeKey: 'SUPPORTING_DOCUMENT',
    name: 'Supporting Bank Document',
    description: 'Additional banking documentation for verification purposes',
    status: 'Pending',
    uploadedDate: null,
  },
];

function formatStatus(rawStatus) {
  if (!rawStatus) return 'Pending';
  const s = rawStatus.toUpperCase();
  if (s === 'PROCESSED') return 'Processed';
  if (s === 'PROCESSING') return 'Processing...';
  if (s === 'EXTRACTION_FAILED') return 'Extraction Failed';
  if (s === 'UPLOADED') return 'Uploaded';
  return rawStatus;
}

function MyDocuments() {
  const [documents, setDocuments] = useState(DEFAULT_REQUIRED_DOCUMENTS);
  const [uploadingDocument, setUploadingDocument] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null); // 'success', 'error', or null
  const [uploadMessage, setUploadMessage] = useState('');
  const [viewingExtracted, setViewingExtracted] = useState(null); // { doc, loading, data, error }

  const mapBackendDocuments = (rawDocs, currentDocs) => {
    return currentDocs.map((doc) => {
      const matched = rawDocs.find(
        (d) => d.documentType === doc.typeKey || d.document_type === doc.typeKey
      );
      if (matched) {
        const rawDate = matched.createdAt || matched.created_at;
        const formattedDate = rawDate
          ? new Date(rawDate).toISOString().split('T')[0]
          : 'Recently uploaded';
        return {
          ...doc,
          dbId: matched.id,
          status: formatStatus(matched.status),
          uploadedDate: formattedDate,
          storedFilename: matched.storedFilename || matched.stored_filename,
          originalFilename: matched.originalFilename || matched.original_filename,
        };
      }
      return {
        ...doc,
        dbId: null,
        status: 'Pending',
        uploadedDate: null,
      };
    });
  };

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await documentAPI.getMyDocuments();
      if (res && res.success && Array.isArray(res.documents)) {
        setDocuments((prevDocs) => mapBackendDocuments(res.documents, prevDocs));
      }
    } catch (err) {
      console.error('Error fetching documents:', err);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadDocuments() {
      try {
        const res = await documentAPI.getMyDocuments();
        if (isMounted && res && res.success && Array.isArray(res.documents)) {
          setDocuments((prevDocs) => mapBackendDocuments(res.documents, prevDocs));
        }
      } catch (err) {
        console.error('Error fetching documents:', err);
      }
    }

    loadDocuments();

    return () => {
      isMounted = false;
    };
  }, []);

  const getStatusClass = (status) => {
    switch (status) {
      case 'Processed':
        return 'processed';
      case 'Processing...':
        return 'processing';
      case 'Extraction Failed':
        return 'failed';
      case 'Uploaded':
        return 'uploaded';
      case 'Pending':
        return 'pending';
      default:
        return '';
    }
  };

  const handleUpload = (docId) => {
    const document = documents.find((doc) => doc.id === docId);
    if (document) {
      setUploadStatus(null);
      setUploadMessage('');
      setUploadingDocument(document);
    }
  };

  const handleView = async (doc) => {
    if (!doc || !doc.dbId) return;
    setViewingExtracted({ doc, loading: true, data: null, error: null });

    try {
      const result = await documentAPI.getExtractedData(doc.dbId);
      if (result && result.success) {
        setViewingExtracted({ doc, loading: false, data: result, error: null });
      } else {
        setViewingExtracted({
          doc,
          loading: false,
          data: null,
          error: result?.error || 'Unable to retrieve extracted data.',
        });
      }
    } catch (err) {
      setViewingExtracted({
        doc,
        loading: false,
        data: null,
        error: err.response?.data?.error || err.message || 'Failed to retrieve extracted data.',
      });
    }
  };

  const handleCloseView = () => {
    setViewingExtracted(null);
  };

  const handleFileSelect = (file) => {
    console.log('File selected:', file);
  };

  const handleSubmit = async (file) => {
    setIsSubmitting(true);
    setUploadStatus(null);
    setUploadMessage('');

    try {
      const docTypeToSubmit = uploadingDocument?.typeKey || uploadingDocument?.name || 'GOVERNMENT_ID';
      const response = await documentAPI.upload(file, docTypeToSubmit);

      if (response && response.success) {
        setUploadStatus('success');
        setUploadMessage(
          `Document uploaded successfully! (${response.document?.originalFilename || file.name})`
        );
        await fetchDocuments();
        setTimeout(() => {
          setUploadingDocument(null);
          setUploadStatus(null);
          setUploadMessage('');
        }, 1200);
      } else {
        setUploadStatus('error');
        setUploadMessage(response?.error || 'Upload failed. Please try again.');
      }
    } catch (error) {
      const errorMsg =
        error.response?.data?.error ||
        error.response?.data?.message ||
        'Upload failed: Network error or server not responding.';
      setUploadStatus('error');
      setUploadMessage(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseUpload = () => {
    setUploadingDocument(null);
  };

  return (
    <div className="my-documents-container">
      <div className="documents-header">
        <h1 className="page-title">My Documents</h1>
        <p className="page-subtitle">Manage and upload your verification documents</p>
      </div>

      {/* Upload Section */}
      <section className="upload-section">
        <div className="upload-card">
          <div className="my-documents-upload-icon">📄</div>
          <h2 className="my-documents-upload-title">Upload Documents</h2>
          <p className="my-documents-upload-description">
            Click on any document below to upload files. Accepted formats: PDF, JPG, PNG (Max 10MB)
          </p>
        </div>
      </section>

      {/* Documents List */}
      <section className="documents-list-section">
        <h2 className="section-heading">Required Documents</h2>
        <div className="documents-grid">
          {documents.map((doc) => (
            <div key={doc.id} className={`document-card ${getStatusClass(doc.status)}`}>
              <div className="document-card-header">
                <div className="document-icon">📋</div>
                <span className={`document-status-badge ${getStatusClass(doc.status)}`}>
                  {doc.status}
                </span>
              </div>

              <h3 className="document-name">{doc.name}</h3>
              <p className="document-description">{doc.description}</p>

              {doc.uploadedDate && (
                <div className="document-meta">
                  <span className="upload-date">Uploaded: {doc.uploadedDate}</span>
                </div>
              )}

              <div className="document-actions">
                <button
                  className="action-btn doc-upload-btn"
                  onClick={() => handleUpload(doc.id)}
                >
                  {doc.status !== 'Pending' ? 'Replace' : 'Upload'}
                </button>
                {doc.status !== 'Pending' && doc.dbId && (
                  <button className="action-btn view-btn" onClick={() => handleView(doc)}>
                    View Data
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Help Section */}
      <section className="help-section">
        <div className="help-content">
          <h3 className="help-title">Need Help?</h3>
          <p className="help-text">
            Our AI Assistant can help you understand document requirements and guide you through the
            upload process.
          </p>
          <button className="documents-help-btn" disabled>
            Coming Soon
          </button>
        </div>
      </section>

      {/* Upload Modal */}
      {uploadingDocument && (
        <div className="upload-modal-overlay">
          <div className="upload-modal">
            <div className="upload-modal-header">
              <h2 className="upload-modal-title">Upload {uploadingDocument.name}</h2>
              <button
                className="close-modal-btn"
                onClick={handleCloseUpload}
                disabled={isSubmitting}
              >
                ✕
              </button>
            </div>
            <div className="upload-modal-body">
              {uploadStatus && (
                <div className={`upload-status-message ${uploadStatus}`}>
                  {uploadStatus === 'success' ? '✅' : '❌'} {uploadMessage}
                </div>
              )}
              <DocumentUpload
                documentType={uploadingDocument.name}
                onFileSelect={handleFileSelect}
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
              />
            </div>
          </div>
        </div>
      )}

      {/* Extracted Data Modal */}
      {viewingExtracted && (
        <div className="upload-modal-overlay">
          <div className="upload-modal">
            <div className="upload-modal-header">
              <h2 className="upload-modal-title">Extracted Data: {viewingExtracted.doc.name}</h2>
              <button className="close-modal-btn" onClick={handleCloseView}>
                ✕
              </button>
            </div>
            <div className="upload-modal-body">
              {viewingExtracted.loading && (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                  Loading extracted data...
                </div>
              )}

              {viewingExtracted.error && (
                <div className="upload-status-message error">
                  {viewingExtracted.error}
                </div>
              )}

              {viewingExtracted.data && (
                <div>
                  <div className="extracted-meta-info">
                    <span>
                      <strong>File:</strong> {viewingExtracted.doc.originalFilename || 'Document'}
                    </span>
                    <span>
                      <strong>Status:</strong>{' '}
                      <span className={`document-status-badge ${getStatusClass(formatStatus(viewingExtracted.data.document?.status))}`}>
                        {formatStatus(viewingExtracted.data.document?.status)}
                      </span>
                    </span>
                  </div>

                  {viewingExtracted.data.fields &&
                  viewingExtracted.data.fields.filter((f) => f.fieldName !== 'raw_text').length > 0 ? (
                    <table className="extracted-table">
                      <thead>
                        <tr>
                          <th>Field</th>
                          <th>Extracted Value</th>
                          <th>Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewingExtracted.data.fields
                          .filter((f) => f.fieldName !== 'raw_text')
                          .map((field) => (
                            <tr key={field.id || field.fieldName}>
                              <td className="field-name-cell">
                                {field.fieldName.replace(/_/g, ' ')}
                              </td>
                              <td className="field-value-cell">{field.fieldValue || '—'}</td>
                              <td>
                                <span className="confidence-pill">
                                  {Math.round((field.confidence || 1.0) * 100)}%
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  ) : (
                    <p style={{ color: '#6b7280', textAlign: 'center', margin: '1.5rem 0' }}>
                      No structured fields detected.
                    </p>
                  )}

                  {viewingExtracted.data.extractedData?.raw_text && (
                    <details style={{ marginTop: '1rem' }}>
                      <summary
                        style={{
                          cursor: 'pointer',
                          fontWeight: 600,
                          color: '#3b82f6',
                          marginBottom: '0.5rem',
                        }}
                      >
                        View Raw OCR Output
                      </summary>
                      <pre className="raw-text-box">
                        {viewingExtracted.data.extractedData.raw_text}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MyDocuments;
