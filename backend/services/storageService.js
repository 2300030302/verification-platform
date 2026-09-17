const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');

// Ensure local uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch (_) {}
}

/**
 * Storage service providing a unified interface for local disk and Vercel Blob storage.
 */
class StorageService {
  constructor() {
    this.uploadsDir = UPLOADS_DIR;
  }

  isCloudStorageEnabled() {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  }

  /**
   * Save an uploaded file to storage.
   * If BLOB_READ_WRITE_TOKEN is configured, uploads to Vercel Blob.
   * Otherwise preserves the local disk storage.
   */
  async saveFile(file) {
    if (this.isCloudStorageEnabled()) {
      try {
        let put;
        try {
          const vercelBlob = require('@vercel/blob');
          put = vercelBlob.put;
        } catch (_) {
          console.warn('[StorageService] @vercel/blob not installed, falling back to local file path.');
          return {
            filePath: file.path,
            storedFilename: file.filename,
            storageType: 'local',
            url: null,
          };
        }

        if (put) {
          const fileBuffer = file.buffer || fs.readFileSync(file.path);
          const blob = await put(file.filename || file.originalname, fileBuffer, {
            access: 'public',
            contentType: file.mimetype,
            token: process.env.BLOB_READ_WRITE_TOKEN,
          });

          return {
            filePath: blob.url,
            storedFilename: file.filename || path.basename(blob.pathname),
            storageType: 'vercel_blob',
            url: blob.url,
          };
        }
      } catch (cloudErr) {
        console.error('[StorageService] Cloud upload failed, falling back to local file:', cloudErr.message);
      }
    }

    // Default to local file storage
    return {
      filePath: file.path,
      storedFilename: file.filename,
      storageType: 'local',
      url: null,
    };
  }

  /**
   * Stream or send a document file to the HTTP response.
   * Enforces security headers and correct MIME type.
   */
  async streamDocument(doc, res) {
    const rawPath = doc.file_path;

    // Check if path is a remote URL (Vercel Blob / S3)
    if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
      const client = rawPath.startsWith('https://') ? https : http;
      
      res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(doc.original_filename)}"`
      );

      return new Promise((resolve, reject) => {
        client.get(rawPath, (remoteRes) => {
          if (remoteRes.statusCode >= 400) {
            res.status(remoteRes.statusCode).json({
              success: false,
              error: 'Failed to stream document from cloud storage.',
            });
            return resolve();
          }
          remoteRes.pipe(res);
          remoteRes.on('end', resolve);
          remoteRes.on('error', (err) => {
            console.error('[StorageService] Stream error:', err);
            reject(err);
          });
        }).on('error', (err) => {
          console.error('[StorageService] Cloud request error:', err);
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              error: 'Failed to access remote document file.',
            });
          }
          resolve();
        });
      });
    }

    // Local file path
    const absoluteFilePath = path.resolve(rawPath);
    if (!fs.existsSync(absoluteFilePath)) {
      return res.status(404).json({
        success: false,
        error: 'Document file not found on disk.',
      });
    }

    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(doc.original_filename)}"`
    );

    return res.sendFile(absoluteFilePath);
  }
}

module.exports = new StorageService();
