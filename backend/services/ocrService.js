const fs = require('fs');
const path = require('path');

// Lazy-loaded library singletons
let cachedPdfParse = null;
let cachedCreateWorker = null;

/**
 * Polyfills DOMMatrix, ImageData, and Path2D in headless Node environments
 * (e.g. Vercel serverless functions where @napi-rs/canvas native binaries may not be present).
 */
function ensureCanvasPolyfills() {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor(init) {
        this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
        this.m11 = 1; this.m12 = 0; this.m13 = 0; this.m14 = 0;
        this.m21 = 0; this.m22 = 1; this.m23 = 0; this.m24 = 0;
        this.m31 = 0; this.m32 = 0; this.m33 = 1; this.m34 = 0;
        this.m41 = 0; this.m42 = 0; this.m43 = 0; this.m44 = 1;
        this.is2D = true;
        this.isIdentity = true;
        if (Array.isArray(init) && init.length === 6) {
          this.a = init[0]; this.b = init[1]; this.c = init[2];
          this.d = init[3]; this.e = init[4]; this.f = init[5];
        }
      }
      preMultiplySelf() { return this; }
      multiplySelf() { return this; }
      invertSelf() { return this; }
      translate() { return this; }
      scale() { return this; }
      rotate() { return this; }
    };
  }

  if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = class ImageData {
      constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = new Uint8ClampedArray(width * height * 4);
      }
    };
  }

  if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = class Path2D {
      constructor() {}
      addPath() {}
      closePath() {}
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
      arc() {}
      arcTo() {}
      ellipse() {}
      rect() {}
    };
  }
}

/**
 * Lazy loads the pdf-parse library only when a PDF extraction is requested.
 * Applies canvas polyfills so serverless runtimes never crash during PDF parsing.
 */
function getPdfParser() {
  if (!cachedPdfParse) {
    ensureCanvasPolyfills();
    try {
      cachedPdfParse = require('pdf-parse');
    } catch (err) {
      console.warn('[OCR Service] Error loading pdf-parse:', err.message);
      throw new Error(`PDF parsing module unavailable: ${err.message}`);
    }
  }
  return cachedPdfParse;
}

/**
 * Lazy loads tesseract.js worker factory only when image OCR is requested.
 */
function getTesseractWorkerFactory() {
  if (!cachedCreateWorker) {
    try {
      const tesseract = require('tesseract.js');
      cachedCreateWorker = tesseract.createWorker;
    } catch (err) {
      console.warn('[OCR Service] Error loading tesseract.js:', err.message);
      throw new Error(`OCR module unavailable: ${err.message}`);
    }
  }
  return cachedCreateWorker;
}

/**
 * Extracts text from a document based on its MIME type.
 * Supports PDF documents via lazy-loaded pdf-parse and Image documents (PNG, JPEG, JPG) via lazy-loaded tesseract.js.
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

  // 1. PDF Extraction (lazy loaded)
  if (normalizedMime === 'application/pdf' || filePath.toLowerCase().endsWith('.pdf')) {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      let text = '';
      let pageCount = 1;

      const pdfParse = getPdfParser();

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

  // 2. Image OCR (PNG, JPG, JPEG) (lazy loaded)
  if (
    normalizedMime.startsWith('image/') ||
    filePath.toLowerCase().endsWith('.png') ||
    filePath.toLowerCase().endsWith('.jpg') ||
    filePath.toLowerCase().endsWith('.jpeg')
  ) {
    let worker;
    try {
      const createWorker = getTesseractWorkerFactory();
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
  ensureCanvasPolyfills,
};
