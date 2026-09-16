const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { createWorker } = require('tesseract.js');

/**
 * Extracts text from a document based on its MIME type.
 * Supports PDF documents via pdf-parse and Image documents (PNG, JPEG, JPG) via tesseract.js.
 *
 * @param {string} filePath - Absolute or relative path to the file on disk
 * @param {string} mimeType - MIME type of the file (e.g. application/pdf, image/jpeg, image/png)
 * @returns {Promise<{ text: string, confidence: number, pageCount?: number }>}
 */
async function extractText(filePath, mimeType) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`File not found at path: ${filePath}`);
  }

  const normalizedMime = (mimeType || '').toLowerCase().trim();

  // 1. PDF Extraction
  if (normalizedMime === 'application/pdf' || filePath.toLowerCase().endsWith('.pdf')) {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      let text = '';
      let pageCount = 1;

      if (typeof pdfParse === 'function') {
        const data = await pdfParse(dataBuffer);
        text = (data.text || '').trim();
        pageCount = data.numpages || 1;
      } else if (pdfParse && pdfParse.PDFParse) {
        const parser = new pdfParse.PDFParse({ data: dataBuffer });
        try {
          const result = await parser.getText();
          text = (result && result.text ? result.text : '').trim();
          pageCount = (result && result.total ? result.total : 1);
        } finally {
          if (parser.destroy) {
            await parser.destroy();
          }
        }
      } else {
        throw new Error('Unsupported pdf-parse export structure');
      }

      return {
        text,
        confidence: text.length > 0 ? 0.95 : 0.0,
        pageCount,
      };
    } catch (pdfError) {
      console.error('[OCR Service] PDF parsing error:', pdfError.message);
      throw new Error(`Failed to extract text from PDF: ${pdfError.message}`);
    }
  }

  // 2. Image OCR (PNG, JPG, JPEG)
  if (
    normalizedMime.startsWith('image/') ||
    filePath.toLowerCase().endsWith('.png') ||
    filePath.toLowerCase().endsWith('.jpg') ||
    filePath.toLowerCase().endsWith('.jpeg')
  ) {
    let worker;
    try {
      worker = await createWorker('eng');
      const ret = await worker.recognize(filePath);
      await worker.terminate();
      worker = null;

      const rawText = ret && ret.data && ret.data.text ? ret.data.text.trim() : '';
      const rawConfidence =
        ret && ret.data && typeof ret.data.confidence === 'number'
          ? Math.min(1.0, Math.max(0.1, ret.data.confidence / 100))
          : 0.85;

      return {
        text: rawText,
        confidence: rawText.length > 0 ? rawConfidence : 0.0,
        pageCount: 1,
      };
    } catch (imageError) {
      if (worker) {
        try {
          await worker.terminate();
        } catch (_) {}
      }
      console.error('[OCR Service] Image OCR error:', imageError.message);
      throw new Error(`Failed to extract text from image: ${imageError.message}`);
    }
  }

  throw new Error(`Unsupported MIME type for text extraction: ${mimeType}`);
}

module.exports = {
  extractText,
};
