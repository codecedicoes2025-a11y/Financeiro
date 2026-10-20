"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cloudEnabled } from "@/lib/supabase";
import type { Root, Workspace } from "@/lib/types";
import { useAuth } from "@/lib/useAuth";
import { useRootData } from "@/lib/useRootData";
import App from "./App";
import { LoginScreen, NewPasswordScreen } from "./LoginScreen";
import { WorkspacePicker } from "./WorkspacePicker";

const WS_KEY = "financeiro:ws";

const totals = (root: Root) => ({
  accounts: root.pf.accounts.length + root.pj.accounts.length,
  entries: root.pf.entries.length + root.pj.entries.length,
});

/** Porta de entrada: login (se o Supabase estiver configurado), dados, escolha de Finanças PF/PJ e o app. */
export default function Shell() {
  const auth = useAuth();
  const data = useRootData(auth.user?.id ?? null, cloudEnabled);
  const [ws, setWs] = useState<Workspace | null>(null);
  const [last, setLast] = useState<Workspace | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(WS_KEY);
      if (v === "pf" || v === "pj") setLast(v);
    } catch {
      /* ignore */
    }
  }, []);

  const pick = useCallback((next: Workspace) => {
    setWs(next);
    setLast(next);
    try {
      localStorage.setItem(WS_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const signOut = useCallback(async () => {
    await auth.signOut();
    setWs(null);
  }, [auth]);

  const counts = useMemo(() => ({ pf: { accounts: data.root.pf.accounts.length, entries: data.root.pf.entries.length }, pj: { accounts: data.root.pj.accounts.length, entries: data.root.pj.entries.length } }), [data.root]);

  if (cloudEnabled) {
    if (!auth.ready) return <div className="boot" aria-busy="true" />;
    if (auth.recovery) return <NewPasswordScreen onSubmit={auth.updatePassword} />;
    if (!auth.user) return <LoginScreen signIn={auth.signIn} signUp={auth.signUp} resetPassword={auth.resetPassword} />;
  }

  if (data.conflict) {
    const l = totals(data.conflict.local);
    const r = totals(data.conflict.remote);
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-brand">Financeiro</div>
          <div>
            <h1>Dados diferentes</h1>
            <p className="muted small">
              Este aparelho tem dados que ainda não foram sincronizados com a sua conta, e a conta já tem outros dados salvos. Qual você quer manter?
            </p>
          </div>
          <div className="ws-grid">
            <button className="ws-card" onClick={() => void data.resolveConflict("remote")}>
              <strong>Usar o da nuvem</strong>
              <span className="muted small">
                {r.accounts} contas · {r.entries} lançamentos
                {data.conflict.remoteAt && ` · salvo em ${new Date(data.conflict.remoteAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}
              </span>
              <span className="muted small">O que está só neste aparelho é substituído (uma cópia de segurança fica guardada).</span>
            </button>
            <button className="ws-card" onClick={() => void data.resolveConflict("local")}>
              <strong>Usar o deste aparelho</strong>
              <span className="muted small">
                {l.accounts} contas · {l.entries} lançamentos
              </span>
              <span className="muted small">O que está na nuvem é substituído (uma cópia de segurança fica guardada).</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data.ready) return <div className="boot" aria-busy="true" />;

  if (!ws) return <WorkspacePicker email={auth.user?.email ?? undefined} last={last} counts={counts} onPick={pick} onSignOut={cloudEnabled ? signOut : undefined} />;

  return (
    <App
      root={data.root}
      dispatchRoot={data.dispatch}
      ws={ws}
      onSwitchWorkspace={() => setWs(null)}
      onRestore={data.replaceRoot}
      account={{ enabled: cloudEnabled, email: auth.user?.email ?? undefined, sync: data.sync, onSignOut: signOut, onPull: data.pullNow }}
    />
  );
}
