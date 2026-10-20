"use client";

import { useState, type CSSProperties } from "react";
import { brl, type Slice } from "@/lib/stats";
import { Donut } from "./Donut";

type Props = { title: string; label: string; emptyText: string; slices: Slice[]; total: number; index: number };

/** Pizza (rosca) por categoria + tabela com valor e percentual. */
export function PiePanel({ title, label, emptyText, slices, total, index }: Props) {
  const [active, setActive] = useState<string | null>(null);
  return (
    <section className="panel panel-pie" style={{ "--i": index } as CSSProperties} aria-label={title}>
      <h2>{title}</h2>
      {slices.length === 0 ? (
        <p className="empty muted">{emptyText}</p>
      ) : (
        <div className="donut-wrap">
          <Donut slices={slices} total={total} label={label} active={active} />
          <table className="legend" onPointerLeave={() => setActive(null)}>
            <caption className="sr">{title}</caption>
            <thead className="sr">
              <tr>
                <th>Categoria</th>
                <th>Parcela</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {slices.map((s) => (
                <tr key={s.id} tabIndex={0} className={active === s.id ? "hot" : ""} onPointerEnter={() => setActive(s.id)} onFocus={() => setActive(s.id)} onBlur={() => setActive(null)}>
                  <td>
                    <span className="dot" style={{ background: s.color }} /> {s.name}
                  </td>
                  <td className="num muted">{s.pct.toFixed(0)}%</td>
                  <td className="num">{brl.format(s.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
