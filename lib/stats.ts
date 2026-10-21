import type { Account, Category, Entry, State } from "./types";
import { inRange, startOfMonth, type Range } from "./dates";

export { brl, usd } from "./money";

const accountOf = (e: Entry, accounts: Account[]) => accounts.find((a) => a.id === e.accountId);

/** Valor assinado do lançamento em reais (entrada +, saída −); dólar convertido pela cotação. */
export function signedBrl(e: Entry, accounts: Account[], usdBrl: number): number {
  if (e.type === "transfer") return 0; // transferência não é gasto nem ganho
  const v = accountOf(e, accounts)?.currency === "USD" ? e.amount * usdBrl : e.amount;
  return e.type === "in" ? v : -v;
}

/** `ids`: categorias que formam a fatia (mais de uma em "Demais categorias"). */
export type Slice = { id: string; name: string; color: string; value: number; pct: number; ids: string[]; /** Só em "Demais categorias": nomes das categorias agrupadas. */ members?: string[] };
const MAX_SLICES = 6;
/** Cor de "Demais categorias" e de categorias sem cadastro: um cinza claro que aparece bem nos temas claro e escuro. */
const REST_COLOR = "var(--muted-2)";

function toSlices(totals: Map<string, number>, categories: Category[]): Slice[] {
  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  if (sum <= 0) return [];
  const sorted = [...totals.entries()]
    .map(([id, value]) => {
      const c = categories.find((x) => x.id === id);
      return { id, name: c?.name ?? "Sem categoria", color: c?.color ?? REST_COLOR, value, pct: (value / sum) * 100, ids: [id] };
    })
    .sort((a, b) => b.value - a.value);
  if (sorted.length <= MAX_SLICES) return sorted;
  const head = sorted.slice(0, MAX_SLICES - 1);
  const rest = sorted.slice(MAX_SLICES - 1);
  const value = rest.reduce((a, s) => a + s.value, 0);
  return [...head, { id: "__rest", name: "Demais categorias", color: REST_COLOR, value, pct: (value / sum) * 100, ids: rest.map((s) => s.id), members: rest.map((s) => s.name) }];
}

export type Summary = { income: number; expense: number; result: number; expenses: Slice[]; incomes: Slice[] };

export function summarize(entries: Entry[], state: State): Summary {
  const exp = new Map<string, number>();
  const inc = new Map<string, number>();
  let income = 0;
  let expense = 0;
  for (const e of entries) {
    if (e.type === "transfer") continue;
    const v = Math.abs(signedBrl(e, state.accounts, state.usdBrl));
    if (e.type === "in") {
      income += v;
      inc.set(e.categoryId, (inc.get(e.categoryId) ?? 0) + v);
    } else {
      expense += v;
      exp.set(e.categoryId, (exp.get(e.categoryId) ?? 0) + v);
    }
  }
  return { income, expense, result: income - expense, expenses: toSlices(exp, state.categories), incomes: toSlices(inc, state.categories) };
}

export const entriesIn = (state: State, range: Range) => state.entries.filter((e) => inRange(e.date, range));

export type CashLine = {
  account: Account;
  /** Saldo na moeda da conta: saldo do dia 01 do mês + entradas − saídas do mês até `asOf`. */
  value: number;
  valueBrl: number;
  /** Se você já informou o saldo do dia 01 desse mês; senão o mês começa do zero. */
  informed: boolean;
};

/** Saldo de uma conta em `asOf`: parte do saldo informado para o dia 01 do mês de `asOf` e soma os lançamentos do mês até essa data. */
export function accountCash(state: State, account: Account, asOf: string): CashLine {
  const month = asOf.slice(0, 7);
  const first = startOfMonth(asOf);
  const informed = account.openings?.[month] !== undefined;
  // Entrada soma, saída subtrai; transferência subtrai da origem e soma no destino.
  const flow = state.entries
    .filter((e) => e.date >= first && e.date <= asOf && (e.accountId === account.id || e.toAccountId === account.id))
    .reduce((sum, e) => {
      if (e.type === "transfer") return sum + (e.toAccountId === account.id ? e.toAmount ?? e.amount : 0) - (e.accountId === account.id ? e.amount : 0);
      return sum + (e.type === "in" ? e.amount : -e.amount);
    }, 0);
  const value = (account.openings?.[month] ?? 0) + flow;
  return { account, value, valueBrl: account.currency === "USD" ? value * state.usdBrl : value, informed };
}

/** Saldo do caixa em `asOf`: soma das contas (mês de `asOf`). */
export function cashBalance(state: State, asOf: string): { total: number; lines: CashLine[]; missing: Account[] } {
  const lines = state.accounts.map((a) => accountCash(state, a, asOf));
  return { total: lines.reduce((s, l) => s + l.valueBrl, 0), lines, missing: lines.filter((l) => !l.informed).map((l) => l.account) };
}

export type MonthPoint = { month: string; label: string; income: number; expense: number };

/** Entradas e saídas (em BRL) de cada mês de janeiro até o último mês com lançamentos do ano. */
export function monthlySeries(state: State, year: string, lastMonth: string): MonthPoint[] {
  const byMonth = new Map<string, { income: number; expense: number }>();
  for (const e of state.entries) {
    if (!e.date.startsWith(year) || e.type === "transfer") continue;
    const v = Math.abs(signedBrl(e, state.accounts, state.usdBrl));
    const key = e.date.slice(0, 7);
    const m = byMonth.get(key) ?? { income: 0, expense: 0 };
    if (e.type === "in") m.income += v;
    else m.expense += v;
    byMonth.set(key, m);
  }
  const lastIdx = Math.max(Number(lastMonth.slice(5, 7)), ...[...byMonth.keys()].map((k) => Number(k.slice(5, 7))));
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return Array.from({ length: lastIdx }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    return { month, label: names[i], ...(byMonth.get(month) ?? { income: 0, expense: 0 }) };
  });
}
