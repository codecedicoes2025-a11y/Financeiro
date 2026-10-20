/** Lê valores digitados em pt-BR ("1.234,56") ou en ("1,234.56"). Devolve NaN se inválido. */
export function parseAmount(raw: string): number {
  let s = raw.trim();
  if (!s) return NaN;
  const negative = /^\(.*\)$/.test(s) || /^[^\d]*-/.test(s);
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

export const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const fmtMoney = (value: number, currency: "BRL" | "USD") => (currency === "USD" ? usd : brl).format(value);

export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
