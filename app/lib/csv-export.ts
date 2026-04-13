/**
 * Client-side CSV export utility.
 * Uses `document` to trigger a download — only works in the browser.
 */

function escapeCell(value: string | number | null): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null)[][],
): void {
  const lines: string[] = []
  lines.push(headers.map(escapeCell).join(','))
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(','))
  }
  const csv = lines.join('\r\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()

  // Clean up
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
