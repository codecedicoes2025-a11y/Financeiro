"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { getSupabase } from "./supabase";
import { hasData, initialRoot, loadLocalRoot, normalizeRoot, rootReducer, saveLocalRoot } from "./store";
import type { Root } from "./types";

const SYNC_KEY = "financeiro:v3:synced";
const DIRTY_KEY = "financeiro:v3:dirty";
const BACKUP_KEY = "financeiro:v3:backup-before-sync";
const TABLE = "finance_state";

export type SyncState = "local" | "idle" | "saving" | "saved" | "error";
export type Conflict = { local: Root; remote: Root; remoteAt: string };

/** JSON com chaves em ordem fixa: o Postgres (jsonb) reordena as chaves, então comparar texto puro daria falsa diferença. */
function canon(v: unknown): string {
  const sort = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(sort);
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, val]) => [k, sort(val)]));
    return x;
  };
  return JSON.stringify(sort(v));
}

async function fetchRemote(uid: string): Promise<{ root: Root; at: string } | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from(TABLE).select("data, updated_at").eq("user_id", uid).maybeSingle();
  if (error) throw error;
  return data ? { root: normalizeRoot(data.data), at: String(data.updated_at ?? "") } : null;
}

async function saveRemote(uid: string, root: Root): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from(TABLE).upsert({ user_id: uid, data: root, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}

/**
 * Dados do app (os dois livros). Em modo local fica só neste aparelho; com login, fica por usuário no Supabase
 * (com cópia local) e acompanha você entre aparelhos.
 */
export function useRootData(userId: string | null, cloud: boolean) {
  const [root, dispatch] = useReducer(rootReducer, undefined, initialRoot);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncState>(cloud ? "idle" : "local");
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const lastSaved = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markSynced = (uid: string) => {
    try {
      localStorage.setItem(SYNC_KEY, uid);
      localStorage.removeItem(DIRTY_KEY);
    } catch {
      /* ignore */
    }
  };

  const adopt = useCallback((next: Root) => {
    lastSaved.current = canon(next);
    saveLocalRoot(next);
    dispatch({ type: "load", root: next });
  }, []);

  // Carga inicial (e ao trocar de usuário).
  useEffect(() => {
    let cancelled = false;
    setConflict(null);
    if (cloud && !userId) {
      setReady(false);
      return;
    }
    const local = loadLocalRoot();
    if (!cloud) {
      adopt(local ?? initialRoot());
      setSync("local");
      setReady(true);
      return;
    }
    setReady(false);
    setSync("idle");
    (async () => {
      try {
        const remote = await fetchRemote(userId!);
        if (cancelled) return;
        if (!remote) {
          // Primeira vez deste usuário: sobe o que existe neste aparelho (ou um livro vazio).
          const base = local ?? initialRoot();
          await saveRemote(userId!, base);
          markSynced(userId!);
          adopt(base);
          setSync("saved");
          setReady(true);
          return;
        }
        const unsynced = !!local && hasData(local) && (localStorage.getItem(SYNC_KEY) !== userId || localStorage.getItem(DIRTY_KEY) === "1");
        if (unsynced && canon(local) !== canon(remote.root)) {
          setConflict({ local: local!, remote: remote.root, remoteAt: remote.at });
          return;
        }
        markSynced(userId!);
        adopt(remote.root);
        setSync("saved");
        setReady(true);
      } catch {
        if (cancelled) return;
        // Sem conexão: abre com a cópia local e tenta sincronizar depois.
        adopt(local ?? initialRoot());
        setSync("error");
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, cloud, adopt]);

  // Salva a cada alteração: na hora no aparelho, e na nuvem com um pequeno atraso.
  useEffect(() => {
    if (!ready) return;
    const json = canon(root);
    if (json === lastSaved.current) return;
    saveLocalRoot(root);
    if (!cloud || !userId) {
      lastSaved.current = json;
      return;
    }
    try {
      localStorage.setItem(DIRTY_KEY, "1");
    } catch {
      /* ignore */
    }
    setSync("saving");
    timer.current = setTimeout(async () => {
      try {
        await saveRemote(userId, root);
        lastSaved.current = json;
        markSynced(userId);
        setSync("saved");
      } catch {
        setSync("error");
      }
    }, 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [root, ready, cloud, userId]);

  const pullNow = useCallback(async () => {
    if (!cloud || !userId) return false;
    const remote = await fetchRemote(userId);
    if (!remote) return false;
    adopt(remote.root);
    markSynced(userId);
    setSync("saved");
    return true;
  }, [cloud, userId, adopt]);

  // Ao voltar para a aba, puxa o que foi feito em outro aparelho (se não houver alteração pendente aqui).
  useEffect(() => {
    if (!cloud || !userId || !ready) return;
    const onBack = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        if (localStorage.getItem(DIRTY_KEY) === "1") return;
        const remote = await fetchRemote(userId);
        if (remote && canon(remote.root) !== lastSaved.current) adopt(remote.root);
      } catch {
        /* sem conexão: segue com o que tem */
      }
    };
    document.addEventListener("visibilitychange", onBack);
    return () => document.removeEventListener("visibilitychange", onBack);
  }, [cloud, userId, ready, adopt]);

  const resolveConflict = useCallback(
    async (choice: "remote" | "local") => {
      if (!conflict || !userId) return;
      try {
        // Rede de segurança: guarda uma cópia do que será substituído.
        localStorage.setItem(BACKUP_KEY, JSON.stringify({ at: new Date().toISOString(), discarded: choice === "remote" ? conflict.local : conflict.remote }));
      } catch {
        /* ignore */
      }
      const chosen = choice === "remote" ? conflict.remote : conflict.local;
      if (choice === "local") await saveRemote(userId, chosen);
      markSynced(userId);
      adopt(chosen);
      setSync("saved");
      setConflict(null);
      setReady(true);
    },
    [conflict, userId, adopt],
  );

  const replaceRoot = useCallback((raw: unknown) => dispatch({ type: "load", root: normalizeRoot(raw) }), []);

  return { root, dispatch, ready, sync, conflict, resolveConflict, replaceRoot, pullNow };
}
