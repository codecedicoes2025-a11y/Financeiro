"use client";

import { Icon } from "./Icon";
import type { Workspace } from "@/lib/types";

type Props = {
  email?: string;
  last: Workspace | null;
  counts: Record<Workspace, { accounts: number; entries: number }>;
  onPick: (ws: Workspace) => void;
  onSignOut?: () => void;
};

const OPTIONS: { id: Workspace; title: string; text: string }[] = [
  { id: "pf", title: "Finanças PF", text: "Suas finanças pessoais. No Resumo você também pode ver PF + PJ, com os caixas somados." },
  { id: "pj", title: "Finanças PJ", text: "As finanças da empresa. Só aparece o que for da PJ." },
];

export function WorkspacePicker({ email, last, counts, onPick, onSignOut }: Props) {
  return (
    <div className="auth-wrap">
      <div className="auth-card ws-picker">
        <div className="auth-brand">Financeiro</div>
        <div>
          <h1>O que você quer abrir?</h1>
          {email && <p className="muted small">Entrou como {email}</p>}
        </div>

        <div className="ws-grid">
          {OPTIONS.map((o) => (
            <button key={o.id} className={`ws-card ${last === o.id ? "last" : ""}`} onClick={() => onPick(o.id)}>
              <strong>{o.title}</strong>
              <span className="muted small">{o.text}</span>
              <span className="ws-count muted small">
                {counts[o.id].accounts} conta{counts[o.id].accounts === 1 ? "" : "s"} · {counts[o.id].entries} lançamento{counts[o.id].entries === 1 ? "" : "s"}
                {last === o.id && " · último usado"}
              </span>
              <span className="ws-go">
                Abrir <Icon name="right" size={16} />
              </span>
            </button>
          ))}
        </div>

        {onSignOut && (
          <div className="auth-links">
            <button className="link" onClick={onSignOut}>
              Sair
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
