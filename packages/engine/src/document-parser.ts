/**
 * document-parser.ts — Secure document parsing for knowledge base uploads
 *
 * Extracts text from PDF, DOCX, TXT, MD, and CSV files.
 * Validates file types, magic bytes, and size limits.
 */

const ALLOWED_TYPES = new Set(['pdf', 'docx', 'txt', 'md', 'csv'])
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

// Magic byte signatures for binary formats
const MAGIC_BYTES: Record<string, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46],   // %PDF
  docx: [0x50, 0x4B, 0x03, 0x04],  // PK (ZIP archive)
}

/**
 * Validate and parse a document buffer into plain text.
 */
export async function parseDocument(
  buffer: Buffer,
  fileName: string,
  fileType: string,
): Promise<string> {
  // Normalize file type
  const type = fileType.toLowerCase().replace(/^\./, '')

  if (!ALLOWED_TYPES.has(type)) {
    throw new ParseError(`Unsupported file type: ${type}. Allowed: ${[...ALLOWED_TYPES].join(', ')}`)
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw new ParseError(`File too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB. Maximum: 10MB`)
  }

  if (buffer.length === 0) {
    throw new ParseError('File is empty')
  }

  // Validate magic bytes for binary formats
  const expectedMagic = MAGIC_BYTES[type]
  if (expectedMagic) {
    const fileMagic = [...buffer.subarray(0, expectedMagic.length)]
    const matches = expectedMagic.every((byte, i) => fileMagic[i] === byte)
    if (!matches) {
      throw new ParseError(`File content does not match expected ${type.toUpperCase()} format`)
    }
  }

  switch (type) {
    case 'pdf':
      return parsePdf(buffer)
    case 'docx':
      return parseDocx(buffer)
    case 'txt':
    case 'md':
    case 'csv':
      return buffer.toString('utf-8')
    default:
      throw new ParseError(`No parser for file type: ${type}`)
  }
}

async function parsePdf(buffer: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default
  const result = await pdfParse(buffer)
  if (!result.text || result.text.trim().length === 0) {
    throw new ParseError('PDF contains no extractable text (may be scanned/image-only)')
  }
  return result.text
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  if (!result.value || result.value.trim().length === 0) {
    throw new ParseError('DOCX contains no extractable text')
  }
  return result.value
}

/**
 * Sanitize a filename — strip path traversal, limit length.
 */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[/\\]/g, '_')        // strip path separators
    .replace(/\.\./g, '_')         // strip path traversal
    .replace(/[^\w.\-\s]/g, '_')   // only allow safe chars
    .slice(0, 255)
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}
