/**
 * Minimal client-side CSV export helper. Escapes quotes/commas/newlines per
 * RFC 4180 and triggers a browser download — no server round-trip needed.
 */
function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
  // Prepend BOM so Excel on Windows renders UTF-8 (Rupiah symbols etc.) correctly.
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
