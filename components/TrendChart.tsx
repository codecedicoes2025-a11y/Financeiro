"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { brl, type MonthPoint } from "@/lib/stats";

const PAD = { l: 58, r: 18, t: 16, b: 34 };
const IN = "var(--fg)";
const OUT = "var(--muted)";

const compact = (n: number) =>
  n >= 1000 ? `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil` : n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

function niceMax(v: number): number {
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Curva suave que não ultrapassa os pontos (Catmull-Rom limitada). */
function smooth(pts: [number, number][], H: number): string {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1y = Math.max(0, Math.min(H, p1[1] + (p2[1] - p0[1]) / 6));
    const c2y = Math.max(0, Math.min(H, p2[1] - (p3[1] - p1[1]) / 6));
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${c1y} ${p2[0] - (p3[0] - p1[0]) / 6},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export function TrendChart({ data, year }: { data: MonthPoint[]; year: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [W, setW] = useState(640);
  const H = Math.round(Math.min(Math.max(W * 0.48, 220), 340));

  // Mede a largura real para o texto manter tamanho fixo (em px) em qualquer tela.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, Math.round(el.clientWidth))));
    ro.observe(el);
    setW(Math.max(280, Math.round(el.clientWidth)));
    return () => ro.disconnect();
  }, []);

  const { max, x, y } = useMemo(() => {
    const max = niceMax(Math.max(0, ...data.flatMap((d) => [d.income, d.expense])));
    const iw = W - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;
    return {
      max,
      x: (i: number) => PAD.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw),
      y: (v: number) => PAD.t + ih - (v / max) * ih,
    };
  }, [data, W, H]);

  const inPts = data.map((d, i) => [x(i), y(d.income)] as [number, number]);
  const outPts = data.map((d, i) => [x(i), y(d.expense)] as [number, number]);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);

  function onMove(e: React.PointerEvent) {
    const r = box.current?.getBoundingClientRect();
    if (!r || !data.length) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < data.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  }

  const h = hover !== null ? data[hover] : null;
  const tipLeft = hover !== null ? Math.min(Math.max((x(hover) / W) * 100, 14), 86) : 0;

  return (
    <div className="trend">
      <div className="trend-legend small" aria-hidden="true">
        <span><i style={{ background: IN }} /> Entradas</span>
        <span><i style={{ background: OUT }} /> Saídas</span>
        <span className="muted">{year}</span>
      </div>

      <div className="trend-box" ref={box} onPointerMove={onMove} onPointerLeave={() => setHover(null)} onPointerDown={onMove}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Entradas e saídas por mês em ${year}`}>
          <defs>
            <pattern id="dots" width="12" height="12" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.9" fill="var(--border-strong)" />
            </pattern>
            <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: "var(--fg)", stopOpacity: 0.16 }} />
              <stop offset="1" style={{ stopColor: "var(--fg)", stopOpacity: 0 }} />
            </linearGradient>
            <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: "var(--muted)", stopOpacity: 0.22 }} />
              <stop offset="1" style={{ stopColor: "var(--muted)", stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} fill="url(#dots)" opacity="0.6" />
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 5" />
              <text x={PAD.l - 10} y={y(t) + 4} textAnchor="end" className="axis">{compact(t)}</text>
            </g>
          ))}
          {data.map((d, i) => (
            <text key={d.month} x={x(i)} y={H - 10} textAnchor="middle" className={`axis ${hover === i ? "axis-on" : ""}`}>{d.label}</text>
          ))}
          {h && hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--muted)" strokeDasharray="3 4" opacity="0.7" />}

          {data.length > 1 && (
            <>
              <path className="area" d={`${smooth(outPts, H)} L${x(data.length - 1)},${H - PAD.b} L${x(0)},${H - PAD.b} Z`} fill="url(#gOut)" />
              <path className="area" d={`${smooth(inPts, H)} L${x(data.length - 1)},${H - PAD.b} L${x(0)},${H - PAD.b} Z`} fill="url(#gIn)" />
            </>
          )}
          <path key={`o${data.length}`} d={smooth(outPts, H)} pathLength={1} className="line-draw" style={{ stroke: OUT }} />
          <path key={`i${data.length}`} d={smooth(inPts, H)} pathLength={1} className="line-draw" style={{ stroke: IN, animationDelay: "0.12s" }} />

          {data.map((d, i) => (
            <g key={d.month} className="pt" style={{ animationDelay: `${0.5 + i * 0.05}s` }}>
              <circle cx={x(i)} cy={y(d.expense)} r={hover === i ? 5.5 : 3.5} style={{ fill: "var(--bg)", stroke: OUT }} strokeWidth="2" />
              <circle cx={x(i)} cy={y(d.income)} r={hover === i ? 5.5 : 3.5} style={{ fill: "var(--bg)", stroke: IN }} strokeWidth="2" />
            </g>
          ))}
        </svg>

        {h && (
          <div className="trend-tip glass" style={{ left: `${tipLeft}%` }}>
            <strong>{h.label}</strong>
            <span><i style={{ background: IN }} /> {brl.format(h.income)}</span>
            <span><i style={{ background: OUT }} /> {brl.format(h.expense)}</span>
            <span className={`small ${h.income - h.expense >= 0 ? "pos" : "neg"}`}>Saldo {brl.format(h.income - h.expense)}</span>
          </div>
        )}
      </div>

      <table className="sr">
        <caption>Entradas e saídas por mês</caption>
        <thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th></tr></thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}><td>{d.label}</td><td>{brl.format(d.income)}</td><td>{brl.format(d.expense)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
