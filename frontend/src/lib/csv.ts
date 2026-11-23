/**
 * CSV building and download.
 *
 * Two things this exists to get right:
 *
 *  - **Quoting.** A description or a person's name may contain a comma, a
 *    quote or a newline. Every cell goes through the RFC 4180 rule (wrap in
 *    quotes, double any inner quote), so Excel and Sheets open the file as a
 *    table rather than a mess.
 *  - **The BOM.** Excel on Windows reads a UTF-8 CSV as the system codepage
 *    unless the file starts with a byte-order mark, which turns "José" into
 *    "JosÃ©". The BOM costs three bytes and is invisible to every other reader.
 */

export type CsvCell = string | number | null | undefined;

function cell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Rows of cells → one CSV document (no BOM). */
export function toCsv(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(cell).join(',')).join('\r\n');
}

/**
 * Trigger a download of `rows` as a CSV file.
 *
 * Uses an object URL rather than a data URI because a long export overflows
 * the data-URI length limit in some browsers.
 */
export function downloadCsv(filename: string, rows: CsvCell[][]): void {
  const content = `﻿${toCsv(rows)}`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoking immediately can race the click in Safari; one tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** `project-name_2026-01-01_2026-03-31` — filesystem-safe, sortable. */
export function csvFilename(...parts: (string | number)[]): string {
  return parts
    .map((part) =>
      String(part)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
    )
    .filter(Boolean)
    .join('_');
}
