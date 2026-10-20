"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { FALLBACK_CATEGORY } from "@/lib/categories";
import { useAiSettings } from "@/lib/aiSettings";
import { useBankConfig, useBankSync } from "@/lib/banks";
import { useFinanceStore } from "@/lib/store";
import { brl, cashBalance, currentMonth, monthLabel, monthlySeries, monthOf, shiftMonth, summarize, toBrl, usd } from "@/lib/stats";
import type { StatementBalance } from "@/lib/parse";
import { useAiRunner } from "@/lib/useAiRunner";
import { useLiveRate } from "@/lib/useLiveRate";
import type { Owner, ParsedRow, Tx } from "@/lib/types";
import { AiPanel } from "./AiPanel";
import { AnimatedNumber } from "./AnimatedNumber";
import { BanksPanel } from "./BanksPanel";
import { Donut } from "./Donut";
import { EditSheet } from "./EditSheet";
import { Icon, type IconName } from "./Icon";
import { ImportHistory } from "./ImportHistory";
import { ImportPanel } from "./ImportPanel";
import { SettingsPanel } from "./SettingsPanel";
import { TrendChart } from "./TrendChart";

type Tab = "resumo" | "lancamentos" | "importar" | "ajustes";

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "resumo", label: "Resumo", icon: "home" },
  { id: "lancamentos", label: "Lançamentos", icon: "list" },
  { id: "importar", label: "Importar", icon: "upload" },
  { id: "ajustes", label: "Ajustes", icon: "settings" },
];

const fmtBrl = (n: number) => brl.format(n);

export default function App() {
  const { state, dispatch, ready, replaceAll } = useFinanceStore();
  const ai = useAiSettings();
  const runner = useAiRunner(state, dispatch, ai.settings);
  const banks = useBankConfig();
  const rate = useLiveRate(ready && state.rateAuto !== false, dispatch);
  const [aiQueued, setAiQueued] = useState(false);
  const [profile, setProfileState] = useState<"all" | Owner>("all");
  useEffect(() => {
    try {
      const v = localStorage.getItem("financeiro:profile");
      if (v === "pf" || v === "pj" || v === "all") setProfileState(v);
    } catch {
      /* ignore */
    }
  }, []);
  const setProfile = useCallback((v: "all" | Owner) => {
    setProfileState(v);
    setAccountId("all");
    try {
      localStorage.setItem("financeiro:profile", v);
    } catch {
      /* ignore */
    }
  }, []);
  const onBankRows = useCallback(
    (accountId: string, rows: ParsedRow[], source: string, balance?: StatementBalance) => {
      dispatch({ type: "import", accountId, rows, source, balance });
      setAiQueued(true);
    },
    [dispatch],
  );
  const bankSync = useBankSync(banks.config, onBankRows);
  const [tab, setTab] = useState<Tab>("resumo");
  const [month, setMonth] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string>("all");
  const [mode, setMode] = useState<"gastos" | "entradas">("gastos");
  const [editing, setEditing] = useState<Tx | null>(null);
  const [query, setQuery] = useState("");
  const [onlyUncat, setOnlyUncat] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  // Perfil do painel: tudo junto, só pessoa física ou só pessoa jurídica. Todo número abaixo sai desta visão.
  const view = useMemo(() => {
    if (profile === "all") return state;
    const accounts = state.accounts.filter((a) => (a.owner ?? "pf") === profile);
    const ids = new Set(accounts.map((a) => a.id));
    return { ...state, accounts, transactions: state.transactions.filter((t) => ids.has(t.accountId)) };
  }, [state, profile]);

  const latest = useMemo(
    () => view.transactions.reduce((m, t) => (monthOf(t.date) > m ? monthOf(t.date) : m), ""),
    [view.transactions],
  );
  const activeMonth = month ?? (latest || currentMonth());

  const monthTxs = useMemo(
    () =>
      view.transactions
        .filter((t) => monthOf(t.date) === activeMonth && (accountId === "all" || t.accountId === accountId))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [view.transactions, activeMonth, accountId],
  );
  const summary = useMemo(() => summarize(monthTxs, view), [monthTxs, view]);

  const catById = useMemo(() => new Map(state.categories.map((c) => [c.id, c])), [state.categories]);
  const accById = useMemo(() => new Map(state.accounts.map((a) => [a.id, a])), [state.accounts]);

  const slices = mode === "gastos" ? summary.expenses : summary.incomes;
  const total = mode === "gastos" ? summary.expense : summary.income;
  const hasUsd = useMemo(() => {
    const usdIds = new Set(view.accounts.filter((a) => a.currency === "USD").map((a) => a.id));
    return view.transactions.some((t) => usdIds.has(t.accountId));
  }, [view.accounts, view.transactions]);
  const cash = useMemo(() => cashBalance(view, accountId), [view, accountId]);
  const year = activeMonth.slice(0, 4);
  const series = useMemo(() => monthlySeries(view, year, accountId, activeMonth), [view, year, accountId, activeMonth]);
  const uncategorized = monthTxs.filter((t) => t.categoryId === FALLBACK_CATEGORY).length;

  const listTxs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return monthTxs.filter(
      (t) => (!q || t.description.toLowerCase().includes(q)) && (!onlyUncat || t.categoryId === FALLBACK_CATEGORY),
    );
  }, [monthTxs, query, onlyUncat]);

  const grouped = useMemo(() => {
    const g = new Map<string, Tx[]>();
    for (const t of listTxs) g.set(t.date, [...(g.get(t.date) ?? []), t]);
    return [...g.entries()];
  }, [listTxs]);

  // Depois de importar, a IA categoriza sozinha (se conectada e ativada).
  useEffect(() => {
    if (!aiQueued) return;
    setAiQueued(false);
    if (ai.settings.apiKey && ai.settings.autoRun) void runner.run();
  }, [aiQueued, ai.settings.apiKey, ai.settings.autoRun, runner]);

  useEffect(() => {
    if (bankSync.status.phase !== "done") return;
    const id = setTimeout(bankSync.dismiss, 15000);
    return () => clearTimeout(id);
  }, [bankSync.status, bankSync.dismiss]);

  // O aviso de "concluído" some sozinho.
  useEffect(() => {
    if (runner.status.phase !== "done") return;
    const id = setTimeout(runner.dismiss, 4500);
    return () => clearTimeout(id);
  }, [runner.status, runner.dismiss]);

  if (!ready) return <div className="boot" aria-busy="true" />;

  const tabIndex = TABS.findIndex((t) => t.id === tab);
  const st = runner.status;

  return (
    <>
      <div className="shell">
        <header className="top">
          <h1>Financeiro</h1>
          <div className="top-actions">
            {tab === "resumo" && (
              <button
                className="btn glass-pill"
                onClick={() => (bankSync.hasAny ? void bankSync.sync() : setTab("ajustes"))}
                disabled={bankSync.status.phase === "running"}
              >
                <span className={bankSync.status.phase === "running" ? "spin" : ""}><Icon name="refresh" size={18} /></span>
                {bankSync.hasAny ? "Sincronizar" : "Conectar banco"}
              </button>
            )}
          {(tab === "resumo" || tab === "lancamentos") && (
            <div className="month glass-pill" role="group" aria-label="Mês">
              <button className="icon-btn" aria-label="Mês anterior" onClick={() => setMonth(shiftMonth(activeMonth, -1))}>
                <Icon name="left" />
              </button>
              <span aria-live="polite">{monthLabel(activeMonth)}</span>
              <button className="icon-btn" aria-label="Próximo mês" onClick={() => setMonth(shiftMonth(activeMonth, 1))}>
                <Icon name="right" />
              </button>
            </div>
          )}
          </div>
        </header>

        <main key={tab} className="view">
          {(tab === "resumo" || tab === "lancamentos") && (
            <div className="seg seg-3" role="group" aria-label="Perfil" style={{ "--n": 3, "--pos": profile === "all" ? 0 : profile === "pf" ? 1 : 2 } as CSSProperties}>
              <span className="seg-thumb" aria-hidden="true" />
              {([["all", "Tudo junto"], ["pf", "Pessoa física"], ["pj", "Pessoa jurídica"]] as const).map(([id, label]) => (
                <button key={id} className={profile === id ? "on" : ""} aria-pressed={profile === id} onClick={() => setProfile(id)}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {(tab === "resumo" || tab === "lancamentos") && (
            <div className="chips scroll" role="group" aria-label="Filtrar por conta">
              <button className={`chip ${accountId === "all" ? "chip-on" : ""}`} aria-pressed={accountId === "all"} onClick={() => setAccountId("all")}>
                Todas
              </button>
              {view.accounts.map((a) => (
                <button key={a.id} className={`chip ${accountId === a.id ? "chip-on" : ""}`} aria-pressed={accountId === a.id} onClick={() => setAccountId(a.id)}>
                  {a.name}
                </button>
              ))}
            </div>
          )}

          {tab === "resumo" && (
            <div className="dash">
              <div className="cards">
                <div className="card glass" style={{ "--i": 0 } as CSSProperties}>
                  <span className="muted small">Entradas</span>
                  <strong className="num pos"><AnimatedNumber value={summary.income} format={fmtBrl} /></strong>
                </div>
                <div className="card glass" style={{ "--i": 1 } as CSSProperties}>
                  <span className="muted small">Saídas</span>
                  <strong className="num neg"><AnimatedNumber value={summary.expense} format={fmtBrl} /></strong>
                </div>
                <div className="card glass" style={{ "--i": 2 } as CSSProperties}>
                  <span className="muted small">Resultado do mês</span>
                  <strong className={`num ${summary.balance >= 0 ? "pos" : "neg"}`}><AnimatedNumber value={summary.balance} format={fmtBrl} /></strong>
                </div>
                <div className="card glass" style={{ "--i": 3 } as CSSProperties}>
                  <span className="muted small">Saldo do caixa</span>
                  <strong className={`num ${cash.total < 0 ? "neg" : ""}`}><AnimatedNumber value={cash.total} format={fmtBrl} /></strong>
                  {cash.missing.length > 0 && (
                    <button className="card-note" onClick={() => setTab("ajustes")}>
                      {cash.lines.length === 0 ? "Informe o saldo atual" : `Falta saldo em ${cash.missing.map((a) => a.name).join(", ")}`} →
                    </button>
                  )}
                </div>
              </div>

              {uncategorized > 0 && (
                <button
                  className="nudge glass"
                  onClick={() => (ai.settings.apiKey ? void runner.run() : setTab("ajustes"))}
                  disabled={st.phase === "running"}
                >
                  <Icon name="sparkle" size={18} />
                  <span>
                    {uncategorized} lançamento{uncategorized > 1 ? "s" : ""} sem categoria
                    <small className="muted">{ai.settings.apiKey ? " · tocar para a IA categorizar" : " · conecte o Gemini em Ajustes"}</small>
                  </span>
                </button>
              )}

              <section className="panel glass panel-donut" style={{ "--i": 3 } as CSSProperties}>
                <div className="seg" role="group" aria-label="Tipo" style={{ "--pos": mode === "gastos" ? 0 : 1 } as CSSProperties}>
                  <span className="seg-thumb" aria-hidden="true" />
                  <button className={mode === "gastos" ? "on" : ""} aria-pressed={mode === "gastos"} onClick={() => setMode("gastos")}>
                    Gastos
                  </button>
                  <button className={mode === "entradas" ? "on" : ""} aria-pressed={mode === "entradas"} onClick={() => setMode("entradas")}>
                    Entradas
                  </button>
                </div>

                {slices.length === 0 ? (
                  <div className="empty">
                    <p>Sem {mode === "gastos" ? "gastos" : "entradas"} neste período.</p>
                    {state.transactions.length === 0 && (
                      <button className="btn btn-primary" onClick={() => setTab("importar")}>
                        <Icon name="upload" size={18} /> Importar primeiro extrato
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="donut-wrap">
                    <Donut slices={slices} total={total} label={mode === "gastos" ? "Gastos" : "Entradas"} active={active} />
                    <table className="legend" onPointerLeave={() => setActive(null)}>
                      <caption className="sr">Valores por categoria</caption>
                      <thead className="sr">
                        <tr><th>Categoria</th><th>Parcela</th><th>Valor</th></tr>
                      </thead>
                      <tbody>
                        {slices.map((s, i) => (
                          <tr
                            key={s.id}
                            tabIndex={0}
                            className={active === s.id ? "hot" : ""}
                            style={{ "--i": i } as CSSProperties}
                            onPointerEnter={() => setActive(s.id)}
                            onFocus={() => setActive(s.id)}
                            onBlur={() => setActive(null)}
                          >
                            <td><span className="dot" style={{ background: s.color }} /> {s.name}</td>
                            <td className="num muted">{s.pct.toFixed(0)}%</td>
                            <td className="num">{brl.format(s.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </>
                )}
                {hasUsd && (accountId === "all" || accById.get(accountId)?.currency === "USD") && (
                  <p className="muted small rate-note">
                    <span className={`live-dot ${state.rateAuto !== false ? "on" : ""}`} aria-hidden="true" />
                    Dólar: US$ 1 = {state.usdBrl.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 4 })}
                    {state.rateAuto !== false ? " · ao vivo" : " · manual"}
                  </p>
                )}
              </section>

              <section className="panel glass panel-trend" style={{ "--i": 4 } as CSSProperties} aria-labelledby="trend-h">
                <h2 id="trend-h">Entradas e saídas por mês</h2>
                {state.transactions.some((t) => t.date.startsWith(year)) ? (
                  <TrendChart data={series} year={year} />
                ) : (
                  <p className="muted small">Sem lançamentos em {year}.</p>
                )}
              </section>
            </div>
          )}

          {tab === "lancamentos" && (
            <div className="stack">
              <div className="toolbar">
                <input className="search glass-input" type="search" aria-label="Buscar lançamento" placeholder="Buscar descrição…" value={query} onChange={(e) => setQuery(e.target.value)} />
                <button className={`chip ${onlyUncat ? "chip-on" : ""}`} aria-pressed={onlyUncat} onClick={() => setOnlyUncat((v) => !v)}>
                  Sem categoria{uncategorized ? ` · ${uncategorized}` : ""}
                </button>
              </div>
              {grouped.length === 0 && <p className="empty muted">Nenhum lançamento neste período.</p>}
              {grouped.map(([date, txs], gi) => (
                <section key={date} className="day">
                  <h3 className="small muted">{new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}</h3>
                  <ul className="plain glass">
                    {txs.map((t, i) => {
                      const c = catById.get(t.categoryId);
                      const acc = accById.get(t.accountId);
                      const ignored = !!c?.ignore;
                      return (
                        <li key={t.id} style={{ "--i": Math.min(gi * 3 + i, 14) } as CSSProperties}>
                          <button className="tx" onClick={() => setEditing(t)} aria-label={`Editar ${t.description}`}>
                            <span className="tx-main">
                              <span className="tx-desc">{t.description}</span>
                              <span className="tx-meta small muted">
                                <span className="dot" style={{ background: c?.color ?? "#94A3B8" }} /> {c?.name ?? "Outros"} · {acc?.name}
                              </span>
                            </span>
                            <span className={`num ${ignored ? "muted" : t.amount < 0 ? "neg" : "pos"}`}>
                              {acc?.currency === "USD" ? usd.format(t.amount) : brl.format(toBrl(t, state.accounts, state.usdBrl))}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {tab === "importar" && (
            <div className="cols2">
              <ImportPanel
                accounts={state.accounts}
                onImport={(accId, rows, source, balance) => {
                  dispatch({ type: "import", accountId: accId, rows, source, balance });
                  const last = rows.reduce((m, r) => (r.date > m ? r.date : m), "");
                  if (last) setMonth(monthOf(last));
                  setAiQueued(true);
                }}
              />
              <ImportHistory imports={state.imports ?? []} accounts={state.accounts} onDelete={(importId) => dispatch({ type: "deleteImport", importId })} />
            </div>
          )}

          {tab === "ajustes" && (
            <div className="cols2">
              <div className="stack">
                <BanksPanel config={banks.config} onChange={banks.update} accounts={state.accounts} status={bankSync.status} onSync={() => void bankSync.sync()} />
                <AiPanel settings={ai.settings} onChange={ai.update} pendingCount={runner.pendingCount} status={st} onRun={() => void runner.run()} />
              </div>
              <SettingsPanel
                state={state}
                onAddAccount={(name, currency, card, owner) =>
                  dispatch({ type: "addAccount", account: { id: `a-${Date.now().toString(36)}`, name, currency, card, owner } })
                }
                onSetOwner={(id, owner) => dispatch({ type: "setOwner", id, owner })}
                onSetBalance={(id, value) => dispatch({ type: "setBalance", accountId: id, value })}
                onClearBalance={(id) => dispatch({ type: "clearBalance", accountId: id })}
                onRemoveAccount={(id) => dispatch({ type: "removeAccount", id })}
                onAddCategory={(category) => dispatch({ type: "addCategory", category })}
                onUpdateCategory={(category) => dispatch({ type: "updateCategory", category })}
                onRemoveCategory={(id) => dispatch({ type: "removeCategory", id })}
                onRate={(value) => dispatch({ type: "setRate", value })}
                onRateAuto={(value) => dispatch({ type: "setRateAuto", value })}
                rate={rate}
                onRestore={replaceAll}
                onClear={() => dispatch({ type: "clearData" })}
              />
            </div>
          )}
        </main>
      </div>

      {bankSync.status.phase !== "idle" && (
        <div className={`toast glass ${bankSync.status.phase === "error" ? "toast-err" : ""}`} role="status" aria-live="polite">
          <Icon name="refresh" size={18} />
          <span>{bankSync.status.message}</span>
          {bankSync.status.phase !== "running" && (
            <button className="icon-btn" onClick={bankSync.dismiss} aria-label="Fechar aviso">
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      )}

      {bankSync.status.phase === "idle" && st.phase !== "idle" && (
        <div className={`toast glass ${st.phase === "error" ? "toast-err" : ""}`} role="status" aria-live="polite">
          <Icon name="sparkle" size={18} />
          <span>
            {st.phase === "running" && (
              <>
                Categorizando {st.done}/{st.total}
                {st.model && <small className="muted"> · {st.model}</small>}
              </>
            )}
            {st.phase === "done" && <>IA categorizou {st.changed} {st.changed === 1 ? "item" : "itens"}{st.failed ? ` (${st.failed} ficaram de fora)` : ""}</>}
            {st.phase === "error" && st.message}
          </span>
          {st.phase === "running" && <i className="bar" style={{ "--p": `${(st.done / Math.max(st.total, 1)) * 100}%` } as CSSProperties} />}
          {st.phase !== "running" && (
            <button className="icon-btn" onClick={runner.dismiss} aria-label="Fechar aviso">
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      )}

      <nav className="tabbar glass" aria-label="Seções" style={{ "--n": TABS.length, "--idx": tabIndex } as CSSProperties}>
        <span className="tab-thumb" aria-hidden="true" />
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <EditSheet
        tx={editing}
        account={editing ? accById.get(editing.accountId) : undefined}
        categories={state.categories}
        onClose={() => setEditing(null)}
        onSave={(categoryId, applySimilar) => {
          if (editing) dispatch({ type: "setCategory", txId: editing.id, categoryId, applySimilar });
          setEditing(null);
        }}
        onDelete={() => {
          if (editing) dispatch({ type: "deleteTx", txId: editing.id });
          setEditing(null);
        }}
      />
    </>
  );
}
