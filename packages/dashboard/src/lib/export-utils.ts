/** Client-side export utilities — download files, CSV/JSON conversion, ZIP bundling. */

export function downloadTextFile(filename: string, content: string, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType })
  triggerDownload(blob, filename)
}

export function downloadBinaryFile(filename: string, buffer: ArrayBuffer, mimeType: string) {
  const blob = new Blob([buffer], { type: mimeType })
  triggerDownload(blob, filename)
}

export function tableToCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const escape = (val: unknown): string => {
    const s = String(val ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const header = columns.map(escape).join(',')
  const body = rows.map(row => columns.map(col => escape(row[col])).join(',')).join('\n')
  return header + '\n' + body
}

export function tableToJson(
  tableName: string,
  columns: string[],
  rows: Record<string, unknown>[],
): string {
  return JSON.stringify({ table: tableName, columns, rows }, null, 2)
}

export async function downloadAsZip(
  files: Array<{ path: string; content: string | Uint8Array }>,
  zipName: string,
) {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (const f of files) {
    zip.file(f.path, f.content)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  triggerDownload(blob, zipName)
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
