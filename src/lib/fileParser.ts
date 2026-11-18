import JSZip from 'jszip';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';

// Set pdfjs worker source safely with local Vite / unpkg fallback
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
} catch {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '6.1.200'}/build/pdf.worker.min.mjs`;
  } catch (e) {
    console.warn("Could not set pdfjs workerSrc:", e);
  }
}

export interface ParsedFile {
  name: string;
  type: string;
  size: number;
  data: string; // Base64 for images/binary
  textContents?: string; // Extracted plain text for documents/code/zip
  pageCount?: number;
  previewUrl?: string; // Optional local URL for thumbnail preview
}

/**
 * Extracts page count of PDF from its array buffer using lightweight binary scanning
 */
function getPdfPageCount(arrayBuffer: ArrayBuffer): number {
  try {
    if (!arrayBuffer || (arrayBuffer as any).detached || arrayBuffer.byteLength === 0) {
      return 1;
    }
    const sliceLen = Math.min(arrayBuffer.byteLength, 1024 * 1024);
    const slice = arrayBuffer.slice(0, sliceLen);
    const text = new TextDecoder('ascii').decode(new Uint8Array(slice));
    
    const countMatch = text.match(/\/Count\s+(\d+)/);
    if (countMatch) {
      return parseInt(countMatch[1], 10);
    }
    
    const fullSlice = arrayBuffer.slice(0, Math.min(arrayBuffer.byteLength, 4 * 1024 * 1024));
    const fullText = new TextDecoder('ascii').decode(new Uint8Array(fullSlice));
    const pages = fullText.match(/\/Type\s*\/Page\b/g);
    if (pages) {
      return pages.length;
    }
  } catch (err) {
    console.warn("PDF page count fallback notice:", err);
  }
  return 1;
}

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

/**
 * Fallback raw stream text extractor for PDF in browser
 */
function extractRawPdfStreamText(arrayBuffer: ArrayBuffer): string {
  try {
    if (!arrayBuffer || (arrayBuffer as any).detached || arrayBuffer.byteLength === 0) {
      return '';
    }
    const textDecoder = new TextDecoder('latin1');
    const slice = arrayBuffer.slice(0, Math.min(arrayBuffer.byteLength, 8 * 1024 * 1024));
    const raw = textDecoder.decode(new Uint8Array(slice));
    const textMatches: string[] = [];

    const btBlocks = raw.match(/BT[\s\S]*?ET/g) || [];
    for (const block of btBlocks) {
      const tjMatches = block.match(/\((.*?)\)\s*Tj/g) || [];
      for (const m of tjMatches) {
        const cleaned = m.replace(/^\(/, '').replace(/\)\s*Tj$/, '').trim();
        if (cleaned && cleaned.length > 0) textMatches.push(cleaned);
      }
      const arrayMatches = block.match(/\[(.*?)\]\s*TJ/g) || [];
      for (const m of arrayMatches) {
        const subStrings = m.match(/\((.*?)\)/g) || [];
        const combined = subStrings.map(s => s.slice(1, -1)).join('').trim();
        if (combined && combined.length > 0) textMatches.push(combined);
      }
    }

    return textMatches.join(' ').trim();
  } catch (e) {
    console.warn("[FileParser] Raw PDF text extraction fallback notice:", e);
    return '';
  }
}

/**
 * Extracts text from a PDF file using pdfjs-dist
 */
async function parsePdfText(
  arrayBuffer: ArrayBuffer,
  onProgress?: (percent: number) => void
): Promise<{ text: string; pageCount: number }> {
  try {
    // Clone ArrayBuffer to pass to worker so the original arrayBuffer is never detached
    const bufferClone = arrayBuffer.slice(0);
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(bufferClone),
      useSystemFonts: true,
      disableFontFace: true
    });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
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
      } catch (pageErr) {
        console.warn(`[FileParser] Warning reading page ${i}:`, pageErr);
      }
      if (onProgress) {
        onProgress(30 + Math.round((i / numPages) * 60));
      }
    }

    const trimmed = fullText.trim();
    if (trimmed.length > 0) {
      return {
        text: trimmed,
        pageCount: numPages
      };
    }
  } catch (err) {
    console.warn("[FileParser] PDF text extraction via pdfjs-dist failed, trying raw stream:", err);
  }

  const rawFallback = extractRawPdfStreamText(arrayBuffer);
  return { text: rawFallback, pageCount: getPdfPageCount(arrayBuffer) };
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

  // In browser, use DOMParser for structural parsing
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlContent, 'application/xml');
      if (!doc.querySelector('parsererror')) {
        const paragraphs = doc.querySelectorAll('p, tbl, drawing, txbxContent');
        const extractedLines: string[] = [];

        const extractNodeText = (el: Element): string => {
          let lineText = '';
          const walker = doc.createTreeWalker(el, NodeFilter.SHOW_ELEMENT);
          let curr = walker.nextNode() as Element | null;
          while (curr) {
            const nodeName = curr.localName || curr.nodeName;
            if (nodeName === 't' || nodeName === 'm:t' || nodeName === 'a:t' || nodeName === 'v') {
              lineText += curr.textContent || '';
            } else if (nodeName === 'tab') {
              lineText += '    ';
            } else if (nodeName === 'br' || nodeName === 'cr') {
              lineText += '\n';
            }
            curr = walker.nextNode() as Element | null;
          }
          return lineText.trim();
        };

        if (paragraphs.length > 0) {
          paragraphs.forEach((p) => {
            const t = extractNodeText(p);
            if (t) extractedLines.push(t);
          });
          const joined = extractedLines.join('\n\n').trim();
          if (joined.length > 0) return joined;
        }
      }
    } catch (domErr) {
      console.warn('[FileParser] DOMParser word extraction notice:', domErr);
    }
  }

  // Regex-based AST replacement fallback (universal across Node and browser)
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

  // Final fallback: strip all XML tags after replacing block ends with newlines
  const stripped = transformed
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map(l => cleanXmlText(l).trim())
    .filter(Boolean)
    .join('\n');

  return stripped.trim();
}

/**
 * Extracts stream text from binary Word 97-2004 (.doc) files
 */
function extractBinaryDocStreamText(arrayBuffer: ArrayBuffer): string {
  try {
    const uint8 = new Uint8Array(arrayBuffer);
    const textPieces: string[] = [];
    
    // Strategy 1: UTF-16LE wide-character scanning (Standard Word 97-2004)
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
    console.warn("[FileParser] Binary .doc text stream extraction notice:", e);
    return '';
  }
}

/**
 * Parses a DOCX Word document with primary mammoth extraction, multi-part OpenXML extraction, and binary fallback
 */
async function parseDocx(file: File, onProgress?: (percent: number) => void): Promise<string> {
  onProgress?.(25);
  const arrayBuffer = await file.arrayBuffer();
  onProgress?.(45);

  // Strategy 1: Try Mammoth conversion first (compatible with ESM & CJS)
  try {
    const extractFunc = (mammoth as any)?.extractRawText || (mammoth as any)?.default?.extractRawText;
    if (typeof extractFunc === 'function') {
      const result = await extractFunc({ arrayBuffer });
      const text = (result?.value || '').trim();
      if (text && text.length > 0) {
        onProgress?.(90);
        return text;
      }
    }
  } catch (mammothErr) {
    console.warn("[FileParser] Mammoth docx extraction notice:", mammothErr);
  }

  // Strategy 2: Multi-part High-fidelity OpenXML extraction using JSZip
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const extractedSections: string[] = [];

    // Order: Headers -> Document Body -> Footnotes -> Endnotes -> Footers
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
      onProgress?.(90);
      return extractedSections.join('\n\n').trim();
    }
  } catch (zipErr) {
    console.warn("[FileParser] XML DOCX fallback notice:", zipErr);
  }

  // Strategy 3: Binary .doc extraction stream fallback
  const binaryFallback = extractBinaryDocStreamText(arrayBuffer);
  if (binaryFallback.length > 20) {
    onProgress?.(90);
    return binaryFallback;
  }

  return "";
}

/**
 * Parses a PPTX file and extracts text slide by slide
 */
async function parsePptx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  let text = '';

  const files = Object.keys(zip.files);
  const slideFiles = files.filter(path => 
    path.startsWith('ppt/slides/slide') && path.endsWith('.xml')
  );

  slideFiles.sort((a, b) => {
    const numA = parseInt(a.replace(/[^0-9]/g, ''), 10);
    const numB = parseInt(b.replace(/[^0-9]/g, ''), 10);
    return numA - numB;
  });

  if (slideFiles.length === 0) {
    return "Empty PowerPoint presentation.";
  }

  for (let i = 0; i < slideFiles.length; i++) {
    const xmlText = await zip.files[slideFiles[i]].async('text');
    const matches = xmlText.match(/<a:t[^>]*>(.*?)<\/a:t>/g);
    if (matches) {
      const slideText = matches
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
        text += `\n--- Slide ${i + 1} ---\n${slideText}\n`;
      }
    }
  }

  return text.trim() || "No text content found in PowerPoint slides.";
}

/**
 * Parses XLSX/XLS/CSV Excel documents
 */
async function parseExcel(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  let text = '';

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) {
      text += `\n--- Sheet: ${sheetName} ---\n${csv}\n`;
    }
  });

  return text.trim() || "Empty spreadsheet document.";
}

/**
 * Parses ZIP archive and extracts file tree + readable text files inside
 */
async function parseZipArchive(file: File, onProgress?: (percent: number) => void): Promise<string> {
  onProgress?.(30);
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  const allFiles = Object.keys(zip.files);
  let summary = `### ZIP Archive Contents (${allFiles.length} item${allFiles.length === 1 ? '' : 's'})\n\n`;
  summary += `**File List:**\n` + allFiles.map(f => `- \`${f}\``).join('\n') + '\n\n';

  let extractedCount = 0;
  const readableExtensions = [
    '.txt', '.md', '.py', '.java', '.js', '.ts', '.tsx', '.jsx', '.json',
    '.html', '.css', '.c', '.cpp', '.h', '.hpp', '.sql', '.csv', '.xml',
    '.yaml', '.yml', '.sh', '.bash', '.env', '.log', '.properties'
  ];

  for (const path of allFiles) {
    if (!zip.files[path].dir) {
      const lowerPath = path.toLowerCase();
      const isReadable = readableExtensions.some(ext => lowerPath.endsWith(ext));
      if (isReadable) {
        try {
          const content = await zip.files[path].async('text');
          if (content.trim()) {
            summary += `\n--- File in ZIP: ${path} ---\n\`\`\`\n${content.slice(0, 15000)}\n\`\`\`\n`;
            extractedCount++;
          }
        } catch (err) {
          console.warn(`Could not read file ${path} inside zip:`, err);
        }
      }
    }
    if (extractedCount >= 25) {
      summary += `\n... [Extracted top 25 code/text files from ZIP archive] ...\n`;
      break;
    }
  }

  onProgress?.(90);
  return summary.trim() || `ZIP archive containing ${allFiles.length} files.`;
}

/**
 * Main entry point for file parsing
 */
export async function parseUploadedFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<ParsedFile> {
  const name = file.name;
  const size = file.size;
  const type = file.type || 'application/octet-stream';
  const lowerName = name.toLowerCase();
  
  console.log(`[FileParser] Processing file: "${name}" (Type: "${type}", Size: ${size} bytes)`);
  onProgress?.(10);

  // 1. Image handling
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) {
    onProgress?.(40);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          try {
            const maxDim = 1024;
            const quality = 0.72;
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > maxDim) {
                height *= maxDim / width;
                width = maxDim;
              }
            } else {
              if (height > maxDim) {
                width *= maxDim / height;
                height = maxDim;
              }
            }

            canvas.width = Math.max(1, Math.round(width));
            canvas.height = Math.max(1, Math.round(height));
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
              const base64Data = compressedDataUrl.split(',')[1] || '';
              console.log(`[FileParser] Image "${name}" compressed to ${base64Data.length} chars base64.`);
              onProgress?.(100);
              resolve({
                name,
                type: 'image/jpeg',
                size: Math.round(base64Data.length * 0.75),
                data: base64Data,
                previewUrl: compressedDataUrl
              });
            } else {
              const dataUrl = reader.result as string;
              const base64Data = (dataUrl.split(',')[1] || '').slice(0, 500000);
              onProgress?.(100);
              resolve({
                name,
                type,
                size,
                data: base64Data,
                previewUrl: dataUrl
              });
            }
          } catch (e) {
            console.error("[FileParser] Image compression error, falling back to original:", e);
            const dataUrl = reader.result as string;
            const base64Data = (dataUrl.split(',')[1] || '').slice(0, 500000);
            onProgress?.(100);
            resolve({
              name,
              type,
              size,
              data: base64Data,
              previewUrl: dataUrl
            });
          }
        };
        img.onerror = () => reject(new Error(`Failed to decode image "${name}".`));
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error(`Failed to read image file "${name}".`));
      reader.readAsDataURL(file);
    });
  }

  // 2. PDF handling
  if (type === 'application/pdf' || lowerName.endsWith('.pdf')) {
    onProgress?.(20);
    const arrayBuffer = await file.arrayBuffer();
    onProgress?.(40);
    
    const { text: extractedText, pageCount } = await parsePdfText(arrayBuffer, onProgress);
    console.log(`[Attachment Pipeline - FileParser] PDF "${name}": extracted ${extractedText.length} chars text across ${pageCount} pages.`);
    
    // If text was extracted successfully, omit generating base64Data (keeps payload small & prevents HTTP 413)
    let base64Data = '';
    if (!extractedText || extractedText.trim().length < 30) {
      base64Data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl.split(',')[1] || '');
        };
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
    }

    onProgress?.(100);
    const parsedPdf: ParsedFile = {
      name,
      type: 'application/pdf',
      size,
      data: base64Data,
      textContents: extractedText,
      pageCount
    };
    console.log(`[Attachment Pipeline - FileParser] Successfully parsed PDF "${name}": textLen=${parsedPdf.textContents?.length || 0}, dataLen=${parsedPdf.data?.length || 0}`);
    return parsedPdf;
  }

  // 3. Word (DOCX / DOC) handling
  if (lowerName.endsWith('.docx') || lowerName.endsWith('.doc') || type.includes('wordprocessingml') || type.includes('msword')) {
    onProgress?.(30);
    const textContents = await parseDocx(file, onProgress);
    const isExtracted = Boolean(textContents && textContents.trim().length > 0);
    console.log(`[FileParser] Word "${name}": extracted ${textContents.length} chars text. Extracted=${isExtracted}`);
    
    let base64Data = '';
    if (!isExtracted || textContents.length < 30) {
      base64Data = await readFileAsBase64(file).catch(() => '');
    }

    onProgress?.(100);
    return {
      name,
      type: lowerName.endsWith('.docx')
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/msword',
      size,
      data: base64Data,
      textContents: isExtracted ? textContents : ''
    };
  }

  // 4. PowerPoint (PPTX) handling
  if (lowerName.endsWith('.pptx')) {
    onProgress?.(40);
    const textContents = await parsePptx(file);
    const isExtracted = textContents && textContents.trim().length > 0;
    console.log(`[FileParser] PPTX "${name}": extracted ${textContents.length} chars. Extracted=${isExtracted}`);
    onProgress?.(100);
    return {
      name,
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      size,
      data: isExtracted ? '' : (await readFileAsBase64(file).catch(() => '')).slice(0, 400000),
      textContents
    };
  }

  // 5. Excel / CSV handling
  if (
    lowerName.endsWith('.xlsx') || 
    lowerName.endsWith('.xls') || 
    lowerName.endsWith('.csv') ||
    lowerName.endsWith('.tsv')
  ) {
    onProgress?.(40);
    const textContents = await parseExcel(file);
    const isExtracted = textContents && textContents.trim().length > 0;
    console.log(`[FileParser] Spreadsheet "${name}": extracted ${textContents.length} chars. Extracted=${isExtracted}`);
    onProgress?.(100);
    return {
      name,
      type: lowerName.endsWith('.csv') ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size,
      data: isExtracted ? '' : (await readFileAsBase64(file).catch(() => '')).slice(0, 400000),
      textContents
    };
  }

  // 6. ZIP Archives
  if (
    lowerName.endsWith('.zip') || 
    type === 'application/zip' || 
    type === 'application/x-zip-compressed'
  ) {
    onProgress?.(20);
    try {
      const zipSummary = await parseZipArchive(file, onProgress);
      console.log(`[FileParser] ZIP "${name}": extracted ${zipSummary.length} chars summary.`);
      onProgress?.(100);
      return {
        name,
        type: 'application/zip',
        size,
        data: '',
        textContents: zipSummary
      };
    } catch (zipErr) {
      console.error("[FileParser] ZIP parsing failed:", zipErr);
      return {
        name,
        type: 'application/zip',
        size,
        data: '',
        textContents: `[ZIP Archive "${name}" - Could not unpack archive]`
      };
    }
  }

  // 7. Plain Text, Source Code, and Markup Files
  onProgress?.(50);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      onProgress?.(100);
      const text = (reader.result as string) || '';
      console.log(`[FileParser] Text/Code file "${name}": read ${text.length} chars.`);
      resolve({
        name,
        type: type || 'text/plain',
        size,
        data: '',
        textContents: text.trim() ? text : `[File "${name}" is empty]`
      });
    };
    reader.onerror = () => reject(new Error(`Failed to read text/code file "${name}".`));
    reader.readAsText(file);
  });
}

