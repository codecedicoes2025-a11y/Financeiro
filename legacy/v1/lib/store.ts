"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, FALLBACK_CATEGORY, categorize, makeKey, normalize } from "./categories";
import { aiKey } from "./gemini";
import type { Account, Category, ImportRecord, Owner, ParsedRow, State, Tx } from "./types";
import type { StatementBalance } from "./parse";

const KEY = "financeiro:v1";

export const INITIAL: State = {
  accounts: DEFAULT_ACCOUNTS,
  transactions: [],
  categories: DEFAULT_CATEGORIES,
  rules: [],
  usdBrl: 5.5,
  aiCache: {},
  rateAuto: true,
  imports: [],
};

type Action =
  | { type: "load"; state: State }
  | { type: "applyAi"; updates: { key: string; categoryId: string }[]; newCategories: Category[] }
  | { type: "import"; accountId: string; rows: ParsedRow[]; source: string; balance?: StatementBalance }
  | { type: "deleteImport"; importId: string }
  | { type: "setBalance"; accountId: string; value: number }
  | { type: "clearData" }
  | { type: "setOwner"; id: string; owner: Owner }
  | { type: "clearBalance"; accountId: string }
  | { type: "setCategory"; txId: string; categoryId: string; applySimilar: boolean }
  | { type: "deleteTx"; txId: string }
  | { type: "addAccount"; account: Account }
  | { type: "removeAccount"; id: string }
  | { type: "addCategory"; category: Category }
  | { type: "updateCategory"; category: Category }
  | { type: "removeCategory"; id: string }
  | { type: "setRate"; value: number }
  | { type: "setLiveRate"; value: number; at: string }
  | { type: "setRateAuto"; value: boolean };

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Regras (suas e padrão) primeiro; depois o que a IA já aprendeu; senão "Outros". */
function categorizeKnown(description: string, state: State): string {
  const byRules = categorize(description, state.rules);
  if (byRules !== FALLBACK_CATEGORY) return byRules;
  const cached = state.aiCache[aiKey(description)];
  return cached && state.categories.some((c) => c.id === cached) ? cached : FALLBACK_CATEGORY;
}

const MIGRATION = 2;

/** Ajusta dados salvos por versões anteriores. v2: saques para bancos fora do app passam a contar como saída. */
export function migrate(s: State): State {
  if ((s.migration ?? 0) >= MIGRATION) return s;
  const saques = DEFAULT_CATEGORIES.find((c) => c.id === "saques")!;
  const categories = s.categories.some((c) => c.id === "saques") ? s.categories : [...s.categories, saques];
  const transactions = s.transactions.map((t) =>
    !t.manual && t.categoryId === "transferencias" && /withdraw|transfer to bank|saque/i.test(t.description) ? { ...t, categoryId: "saques" } : t,
  );
  return { ...s, categories, transactions, migration: MIGRATION };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "load":
      return action.state;
    case "import": {
      const seen = new Map<string, number>();
      const known = new Set(state.transactions.map((t) => t.id));
      const importId = `imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const added: Tx[] = [];
      let skipped = 0;
      for (const row of action.rows) {
        const base = `${action.accountId}|${row.date}|${row.description}|${row.amount}`;
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        const id = hash(`${base}|${n}`);
        if (known.has(id)) {
          skipped++;
          continue;
        }
        added.push({
          id,
          accountId: action.accountId,
          date: row.date,
          description: row.description,
          amount: row.amount,
          categoryId: categorizeKnown(row.description, state),
          importId,
        });
      }
      // Saldo informado no extrato: vale se for mais recente que o que já temos.
      const accounts = action.balance
        ? state.accounts.map((a) =>
            a.id === action.accountId && (!a.balance || (a.balance.manual ? action.balance!.date > a.balance.date : action.balance!.date >= a.balance.date))
              ? { ...a, balance: { value: action.balance!.value, date: action.balance!.date, importId: added.length ? importId : a.balance?.importId } }
              : a,
          )
        : state.accounts;
      // Nada novo (arquivo já importado): só atualiza o saldo, sem criar item no histórico.
      if (!added.length) return accounts === state.accounts ? state : { ...state, accounts };
      const dates = added.map((t) => t.date).sort();
      const record: ImportRecord = {
        id: importId,
        accountId: action.accountId,
        source: action.source,
        at: new Date().toISOString(),
        added: added.length,
        skipped,
        income: added.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0),
        expense: added.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0),
        from: dates[0] ?? "",
        to: dates[dates.length - 1] ?? "",
      };
      return {
        ...state,
        accounts,
        transactions: [...state.transactions, ...added],
        imports: [record, ...(state.imports ?? [])],
      };
    }
    case "deleteImport":
      return {
        ...state,
        transactions: state.transactions.filter((t) => t.importId !== action.importId),
        imports: (state.imports ?? []).filter((i) => i.id !== action.importId),
        accounts: state.accounts.map((a) => (a.balance?.importId === action.importId ? { ...a, balance: undefined } : a)),
      };
    case "clearBalance":
      return { ...state, accounts: state.accounts.map((a) => (a.id === action.accountId ? { ...a, balance: undefined } : a)) };
    case "setOwner":
      return { ...state, accounts: state.accounts.map((a) => (a.id === action.id ? { ...a, owner: action.owner } : a)) };
    case "clearData":
      // Apaga lançamentos, importações, saldos e o que a IA aprendeu. Contas, categorias e regras ficam.
      return {
        ...state,
        transactions: [],
        imports: [],
        aiCache: {},
        accounts: state.accounts.map((a) => ({ ...a, balance: undefined })),
      };
    case "setBalance":
      return {
        ...state,
        accounts: state.accounts.map((a) =>
          a.id === action.accountId ? { ...a, balance: { value: action.value, date: new Date().toISOString().slice(0, 10), manual: true } } : a,
        ),
      };
    case "applyAi": {
      const byKey = new Map(action.updates.map((u) => [u.key, u.categoryId]));
      const aiCache = { ...state.aiCache };
      for (const u of action.updates) aiCache[u.key] = u.categoryId;
      const transactions = state.transactions.map((t) => {
        if (t.manual || t.categoryId !== FALLBACK_CATEGORY) return t;
        const cat = byKey.get(aiKey(t.description));
        return cat ? { ...t, categoryId: cat } : t;
      });
      return { ...state, transactions, aiCache, categories: [...state.categories, ...action.newCategories] };
    }
    case "setCategory": {
      const target = state.transactions.find((t) => t.id === action.txId);
      if (!target) return state;
      let rules = state.rules;
      const key = makeKey(target.description);
      if (action.applySimilar && key) {
        rules = [...rules.filter((r) => r.key !== key), { key, categoryId: action.categoryId }];
      }
      const transactions = state.transactions.map((t) => {
        if (t.id === action.txId) return { ...t, categoryId: action.categoryId, manual: true };
        if (action.applySimilar && key && !t.manual && normalize(t.description).includes(key)) {
          return { ...t, categoryId: action.categoryId };
        }
        return t;
      });
      return { ...state, transactions, rules };
    }
    case "deleteTx":
      return { ...state, transactions: state.transactions.filter((t) => t.id !== action.txId) };
    case "addAccount":
      return { ...state, accounts: [...state.accounts, action.account] };
    case "removeAccount":
      return {
        ...state,
        accounts: state.accounts.filter((a) => a.id !== action.id),
        transactions: state.transactions.filter((t) => t.accountId !== action.id),
        imports: (state.imports ?? []).filter((i) => i.accountId !== action.id),
      };
    case "addCategory":
      return { ...state, categories: [...state.categories, action.category] };
    case "updateCategory":
      return { ...state, categories: state.categories.map((c) => (c.id === action.category.id ? action.category : c)) };
    case "removeCategory":
      return {
        ...state,
        categories: state.categories.filter((c) => c.id !== action.id),
        rules: state.rules.filter((r) => r.categoryId !== action.id),
        aiCache: Object.fromEntries(Object.entries(state.aiCache).filter(([, id]) => id !== action.id)),
        transactions: state.transactions.map((t) => (t.categoryId === action.id ? { ...t, categoryId: "outros" } : t)),
      };
    case "setRate":
      return { ...state, usdBrl: action.value, rateAuto: false };
    case "setLiveRate":
      return { ...state, usdBrl: action.value, rateAt: action.at };
    case "setRateAuto":
      return { ...state, rateAuto: action.value };
  }
}

export function useFinanceStore() {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) dispatch({ type: "load", state: migrate({ ...INITIAL, ...JSON.parse(raw) }) });
    } catch {
      /* armazenamento indisponível: segue com estado vazio */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, ready]);

  const replaceAll = useCallback((next: State) => dispatch({ type: "load", state: migrate({ ...INITIAL, ...next }) }), []);
  return { state, dispatch, ready, replaceAll };
}
