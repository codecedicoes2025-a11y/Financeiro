"use client";

import { brl, usd } from "@/lib/stats";
import type { Account, ImportRecord } from "@/lib/types";
import { Icon } from "./Icon";

type Props = { imports: ImportRecord[]; accounts: Account[]; onDelete: (id: string) => void };

const br = (d: string) => d.split("-").reverse().join("/");

export function ImportHistory({ imports, accounts, onDelete }: Props) {
  return (
    <section className="panel" aria-labelledby="hist-h">
      <div className="panel-head">
        <h2 id="hist-h">Histórico de importações</h2>
        <span className="badge">{imports.length}</span>
      </div>

      {imports.length === 0 ? (
        <p className="muted small">Nenhuma importação ainda. Quando você importar um extrato (ou sincronizar um banco), ele aparece aqui.</p>
      ) : (
        <ul className="plain hist">
          {imports.map((imp) => {
            const acc = accounts.find((a) => a.id === imp.accountId);
            const fmt = acc?.currency === "USD" ? usd : brl;
            return (
              <li key={imp.id} className="hist-item">
                <div className="hist-main">
                  <strong className="hist-name">{imp.source}</strong>
                  <span className="muted small">
                    {acc?.name ?? "Conta removida"} · {new Date(imp.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="muted small">
                    {imp.added} lançamento{imp.added === 1 ? "" : "s"}
                    {imp.from ? ` · ${br(imp.from)} a ${br(imp.to)}` : ""}
                    {imp.skipped ? ` · ${imp.skipped} repetido${imp.skipped === 1 ? "" : "s"} ignorado${imp.skipped === 1 ? "" : "s"}` : ""}
                  </span>
                  <span className="small">
                    <span className="pos num">+{fmt.format(imp.income)}</span> <span className="neg num">−{fmt.format(imp.expense)}</span>
                  </span>
                </div>
                <button
                  className="btn btn-sm btn-danger"
                  aria-label={`Apagar importação ${imp.source}`}
                  onClick={() => confirm(`Apagar esta importação?\n\n${imp.source}: ${imp.added} lançamentos serão removidos do app.`) && onDelete(imp.id)}
                >
                  <Icon name="trash" size={18} /> Apagar
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
