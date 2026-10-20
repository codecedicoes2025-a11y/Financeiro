import { defaultCategories, FALLBACK } from "./categories";
import type { Account, Book, Category, Entry, ImportRecord, Root, State, Workspace } from "./types";

/** Armazenamento local. v3 = dois livros (PF e PJ). v2 = formato anterior, de um livro só, lido uma vez para migrar. */
export const KEY_V3 = "financeiro:v3";
const KEY_V2 = "financeiro:v2";

export type Action =
  | { type: "addEntry"; entry: Entry }
  | { type: "updateEntry"; entry: Entry }
  | { type: "deleteEntry"; id: string }
  | { type: "addAccount"; account: Account }
  | { type: "updateAccount"; id: string; patch: Partial<Pick<Account, "name">> }
  | { type: "setOpening"; accountId: string; month: string; value: number | null }
  | { type: "removeAccount"; id: string }
  | { type: "addCategory"; category: Category }
  | { type: "updateCategory"; category: Category }
  | { type: "removeCategory"; id: string }
  | { type: "setRate"; value: number }
  | { type: "setLiveRate"; value: number; at: string }
  | { type: "setRateAuto"; value: boolean }
  | { type: "importEntries"; record: ImportRecord; entries: Entry[]; removeIds?: string[] }
  | { type: "setNames"; names: string[] }
  | { type: "deleteImport"; id: string }
  | { type: "clearEntries" };

/** Reducer de UM livro (a visão `State` = livro + dados compartilhados). */
export function bookReducer(state: State, a: Action): State {
  switch (a.type) {
    case "addEntry":
      return { ...state, entries: [a.entry, ...state.entries] };
    case "updateEntry":
      return { ...state, entries: state.entries.map((e) => (e.id === a.entry.id ? a.entry : e)) };
    case "deleteEntry":
      return { ...state, entries: state.entries.filter((e) => e.id !== a.id) };
    case "addAccount":
      return { ...state, accounts: [...state.accounts, a.account] };
    case "setOpening":
      return {
        ...state,
        accounts: state.accounts.map((x) => {
          if (x.id !== a.accountId) return x;
          const openings = { ...(x.openings ?? {}) };
          if (a.value === null) delete openings[a.month];
          else openings[a.month] = a.value;
          return { ...x, openings };
        }),
      };
    case "updateAccount":
      return { ...state, accounts: state.accounts.map((x) => (x.id === a.id ? { ...x, ...a.patch } : x)) };
    case "removeAccount":
      // Só remove conta sem lançamentos (a interface já impede o contrário).
      return state.entries.some((e) => e.accountId === a.id || e.toAccountId === a.id) ? state : { ...state, accounts: state.accounts.filter((x) => x.id !== a.id) };
    case "addCategory":
      return { ...state, categories: [...state.categories, a.category] };
    case "updateCategory":
      return { ...state, categories: state.categories.map((c) => (c.id === a.category.id ? a.category : c)) };
    case "removeCategory": {
      const gone = state.categories.find((c) => c.id === a.id);
      if (!gone || a.id === FALLBACK[gone.kind]) return state;
      return {
        ...state,
        categories: state.categories.filter((c) => c.id !== a.id),
        entries: state.entries.map((e) => (e.categoryId === a.id ? { ...e, categoryId: FALLBACK[gone.kind] } : e)),
      };
    }
    case "setRate":
      return { ...state, usdBrl: a.value, rateAuto: false };
    case "setLiveRate":
      return { ...state, usdBrl: a.value, rateAt: a.at };
    case "setRateAuto":
      return { ...state, rateAuto: a.value };
    case "importEntries":
      return {
        ...state,
        entries: [...a.entries, ...state.entries.filter((e) => !a.removeIds?.includes(e.id))],
        imports: [a.record, ...(state.imports ?? [])],
      };
    case "setNames":
      return { ...state, myNames: a.names };
    case "deleteImport":
      return { ...state, entries: state.entries.filter((e) => e.importId !== a.id), imports: (state.imports ?? []).filter((i) => i.id !== a.id) };
    case "clearEntries":
      return { ...state, entries: [], imports: [] };
  }
}

/* ---------------- Dois livros ---------------- */

export const emptyBook = (ws: Workspace): Book => ({ accounts: [], categories: defaultCategories(ws), entries: [], imports: [] });
export const initialRoot = (): Root => ({ pf: emptyBook("pf"), pj: emptyBook("pj"), usdBrl: 5.5, rateAuto: true, myNames: [] });

/** O livro escolhido + dados compartilhados, no formato que as telas já usam. */
export function viewOf(root: Root, ws: Workspace): State {
  const b = root[ws];
  return { accounts: b.accounts, categories: b.categories, entries: b.entries, imports: b.imports, usdBrl: root.usdBrl, rateAuto: root.rateAuto, rateAt: root.rateAt, myNames: root.myNames };
}

/** Visão "PF + PJ": contas e lançamentos dos dois livros juntos (cada conta marcada com o livro de origem). Só para leitura. */
export function combineBooks(root: Root): State {
  const tag = (ws: Workspace) => root[ws].accounts.map((a) => ({ ...a, ws }));
  const seen = new Set<string>();
  const categories: Category[] = [];
  for (const c of [...root.pf.categories, ...root.pj.categories]) {
    // Categorias com o mesmo id (ex.: "Outros") se somam; custom de cada livro aparecem cada uma.
    if (!seen.has(c.id)) {
      seen.add(c.id);
      categories.push(c);
    }
  }
  return {
    accounts: [...tag("pf"), ...tag("pj")],
    categories,
    entries: [...root.pf.entries, ...root.pj.entries],
    imports: [],
    usdBrl: root.usdBrl,
    rateAuto: root.rateAuto,
    rateAt: root.rateAt,
    myNames: root.myNames,
  };
}

const SHARED = new Set<Action["type"]>(["setRate", "setLiveRate", "setRateAuto", "setNames"]);

export type RootAction = { type: "load"; root: Root } | { type: "scoped"; ws: Workspace; action: Action };

export function rootReducer(root: Root, ra: RootAction): Root {
  if (ra.type === "load") return ra.root;
  const next = bookReducer(viewOf(root, ra.ws), ra.action);
  if (SHARED.has(ra.action.type)) return { ...root, usdBrl: next.usdBrl, rateAuto: next.rateAuto, rateAt: next.rateAt, myNames: next.myNames };
  return { ...root, [ra.ws]: { accounts: next.accounts, categories: next.categories, entries: next.entries, imports: next.imports } };
}

/* ---------------- Leitura segura (backup, nuvem, formato antigo) ---------------- */

type LegacyAccount = Account & { owner?: string; opening?: { value: number; date: string } };
type LegacyEntry = Entry & { owner?: string };
type RawBook = Partial<Omit<Book, "entries" | "accounts">> & { entries?: LegacyEntry[]; accounts?: LegacyAccount[] };

function normalizeBook(raw: RawBook | undefined, ws: Workspace): Book {
  const accounts = (Array.isArray(raw?.accounts) ? raw!.accounts! : []).map((a) => {
    const { owner: _o, opening, ...rest } = a;
    void _o;
    const openings = { ...(rest.openings ?? {}) };
    // Saldo único antigo vira o saldo do mês da data dele.
    if (opening && /^\d{4}-\d{2}-\d{2}$/.test(opening.date) && opening.date !== "2000-01-01" && openings[opening.date.slice(0, 7)] === undefined) {
      openings[opening.date.slice(0, 7)] = opening.value;
    }
    const { ws: _ws, ...clean } = rest as Account;
    void _ws;
    return { ...clean, openings } as Account;
  });
  const entries = (Array.isArray(raw?.entries) ? raw!.entries! : []).map((e) => {
    const { owner: _legacy, ...rest } = e;
    void _legacy;
    return rest as Entry;
  });
  return {
    accounts,
    entries,
    imports: Array.isArray(raw?.imports) ? raw!.imports! : [],
    categories: Array.isArray(raw?.categories) && raw!.categories!.length ? raw!.categories! : defaultCategories(ws),
  };
}

type Shared = { usdBrl?: number; rateAuto?: boolean; rateAt?: string; myNames?: string[] };

/**
 * Aceita o formato atual (dois livros) e o anterior (um livro só, que vira o livro PF).
 * Qualquer coisa que faltar é completada.
 */
export function normalizeRoot(raw: unknown): Root {
  const base = initialRoot();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Shared & { pf?: RawBook; pj?: RawBook } & RawBook;
  const twoBooks = !!r.pf || !!r.pj;
  return {
    pf: normalizeBook(twoBooks ? r.pf : r, "pf"),
    pj: normalizeBook(twoBooks ? r.pj : undefined, "pj"),
    usdBrl: typeof r.usdBrl === "number" && r.usdBrl > 0 ? r.usdBrl : base.usdBrl,
    rateAuto: typeof r.rateAuto === "boolean" ? r.rateAuto : base.rateAuto,
    rateAt: r.rateAt,
    myNames: Array.isArray(r.myNames) ? r.myNames : [],
  };
}

export const hasData = (root: Root) => ["pf", "pj"].some((k) => root[k as Workspace].entries.length > 0 || root[k as Workspace].accounts.length > 0);

export function loadLocalRoot(): Root | null {
  try {
    const v3 = localStorage.getItem(KEY_V3);
    if (v3) return normalizeRoot(JSON.parse(v3));
    const v2 = localStorage.getItem(KEY_V2);
    if (v2) return normalizeRoot(JSON.parse(v2));
  } catch {
    /* armazenamento indisponível ou corrompido */
  }
  return null;
}

export function saveLocalRoot(root: Root) {
  try {
    localStorage.setItem(KEY_V3, JSON.stringify(root));
  } catch {
    /* ignore */
  }
}
