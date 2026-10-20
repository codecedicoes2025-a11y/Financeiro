"use client";

import { useCallback, useMemo, useRef, useState, type Dispatch } from "react";
import { FALLBACK_CATEGORY, normalize } from "./categories";
import { aiKey, categorizeItems, type AiItem, type AiSettings } from "./gemini";
import type { Category, State } from "./types";

export type AiStatus =
  | { phase: "idle" }
  | { phase: "running"; done: number; total: number; model: string }
  | { phase: "done"; changed: number; failed: number }
  | { phase: "error"; message: string };

const NEW_COLORS = ["#22D3EE", "#A78BFA", "#FB7185", "#FBBF24", "#4ADE80", "#F472B6", "#60A5FA", "#FB923C"];

type ApplyAction = { type: "applyAi"; updates: { key: string; categoryId: string }[]; newCategories: Category[] };

export function useAiRunner(state: State, dispatch: Dispatch<ApplyAction>, settings: AiSettings) {
  const [status, setStatus] = useState<AiStatus>({ phase: "idle" });
  const stateRef = useRef(state);
  stateRef.current = state;
  const running = useRef(false);

  /** Descrições únicas ainda em "Outros" que a IA não viu. */
  const pending = useMemo<AiItem[]>(() => {
    const seen = new Map<string, AiItem>();
    for (const t of state.transactions) {
      if (t.manual || t.categoryId !== FALLBACK_CATEGORY) continue;
      const key = aiKey(t.description);
      if (!key || key in state.aiCache || seen.has(key)) continue;
      seen.set(key, { key, text: t.description.slice(0, 80), sign: t.amount >= 0 ? "+" : "-" });
    }
    return [...seen.values()];
  }, [state.transactions, state.aiCache]);

  const run = useCallback(async () => {
    if (running.current || !settings.apiKey) return;
    const items = pending;
    if (!items.length) return;
    running.current = true;
    setStatus({ phase: "running", done: 0, total: items.length, model: "" });

    const known = [...stateRef.current.categories];
    let changed = 0;
    try {
      const { failed } = await categorizeItems(items, known, settings, (results, progress) => {
        const created: Category[] = [];
        const updates: { key: string; categoryId: string }[] = [];
        for (const r of results) {
          let id = r.categoryId;
          if (!id && r.newName) {
            const name = r.newName;
            const existing = [...known, ...created].find((c) => normalize(c.name) === normalize(name));
            if (existing) id = existing.id;
            else {
              const cat: Category = {
                id: `ai-${normalize(name).replace(/[^a-z0-9]+/g, "-")}`,
                name,
                color: NEW_COLORS[(known.length + created.length) % NEW_COLORS.length],
              };
              created.push(cat);
              id = cat.id;
            }
          }
          if (id) updates.push({ key: r.key, categoryId: id });
        }
        known.push(...created);
        changed += updates.filter((u) => u.categoryId !== FALLBACK_CATEGORY).length;
        dispatch({ type: "applyAi", updates, newCategories: created });
        setStatus({ phase: "running", done: progress.done, total: progress.total, model: progress.model });
      });
      setStatus({ phase: "done", changed, failed });
    } catch (e) {
      setStatus({ phase: "error", message: e instanceof Error ? e.message : "Falha ao falar com o Gemini." });
    } finally {
      running.current = false;
    }
  }, [pending, settings, dispatch]);

  const dismiss = useCallback(() => setStatus({ phase: "idle" }), []);
  return { status, run, dismiss, pendingCount: pending.length };
}
