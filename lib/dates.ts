export type Preset = "today" | "7d" | "30d" | "month" | "lastmonth" | "year" | "custom";
export type Range = { from: string; to: string; preset: Preset };

const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => iso(new Date());
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
export const startOfMonth = (s: string) => `${s.slice(0, 7)}-01`;
export const endOfMonth = (s: string) => {
  const d = parse(s);
  return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};
export const addMonths = (s: string, n: number) => {
  const d = parse(s);
  return iso(new Date(d.getFullYear(), d.getMonth() + n, 1));
};
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
export const fmtBR = (s: string) => s.split("-").reverse().join("/");

export function presetRange(preset: Preset, base = today()): Range {
  switch (preset) {
    case "today":
      return { from: base, to: base, preset };
    case "7d":
      return { from: addDays(base, -6), to: base, preset };
    case "30d":
      return { from: addDays(base, -29), to: base, preset };
    case "lastmonth": {
      const prev = addMonths(base, -1);
      return { from: startOfMonth(prev), to: endOfMonth(prev), preset };
    }
    case "year":
      return { from: `${base.slice(0, 4)}-01-01`, to: `${base.slice(0, 4)}-12-31`, preset };
    case "month":
    default:
      return { from: startOfMonth(base), to: endOfMonth(base), preset: "month" };
  }
}

const isFullMonth = (r: Range) => r.from === startOfMonth(r.from) && r.to === endOfMonth(r.from);
const isFullYear = (r: Range) => r.from.endsWith("-01-01") && r.to === `${r.from.slice(0, 4)}-12-31`;

/** Anda para o período anterior/seguinte: mês inteiro pula mês, ano pula ano, o resto pula o mesmo número de dias. */
export function shiftRange(r: Range, dir: 1 | -1): Range {
  if (isFullYear(r)) {
    const y = Number(r.from.slice(0, 4)) + dir;
    return { from: `${y}-01-01`, to: `${y}-12-31`, preset: "custom" };
  }
  if (isFullMonth(r)) {
    const from = addMonths(r.from, dir);
    return { from, to: endOfMonth(from), preset: "custom" };
  }
  const len = daysBetween(r.from, r.to) + 1;
  return { from: addDays(r.from, dir * len), to: addDays(r.to, dir * len), preset: "custom" };
}

export function rangeLabel(r: Range): string {
  if (r.from === r.to) return fmtBR(r.from);
  if (isFullYear(r)) return r.from.slice(0, 4);
  if (isFullMonth(r)) {
    const [y, m] = r.from.split("-").map(Number);
    const s = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return `${fmtBR(r.from).slice(0, 5)} – ${fmtBR(r.to)}`;
}

export const inRange = (date: string, r: Range) => date >= r.from && date <= r.to;
