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

// Opens (synchronously, so it can't be popup-blocked) a placeholder tab a caller can fill
// in later via exportReport(..., target) once its async data has loaded.
export function openReportWindow(loadingText = 'Preparing your report…'): Window | null {
  const w = window.open('', '_blank');
  if (w) {
    w.document.write(`<body style="font-family:sans-serif;padding:40px;color:#5d6f63">${loadingText}</body>`);
    w.document.close();
  }
  return w;
}

export interface ReportSection {
  heading: string;
  summary?: string;
  headers?: string[];
  rows?: (string | number)[][];
}

// Multi-section version of exportPDF — same "print-window" mechanism (no PDF library
// dependency), but for a full report rather than a single table. Accepts an already-open
// window (see openReportWindow) for callers that need to fetch data before they have
// content to write — opening the window only once that data resolves would happen well
// after the click that triggered it and get silently killed by the popup blocker.
export function exportReport(title: string, subtitle: string, sections: ReportSection[], target?: Window | null) {
  const w = target !== undefined ? target : window.open('', '_blank');
  if (!w) return;
  if (target) w.document.open();
  const esc = (v: string) => String(v).replace(/</g, '&lt;');
  const body = sections.map((s) => {
    const table = s.headers && s.rows
      ? `<table><thead><tr>${s.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${s.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(String(c))}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      : '';
    return `<section><h3>${esc(s.heading)}</h3>${s.summary ? `<p>${esc(s.summary)}</p>` : ''}${table}</section>`;
  }).join('');
  w.document.write(`<html><head><title>${esc(title)}</title><style>
    body{font-family:sans-serif;color:#1c2b22;padding:28px;max-width:900px;margin:0 auto}
    h1{color:#246346;margin-bottom:2px}
    .subtitle{color:#5d6f63;margin-top:0}
    section{margin-top:22px}
    h3{color:#246346;border-bottom:2px solid #246346;padding-bottom:6px}
    table{border-collapse:collapse;width:100%;margin-top:8px}
    th,td{border:1px solid #ccc;padding:8px;text-align:left;font-size:13px}
    th{background:#246346;color:#fff}
    @media print{body{padding:0}}
  </style></head><body>
    <h1>${esc(title)}</h1><p class="subtitle">${esc(subtitle)}</p>
    ${body}
    <script>window.onload=()=>window.print()</script>
  </body></html>`);
  w.document.close();
}
