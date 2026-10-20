"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseStatement, type StatementBalance } from "./parse";
import type { ParsedRow } from "./types";

/** Credenciais ficam só neste aparelho (fora do backup). */
const KEY = "financeiro:banks";

export type BankConfig = {
  mpToken: string;
  /** Conta do app que recebe os lançamentos do Mercado Pago. */
  mpAccountId: string;
  pluggyClientId: string;
  pluggyClientSecret: string;
  pluggyItemIds: string;
  /** conta do Pluggy → conta do app ("" = ignorar). */
  pluggyMap: Record<string, string>;
};

export const DEFAULT_BANKS: BankConfig = {
  mpToken: "",
  mpAccountId: "mp-conta",
  pluggyClientId: "",
  pluggyClientSecret: "",
  pluggyItemIds: "",
  pluggyMap: {},
};

export type PluggyAccount = { id: string; itemId: string; type: string; name: string; number?: string; currency?: string };

export function useBankConfig() {
  const [config, setConfig] = useState<BankConfig>(DEFAULT_BANKS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setConfig({ ...DEFAULT_BANKS, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);
  const update = useCallback((patch: Partial<BankConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  return { config, update };
}

export type SyncStatus =
  | { phase: "idle" }
  | { phase: "running"; message: string }
  | { phase: "done"; message: string }
  | { phase: "error"; message: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error ?? `Erro ${r.status}`);
  return data as T;
}

/** Janela de 60 dias (limite do relatório do Mercado Pago). */
export function syncWindow() {
  const end = new Date();
  const begin = new Date(end.getTime() - 59 * 86_400_000);
  return { begin: iso(begin), end: iso(end) };
}

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Resume o que o relatório trouxe, para você ver na hora se faltam gastos. */
function describeReport(rows: ParsedRow[], balance?: StatementBalance, opening?: StatementBalance): string {
  if (!rows.length) return `Mercado Pago: o relatório veio sem nenhum lançamento nos últimos 60 dias.${balance ? ` Saldo disponível: ${money.format(balance.value)}.` : ""}`;
  const inc = rows.filter((r) => r.amount > 0);
  const exp = rows.filter((r) => r.amount < 0);
  const types = new Map<string, number>();
  for (const r of rows) {
    const k = r.description.split(" - ")[0].slice(0, 22).toLowerCase();
    types.set(k, (types.get(k) ?? 0) + 1);
  }
  const top = [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} ×${n}`).join(", ");
  let msg = `Mercado Pago: ${rows.length} lançamentos (${inc.length} entradas ${money.format(inc.reduce((s, r) => s + r.amount, 0))}, ${exp.length} saídas ${money.format(-exp.reduce((s, r) => s + r.amount, 0))}). Tipos: ${top}.`;
  if (balance) {
    msg += ` Saldo disponível calculado: ${money.format(balance.value)}${opening ? ` (saldo inicial do relatório ${money.format(opening.value)} + movimentos)` : ""}. Se não bater com o app do Mercado Pago, ajuste em Ajustes › Contas.`;
  } else {
    msg += " O relatório não trouxe saldo: informe o saldo atual em Ajustes › Contas.";
  }
  if (!exp.length) {
    msg += " Nenhuma saída veio: o relatório de Liberações do Mercado Pago costuma trazer só vendas e saques, e pode não incluir Pix pago e compras no cartão. Para esses gastos, importe o extrato exportado do app do Mercado Pago.";
  }
  return msg;
}

export async function fetchMercadoPago(token: string, onStep: (m: string) => void): Promise<{ rows: ParsedRow[]; balance?: StatementBalance; note: string }> {
  const { begin, end } = syncWindow();
  onStep("Mercado Pago: pedindo o relatório…");
  const created = await post<{ known?: string[] }>("/api/mercadopago", { token, action: "create", begin: `${begin}T00:00:00Z`, end: `${end}T23:59:59Z` });
  const known = created.known ?? [];
  for (let i = 0; i < 24; i++) {
    onStep(`Mercado Pago: gerando relatório… (${i * 5}s)`);
    await sleep(i === 0 ? 2500 : 5000);
    // Só aceita o relatório NOVO; depois de ~40 s sem novidade, aceita o mais recente que existir.
    const r = await post<{ ready: boolean; csv?: string }>("/api/mercadopago", { token, action: "fetch", known, fallback: i >= 8 });
    if (r.ready && r.csv) {
      const { rows, balance: raw, opening } = parseStatement(r.csv, "mercadopago.csv", false);
      // A janela do relatório termina hoje: o saldo calculado vale para hoje.
      const balance = raw ? { value: raw.value, date: end } : undefined;
      return { rows, balance, note: describeReport(rows, balance, opening) };
    }
  }
  throw new Error("O Mercado Pago ainda está gerando o relatório. Tente sincronizar de novo em alguns minutos.");
}

export async function fetchPluggyAccounts(cfg: BankConfig): Promise<PluggyAccount[]> {
  const itemIds = cfg.pluggyItemIds.split(/[\s,;]+/).filter(Boolean);
  if (!itemIds.length) throw new Error("Cole ao menos um Item ID.");
  const r = await post<{ accounts: PluggyAccount[] }>("/api/pluggy", {
    action: "accounts",
    clientId: cfg.pluggyClientId,
    clientSecret: cfg.pluggyClientSecret,
    itemIds,
  });
  return r.accounts;
}

export async function fetchPluggy(cfg: BankConfig, onStep: (m: string) => void): Promise<{ accountId: string; rows: ParsedRow[]; balance?: StatementBalance }[]> {
  const mapped = Object.entries(cfg.pluggyMap).filter(([, app]) => app);
  if (!mapped.length) return [];
  onStep("Open Finance: buscando lançamentos…");
  const { begin, end } = syncWindow();
  const r = await post<{ transactions: { accountId: string; date: string; description: string; amount: number }[]; balances?: Record<string, number> }>("/api/pluggy", {
    action: "transactions",
    clientId: cfg.pluggyClientId,
    clientSecret: cfg.pluggyClientSecret,
    accountIds: mapped.map(([id]) => id),
    from: begin,
    to: end,
  });
  const today = iso(new Date());
  return mapped.map(([pluggyId, appId]) => ({
    accountId: appId,
    balance: typeof r.balances?.[pluggyId] === "number" ? { value: r.balances[pluggyId], date: today } : undefined,
    rows: r.transactions
      .filter((t) => t.accountId === pluggyId)
      .map((t) => ({ date: t.date.slice(0, 10), description: t.description, amount: t.amount })),
  }));
}

/** Sincroniza tudo que estiver configurado; cada fonte falha sem derrubar a outra. */
export function useBankSync(config: BankConfig, onRows: (accountId: string, rows: ParsedRow[], source: string, balance?: StatementBalance) => void) {
  const [status, setStatus] = useState<SyncStatus>({ phase: "idle" });
  const busy = useRef(false);

  const sync = useCallback(async () => {
    if (busy.current) return;
    const hasMp = !!config.mpToken;
    const hasPluggy = !!(config.pluggyClientId && config.pluggyClientSecret && Object.values(config.pluggyMap).some(Boolean));
    if (!hasMp && !hasPluggy) {
      setStatus({ phase: "error", message: "Nenhum banco conectado. Configure em Ajustes › Conectar banco." });
      return;
    }
    busy.current = true;
    const problems: string[] = [];
    const notes: string[] = [];
    let count = 0;
    const step = (message: string) => setStatus({ phase: "running", message });
    try {
      if (hasMp) {
        try {
          const { rows, balance, note } = await fetchMercadoPago(config.mpToken, step);
          onRows(config.mpAccountId, rows, "Mercado Pago · sincronização", balance);
          count += rows.length;
          notes.push(note);
        } catch (e) {
          problems.push(e instanceof Error ? e.message : "Falha no Mercado Pago.");
        }
      }
      if (hasPluggy) {
        try {
          for (const g of await fetchPluggy(config, step)) {
            onRows(g.accountId, g.rows, "Open Finance · sincronização", g.balance);
            count += g.rows.length;
          }
        } catch (e) {
          problems.push(e instanceof Error ? e.message : "Falha no Open Finance.");
        }
      }
      setStatus(
        problems.length
          ? { phase: "error", message: problems.join(" ") + (count ? ` (${count} lançamentos foram lidos)` : "") }
          : { phase: "done", message: notes.length ? notes.join(" ") : `${count} lançamentos lidos dos bancos.` },
      );
    } finally {
      busy.current = false;
    }
  }, [config, onRows]);

  const dismiss = useCallback(() => setStatus({ phase: "idle" }), []);
  return { status, sync, dismiss, hasAny: !!config.mpToken || Object.values(config.pluggyMap).some(Boolean) };
}
