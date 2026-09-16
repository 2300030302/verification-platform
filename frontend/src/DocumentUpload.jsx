import React, { useState, useRef } from 'react';
import './DocumentUpload.css';

function DocumentUpload({ documentType, onFileSelect, onSubmit, isSubmitting = false }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  const maxFileSize = 10 * 1024 * 1024; // 10MB

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    setError('');

    if (!file) {
      return;
    }

    // Validate file type
    if (!allowedTypes.includes(file.type)) {
      setError('Please select a PDF, JPG, or PNG file.');
      setSelectedFile(null);
      return;
    }

    // Validate file size
    if (file.size > maxFileSize) {
      setError('File size must be less than 10MB.');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    
    // Notify parent component about file selection
    if (onFileSelect) {
      onFileSelect(file);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = () => {
    if (selectedFile && onSubmit) {
      onSubmit(selectedFile);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (onFileSelect) {
      onFileSelect(null);
    }
  };

  const getDocumentTypeLabel = (file) => {
    if (!file) return '';
    
    switch (file.type) {
      case 'application/pdf':
        return 'PDF Document';
      case 'image/jpeg':
        return 'JPEG Image';
      case 'image/png':
        return 'PNG Image';
      default:
        return 'Unknown Type';
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="document-upload-container">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={handleFileSelect}
        className="file-input"
        style={{ display: 'none' }}
      />

      {!selectedFile ? (
        <div className="upload-placeholder">
          <div className="doc-upload-icon">📄</div>
          <h3 className="doc-upload-title">Upload {documentType}</h3>
          <p className="doc-upload-description">
            Select a PDF, JPG, or PNG file (Max 10MB)
          </p>
          <button 
            className="doc-upload-button"
            onClick={handleUploadClick}
          >
            Choose File
          </button>
          {error && <p className="doc-upload-error-message">{error}</p>}
        </div>
      ) : (
        <div className="file-selected-container">
          <div className="file-info-header">
            <div className="doc-file-icon">✅</div>
            <h3 className="file-selected-title">File Selected</h3>
          </div>
          
          <div className="file-details">
            <div className="file-detail-row">
              <span className="file-detail-label">Filename:</span>
              <span className="file-detail-value">{selectedFile.name}</span>
            </div>
            <div className="file-detail-row">
              <span className="file-detail-label">Type:</span>
              <span className="file-detail-value">{getDocumentTypeLabel(selectedFile)}</span>
            </div>
            <div className="file-detail-row">
              <span className="file-detail-label">Size:</span>
              <span className="file-detail-value">{formatFileSize(selectedFile.size)}</span>
            </div>
            <div className="file-detail-row">
              <span className="file-detail-label">Document:</span>
              <span className="file-detail-value">{documentType}</span>
            </div>
          </div>

          <div className="file-actions">
            <button 
              className="remove-button"
              onClick={handleRemoveFile}
              disabled={isSubmitting}
            >
              Remove
            </button>
            <button 
              className="submit-button"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Document'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentUpload;