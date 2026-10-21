"use client";

import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { brl, type Slice } from "@/lib/stats";
import { Donut } from "./Donut";
import { Icon } from "./Icon";

type Props = {
  title: string;
  label: string;
  emptyText: string;
  slices: Slice[];
  total: number;
  index: number;
  /** Clique numa categoria (linha da tabela ou fatia): abre os lançamentos dela. */
  onSelect: (slice: Slice) => void;
};

/** Pizza (rosca) por categoria + tabela com valor e percentual. Cada categoria é clicável. */
export function PiePanel({ title, label, emptyText, slices, total, index, onSelect }: Props) {
  const [active, setActive] = useState<string | null>(null);
  const key = (s: Slice) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(s);
    }
  };

  return (
    <section className="panel panel-pie" style={{ "--i": index } as CSSProperties} aria-label={title}>
      <h2>{title}</h2>
      {slices.length === 0 ? (
        <p className="empty muted">{emptyText}</p>
      ) : (
        <div className="donut-wrap">
          <Donut slices={slices} total={total} label={label} active={active} onSelect={onSelect} />
          <table className="legend" onPointerLeave={() => setActive(null)}>
            <caption className="sr">{title}. Toque em uma categoria para ver os lançamentos.</caption>
            <thead className="sr">
              <tr>
                <th>Categoria</th>
                <th>Parcela</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {slices.map((s) => (
                <tr
                  key={s.id}
                  tabIndex={0}
                  role="button"
                  className={`legend-row ${active === s.id ? "hot" : ""}`}
                  aria-label={`${s.name}: ${brl.format(s.value)}, ${s.pct.toFixed(0)}%. Ver lançamentos${s.ids.length > 1 ? ` das ${s.ids.length} categorias` : ""}`}
                  onClick={() => onSelect(s)}
                  onKeyDown={key(s)}
                  onPointerEnter={() => setActive(s.id)}
                  onFocus={() => setActive(s.id)}
                  onBlur={() => setActive(null)}
                >
                  <td>
                    <span className="dot" style={{ background: s.color }} />
                    <span className="legend-name">
                      {s.name}
                      {s.members && <span className="legend-members muted small">{s.members.join(", ")}</span>}
                    </span>
                  </td>
                  <td className="num muted">{s.pct.toFixed(0)}%</td>
                  <td className="num">
                    {brl.format(s.value)} <Icon name="right" size={14} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
