"use client";

import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "./supabase";

const pt = (message: string): string => {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar: procure a mensagem na sua caixa de entrada (e no spam).";
  if (m.includes("already registered") || m.includes("already been registered")) return "Esse e-mail já tem conta. Use “Entrar”.";
  if (m.includes("at least") && m.includes("character")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled") || m.includes("signups are disabled")) return "O cadastro de novas contas está desativado. Entre com a conta já criada.";
  if (m.includes("rate limit") || m.includes("too many")) return "Muitas tentativas. Espere alguns minutos e tente de novo.";
  if (m.includes("same password") || m.includes("different from the old")) return "A nova senha precisa ser diferente da atual.";
  if (m.includes("fetch") || m.includes("network")) return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
  return message;
};

export type AuthResult = { ok: boolean; message?: string };

export function useAuth() {
  const sb = getSupabase();
  const [ready, setReady] = useState(!sb);
  const [user, setUser] = useState<User | null>(null);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!sb) return;
    let alive = true;
    sb.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setReady(true);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [sb]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!sb) return { ok: false, message: "Login não configurado." };
      const { error } = await sb.auth.signInWithPassword({ email, password });
      return error ? { ok: false, message: pt(error.message) } : { ok: true };
    },
    [sb],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!sb) return { ok: false, message: "Login não configurado." };
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined } });
      if (error) return { ok: false, message: pt(error.message) };
      // Com confirmação de e-mail ligada, não há sessão até o clique no link.
      return data.session ? { ok: true } : { ok: true, message: "Conta criada! Enviamos um e-mail de confirmação: clique no link e depois volte para entrar." };
    },
    [sb],
  );

  const resetPassword = useCallback(
    async (email: string): Promise<AuthResult> => {
      if (!sb) return { ok: false, message: "Login não configurado." };
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined });
      return error ? { ok: false, message: pt(error.message) } : { ok: true, message: "Se esse e-mail tiver conta, enviamos um link para criar uma nova senha." };
    },
    [sb],
  );

  const updatePassword = useCallback(
    async (password: string): Promise<AuthResult> => {
      if (!sb) return { ok: false, message: "Login não configurado." };
      const { error } = await sb.auth.updateUser({ password });
      if (error) return { ok: false, message: pt(error.message) };
      setRecovery(false);
      return { ok: true };
    },
    [sb],
  );

  const signOut = useCallback(async () => {
    await sb?.auth.signOut();
  }, [sb]);

  return { enabled: !!sb, ready, user, recovery, signIn, signUp, resetPassword, updatePassword, signOut };
}
