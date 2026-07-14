export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function toCSV(headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}

export function toExcel(html: string, filename: string) {
  const full = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"></head><body>${html}</body></html>`;
  download(filename, full, 'application/vnd.ms-excel');
}

export function exportTable(filename: string, title: string, headers: string[], rows: (string | number)[][]) {
  const thead = `<tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>`;
  const tbody = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  toExcel(`<h3>${title}</h3><table border="1">${thead}${tbody}</table>`, filename);
}

export function exportPDF(title: string, headers: string[], rows: (string | number)[][]) {
  const w = window.open('', '_blank');
  if (!w) return;
  const thead = `<tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>`;
  const tbody = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  w.document.write(`<html><head><title>${title}</title><style>body{font-family:sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#246346;color:#fff}</style></head><body><h2>${title}</h2><table>${thead}${tbody}</table><script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}
