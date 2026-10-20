"use client";

import { useMemo, useRef, useState, type Dispatch } from "react";
import { findCovered, findPair, fingerprint, guessDestination, isBalanceHold, makeSuggester, matchesMyName } from "@/lib/importing";
import { brl, fmtMoney, uid } from "@/lib/money";
import { extractFromPdf, type AiSettings } from "@/lib/gemini";
import { parseStatement, type ParseResult } from "@/lib/parse";
import type { Action } from "@/lib/store";
import type { Currency, Entry, EntryType, State } from "@/lib/types";
import { CategoryDialog } from "./CategoryDialog";
import { Icon } from "./Icon";

type Draft = {
  key: string;
  include: boolean;
  dup: boolean;
  /** Bloqueio de saldo (reserva): vem desmarcado. */
  hold: boolean;
  date: string;
  description: string;
  amount: number;
  type: EntryType;
  categoryId: string;
  fp: string;
  /** Por que a linha parece transferência entre contas suas. */
  hint: "" | "pair" | "name" | "covered";
  /** "normal" | "pair" (juntar com o outro lado) | "acc:<id>" (transferência para/de essa conta). */
  action: string;
  pairId?: string;
  pairLabel?: string;
  matchedName?: string;
};

const NEW_CATEGORY = "__newcat";
const br = (d: string) => d.split("-").reverse().join("/");

export function ImportSection({ state, dispatch, ai }: { state: State; dispatch: Dispatch<Action>; ai: AiSettings }) {
  const [accountId, setAccountId] = useState("");
  const [card, setCard] = useState(false);
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState<{ ok: boolean; text: string }[]>([]);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [target, setTarget] = useState("");
  const [fileName, setFileName] = useState("");
  const [catDlg, setCatDlg] = useState<{ key: string; kind: EntryType } | null>(null);
  const [bulkCat, setBulkCat] = useState("");
  const [done, setDone] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const accounts = state.accounts;
  const account = accounts.find((a) => a.id === (target || accountId));
  const catsOf = (kind: EntryType) => state.categories.filter((c) => c.kind === kind);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const chosen = accounts.find((a) => a.id === accountId);
    if (!chosen) return;
    setDone("");
    const msgs: { ok: boolean; text: string }[] = [];
    const reset = () => {
      setBusy("");
      if (input.current) input.current.value = "";
    };
    let acc = chosen;
    const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
    let text = "";
    let parsed: ParseResult;
    if (isPdf) {
      if (!ai.apiKey) {
        setNotes([{ ok: false, text: "Para ler PDF, cole sua chave do Gemini em Configurações › Gemini." }]);
        return reset();
      }
      setBusy("Abrindo o PDF…");
      try {
        const r = await extractFromPdf(file, ai, card, {
          onStatus: setBusy,
          onModel: (m) => setBusy(`Lendo o PDF com o Gemini (${m})…`),
          confirmSend: (info) =>
            confirm(
              info.mode === "text"
                ? `Enviar o TEXTO de "${file.name}" ao Google Gemini?\n\nO PDF foi aberto aqui no seu aparelho${info.usedPassword ? " (com a senha salva, que não é enviada)" : ""} e só o texto extraído (${info.chars.toLocaleString("pt-BR")} caracteres: lançamentos, saldos e dados da conta) vai ao Google. Na camada gratuita, o Google pode usar o conteúdo para melhorar produtos.\n\nPara não enviar nada, use CSV ou OFX.`
                : `Enviar o PDF "${file.name}" ao Google Gemini?\n\nEsse PDF não tem texto extraível, então o ARQUIVO inteiro será enviado ao Google. Na camada gratuita, o Google pode usar o conteúdo para melhorar produtos.\n\nPara não enviar nada, use CSV ou OFX.`,
            ),
        });
        if (!r) return reset();
        parsed = { rows: r.rows, warnings: r.warnings, currency: r.currency };
        msgs.push({ ok: true, text: `PDF lido pelo ${r.model}. Confira os lançamentos abaixo: a leitura por IA pode errar valores ou datas.` });
      } catch (e) {
        setNotes([{ ok: false, text: e instanceof Error ? e.message : "Não consegui ler o PDF." }]);
        return reset();
      }
    } else {
      setBusy("Lendo…");
      text = await file.text();
      parsed = parseStatement(text, file.name, card);
    }

    // A moeda declarada no arquivo manda: extrato em USD nunca cai numa conta em BRL.
    if (parsed.currency && parsed.currency !== acc.currency) {
      const options = accounts.filter((a) => a.currency === parsed.currency);
      if ((parsed.currency === "USD" || parsed.currency === "BRL") && options.length === 1) {
        acc = options[0];
        if (!isPdf) parsed = parseStatement(text, file.name, card);
        msgs.push({ ok: true, text: `O arquivo está em ${parsed.currency}, então vai para a conta ${acc.name} (e não ${chosen.name}).` });
      } else {
        setNotes([{ ok: false, text: `O arquivo está em ${parsed.currency}, mas a conta ${chosen.name} é em ${chosen.currency}. Escolha uma conta em ${parsed.currency}${options.length ? "" : " (crie uma em Contas, bancos e saldo do caixa)"}.` }]);
        return reset();
      }
    }
    for (const w of parsed.warnings) msgs.push({ ok: false, text: w });
    if (!parsed.rows.length) {
      setNotes([...msgs, { ok: false, text: `${file.name}: nenhum lançamento encontrado.` }]);
      return reset();
    }

    const known = new Set(state.entries.map((e) => e.fp).filter(Boolean) as string[]);
    const suggest = makeSuggester(state.entries, state.categories);
    const seen = new Map<string, number>();
    const used = new Set<string>();
    const myNames = state.myNames ?? [];
    const nameOf = (id: string) => accounts.find((a) => a.id === id)?.name ?? "conta";
    const rows: Draft[] = parsed.rows.map((r, i) => {
      const type: EntryType = r.amount >= 0 ? "in" : "out";
      const amount = Math.abs(r.amount);
      const base = `${r.date}|${Math.round(amount * 100)}|${type}|${r.description}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const fp = fingerprint(acc.id, r.date, amount, type, r.description, n);
      let dup = known.has(fp);
      const hold = isBalanceHold(r.description);
      let hint: Draft["hint"] = "";
      let action = "normal";
      let pairId: string | undefined;
      let pairLabel: string | undefined;
      let matchedName: string | undefined;
      if (!dup && !hold) {
        const row = { type, amount, date: r.date };
        const covered = findCovered(row, acc.id, accounts, state.entries, used);
        if (covered) {
          used.add(covered.id);
          dup = true;
          hint = "covered";
        } else {
          const pair = findPair(row, acc.id, accounts, state.entries, used);
          matchedName = matchesMyName(r.description, myNames) ?? undefined;
          if (pair) {
            used.add(pair.id);
            hint = "pair";
            action = "pair";
            pairId = pair.id;
            pairLabel = `${pair.description || "lançamento"} · ${nameOf(pair.accountId)}`;
          } else if (matchedName) {
            hint = "name";
            const dest = guessDestination(r.description, acc.id, accounts);
            action = dest ? `acc:${dest}` : "normal";
          }
        }
      }
      return { key: `${i}-${fp}`, include: !dup && !hold, dup, hold, date: r.date, description: r.description, amount, type, categoryId: suggest(r.description, type), fp, hint, action, pairId, pairLabel, matchedName };
    });
    setDrafts(rows);
    setTarget(acc.id);
    setFileName(file.name);
    setNotes(msgs);
    reset();
  }

  const patch = (key: string, p: Partial<Draft>) => setDrafts((ds) => ds && ds.map((d) => (d.key === key ? { ...d, ...p } : d)));

  function setType(d: Draft, type: EntryType) {
    if (d.type === type) return;
    const suggest = makeSuggester(state.entries, state.categories);
    patch(d.key, { type, categoryId: suggest(d.description, type) });
  }

  const summary = useMemo(() => {
    const list = drafts ?? [];
    const chosen = list.filter((d) => d.include && !d.dup);
    const plain = chosen.filter((d) => d.action === "normal");
    return {
      transfers: chosen.length - plain.length,
      total: list.length,
      dups: list.filter((d) => d.dup).length,
      holds: list.filter((d) => d.hold && !d.dup).length,
      count: chosen.length,
      income: plain.filter((d) => d.type === "in").reduce((s, d) => s + d.amount, 0),
      expense: plain.filter((d) => d.type === "out").reduce((s, d) => s + d.amount, 0),
    };
  }, [drafts]);

  function confirmImport() {
    if (!drafts || !account) return;
    const chosen = drafts.filter((d) => d.include && !d.dup);
    if (!chosen.length) return;
    const importId = `imp-${uid()}`;
    const rate = state.usdBrl;
    const cur = (id: string): Currency => accounts.find((a) => a.id === id)?.currency ?? "BRL";
    const convert = (v: number, from: Currency, to: Currency) => (from === to ? v : Math.round((from === "USD" ? v * rate : v / rate) * 100) / 100);
    const removeIds: string[] = [];
    const entries: Entry[] = [];
    let transfers = 0;

    for (const d of chosen) {
      const base = { id: uid() + d.key.split("-")[0], date: d.date, description: d.description.trim(), importId, fp: d.fp };
      const dest = d.action === "pair" ? state.entries.find((e) => e.id === d.pairId)?.accountId : d.action.startsWith("acc:") ? d.action.slice(4) : undefined;
      if (d.action === "normal" || !dest || !accounts.some((a) => a.id === dest)) {
        entries.push({ ...base, type: d.type, accountId: account.id, amount: d.amount, categoryId: d.categoryId });
        continue;
      }
      if (d.action === "pair" && d.pairId) removeIds.push(d.pairId);
      // Quem envia é a origem; quem recebe, o destino. O valor da origem fica na moeda dela.
      const from = d.type === "out" ? account.id : dest;
      const to = d.type === "out" ? dest : account.id;
      const here = d.amount; // valor deste extrato, na moeda desta conta
      const sent = d.type === "out" ? here : convert(here, cur(account.id), cur(from));
      const received = d.type === "out" ? convert(here, cur(account.id), cur(to)) : here;
      entries.push({ ...base, type: "transfer", accountId: from, toAccountId: to, amount: sent, toAmount: cur(from) === cur(to) ? undefined : received, categoryId: "" });
      transfers++;
    }
    const dates = entries.map((e) => e.date).sort();
    dispatch({
      type: "importEntries",
      entries,
      removeIds,
      record: { id: importId, accountId: account.id, source: fileName, at: new Date().toISOString(), count: entries.length, income: summary.income, expense: summary.expense, from: dates[0], to: dates[dates.length - 1] },
    });
    setDone(`${entries.length} lançamentos importados de ${fileName} para ${account.name}${transfers ? ` (${transfers} como transferência entre contas)` : ""}.`);
    setDrafts(null);
    setNotes([]);
  }

  function applyBulk() {
    if (!bulkCat || !drafts) return;
    const kind = state.categories.find((c) => c.id === bulkCat)?.kind;
    if (!kind) return;
    setDrafts(drafts.map((d) => (d.include && !d.dup && d.type === kind ? { ...d, categoryId: bulkCat } : d)));
  }

  const fmt = (n: number) => fmtMoney(n, account?.currency ?? "BRL");
  const imports = state.imports ?? [];
  const allOn = !!drafts && drafts.filter((d) => !d.dup && !d.hold).every((d) => d.include);

  return (
    <div className="stack">
      <section className="panel" aria-labelledby="imp-h">
        <h2 id="imp-h">Importar extrato</h2>
        <p className="muted small">
          Baixe o extrato do mês em <b>CSV, OFX ou PDF</b> no app ou no site do banco, escolha a conta e envie o arquivo. Antes de gravar, você revisa cada lançamento e ajusta categoria e descrição.
        </p>

        {accounts.length === 0 ? (
          <p className="result result-err">Crie uma conta antes, em “Contas, bancos e saldo do caixa”.</p>
        ) : (
          <>
            <label className="field">
              <span>De qual conta é o extrato?</span>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={!!drafts}>
                <option value="" disabled>
                  Escolha a conta…
                </option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={card} onChange={(e) => setCard(e.target.checked)} disabled={!!drafts} />
              <span>É fatura de cartão de crédito (valores positivos no arquivo são gastos)</span>
            </label>
            <label className={`drop ${accountId && !drafts ? "" : "drop-off"}`} aria-disabled={!accountId || !!drafts}>
              <Icon name="upload" size={28} />
              <span>{busy ? busy : !accountId ? "Escolha a conta primeiro" : drafts ? "Revise abaixo e confirme" : "Escolher arquivo .csv, .ofx ou .pdf"}</span>
              <input ref={input} type="file" accept=".csv,.ofx,.txt,.pdf,text/csv,application/pdf" disabled={!accountId || !!drafts || !!busy} onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </>
        )}

        {notes.map((n, i) => (
          <p key={i} className={`result ${n.ok ? "result-ok" : "result-err"}`} role="status">
            {n.text}
          </p>
        ))}
        {done && (
          <p className="result result-ok" role="status">
            {done}
          </p>
        )}
      </section>

      {drafts && account && (
        <section className="panel" aria-labelledby="rev-h">
          <div className="panel-head">
            <h2 id="rev-h">Revisar lançamentos</h2>
            <span className="badge">{account.name}</span>
          </div>
          <p className="muted small">
            {fileName}: {summary.total} linhas lidas
            {summary.dups ? `, ${summary.dups} já registrada${summary.dups > 1 ? "s" : ""} antes (ignorada${summary.dups > 1 ? "s" : ""})` : ""}{summary.transfers ? `, ${summary.transfers} marcada${summary.transfers > 1 ? "s" : ""} como transferência entre contas (não contam como gasto nem ganho)` : ""}{summary.holds ? `, ${summary.holds} reserva${summary.holds > 1 ? "s" : ""} de saldo (bloqueio e devolução do dinheiro durante um pagamento; não são gasto) vêm desmarcada${summary.holds > 1 ? "s" : ""}` : ""}. Marcadas: <strong>{summary.count}</strong> · entradas{" "}
            <span className="pos num">{fmt(summary.income)}</span> · saídas <span className="neg num">{fmt(summary.expense)}</span>. Se a entrada ou a saída estiver trocada, corrija no seletor da linha.
          </p>

          <div className="rev-bulk">
            <label className="check compact">
              <input
                type="checkbox"
                checked={allOn}
                onChange={(e) => setDrafts((ds) => ds && ds.map((d) => (d.dup || d.hold ? d : { ...d, include: e.target.checked })))}
              />
              Marcar todas
            </label>
            <select aria-label="Categoria para aplicar às marcadas" value={bulkCat} onChange={(e) => setBulkCat(e.target.value)}>
              <option value="">Aplicar categoria às marcadas…</option>
              <optgroup label="Saídas">
                {catsOf("out").map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Entradas">
                {catsOf("in").map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <button className="btn btn-sm" onClick={applyBulk} disabled={!bulkCat}>
              Aplicar
            </button>
          </div>

          <ul className="plain rev-list">
            {drafts.map((d) => (
              <li key={d.key} className={`rev-row ${!d.include || d.dup ? "off" : ""} ${(d.hint === "pair" || d.hint === "name") && !d.dup ? "has-xfer" : ""} ${d.action !== "normal" && !d.dup ? "is-xfer" : ""}`}>
                <label className="rev-check" aria-label="Importar este lançamento">
                  <input type="checkbox" checked={d.include && !d.dup} disabled={d.dup} onChange={(e) => patch(d.key, { include: e.target.checked })} />
                </label>
                <span className="rev-date num">{br(d.date)}</span>
                <span className={`rev-amount num ${d.action !== "normal" && !d.dup ? "muted" : d.type === "in" ? "pos" : "neg"}`}>{fmt(d.type === "in" ? d.amount : -d.amount)}</span>
                <input className="rev-desc" aria-label="Descrição" value={d.description} onChange={(e) => patch(d.key, { description: e.target.value })} placeholder="Descrição" />
                <select className={`rev-type ${d.type}`} aria-label="Entrada ou saída" value={d.type} onChange={(e) => setType(d, e.target.value as EntryType)}>
                  <option value="out">Saída</option>
                  <option value="in">Entrada</option>
                </select>
                <select
                  className="rev-cat"
                  aria-label="Categoria"
                  value={d.categoryId}
                  onChange={(e) => (e.target.value === NEW_CATEGORY ? setCatDlg({ key: d.key, kind: d.type }) : patch(d.key, { categoryId: e.target.value }))}
                >
                  {catsOf(d.type).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value={NEW_CATEGORY}>＋ Criar categoria…</option>
                </select>
                {(d.hint === "pair" || d.hint === "name") && !d.dup && (
                  <div className="rev-xfer">
                    <span className="small muted">
                      {d.hint === "pair" ? "Parece a outra ponta de uma transferência entre suas contas." : `Tem o seu nome (“${d.matchedName}”): provável transferência entre suas contas.`}
                    </span>
                    <select aria-label="Tratar como" value={d.action} onChange={(e) => patch(d.key, { action: e.target.value })}>
                      {d.hint === "pair" && <option value="pair">Juntar com “{d.pairLabel}” (transferência)</option>}
                      {accounts
                        .filter((a) => a.id !== account.id)
                        .map((a) => (
                          <option key={a.id} value={`acc:${a.id}`}>
                            {d.type === "out" ? "Transferência para" : "Transferência de"} {a.name}
                          </option>
                        ))}
                      <option value="normal">{d.hint === "pair" ? "Manter como gasto/entrada normal" : `Conta fora do app (conta como ${d.type === "out" ? "saída" : "entrada"})`}</option>
                    </select>
                  </div>
                )}
                {d.dup ? <span className="badge rev-dup">{d.hint === "covered" ? "já registrada como transferência" : "já importado"}</span> : d.hold ? <span className="badge rev-dup" title="Bloqueio e devolução do saldo durante um pagamento: se anulam e não são gasto.">reserva de saldo</span> : null}
              </li>
            ))}
          </ul>

          <div className="row-actions">
            <button
              className="btn"
              onClick={() => {
                setDrafts(null);
                setNotes([]);
              }}
            >
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={confirmImport} disabled={summary.count === 0}>
              Importar {summary.count} lançamento{summary.count === 1 ? "" : "s"}
            </button>
          </div>
        </section>
      )}

      <section className="panel" aria-labelledby="hist-h">
        <div className="panel-head">
          <h2 id="hist-h">Histórico de importações</h2>
          <span className="badge">{imports.length}</span>
        </div>
        {imports.length === 0 ? (
          <p className="muted small">Nenhuma importação ainda. Cada extrato importado aparece aqui, e você pode apagar a importação inteira se algo sair errado.</p>
        ) : (
          <ul className="plain hist">
            {imports.map((imp) => {
              const acc = state.accounts.find((a) => a.id === imp.accountId);
              const f = (n: number) => fmtMoney(n, acc?.currency ?? "BRL");
              return (
                <li key={imp.id} className="hist-item">
                  <div className="hist-main">
                    <strong className="hist-name">{imp.source}</strong>
                    <span className="muted small">
                      {acc?.name ?? "Conta removida"} · importado em {new Date(imp.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="muted small">
                      {imp.count} lançamento{imp.count === 1 ? "" : "s"} · {br(imp.from)} a {br(imp.to)}
                    </span>
                    <span className="small">
                      <span className="pos num">+{f(imp.income)}</span> <span className="neg num">−{f(imp.expense)}</span>
                      {acc?.currency === "USD" && <span className="muted"> ≈ {brl.format(imp.income * state.usdBrl)} / {brl.format(imp.expense * state.usdBrl)}</span>}
                    </span>
                  </div>
                  <button
                    className="btn btn-sm btn-danger"
                    aria-label={`Apagar importação ${imp.source}`}
                    onClick={() => confirm(`Apagar esta importação?\n\n${imp.source}: ${imp.count} lançamentos serão removidos do app.`) && dispatch({ type: "deleteImport", id: imp.id })}
                  >
                    <Icon name="trash" size={18} /> Apagar
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <CategoryDialog
        open={!!catDlg}
        kind={catDlg?.kind ?? "out"}
        onClose={() => setCatDlg(null)}
        onCreate={(name, color) => {
          if (!catDlg) return;
          const id = `c-${uid()}`;
          dispatch({ type: "addCategory", category: { id, name, color, kind: catDlg.kind } });
          patch(catDlg.key, { categoryId: id });
          setCatDlg(null);
        }}
      />
    </div>
  );
}
