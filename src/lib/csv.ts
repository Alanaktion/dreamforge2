// Reading CSV files in the browser for the CSV import page (moved from src/lib/server/csv.ts).
// Quoted fields, doubled quotes, and \n, \r\n or \r line endings are handled.

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      current.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      current.push(field);
      field = '';
      rows.push(current);
      current = [];
      if (char === '\r' && next === '\n') i++;
    } else {
      field += char;
    }
  }

  if (field || current.length > 0) {
    current.push(field);
    rows.push(current);
  }

  return rows;
}

/** Rows as objects keyed by the (trimmed) header row. Blank lines are skipped. */
export function parseCSVWithHeaders(text: string): Record<string, string>[] {
  const rows = parseCSV(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text); // drop a BOM
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim());
  const result: Record<string, string>[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 1 && row[0].trim() === '') continue;
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j] ?? '';
    }
    result.push(obj);
  }

  return result;
}
