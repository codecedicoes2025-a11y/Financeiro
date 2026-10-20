/** Uma linha lida do extrato: valor com sinal (entrada +, saída −). */
export type ParsedRow = { date: string; description: string; amount: number };

export type StatementBalance = { value: number; date: string };
export type ParseResult = { rows: ParsedRow[]; warnings: string[]; balance?: StatementBalance; /** Saldo no início do período, quando o relatório traz (ex.: Mercado Pago). */ opening?: StatementBalance; /** Moeda declarada no arquivo (coluna Currency / CURDEF), ex.: "USD". */ currency?: string };

const clean = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function parseAmount(raw: string): number {
  let s = raw.trim();
  if (!s) return NaN;
  const negative = /^\(.*\)$/.test(s) || /^-|-$/.test(s) || /^[^\d]*-/.test(s);
  s = s.replace(/[^\d.,]/g, "");
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousand = decimal === "," ? "." : ",";
    s = s.split(thousand).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    s = s.replace(",", ".");
  } else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  if (Number.isNaN(n)) return NaN;
  return negative ? -Math.abs(n) : n;
}

type DateOrder = "dmy" | "mdy";

/** Arquivos em formato americano (ex.: Payoneer) têm algum "mm/dd" com o 2º número > 12. */
function detectDateOrder(values: string[]): DateOrder {
  let dmy = false;
  let mdy = false;
  for (const v of values) {
    const m = v.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/);
    if (!m) continue;
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  }
  return mdy && !dmy ? "mdy" : "dmy";
}

export function parseDate(raw: string, order: DateOrder = "dmy"): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const [day, month] = order === "dmy" ? [m[1], m[2]] : [m[2], m[1]];
    return `${y}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return null;
}

function splitCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
  const count = (d: string) => sample.split(d).length - 1;
  const best = [";", ",", "\t"].sort((a, b) => count(b) - count(a))[0];
  return best;
}

type Mapping = {
  currency: number;
  balance: number;
  status: number;
  recordType: number;
  date: number;
  desc: number[];
  amount: number;
  entrada: number;
  saida: number;
};

const DATE_KEYS = ["data lancamento", "data da transacao", "transaction date", "data de compra", "release date", "data do lancamento", "data", "date"];
const DESC_SET = new Set(["titulo", "descricao", "description", "estabelecimento", "historico", "transaction type", "detalhe", "memo", "lancamento", "payee", "name"]);
const AMOUNT_KEYS = ["valor em r", "valor r", "transaction net amount", "net amount", "amount", "valor"];

function findColumn(headers: string[], keys: string[]): number {
  for (const k of keys) {
    const i = headers.indexOf(k);
    if (i >= 0) return i;
  }
  for (const k of keys) {
    const i = headers.findIndex((h) => h.includes(k));
    if (i >= 0) return i;
  }
  return -1;
}

function mapHeaders(rawHeaders: string[]): Mapping | null {
  const headers = rawHeaders.map(clean);
  const date = findColumn(headers, DATE_KEYS);
  if (date < 0) return null;
  const desc = headers.map((h, i) => (DESC_SET.has(h) ? i : -1)).filter((i) => i >= 0);
  const entrada = headers.findIndex((h) => /^(entrada|credito|credit|net credit)\b/.test(h));
  const saida = headers.findIndex((h) => /^(saida|debito|debit|net debit)\b/.test(h));
  const amount = findColumn(headers.map((h) => (h.startsWith("saldo") ? "" : h)), AMOUNT_KEYS);
  const hasSplit = entrada >= 0 && saida >= 0;
  if (!hasSplit && amount < 0) return null;
  const balance = headers.findIndex((h) => /^(saldo|running balance|partial balance|balance)\b/.test(h) && !h.includes("anterior") && !h.includes("previous"));
  return { currency: headers.findIndex((h) => h === "currency" || h === "moeda" || h === "currency code"), balance, status: headers.indexOf("status"), recordType: headers.indexOf("record type"), date, desc, amount: hasSplit ? -1 : amount, entrada: hasSplit ? entrada : -1, saida: hasSplit ? saida : -1 };
}

/** Saldo da linha mais recente. Empate no mesmo dia: a última do arquivo (ou a primeira, se o arquivo está em ordem decrescente). */
function latestBalance(list: StatementBalance[]): StatementBalance | undefined {
  if (!list.length) return undefined;
  const max = list.reduce((m, b) => (b.date > m ? b.date : m), list[0].date);
  const sameDay = list.filter((b) => b.date === max);
  const descending = list[0].date > list[list.length - 1].date;
  return descending ? sameDay[0] : sameDay[sameDay.length - 1];
}

function parseCsv(text: string, cardMode: boolean): ParseResult {
  const warnings: string[] = [];
  const rows = splitCsv(text, detectDelimiter(text));
  let headerIdx = -1;
  let map: Mapping | null = null;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    map = mapHeaders(rows[i]);
    if (map) {
      headerIdx = i;
      break;
    }
  }
  if (!map || headerIdx < 0) {
    return { rows: [], warnings: ["Não reconheci as colunas (preciso de data, descrição e valor). Me envie uma amostra do arquivo."] };
  }
  const m = map;
  const out: ParsedRow[] = [];
  let skipped = 0;
  const body = rows.slice(headerIdx + 1);
  const order = detectDateOrder(body.map((c) => c[m.date] ?? ""));
  const balances: StatementBalance[] = [];
  const currencies = new Map<string, number>();
  let opening: StatementBalance | undefined;
  let closing: StatementBalance | undefined;
  for (const cols of body) {
    // Relatório do Mercado Pago traz linhas de saldo inicial/final e totais: não são lançamentos,
    // mas o saldo inicial/final vale ouro: com ele dá para saber o saldo da conta.
    const recordType = m.recordType >= 0 ? cols[m.recordType] ?? "" : "";
    if (/balance|total/i.test(recordType)) {
      if (/initial.*balance|final.*balance|closing.*balance/i.test(recordType)) {
        const d = parseDate(cols[m.date] ?? "", order);
        const credit = m.entrada >= 0 ? parseAmount(cols[m.entrada] ?? "") : parseAmount(cols[m.amount] ?? "");
        const debit = m.saida >= 0 ? parseAmount(cols[m.saida] ?? "") : 0;
        const value = (Number.isNaN(credit) ? 0 : credit) - (Number.isNaN(debit) ? 0 : Math.abs(debit));
        if (d && !(Number.isNaN(credit) && Number.isNaN(debit))) {
          if (/initial/i.test(recordType)) opening = { date: d, value };
          else closing = { date: d, value };
        }
      }
      continue;
    }
    // Transações canceladas/recusadas não movimentaram dinheiro.
    if (m.status >= 0 && /cancel|fail|declin|reject|void|expired/i.test(cols[m.status] ?? "")) continue;
    const date = parseDate(cols[m.date] ?? "", order);
    let amount: number;
    if (m.amount >= 0) amount = parseAmount(cols[m.amount] ?? "");
    else {
      const inn = parseAmount(cols[m.entrada] ?? "");
      const outv = parseAmount(cols[m.saida] ?? "");
      amount = (Number.isNaN(inn) ? 0 : Math.abs(inn)) - (Number.isNaN(outv) ? 0 : Math.abs(outv));
      if (Number.isNaN(inn) && Number.isNaN(outv)) amount = NaN;
    }
    if (!date || Number.isNaN(amount)) {
      skipped++;
      continue;
    }
    const parts: string[] = [];
    for (const i of m.desc) {
      const v = (cols[i] ?? "").trim();
      if (v && !parts.includes(v)) parts.push(v);
    }
    if (cardMode && m.amount >= 0) amount = -amount;
    out.push({ date, description: parts.join(" - ") || "Sem descrição", amount });
    if (m.currency >= 0) {
      const c = (cols[m.currency] ?? "").trim().toUpperCase();
      if (/^[A-Z]{3}$/.test(c)) currencies.set(c, (currencies.get(c) ?? 0) + 1);
    }
    if (m.balance >= 0) {
      const b = parseAmount(cols[m.balance] ?? "");
      if (!Number.isNaN(b)) balances.push({ date, value: b });
    }
  }
  if (skipped) warnings.push(`${skipped} linha(s) ignorada(s) (sem data ou valor válido).`);
  const currency = [...currencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  let balance = latestBalance(balances);
  if (!balance && closing) balance = closing;
  if (!balance && opening) {
    // Sem coluna de saldo: saldo no início + todos os movimentos do período = saldo ao fim do período.
    const lastDate = out.reduce((mx, r) => (r.date > mx ? r.date : mx), opening.date);
    balance = { value: opening.value + out.reduce((s, r) => s + r.amount, 0), date: lastDate };
  }
  return { rows: out, warnings, balance, opening, currency };
}

function parseOfx(text: string): ParseResult {
  const out: ParsedRow[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const tag = (block: string, name: string) =>
    block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, "i"))?.[1]?.trim() ?? "";
  for (const b of blocks) {
    const date = parseDate(tag(b, "DTPOSTED"));
    const amount = parseAmount(tag(b, "TRNAMT").replace(/^-/, "-"));
    const description = [tag(b, "NAME"), tag(b, "MEMO")].filter((v, i, a) => v && a.indexOf(v) === i).join(" - ");
    if (date && !Number.isNaN(amount)) out.push({ date, description: description || "Sem descrição", amount });
  }
  const bal = text.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([^<\r\n]*)[\s\S]*?<DTASOF>([^<\r\n]*)/i);
  const balance = bal && parseDate(bal[2]) && !Number.isNaN(parseAmount(bal[1])) ? { value: parseAmount(bal[1]), date: parseDate(bal[2]) as string } : undefined;
  const currency = text.match(/<CURDEF>\s*([A-Za-z]{3})/i)?.[1]?.toUpperCase();
  return { rows: out, warnings: out.length ? [] : ["Nenhum lançamento encontrado no OFX."], balance, currency };
}

export function parseStatement(text: string, filename: string, cardMode: boolean): ParseResult {
  const body = text.replace(/^﻿/, "");
  if (/\.ofx$/i.test(filename) || /<OFX>/i.test(body)) return parseOfx(body);
  return parseCsv(body, cardMode);
}
