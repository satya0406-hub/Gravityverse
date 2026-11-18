import * as mammoth from 'mammoth';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';

export interface ProcessedAttachment {
  name: string;
  type: string;
  size: number;
  data?: string;
  textContents: string;
  pageCount?: number;
  extractionStatus: 'success' | 'partial' | 'empty' | 'unsupported';
  error?: string;
}

/**
 * Extracts text from PDF base64 or buffer on the backend.
 * Uses pdfjs-dist legacy build with stream fallback.
 */
export async function extractPdfText(base64Data: string): Promise<{ text: string; pageCount: number }> {
  if (!base64Data || base64Data.trim().length === 0) return { text: '', pageCount: 0 };
  const cleanBase64 = base64Data.includes('base64,') ? base64Data.split('base64,')[1] : base64Data;
  const buffer = Buffer.from(cleanBase64, 'base64');
  const uint8 = new Uint8Array(buffer);

  // Strategy 1: pdfjs-dist legacy in Node
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjsLib.getDocument({
      data: uint8,
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0
    });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages || 1;
    let fullText = '';

    for (let i = 1; i <= numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageItems = textContent.items
          .map((item: any) => (item && typeof item.str === 'string' ? item.str : ''))
          .filter(Boolean)
          .join(' ');
        if (pageItems.trim()) {
          fullText += `\n--- Page ${i} ---\n` + pageItems.trim() + '\n';
        }
      } catch (pageErr: any) {
        console.warn(`[Backend PdfParser] Error on page ${i}:`, pageErr.message);
      }
    }

    const trimmed = fullText.trim();
    if (trimmed.length > 0) {
      return { text: trimmed, pageCount: numPages };
    }
  } catch (err: any) {
    console.warn('[Backend PdfParser] pdfjs extraction failed, trying stream fallback:', err.message);
  }

  // Strategy 2: Raw PDF stream / text operator extraction fallback
  try {
    const rawString = buffer.toString('binary');
    const textMatches: string[] = [];
    const btBlocks = rawString.match(/BT[\s\S]*?ET/g) || [];
    for (const block of btBlocks) {
      const tjMatches = block.match(/\((.*?)\)\s*Tj/g) || [];
      for (const m of tjMatches) {
        const cleaned = m.replace(/^\(/, '').replace(/\)\s*Tj$/, '').trim();
        if (cleaned) textMatches.push(cleaned);
      }
      const arrayMatches = block.match(/\[(.*?)\]\s*TJ/g) || [];
      for (const m of arrayMatches) {
        const subStrings = m.match(/\((.*?)\)/g) || [];
        const combined = subStrings.map(s => s.slice(1, -1)).join('').trim();
        if (combined) textMatches.push(combined);
      }
    }
    if (textMatches.length > 0) {
      return { text: textMatches.join(' ').trim(), pageCount: 1 };
    }
  } catch (rawErr: any) {
    console.warn('[Backend PdfParser] Raw stream fallback failed:', rawErr.message);
  }

  return { text: '', pageCount: 0 };
}

/**
 * Decodes XML entities safely
 */
function cleanXmlText(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Extracts plain text from Word XML with layout preservation (paragraphs, tables, line breaks, equations, drawings, textboxes)
 */
function extractTextFromWordXml(xmlContent: string): string {
  if (!xmlContent || !xmlContent.trim()) return '';

  let transformed = xmlContent;
  transformed = transformed.replace(/<\/(?:w:p|w:tr|m:oMath)>/gi, '\n\n');
  transformed = transformed.replace(/<\/(?:w:tc)>/gi, '\t');
  transformed = transformed.replace(/<(?:w:br|w:cr)[^>]*\/?>/gi, '\n');
  transformed = transformed.replace(/<w:tab[^>]*\/?>/gi, '    ');

  const textMatches: string[] = [];
  const regex = /<(?:w:t|m:t|a:t|c:v)[^>]*>([\s\S]*?)<\/(?:w:t|m:t|a:t|c:v)>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(transformed)) !== null) {
    if (match[1]) {
      textMatches.push(cleanXmlText(match[1]));
    }
  }

  if (textMatches.length > 0) {
    return textMatches.join('').replace(/\n{3,}/g, '\n\n').trim();
  }

  const stripped = transformed
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map(l => cleanXmlText(l).trim())
    .filter(Boolean)
    .join('\n');

  return stripped.trim();
}

/**
 * Extracts stream text from binary Word 97-2004 (.doc) buffers
 */
function extractBinaryDocStreamText(buffer: Buffer): string {
  try {
    const uint8 = new Uint8Array(buffer);
    const textPieces: string[] = [];
    
    // Strategy 1: UTF-16LE wide-character scanning
    let currentWideWord: number[] = [];
    for (let i = 0; i < uint8.length - 1; i += 2) {
      const code = uint8[i] | (uint8[i + 1] << 8);
      if ((code >= 32 && code <= 126) || code === 10 || code === 13 || code === 9 || (code >= 160 && code <= 0x052F)) {
        currentWideWord.push(code);
      } else {
        if (currentWideWord.length >= 4) {
          const str = String.fromCharCode(...currentWideWord).trim();
          if (str.length >= 3 && !/^[\x00-\x1F]+$/.test(str)) {
            textPieces.push(str);
          }
        }
        currentWideWord = [];
      }
    }
    if (currentWideWord.length >= 4) {
      textPieces.push(String.fromCharCode(...currentWideWord).trim());
    }

    // Strategy 2: ASCII / Latin-1 scanning
    if (textPieces.length < 5) {
      let currentAsciiWord: number[] = [];
      for (let i = 0; i < uint8.length; i++) {
        const b = uint8[i];
        if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9) {
          currentAsciiWord.push(b);
        } else {
          if (currentAsciiWord.length >= 4) {
            const str = String.fromCharCode(...currentAsciiWord).trim();
            if (str.length >= 3) {
              textPieces.push(str);
            }
          }
          currentAsciiWord = [];
        }
      }
    }

    return textPieces
      .filter(p => p && !p.includes('Microsoft Word') && !p.includes('Normal.dotm') && !p.includes('CompObj') && !p.includes('WordDocument'))
      .join('\n')
      .trim();
  } catch (e) {
    console.warn("[Backend DocxParser] Binary .doc stream extraction notice:", e);
    return '';
  }
}

/**
 * Extracts text from DOCX base64 or buffer on the backend.
 * Uses primary mammoth parser, multi-part OpenXML fallback, and binary fallback.
 */
export async function extractDocxText(base64Data: string): Promise<string> {
  if (!base64Data || base64Data.trim().length === 0) return '';
  const cleanBase64 = base64Data.includes('base64,') ? base64Data.split('base64,')[1] : base64Data;
  const buffer = Buffer.from(cleanBase64, 'base64');

  // Strategy 1: Mammoth extraction (Both CJS and ESM safe)
  try {
    const extractFunc = (mammoth as any)?.extractRawText || (mammoth as any)?.default?.extractRawText;
    if (typeof extractFunc === 'function') {
      const result = await extractFunc({ buffer });
      const text = (result?.value || '').trim();
      if (text.length > 0) {
        return text;
      }
    }
  } catch (err: any) {
    console.warn('[Backend DocxParser] Mammoth extraction notice:', err.message);
  }

  // Strategy 2: Multi-part JSZip OpenXML fallback (reading word/document.xml, headers, footers, footnotes)
  try {
    const zip = await JSZip.loadAsync(buffer);
    const extractedSections: string[] = [];

    const targetFileOrder = [
      ...Object.keys(zip.files).filter(k => k.startsWith('word/header') && k.endsWith('.xml')),
      'word/document.xml',
      'word/document2.xml',
      ...Object.keys(zip.files).filter(k => k.startsWith('word/footer') && k.endsWith('.xml')),
      'word/footnotes.xml',
      'word/endnotes.xml',
      'word/comments.xml'
    ];

    for (const fileName of targetFileOrder) {
      const xmlFile = zip.file(fileName);
      if (xmlFile) {
        const xmlContent = await xmlFile.async('text');
        const text = extractTextFromWordXml(xmlContent);
        if (text && text.length > 0) {
          extractedSections.push(text);
        }
      }
    }

    if (extractedSections.length > 0) {
      return extractedSections.join('\n\n').trim();
    }
  } catch (err: any) {
    console.warn('[Backend DocxParser] JSZip fallback notice:', err.message);
  }

  // Strategy 3: Binary .doc fallback
  const binaryFallback = extractBinaryDocStreamText(buffer);
  if (binaryFallback.length > 20) {
    return binaryFallback;
  }

  return '';
}

/**
 * Extracts text from PPTX presentation base64
 */
export async function extractPptxText(base64Data: string): Promise<string> {
  if (!base64Data) return '';
  const cleanBase64 = base64Data.includes('base64,') ? base64Data.split('base64,')[1] : base64Data;
  const buffer = Buffer.from(cleanBase64, 'base64');

  try {
    const zip = await JSZip.loadAsync(buffer);
    const slideFiles = Object.keys(zip.files)
      .filter(fileName => fileName.startsWith('ppt/slides/slide') && fileName.endsWith('.xml'))
      .sort((a, b) => {
        const numA = parseInt(a.replace(/[^0-9]/g, ''), 10) || 0;
        const numB = parseInt(b.replace(/[^0-9]/g, ''), 10) || 0;
        return numA - numB;
      });

    let extracted = '';
    for (let i = 0; i < slideFiles.length; i++) {
      const slidePath = slideFiles[i];
      const xml = await zip.files[slidePath].async('text');
      const textMatches = xml.match(/<a:t>(.*?)<\/a:t>/g);
      if (textMatches) {
        const slideText = textMatches
          .map(m => m.replace(/<[^>]+>/g, ''))
          .map(t => t
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
          )
          .join(' ')
          .trim();
        if (slideText) {
          extracted += `\n--- Slide ${i + 1} ---\n${slideText}\n`;
        }
      }
    }
    return extracted.trim();
  } catch (err: any) {
    console.warn('[Backend PptxParser] Extraction failed:', err.message);
    return '';
  }
}

/**
 * Extracts text from XLSX/XLS/CSV base64
 */
export function extractSpreadsheetText(base64Data: string): string {
  if (!base64Data) return '';
  const cleanBase64 = base64Data.includes('base64,') ? base64Data.split('base64,')[1] : base64Data;
  const buffer = Buffer.from(cleanBase64, 'base64');

  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let text = '';
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv.trim()) {
        text += `\n--- Sheet: ${sheetName} ---\n${csv}\n`;
      }
    });
    return text.trim();
  } catch (err: any) {
    console.warn('[Backend SpreadsheetParser] Extraction failed:', err.message);
    return '';
  }
}

/**
 * Normalizes and guarantees extraction of document content for backend processing
 */
export async function processBackendAttachment(att: any): Promise<ProcessedAttachment> {
  const name = String(att.name || 'document').trim();
  const lowerName = name.toLowerCase();
  const type = String(att.type || 'application/octet-stream').trim();
  const size = Number(att.size || 0);
  const data = typeof att.data === 'string' ? att.data : '';
  let textContents = typeof att.textContents === 'string' ? att.textContents.trim() : '';
  const pageCount = Number(att.pageCount || 0);

  // If textContents is already populated and non-empty (e.g. from frontend parser), validate and use it
  if (textContents.length > 0) {
    return {
      name,
      type,
      size,
      data,
      textContents,
      pageCount,
      extractionStatus: 'success'
    };
  }

  // Otherwise, extract on backend from base64 data if available
  if (data.length > 0) {
    try {
      if (lowerName.endsWith('.pdf') || type === 'application/pdf') {
        const { text: extracted, pageCount: extractedPages } = await extractPdfText(data);
        if (extracted.length > 0) {
          textContents = extracted;
        }
      } else if (lowerName.endsWith('.docx') || lowerName.endsWith('.doc') || type.includes('wordprocessingml') || type.includes('msword')) {
        const extracted = await extractDocxText(data);
        if (extracted.length > 0) {
          textContents = extracted;
        }
      } else if (lowerName.endsWith('.pptx') || type.includes('presentationml')) {
        const extracted = await extractPptxText(data);
        if (extracted.length > 0) {
          textContents = extracted;
        }
      } else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv') || type.includes('spreadsheet') || type.includes('csv')) {
        const extracted = extractSpreadsheetText(data);
        if (extracted.length > 0) {
          textContents = extracted;
        }
      } else if (
        lowerName.endsWith('.txt') || lowerName.endsWith('.md') || lowerName.endsWith('.json') ||
        lowerName.endsWith('.js') || lowerName.endsWith('.ts') || lowerName.endsWith('.tsx') ||
        lowerName.endsWith('.py') || lowerName.endsWith('.java') || lowerName.endsWith('.c') ||
        lowerName.endsWith('.cpp') || lowerName.endsWith('.sql') || lowerName.endsWith('.html') ||
        lowerName.endsWith('.css') || lowerName.endsWith('.xml') || type.startsWith('text/')
      ) {
        const cleanBase64 = data.includes('base64,') ? data.split('base64,')[1] : data;
        const decoded = Buffer.from(cleanBase64, 'base64').toString('utf-8');
        if (decoded.trim().length > 0) {
          textContents = decoded.trim();
        }
      }
    } catch (err: any) {
      console.error(`[Backend Attachment Processing Error] Failed to parse ${name}:`, err);
      return {
        name,
        type,
        size,
        data,
        textContents: '',
        pageCount,
        extractionStatus: 'empty',
        error: err.message
      };
    }
  }

  return {
    name,
    type,
    size,
    data,
    textContents: textContents || (type.startsWith('image/') ? '' : `[File: ${name} (Size: ${size} bytes)]`),
    pageCount,
    extractionStatus: textContents.length > 0 ? 'success' : (type.startsWith('image/') ? 'success' : 'empty')
  };
}
