"use client";

import { useState } from "react";
import { fmtBR, presetRange, rangeLabel, shiftRange, type Preset, type Range } from "@/lib/dates";
import { Icon } from "./Icon";
import { RangeCalendar } from "./RangeCalendar";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "month", label: "Este mês" },
  { id: "lastmonth", label: "Mês passado" },
  { id: "year", label: "Este ano" },
];

/** Período dia a dia: atalhos, setas para avançar/voltar e um calendário único para escolher início e fim. */
export function PeriodPicker({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="period" aria-label="Período">
      <div className="period-nav">
        <button className="icon-btn" aria-label="Período anterior" onClick={() => onChange(shiftRange(range, -1))}>
          <Icon name="left" />
        </button>
        <strong className="period-label" aria-live="polite">
          {rangeLabel(range)}
        </strong>
        <button className="icon-btn" aria-label="Próximo período" onClick={() => onChange(shiftRange(range, 1))}>
          <Icon name="right" />
        </button>
      </div>

      <div className="chips scroll" role="group" aria-label="Atalhos de período">
        {PRESETS.map((p) => (
          <button key={p.id} className={`chip ${range.preset === p.id ? "chip-on" : ""}`} aria-pressed={range.preset === p.id} onClick={() => onChange(presetRange(p.id))}>
            {p.label}
          </button>
        ))}
      </div>

      <button className={`range-btn ${open ? "open" : ""}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="calendar" size={18} />
        <span>
          {fmtBR(range.from)} <span className="muted">até</span> {fmtBR(range.to)}
        </span>
        <span className="range-hint muted small">{open ? "Fechar calendário" : "Escolher no calendário"}</span>
      </button>

      {open && <RangeCalendar range={range} onChange={onChange} onDone={() => setOpen(false)} />}
    </section>
  );
}
