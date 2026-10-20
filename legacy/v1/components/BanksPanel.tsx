"use client";

import { useState } from "react";
import { fetchPluggyAccounts, type BankConfig, type PluggyAccount, type SyncStatus } from "@/lib/banks";
import type { Account } from "@/lib/types";
import { Icon } from "./Icon";

type Props = {
  config: BankConfig;
  onChange: (patch: Partial<BankConfig>) => void;
  accounts: Account[];
  status: SyncStatus;
  onSync: () => void;
};

function Secret({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <label className="field">
      <span>{label}</span>
      <div className="secret">
        <input type={show ? "text" : "password"} autoComplete="off" spellCheck={false} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value.trim())} />
        <button type="button" className="btn btn-sm" onClick={() => setShow((s) => !s)} aria-pressed={show}>
          {show ? "Ocultar" : "Mostrar"}
        </button>
      </div>
    </label>
  );
}

export function BanksPanel({ config, onChange, accounts, status, onSync }: Props) {
  const [found, setFound] = useState<PluggyAccount[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const running = status.phase === "running";
  const connected = !!config.mpToken || Object.values(config.pluggyMap).some(Boolean);

  async function discover() {
    setBusy(true);
    setMsg(null);
    try {
      const list = await fetchPluggyAccounts(config);
      setFound(list);
      setMsg({ ok: true, text: `${list.length} conta(s) encontrada(s). Escolha abaixo onde cada uma entra.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao buscar contas." });
    }
    setBusy(false);
  }

  return (
    <section className="panel glass" aria-labelledby="bk-h">
      <div className="panel-head">
        <h2 id="bk-h">Conectar banco</h2>
        <span className={`badge ${connected ? "badge-ok" : ""}`}>{connected ? "Conectado" : "Não conectado"}</span>
      </div>
      <p className="muted small">
        Puxa o extrato dos últimos 60 dias, sem você baixar arquivo. Depois de conectar, use o botão <b>Sincronizar</b> no Resumo. O Payoneer
        continua por importação de arquivo.
      </p>

      <div className="bank">
        <h3>Mercado Pago <span className="badge">API oficial · grátis</span></h3>
        <details>
          <summary>Passo a passo</summary>
          <ol className="steps">
            <li>Entre em <b>mercadopago.com.br/developers</b> com a sua conta.</li>
            <li>Vá em <b>Suas integrações › Criar aplicação</b>. Pode ser qualquer nome (ex.: “Financeiro”).</li>
            <li>Abra a aplicação, depois <b>Credenciais de produção</b>. Se pedir para ativar, preencha o formulário rápido.</li>
            <li>Copie o <b>Access Token</b> (começa com <code>APP_USR-</code>) e cole abaixo.</li>
            <li>Escolha em qual conta do app os lançamentos entram e toque em <b>Sincronizar tudo</b>.</li>
          </ol>
        </details>
        <Secret label="Access Token de produção" value={config.mpToken} onChange={(v) => onChange({ mpToken: v })} placeholder="APP_USR-…" />
        <label className="field">
          <span>Entra na conta</span>
          <select value={config.mpAccountId} onChange={(e) => onChange({ mpAccountId: e.target.value })}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="bank">
        <h3>C6 Bank e outros <span className="badge">Open Finance · Meu Pluggy</span></h3>
        <details>
          <summary>Passo a passo</summary>
          <ol className="steps">
            <li>Crie uma conta grátis em <b>meu.pluggy.ai</b> e conecte o C6. Você autoriza dentro do app do banco.</li>
            <li>Se o C6 não aparecer na lista de bancos, esse caminho não serve para ele: use a aba Importar com o extrato do app do C6.</li>
            <li>Em <b>dashboard.pluggy.ai</b>, copie o <b>Client ID</b> e o <b>Client Secret</b> da sua aplicação.</li>
            <li>Copie o <b>Item ID</b> da conexão do C6 (identificador da conexão no Meu Pluggy). Pode colar vários, separados por vírgula.</li>
            <li>Cole tudo abaixo e toque em <b>Buscar contas</b>. Depois escolha: conta corrente → “C6 Conta”, cartão → “C6 Cartão”.</li>
          </ol>
        </details>
        <label className="field">
          <span>Client ID</span>
          <input autoComplete="off" spellCheck={false} value={config.pluggyClientId} onChange={(e) => onChange({ pluggyClientId: e.target.value.trim() })} />
        </label>
        <Secret label="Client Secret" value={config.pluggyClientSecret} onChange={(v) => onChange({ pluggyClientSecret: v })} />
        <label className="field">
          <span>Item ID(s)</span>
          <input autoComplete="off" spellCheck={false} placeholder="uuid, uuid" value={config.pluggyItemIds} onChange={(e) => onChange({ pluggyItemIds: e.target.value })} />
        </label>
        <button className="btn" onClick={discover} disabled={busy || !config.pluggyClientId || !config.pluggyClientSecret || !config.pluggyItemIds}>
          {busy ? "Buscando…" : "Buscar contas"}
        </button>

        {found.length > 0 && (
          <ul className="plain map">
            {found.map((a) => (
              <li key={a.id} className="line">
                <span>
                  {a.name} <span className="muted small">· {a.type === "CREDIT" ? "cartão" : "conta"}{a.number ? ` ${a.number}` : ""}</span>
                </span>
                <select
                  aria-label={`Conta do app para ${a.name}`}
                  value={config.pluggyMap[a.id] ?? ""}
                  onChange={(e) => onChange({ pluggyMap: { ...config.pluggyMap, [a.id]: e.target.value } })}
                >
                  <option value="">Ignorar</option>
                  {accounts.map((x) => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
        {msg && (
          <p className={`result ${msg.ok ? "result-ok" : "result-err"}`} role="status">{msg.text}</p>
        )}
      </div>

      <div className="row-actions">
        <button className="btn btn-primary" onClick={onSync} disabled={!connected || running}>
          <Icon name="refresh" size={18} /> {running ? "Sincronizando…" : "Sincronizar tudo"}
        </button>
      </div>
      {status.phase !== "idle" && status.phase !== "running" && (
        <p className={`result ${status.phase === "done" ? "result-ok" : "result-err"}`} role="status">{status.message}</p>
      )}
      <p className="muted small">
        As credenciais ficam só neste aparelho e não entram no backup. Elas passam pelo servidor do app apenas para falar com o banco (nunca
        são gravadas). O acesso é somente leitura: o app não consegue movimentar dinheiro.
      </p>
    </section>
  );
}
