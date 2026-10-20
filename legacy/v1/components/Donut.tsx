"use client";

import { useEffect, useState } from "react";
import { brl, type Slice } from "@/lib/stats";
import { AnimatedNumber } from "./AnimatedNumber";

const R = 47;

type Props = { slices: Slice[]; total: number; label: string; active: string | null };

export function Donut({ slices, total, label, active }: Props) {
  const [drawn, setDrawn] = useState(false);
  const sig = slices.map((s) => `${s.id}:${s.pct.toFixed(1)}`).join("|");

  // Re-desenha as fatias quando os dados mudam.
  useEffect(() => {
    setDrawn(false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true)));
    return () => cancelAnimationFrame(id);
  }, [sig]);

  const summary = slices.map((s) => `${s.name} ${s.pct.toFixed(0)}%`).join(", ");
  let offset = 0;

  return (
    <div className="donut" role="img" aria-label={`${label}: ${brl.format(total)}. ${summary || "Sem dados"}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--track)" strokeWidth="9" />
        <g transform="rotate(-90 60 60)">
          {slices.map((s, i) => {
            const gap = slices.length > 1 ? 1.1 : 0;
            const len = Math.max(s.pct - gap, 0.1);
            const el = (
              <circle
                key={s.id}
                cx="60"
                cy="60"
                r={R}
                pathLength={100}
                fill="none"
                stroke={s.color}
                strokeWidth={active === s.id ? 12 : 9}
                strokeDasharray={drawn ? `${len} ${100 - len}` : "0 100"}
                strokeDashoffset={-offset}
                opacity={active && active !== s.id ? 0.28 : 1}
                style={{ transition: `stroke-dasharray 0.8s cubic-bezier(0.22,1,0.36,1) ${i * 60}ms, stroke-width 0.2s ease, opacity 0.2s ease` }}
              />
            );
            offset += s.pct;
            return el;
          })}
        </g>
      </svg>
      <div className="donut-center">
        <span className="muted">{label}</span>
        <strong className="num">
          <AnimatedNumber value={total} format={(n) => brl.format(n)} />
        </strong>
      </div>
    </div>
  );
}
