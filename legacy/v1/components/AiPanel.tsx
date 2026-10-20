"use client";

import { useState } from "react";
import { DEFAULT_MODELS, testConnection, type AiSettings } from "@/lib/gemini";
import type { AiStatus } from "@/lib/useAiRunner";
import { Icon } from "./Icon";

type Props = {
  settings: AiSettings;
  onChange: (patch: Partial<AiSettings>) => void;
  pendingCount: number;
  status: AiStatus;
  onRun: () => void;
};

export function AiPanel({ settings, onChange, pendingCount, status, onRun }: Props) {
  const [show, setShow] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const connected = settings.apiKey.length > 0;

  async function runTest() {
    setTesting(true);
    setTest(null);
    try {
      const model = await testConnection(settings);
      setTest({ ok: true, text: `Conectado. Respondeu: ${model}` });
    } catch (e) {
      setTest({ ok: false, text: e instanceof Error ? e.message : "Falha na conexão." });
    }
    setTesting(false);
  }

  return (
    <section className="panel glass" aria-labelledby="ai-h">
      <div className="panel-head">
        <h2 id="ai-h">Conectar API</h2>
        <span className={`badge ${connected ? "badge-ok" : ""}`}>{connected ? "Gemini ativo" : "Desconectado"}</span>
      </div>
      <p className="muted small">
        Cole sua chave do Google Gemini (gratuita, em aistudio.google.com/apikey). A IA categoriza o que ficou em “Outros” e o gráfico
        se atualiza sozinho.
      </p>

      <label className="field">
        <span>Chave da API do Gemini</span>
        <div className="secret">
          <input
            type={show ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            placeholder="AIza…"
            value={settings.apiKey}
            onChange={(e) => {
              setTest(null);
              onChange({ apiKey: e.target.value.trim() });
            }}
          />
          <button type="button" className="btn btn-sm" onClick={() => setShow((s) => !s)} aria-pressed={show}>
            {show ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </label>

      <label className="field">
        <span>Modelos, em ordem de uso (um por linha)</span>
        <textarea
          rows={5}
          spellCheck={false}
          value={settings.models.join("\n")}
          onChange={(e) => onChange({ models: e.target.value.split("\n").map((m) => m.trim()).filter(Boolean) })}
        />
      </label>
      <p className="muted small">
        O app alterna entre eles a cada lote. A cota gratuita é separada por modelo, então rodar vários rende mais. Se um estourar, ele
        pula para o próximo. Usa só os modelos “lite” primeiro, que gastam menos.
        <button type="button" className="link" onClick={() => onChange({ models: DEFAULT_MODELS })}>
          Restaurar padrão
        </button>
      </p>

      <label className="check">
        <input type="checkbox" checked={settings.autoRun} onChange={(e) => onChange({ autoRun: e.target.checked })} />
        <span>Categorizar automaticamente depois de importar</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.allowNew} onChange={(e) => onChange({ allowNew: e.target.checked })} />
        <span>Deixar a IA criar categorias novas quando nenhuma servir</span>
      </label>

      <div className="row-actions">
        <button className="btn" onClick={runTest} disabled={!connected || testing}>
          {testing ? "Testando…" : "Testar conexão"}
        </button>
        <button className="btn btn-primary" onClick={onRun} disabled={!connected || pendingCount === 0 || status.phase === "running"}>
          <Icon name="sparkle" size={18} /> Categorizar agora{pendingCount ? ` (${pendingCount})` : ""}
        </button>
      </div>

      {test && (
        <p className={`result ${test.ok ? "result-ok" : "result-err"}`} role="status">
          {test.text}
        </p>
      )}

      <p className="muted small">
        Privacidade: o app envia ao Google só a descrição dos lançamentos (ex.: “IFOOD *RESTAURANTE”) e o sinal entrada/saída, nunca valores
        ou saldos. Na camada gratuita o Google pode usar esses dados para melhorar produtos. Descrições de Pix podem conter nomes de
        pessoas. A chave fica só neste aparelho e não entra no backup.
      </p>
    </section>
  );
}
