"use client";

import { useState } from "react";
import { DEFAULT_MODELS, testConnection, type AiSettings } from "@/lib/gemini";

type Props = { settings: AiSettings; onChange: (patch: Partial<AiSettings>) => void };

export function GeminiSection({ settings, onChange }: Props) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const connected = settings.apiKey.length > 0;

  async function test() {
    setBusy(true);
    setResult(null);
    try {
      const model = await testConnection(settings);
      setResult({ ok: true, text: `Conectado. Respondeu: ${model}` });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "Falha na conexão." });
    }
    setBusy(false);
  }

  return (
    <section className="panel" aria-labelledby="gm-h">
      <div className="panel-head">
        <h2 id="gm-h">Gemini (ler PDF)</h2>
        <span className={`badge ${connected ? "badge-ok" : ""}`}>{connected ? "Chave salva" : "Sem chave"}</span>
      </div>
      <p className="muted small">
        Com a chave do Google Gemini, a tela <b>Importar extrato</b> passa a aceitar <b>PDF</b>: o Gemini lê o arquivo e entrega os lançamentos para você revisar antes de gravar. A chave é gratuita em
        aistudio.google.com/apikey.
      </p>

      <label className="field">
        <span>Chave da API do Gemini</span>
        <div className="secret">
          <input type={show ? "text" : "password"} autoComplete="off" spellCheck={false} placeholder="AIza…" value={settings.apiKey} onChange={(e) => (setResult(null), onChange({ apiKey: e.target.value.trim() }))} />
          <button type="button" className="btn btn-sm" onClick={() => setShow((s) => !s)} aria-pressed={show}>
            {show ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </label>

      <label className="field">
        <span>Modelos, em ordem de uso (um por linha)</span>
        <textarea rows={5} spellCheck={false} value={settings.models.join("\n")} onChange={(e) => onChange({ models: e.target.value.split("\n").map((m) => m.trim()).filter(Boolean) })} />
      </label>
      <p className="muted small">
        O app alterna entre eles e, se um estourar a cota gratuita, pula para o próximo. Cada modelo tem cota própria.
        <button type="button" className="link" onClick={() => onChange({ models: DEFAULT_MODELS })}>
          Restaurar padrão
        </button>
      </p>

      <label className="field">
        <span>Senhas dos PDFs dos bancos (opcional, uma por linha)</span>
        <textarea
          rows={2}
          spellCheck={false}
          autoComplete="off"
          placeholder="Ex.: a senha dos PDFs do C6"
          value={settings.pdfPasswords.join("\n")}
          onChange={(e) => onChange({ pdfPasswords: e.target.value.split("\n").map((p) => p.trim()).filter(Boolean) })}
        />
      </label>
      <p className="muted small">
        Alguns bancos (como o C6) protegem o extrato em PDF com senha. Salve aqui uma vez: o app abre o PDF <b>no seu aparelho</b> com essa senha, extrai o texto e envia ao Gemini <b>só o texto</b>. A senha
        nunca vai para o Google, fica só neste aparelho e não entra no backup. Com mais de uma senha, o app tenta uma por uma.
      </p>

      <div className="row-actions">
        <button className="btn" onClick={test} disabled={!connected || busy}>
          {busy ? "Testando…" : "Testar conexão"}
        </button>
      </div>
      {result && (
        <p className={`result ${result.ok ? "result-ok" : "result-err"}`} role="status">
          {result.text}
        </p>
      )}

      <p className="muted small">
        <b>Privacidade:</b> ao importar um PDF, o app abre o arquivo aqui e envia ao Google o <b>texto</b> extraído (lançamentos, saldos e dados da conta). Só se o PDF não tiver texto (escaneado) e não tiver senha é que o arquivo inteiro vai. Na camada gratuita, o Google pode usar esse conteúdo
        para melhorar seus produtos. Se isso for um problema, use CSV ou OFX, que são lidos só neste aparelho. A chave fica só neste aparelho e não entra no backup.
      </p>
    </section>
  );
}
