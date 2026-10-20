"use client";

import { useMemo, useState } from "react";
import { addMonths, fmtBR, iso, startOfMonth, today, type Range } from "@/lib/dates";
import { Icon } from "./Icon";

type Props = { range: Range; onChange: (r: Range) => void; onDone: () => void };

const WEEK = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Um calendário só: clique no primeiro dia e, no mesmo calendário, no último. Dá para trocar de mês no meio. */
export function RangeCalendar({ range, onChange, onDone }: Props) {
  const [view, setView] = useState(startOfMonth(range.from));
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const cells = useMemo(() => {
    const [y, m] = view.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const days = new Date(y, m, 0).getDate();
    const out: (string | null)[] = Array.from({ length: first.getDay() }, () => null);
    for (let d = 1; d <= days; d++) out.push(iso(new Date(y, m - 1, d)));
    return out;
  }, [view]);

  // Intervalo exibido: o que está sendo escolhido agora ou o atual.
  const shown = anchor ? [anchor, hover ?? anchor].sort() : [range.from, range.to];
  const [lo, hi] = [shown[0], shown[1]];
  const now = today();
  const title = new Date(`${view}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  function pick(d: string) {
    if (!anchor) {
      setAnchor(d);
      setHover(d);
      return;
    }
    const [from, to] = [anchor, d].sort();
    onChange({ from, to, preset: "custom" });
    setAnchor(null);
    setHover(null);
    onDone();
  }

  return (
    <div className="cal" role="group" aria-label="Escolher intervalo de datas">
      <div className="cal-head">
        <button className="icon-btn" aria-label="Mês anterior" onClick={() => setView(addMonths(view, -1))}>
          <Icon name="left" />
        </button>
        <strong className="cal-title">{title.charAt(0).toUpperCase() + title.slice(1)}</strong>
        <button className="icon-btn" aria-label="Próximo mês" onClick={() => setView(addMonths(view, 1))}>
          <Icon name="right" />
        </button>
      </div>

      <p className="cal-hint small" aria-live="polite">
        {anchor ? `Início em ${fmtBR(anchor)}. Agora clique no último dia.` : "Clique no primeiro dia do período."}
      </p>

      <div className="cal-grid" onPointerLeave={() => anchor && setHover(anchor)}>
        {WEEK.map((w, i) => (
          <span key={i} className="cal-dow">
            {w}
          </span>
        ))}
        {cells.map((d, i) =>
          d ? (
            <button
              key={d}
              type="button"
              className={`cal-day ${d >= lo && d <= hi ? "in" : ""} ${d === lo ? "start" : ""} ${d === hi ? "end" : ""} ${d === now ? "today" : ""}`}
              aria-label={fmtBR(d)}
              aria-pressed={d === lo || d === hi}
              onClick={() => pick(d)}
              onPointerEnter={() => anchor && setHover(d)}
              onFocus={() => anchor && setHover(d)}
            >
              {Number(d.slice(8))}
            </button>
          ) : (
            <span key={`b${i}`} />
          ),
        )}
      </div>

      <div className="cal-foot">
        <button className="btn btn-sm" onClick={() => (anchor ? (setAnchor(null), setHover(null)) : onDone())}>
          {anchor ? "Recomeçar" : "Fechar"}
        </button>
        <button
          className="btn btn-sm"
          onClick={() => {
            onChange({ from: now, to: now, preset: "today" });
            setAnchor(null);
            onDone();
          }}
        >
          Só hoje
        </button>
      </div>
    </div>
  );
}
