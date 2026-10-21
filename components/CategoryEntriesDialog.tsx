"use client";

import { useEffect, useMemo, useRef } from "react";
import { fmtBR } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { brl, signedBrl, type Slice } from "@/lib/stats";
import type { Entry, EntryType, State } from "@/lib/types";
import { Icon } from "./Icon";

type Props = {
  /** Categoria (ou "Demais categorias") clicada; null fecha. */
  slice: Slice | null;
  kind: EntryType;
  /** Livro(s) em exibição: contas, categorias e cotação. */
  state: State;
  /** Lançamentos do período mostrado no Resumo. */
  entries: Entry[];
  periodLabel: string;
  onClose: () => void;
};

/** Pop-up com todos os lançamentos (saídas ou entradas) de uma categoria no período. */
export function CategoryEntriesDialog({ slice, kind, state, entries, periodLabel, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (slice && !d.open) d.showModal();
    else if (!slice && d.open) d.close();
  }, [slice]);

  const catName = useMemo(() => new Map(state.categories.map((c) => [c.id, c])), [state.categories]);
  const accName = useMemo(() => new Map(state.accounts.map((a) => [a.id, a])), [state.accounts]);

  const groups = useMemo(() => {
    if (!slice) return [];
    const picked = entries.filter((e) => e.type === kind && slice.ids.includes(e.categoryId));
    return slice.ids
      .map((id) => {
        const list = picked.filter((e) => e.categoryId === id).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        const total = list.reduce((s, e) => s + Math.abs(signedBrl(e, state.accounts, state.usdBrl)), 0);
        return { id, list, total };
      })
      .filter((g) => g.list.length > 0)
      .sort((a, b) => b.total - a.total);
  }, [slice, entries, kind, state.accounts, state.usdBrl]);

  const count = groups.reduce((s, g) => s + g.list.length, 0);
  const total = groups.reduce((s, g) => s + g.total, 0);
  const many = (slice?.ids.length ?? 0) > 1;

  return (
    <dialog ref={ref} className="sheet sheet-lg" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-labelledby="ce-h">
      {slice && (
        <div className="sheet-body">
          <div className="sheet-head">
            <div className="ce-title">
              <h2 id="ce-h">
                <span className="dot big" style={{ background: slice.color }} /> {slice.name}
              </h2>
              <p className="muted small">
                {kind === "out" ? "Saídas" : "Entradas"} · {periodLabel} · {count} lançamento{count === 1 ? "" : "s"}
                {many ? ` em ${groups.length} categoria${groups.length === 1 ? "" : "s"}` : ""}
              </p>
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="Fechar">
              <Icon name="close" />
            </button>
          </div>

          <p className={`ce-total num ${kind === "in" ? "pos" : "neg"}`}>{brl.format(total)}</p>

          {groups.length === 0 ? (
            <p className="muted">Nenhum lançamento nesta categoria no período.</p>
          ) : (
            <div className="ce-groups">
              {groups.map((g) => {
                const c = catName.get(g.id);
                return (
                  <section key={g.id} className="ce-group">
                    {many && (
                      <h3 className="ce-group-h">
                        <span className="dot" style={{ background: c?.color ?? "#94A3B8" }} /> {c?.name ?? "Sem categoria"}
                        <span className="muted small num"> · {brl.format(g.total)}</span>
                      </h3>
                    )}
                    <ul className="plain ce-list">
                      {g.list.map((e) => {
                        const acc = accName.get(e.accountId);
                        return (
                          <li key={e.id} className="ce-row">
                            <span className="ce-date num muted small">{fmtBR(e.date).slice(0, 5)}</span>
                            <span className="ce-main">
                              <span className="ce-desc">{e.description || c?.name || "Lançamento"}</span>
                              <span className="muted small">
                                {acc?.name ?? "Conta"}
                                {acc?.ws && <span className="tag">{acc.ws.toUpperCase()}</span>}
                              </span>
                            </span>
                            <span className={`ce-amount num ${kind === "in" ? "pos" : "neg"}`}>
                              {fmtMoney(e.amount, acc?.currency ?? "BRL")}
                              {acc?.currency === "USD" && <small className="muted"> ≈ {brl.format(Math.abs(signedBrl(e, state.accounts, state.usdBrl)))}</small>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
