import type { Account, Category, State, Tx } from "./types";

export const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function toBrl(tx: Tx, accounts: Account[], usdBrl: number): number {
  const acc = accounts.find((a) => a.id === tx.accountId);
  return acc?.currency === "USD" ? tx.amount * usdBrl : tx.amount;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export type Slice = { id: string; name: string; color: string; value: number; pct: number };

export type Summary = { income: number; expense: number; balance: number; expenses: Slice[]; incomes: Slice[] };

const OTHERS_COLOR = "#64748B";
const MAX_SLICES = 6;

function toSlices(totals: Map<string, number>, categories: Category[]): Slice[] {
  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  if (sum <= 0) return [];
  const sorted = [...totals.entries()]
    .map(([id, value]) => {
      const c = categories.find((x) => x.id === id);
      return { id, name: c?.name ?? "Outros", color: c?.color ?? OTHERS_COLOR, value, pct: (value / sum) * 100 };
    })
    .sort((a, b) => b.value - a.value);
  if (sorted.length <= MAX_SLICES) return sorted;
  const head = sorted.slice(0, MAX_SLICES - 1);
  const rest = sorted.slice(MAX_SLICES - 1);
  const value = rest.reduce((a, s) => a + s.value, 0);
  return [...head, { id: "__rest", name: "Demais categorias", color: OTHERS_COLOR, value, pct: (value / sum) * 100 }];
}

export function summarize(txs: Tx[], state: State): Summary {
  const ignored = new Set(state.categories.filter((c) => c.ignore).map((c) => c.id));
  const exp = new Map<string, number>();
  const inc = new Map<string, number>();
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (ignored.has(t.categoryId)) continue;
    const v = toBrl(t, state.accounts, state.usdBrl);
    if (v < 0) {
      expense += -v;
      exp.set(t.categoryId, (exp.get(t.categoryId) ?? 0) - v);
    } else {
      income += v;
      inc.set(t.categoryId, (inc.get(t.categoryId) ?? 0) + v);
    }
  }
  return {
    income,
    expense,
    balance: income - expense,
    expenses: toSlices(exp, state.categories),
    incomes: toSlices(inc, state.categories),
  };
}

export type MonthPoint = { month: string; label: string; income: number; expense: number };

/** Entradas e saídas (em BRL) de cada mês de janeiro até o último mês com dados do ano, como no gráfico de linhas. */
export function monthlySeries(state: State, year: string, accountId: string, lastMonth: string): MonthPoint[] {
  const ignored = new Set(state.categories.filter((c) => c.ignore).map((c) => c.id));
  const byMonth = new Map<string, { income: number; expense: number }>();
  for (const t of state.transactions) {
    if (!t.date.startsWith(year) || (accountId !== "all" && t.accountId !== accountId) || ignored.has(t.categoryId)) continue;
    const v = toBrl(t, state.accounts, state.usdBrl);
    const m = byMonth.get(monthOf(t.date)) ?? { income: 0, expense: 0 };
    if (v < 0) m.expense += -v;
    else m.income += v;
    byMonth.set(monthOf(t.date), m);
  }
  const lastIdx = Math.max(Number(lastMonth.slice(5, 7)), ...[...byMonth.keys()].map((k) => Number(k.slice(5, 7))));
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return Array.from({ length: lastIdx }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    const v = byMonth.get(month) ?? { income: 0, expense: 0 };
    return { month, label: names[i], ...v };
  });
}

export type CashLine = { account: Account; /** na moeda da conta */ value: number; valueBrl: number; asOf: string };

/**
 * Saldo do caixa: soma só de contas com saldo REAL (do extrato/banco ou informado por você) mais os lançamentos posteriores a ele.
 * Contas sem saldo ficam de fora (`missing`): somar lançamentos soltos não é saldo, pois não sabemos quanto havia antes.
 * Cartões não entram (são dívida, não caixa). `accountId` restringe a uma conta.
 */
export function cashBalance(state: State, accountId = "all"): { total: number; lines: CashLine[]; missing: Account[] } {
  const lines: CashLine[] = [];
  const missing: Account[] = [];
  for (const account of state.accounts) {
    if (account.card || (accountId !== "all" && account.id !== accountId)) continue;
    if (!account.balance) {
      missing.push(account);
      continue;
    }
    const after = state.transactions.filter((t) => t.accountId === account.id && t.date > account.balance!.date);
    const value = account.balance.value + after.reduce((sum, t) => sum + t.amount, 0);
    lines.push({ account, value, valueBrl: account.currency === "USD" ? value * state.usdBrl : value, asOf: account.balance.date });
  }
  return { total: lines.reduce((sum, l) => sum + l.valueBrl, 0), lines, missing };
}
