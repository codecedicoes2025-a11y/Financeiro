"use client";

import { useState } from "react";
import type { AuthResult } from "@/lib/useAuth";

type Mode = "signin" | "signup" | "reset";

type Props = {
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  resetPassword: (email: string) => Promise<AuthResult>;
};

const TITLES: Record<Mode, { h: string; sub: string; cta: string }> = {
  signin: { h: "Entrar", sub: "Use o e-mail e a senha da sua conta.", cta: "Entrar" },
  signup: { h: "Criar conta", sub: "Crie o seu acesso com e-mail e senha.", cta: "Criar conta" },
  reset: { h: "Recuperar senha", sub: "Enviamos um link para você criar uma nova senha.", cta: "Enviar link" },
};

export function LoginScreen({ signIn, signUp, resetPassword }: Props) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const mail = email.trim();
    if (!mail) return setMsg({ ok: false, text: "Digite seu e-mail." });
    if (mode !== "reset" && password.length < 6) return setMsg({ ok: false, text: "A senha precisa ter pelo menos 6 caracteres." });
    setBusy(true);
    setMsg(null);
    const r = mode === "signin" ? await signIn(mail, password) : mode === "signup" ? await signUp(mail, password) : await resetPassword(mail);
    setBusy(false);
    // No login com sucesso a tela troca sozinha; nos outros casos mostramos o aviso.
    if (!r.ok) setMsg({ ok: false, text: r.message ?? "Não deu certo." });
    else if (r.message) setMsg({ ok: true, text: r.message });
  }

  const t = TITLES[mode];

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="auth-brand">Financeiro</div>
        <div>
          <h1>{t.h}</h1>
          <p className="muted small">{t.sub}</p>
        </div>

        <label className="field">
          <span>E-mail</span>
          <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="voce@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>

        {mode !== "reset" && (
          <label className="field">
            <span>Senha</span>
            <div className="secret">
              <input
                type={show ? "text" : "password"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder="Mínimo de 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className="btn btn-sm" onClick={() => setShow((s) => !s)} aria-pressed={show}>
                {show ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </label>
        )}

        {msg && (
          <p className={`result ${msg.ok ? "result-ok" : "result-err"}`} role={msg.ok ? "status" : "alert"}>
            {msg.text}
          </p>
        )}

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Aguarde…" : t.cta}
        </button>

        <div className="auth-links">
          {mode === "signin" && (
            <>
              <button type="button" className="link" onClick={() => (setMode("reset"), setMsg(null))}>
                Esqueci minha senha
              </button>
              <button type="button" className="link" onClick={() => (setMode("signup"), setMsg(null))}>
                Criar conta
              </button>
            </>
          )}
          {mode !== "signin" && (
            <button type="button" className="link" onClick={() => (setMode("signin"), setMsg(null))}>
              Voltar para entrar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/** Tela mostrada quando você chega pelo link de "recuperar senha" do e-mail. */
export function NewPasswordScreen({ onSubmit }: { onSubmit: (password: string) => Promise<AuthResult> }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return setMsg("A senha precisa ter pelo menos 6 caracteres.");
    setBusy(true);
    const r = await onSubmit(password);
    setBusy(false);
    if (!r.ok) setMsg(r.message ?? "Não deu certo.");
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="auth-brand">Financeiro</div>
        <div>
          <h1>Nova senha</h1>
          <p className="muted small">Escolha a nova senha da sua conta.</p>
        </div>
        <label className="field">
          <span>Nova senha</span>
          <input type="password" autoComplete="new-password" placeholder="Mínimo de 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {msg && (
          <p className="result result-err" role="alert">
            {msg}
          </p>
        )}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Salvando…" : "Salvar nova senha"}
        </button>
      </form>
    </div>
  );
}
