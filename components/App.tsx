"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type Dispatch } from "react";
import { fmtBR, presetRange, startOfMonth, today, type Range } from "@/lib/dates";
import { fmtMoney, uid } from "@/lib/money";
import { brl, cashBalance, entriesIn, monthlySeries, signedBrl, summarize } from "@/lib/stats";
import { combineBooks, viewOf, type Action, type RootAction } from "@/lib/store";
import type { Currency, Entry, EntryType, Root, Workspace } from "@/lib/types";
import { useLiveRate } from "@/lib/useLiveRate";
import { AnimatedNumber } from "./AnimatedNumber";
import { EntryDialog } from "./EntryDialog";
import { EntryForm } from "./EntryForm";
import { Icon, type IconName } from "./Icon";
import { PeriodPicker } from "./PeriodPicker";
import { PiePanel } from "./PiePanel";
import { SettingsPanel, type AccountInfo } from "./SettingsPanel";
import { TrendChart } from "./TrendChart";

type Tab = "resumo" | "lancamentos" | "ajustes";

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "resumo", label: "Resumo", icon: "home" },
  { id: "lancamentos", label: "Lançamentos", icon: "list" },
  { id: "ajustes", label: "Ajustes", icon: "settings" },
];

const fmtBrl = (n: number) => brl.format(n);

const monthName = (iso: string) => {
  const s = new Date(`${iso.slice(0, 7)}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export type AppProps = {
  root: Root;
  dispatchRoot: Dispatch<RootAction>;
  /** Livro aberto: finanças pessoais (PF) ou da empresa (PJ). */
  ws: Workspace;
  onSwitchWorkspace: () => void;
  onRestore: (raw: unknown) => void;
  account: AccountInfo;
};

const WS_LABEL: Record<Workspace, string> = { pf: "Finanças PF", pj: "Finanças PJ" };

export default function App({ root, dispatchRoot, ws, onSwitchWorkspace, onRestore, account }: AppProps) {
  // As telas trabalham com UM livro por vez (o aberto); as ações vão para ele.
  const state = useMemo(() => viewOf(root, ws), [root, ws]);
  const dispatch = useCallback((a: Action) => dispatchRoot({ type: "scoped", ws, action: a }), [dispatchRoot, ws]);
  const rate = useLiveRate(state.rateAuto, dispatch);

  // Só no PF: o Resumo pode mostrar "Só PF" ou "PF + PJ" (caixas somados).
  const [scope, setScopeState] = useState<"only" | "both">("only");
  useEffect(() => {
    try {
      if (localStorage.getItem("financeiro:scope") === "both") setScopeState("both");
    } catch {
      /* ignore */
    }
  }, []);
  const setScope = useCallback((v: "only" | "both") => {
    setScopeState(v);
    try {
      localStorage.setItem("financeiro:scope", v);
    } catch {
      /* ignore */
    }
  }, []);
  const both = ws === "pf" && scope === "both";
  const resumo = useMemo(() => (both ? combineBooks(root) : state), [both, root, state]);

  const [tab, setTab] = useState<Tab>("resumo");
  const [range, setRange] = useState<Range>(() => presetRange("month"));
  const [accountFilter, setAccountFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);

  // Virada de mês: se o período é "Este mês" e o mês mudou (app aberto de um dia para o outro), recomeça no mês novo.
  useEffect(() => {
    const roll = () => setRange((r) => (r.preset === "month" && r.from !== startOfMonth(today()) ? presetRange("month") : r));
    const id = setInterval(roll, 60_000);
    document.addEventListener("visibilitychange", roll);
    window.addEventListener("focus", roll);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", roll);
      window.removeEventListener("focus", roll);
    };
  }, []);

  const createAccount = useCallback(
    (name: string, currency: Currency) => {
      const id = `a-${uid()}`;
      dispatch({ type: "addAccount", account: { id, name, currency } });
      return id;
    },
    [dispatch],
  );
  const createCategory = useCallback(
    (name: string, color: string, kind: EntryType) => {
      const id = `c-${uid()}`;
      dispatch({ type: "addCategory", category: { id, name, color, kind } });
      return id;
    },
    [dispatch],
  );

  const periodEntries = useMemo(() => entriesIn(state, range), [state, range]);
  const summary = useMemo(() => summarize(entriesIn(resumo, range), resumo), [resumo, range]);

  // Saldo do caixa vale para o fim do período (até hoje, se o período ainda não acabou).
  const t = today();
  const asOf = range.from > t ? range.to : range.to < t ? range.to : t;
  const cash = useMemo(() => cashBalance(resumo, asOf), [resumo, asOf]);

  const year = range.to.slice(0, 4);
  const series = useMemo(() => monthlySeries(resumo, year, range.to.slice(0, 7)), [resumo, year, range.to]);

  const accById = useMemo(() => new Map(state.accounts.map((a) => [a.id, a])), [state.accounts]);
  const catById = useMemo(() => new Map(state.categories.map((c) => [c.id, c])), [state.categories]);

  const listEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return periodEntries
      .filter((e) => accountFilter === "all" || e.accountId === accountFilter)
      .filter((e) => !q || e.description.toLowerCase().includes(q) || (catById.get(e.categoryId)?.name ?? "").toLowerCase().includes(q))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [periodEntries, accountFilter, query, catById]);

  const grouped = useMemo(() => {
    const g = new Map<string, Entry[]>();
    for (const e of listEntries) g.set(e.date, [...(g.get(e.date) ?? []), e]);
    return [...g.entries()];
  }, [listEntries]);

  const tabIndex = TABS.findIndex((x) => x.id === tab);
  const hasUsd = resumo.accounts.some((a) => a.currency === "USD");

  return (
    <>
      <div className="shell">
        <header className="top">
          <div className="top-left">
            <h1>Financeiro</h1>
            <button className={`ws-chip ws-${ws}`} onClick={onSwitchWorkspace} title="Trocar entre Finanças PF e PJ">
              {WS_LABEL[ws]} <span className="muted small">trocar</span>
            </button>
          </div>
          <div className="top-actions">
            {tab !== "lancamentos" && (
              <button className="btn btn-primary" onClick={() => setTab("lancamentos")}>
                <Icon name="plus" size={18} /> Novo lançamento
              </button>
            )}
          </div>
        </header>

        <main key={tab} className="view">
          {tab === "resumo" && (
            <div className="dash">
              <div className="dash-wide stack">
                {ws === "pf" && (
                  <div className="scope-box">
                    <div className="seg" role="group" aria-label="O que mostrar no resumo" style={{ "--n": 2, "--seg-pos": scope === "both" ? 1 : 0 } as CSSProperties}>
                      <span className="seg-thumb" aria-hidden="true" />
                      <button className={scope === "only" ? "on" : ""} aria-pressed={scope === "only"} onClick={() => setScope("only")}>
                        Só PF
                      </button>
                      <button className={scope === "both" ? "on" : ""} aria-pressed={scope === "both"} onClick={() => setScope("both")}>
                        PF + PJ
                      </button>
                    </div>
                    {both && <p className="muted small">Somando os caixas, entradas e saídas de Finanças PF e Finanças PJ. Para lançar ou editar, use cada livro separado.</p>}
                  </div>
                )}
                <PeriodPicker range={range} onChange={setRange} />
              </div>

              <div className="cards">
                <div className="card" style={{ "--i": 0 } as CSSProperties}>
                  <span className="muted small">Entradas</span>
                  <strong className="num pos"><AnimatedNumber value={summary.income} format={fmtBrl} /></strong>
                </div>
                <div className="card" style={{ "--i": 1 } as CSSProperties}>
                  <span className="muted small">Saídas</span>
                  <strong className="num neg"><AnimatedNumber value={summary.expense} format={fmtBrl} /></strong>
                </div>
                <div className="card" style={{ "--i": 2 } as CSSProperties}>
                  <span className="muted small">Resultado do período</span>
                  <strong className={`num ${summary.result >= 0 ? "pos" : "neg"}`}><AnimatedNumber value={summary.result} format={fmtBrl} /></strong>
                </div>
                <div className="card" style={{ "--i": 3 } as CSSProperties}>
                  <span className="muted small">Saldo do caixa</span>
                  <strong className={`num ${cash.total < 0 ? "neg" : ""}`}><AnimatedNumber value={cash.total} format={fmtBrl} /></strong>
                  <span className="card-sub muted small">em {fmtBR(asOf)}</span>
                  {resumo.accounts.length > 0 && cash.missing.length > 0 && !both && (
                    <button className="card-note" onClick={() => setTab("ajustes")}>
                      Informe o saldo de {monthName(asOf)} →
                    </button>
                  )}
                </div>
              </div>

              <section className="panel dash-wide" style={{ "--i": 3.5 } as CSSProperties} aria-labelledby="bal-h">
                <h2 id="bal-h">Saldo do caixa por conta</h2>
                {cash.lines.length === 0 ? (
                  <p className="muted small">Nenhuma conta ainda. Crie em Ajustes ou ao fazer um lançamento.</p>
                ) : (
                  <ul className="plain balances">
                    {cash.lines.map((l) => (
                      <li key={l.account.id} className="bal-row">
                        <span className="bal-name">
                          {l.account.name}
                          {both && l.account.ws && <span className="tag">{l.account.ws.toUpperCase()}</span>}
                          {!l.informed && <span className="muted small"> · saldo do mês não informado</span>}
                        </span>
                        <span className="bal-val">
                          <strong className={`num ${l.value < 0 ? "neg" : ""}`}>{fmtMoney(l.value, l.account.currency)}</strong>
                          {l.account.currency === "USD" && <span className="muted small num">≈ {brl.format(l.valueBrl)}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="muted small">Saldo informado para o dia 01 do mês + entradas − saídas do mês, até {fmtBR(asOf)}. A cada mês recomeça.</p>
              </section>

              <PiePanel title="Para onde vão os gastos" label="Gastos" emptyText="Sem saídas neste período." slices={summary.expenses} total={summary.expense} index={4} />
              <PiePanel title="De onde vêm as entradas" label="Entradas" emptyText="Sem entradas neste período." slices={summary.incomes} total={summary.income} index={5} />

              <section className="panel panel-trend" style={{ "--i": 6 } as CSSProperties} aria-labelledby="trend-h">
                <h2 id="trend-h">Entradas e saídas por mês</h2>
                {resumo.entries.some((e) => e.date.startsWith(year)) ? <TrendChart data={series} year={year} /> : <p className="muted small">Sem lançamentos em {year}.</p>}
              </section>

              {hasUsd && (
                <p className="muted small rate-note dash-wide">
                  <span className={`live-dot ${resumo.rateAuto ? "on" : ""}`} aria-hidden="true" />
                  Dólar: US$ 1 = {resumo.usdBrl.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 4 })}
                  {resumo.rateAuto ? " · ao vivo" : " · manual"}
                </p>
              )}
            </div>
          )}

          {tab === "lancamentos" && (
            <div className="stack">
              <PeriodPicker range={range} onChange={setRange} />

              <div className="cols2 entries-layout">
                <section className="panel" aria-labelledby="new-h">
                  <h2 id="new-h">Novo lançamento</h2>
                  <EntryForm
                    accounts={state.accounts}
                    categories={state.categories}
                    submitLabel="Lançar"
                    onSubmit={(entry) => dispatch({ type: "addEntry", entry })}
                    onCreateAccount={createAccount}
                    onCreateCategory={createCategory}
                  />
                </section>

                <div className="stack">
                  <div className="toolbar">
                    <input className="search" type="search" aria-label="Buscar lançamento" placeholder="Buscar descrição ou categoria…" value={query} onChange={(e) => setQuery(e.target.value)} />
                    {state.accounts.length > 1 && (
                      <select className="filter-select" aria-label="Filtrar por conta" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
                        <option value="all">Todas as contas</option>
                        {state.accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {grouped.length === 0 && <p className="empty muted">Nenhum lançamento neste período.</p>}
                  {grouped.map(([date, items]) => (
                    <section key={date} className="day">
                      <h3 className="small muted">{new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</h3>
                      <ul className="plain panel-lite">
                        {items.map((e) => {
                          const c = catById.get(e.categoryId);
                          const acc = accById.get(e.accountId);
                          const isT = e.type === "transfer";
                          const to = isT ? accById.get(e.toAccountId ?? "") : undefined;
                          const signed = e.type === "in" ? e.amount : -e.amount;
                          return (
                            <li key={e.id}>
                              <button className="tx" onClick={() => setEditing(e)} aria-label={`Editar lançamento ${e.description || c?.name || ""}`}>
                                <span className="tx-main">
                                  <span className="tx-desc">{e.description || (isT ? "Transferência entre contas" : c?.name) || "Lançamento"}</span>
                                  <span className="tx-meta small muted">
                                    {isT ? (
                                      <>
                                        <span className="tag">transferência</span> {acc?.name ?? "Conta"} → {to?.name ?? "Conta"}
                                      </>
                                    ) : (
                                      <>
                                        <span className="dot" style={{ background: c?.color ?? "#94A3B8" }} /> {c?.name ?? "Sem categoria"} · {acc?.name ?? "Conta"}
                                      </>
                                    )}
                                  </span>
                                </span>
                                <span className={`tx-amount num ${isT ? "muted" : e.type === "in" ? "pos" : "neg"}`}>
                                  {isT ? fmtMoney(e.amount, acc?.currency ?? "BRL") : fmtMoney(signed, acc?.currency ?? "BRL")}
                                  {isT && e.toAmount !== undefined && <small className="muted"> → {fmtMoney(e.toAmount, to?.currency ?? "BRL")}</small>}
                                  {!isT && acc?.currency === "USD" && <small className="muted"> ≈ {brl.format(signedBrl(e, state.accounts, state.usdBrl))}</small>}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                  {listEntries.length > 0 && (
                    <p className="muted small">
                      {listEntries.length} lançamento{listEntries.length > 1 ? "s" : ""} de {fmtBR(range.from)} a {fmtBR(range.to)}.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "ajustes" && <SettingsPanel state={state} root={root} ws={ws} dispatch={dispatch} onRestore={onRestore} rate={rate} account={account} />}
        </main>
      </div>

      <nav className="tabbar" aria-label="Seções" style={{ "--n": TABS.length, "--idx": tabIndex } as CSSProperties}>
        <span className="tab-thumb" aria-hidden="true" />
        {TABS.map((x) => (
          <button key={x.id} className={tab === x.id ? "on" : ""} aria-current={tab === x.id ? "page" : undefined} onClick={() => setTab(x.id)}>
            <Icon name={x.icon} />
            <span>{x.label}</span>
          </button>
        ))}
      </nav>

      <EntryDialog
        entry={editing}
        accounts={state.accounts}
        categories={state.categories}
        onClose={() => setEditing(null)}
        onSave={(entry) => dispatch({ type: "updateEntry", entry })}
        onDelete={(id) => dispatch({ type: "deleteEntry", id })}
        onCreateAccount={createAccount}
        onCreateCategory={createCategory}
      />
    </>
  );
}
