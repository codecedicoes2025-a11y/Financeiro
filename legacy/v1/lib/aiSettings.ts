"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_AI, type AiSettings } from "./gemini";

/** Guardado à parte do backup: a chave nunca sai deste aparelho. */
const KEY = "financeiro:ai";

export function useAiSettings() {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setSettings({ ...DEFAULT_AI, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  const update = useCallback((patch: Partial<AiSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { settings, update, loaded };
}
