import { google } from "googleapis";

const SHEET_ID = import.meta.env.SHEET_ID ?? process.env.SHEET_ID;
if (!SHEET_ID) throw new Error("SHEET_ID env var required");

// Prioriza JSON inline (para Vercel/hosts sin filesystem). Fallback a path del archivo (dev local).
const inline = import.meta.env.GOOGLE_CREDENTIALS_JSON ?? process.env.GOOGLE_CREDENTIALS_JSON;
const filePath = import.meta.env.GOOGLE_APPLICATION_CREDENTIALS ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;

function parseCreds(v: string) {
  const t = v.trim();
  try { return JSON.parse(t); } catch {}
  try { return JSON.parse(Buffer.from(t, "base64").toString("utf-8")); } catch {}
  throw new Error("GOOGLE_CREDENTIALS_JSON no es JSON válido ni base64 de JSON");
}

const auth = inline
  ? new google.auth.GoogleAuth({
      credentials: parseCreds(inline),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    })
  : new google.auth.GoogleAuth({
      keyFile: filePath,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
const sheets = google.sheets({ version: "v4", auth });

/** Lee un rango A1 y devuelve filas como arrays. Cachea 30s. */
const cache = new Map<string, { at: number; rows: string[][] }>();
const TTL_MS = 30_000;

export async function leerRango(rango: string): Promise<string[][]> {
  const cached = cache.get(rango);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.rows;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: rango,
  });
  const rows = (res.data.values ?? []) as string[][];
  cache.set(rango, { at: Date.now(), rows });
  return rows;
}

/** Convierte filas (con header en primera) a objetos por header. */
export function toObjects<T = Record<string, string>>(rows: string[][]): T[] {
  const [head, ...body] = rows;
  if (!head) return [];
  return body.map((r) => {
    const o: Record<string, string> = {};
    head.forEach((k, i) => (o[k] = r[i] ?? ""));
    return o as T;
  });
}

/** Agrega una fila al final de una pestaña. */
export async function agregarFila(hoja: string, fila: (string | number)[]) {
  cache.clear();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${hoja}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [fila] },
  });
}

/** Sobrescribe un rango exacto. */
export async function escribirRango(rango: string, valores: (string | number)[][]) {
  cache.clear();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: rango,
    valueInputOption: "RAW",
    requestBody: { values: valores },
  });
}

/** Encuentra la fila (1-based) donde la columna `col` es igual a `id`. */
export function filaPorId(rows: string[][], id: string, col = 0): number | null {
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i]?.[col] ?? "") === id) return i + 1;
  }
  return null;
}

// ponytail: cache global 30s. Upgrade path: por-request si multi-tenant.
