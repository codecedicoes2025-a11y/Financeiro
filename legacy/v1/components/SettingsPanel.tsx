"use client";

import { useRef, useState } from "react";
import { parseAmount } from "@/lib/parse";
import type { Category, Currency, Owner, State } from "@/lib/types";
import { Icon } from "./Icon";

type Props = {
  state: State;
  onAddAccount: (name: string, currency: Currency, card: boolean, owner: Owner) => void;
  onSetOwner: (id: string, owner: Owner) => void;
  onSetBalance: (id: string, value: number) => void;
  onClearBalance: (id: string) => void;
  onRemoveAccount: (id: string) => void;
  onAddCategory: (c: Category) => void;
  onUpdateCategory: (c: Category) => void;
  onRemoveCategory: (id: string) => void;
  onRate: (v: number) => void;
  onRateAuto: (v: boolean) => void;
  rate: { loading: boolean; error: string | null; refresh: () => void };
  onRestore: (s: State) => void;
  onClear: () => void;
};

export function SettingsPanel(p: Props) {
  const [accName, setAccName] = useState("");
  const [accCur, setAccCur] = useState<Currency>("BRL");
  const [accCard, setAccCard] = useState(false);
  const [accOwner, setAccOwner] = useState<Owner>("pf");
  const [catName, setCatName] = useState("");
  const [catColor, setCatColor] = useState("#3B82F6");
  const fileRef = useRef<HTMLInputElement>(null);

  function backup() {
    const blob = new Blob([JSON.stringify(p.state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `financeiro-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function restore(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (Array.isArray(data.transactions) && Array.isArray(data.accounts)) p.onRestore(data);
      else alert("Arquivo de backup inválido.");
    } catch {
      alert("Não consegui ler esse arquivo.");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="stack">
      <section className="panel">
        <h2>Contas</h2>
        <ul className="plain">
          {p.state.accounts.map((a) => (
            <li key={a.id} className="line">
              <span>
                {a.name} <span className="muted small">· {a.currency}{a.card ? " · cartão" : ""}</span>
              </span>
              {!a.card && (
                <input
                  key={`${a.id}-${a.balance?.value ?? "x"}`}
                  className="balance-input"
                  inputMode="decimal"
                  aria-label={`Saldo atual de ${a.name} em ${a.currency}`}
                  title={a.balance ? `Saldo de ${a.balance.date.split("-").reverse().join("/")}` : "Informe o saldo atual desta conta"}
                  placeholder={a.currency === "USD" ? "Saldo US$" : "Saldo R$"}
                  defaultValue={a.balance ? a.balance.value.toLocaleString(a.currency === "USD" ? "en-US" : "pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    // Campo vazio remove o saldo manual: a conta volta a usar o saldo do extrato/API.
                    if (!raw) {
                      if (a.balance) p.onClearBalance(a.id);
                      return;
                    }
                    const v = parseAmount(raw);
                    if (!Number.isNaN(v) && v !== a.balance?.value) p.onSetBalance(a.id, v);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
              )}
              <select className="owner-select" aria-label={`Tipo da conta ${a.name}`} value={a.owner ?? "pf"} onChange={(e) => p.onSetOwner(a.id, e.target.value as Owner)}>
                <option value="pf">Pessoa física</option>
                <option value="pj">Pessoa jurídica</option>
              </select>
              <button
                className="icon-btn"
                aria-label={`Remover ${a.name}`}
                onClick={() => confirm(`Remover "${a.name}" e todos os lançamentos dela?`) && p.onRemoveAccount(a.id)}
              >
                <Icon name="trash" size={18} />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!accName.trim()) return;
            p.onAddAccount(accName.trim(), accCur, accCard, accOwner);
            setAccName("");
          }}
        >
          <input aria-label="Nome da nova conta" placeholder="Nova conta" value={accName} onChange={(e) => setAccName(e.target.value)} />
          <select aria-label="Tipo de pessoa" value={accOwner} onChange={(e) => setAccOwner(e.target.value as Owner)}>
            <option value="pf">Pessoa física</option>
            <option value="pj">Pessoa jurídica</option>
          </select>
          <select aria-label="Moeda" value={accCur} onChange={(e) => setAccCur(e.target.value as Currency)}>
            <option>BRL</option>
            <option>USD</option>
          </select>
          <label className="check compact">
            <input type="checkbox" checked={accCard} onChange={(e) => setAccCard(e.target.checked)} /> Cartão
          </label>
          <button className="btn btn-primary" type="submit">
            <Icon name="plus" size={18} /> Adicionar
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Categorias</h2>
        <ul className="plain">
          {p.state.categories.map((c) => (
            <li key={c.id} className="line">
              <label className="color-pick" aria-label={`Cor de ${c.name}`}>
                <input type="color" value={c.color} onChange={(e) => p.onUpdateCategory({ ...c, color: e.target.value })} />
                <span className="dot big" style={{ background: c.color }} />
              </label>
              <input
                className="grow"
                aria-label={`Nome da categoria ${c.name}`}
                defaultValue={c.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && p.onUpdateCategory({ ...c, name: e.target.value.trim() })}
              />
              <label className="check compact" title="Ignorar nos totais (ex.: pagamento de fatura)">
                <input type="checkbox" checked={!!c.ignore} onChange={(e) => p.onUpdateCategory({ ...c, ignore: e.target.checked })} /> Ignorar
              </label>
              {c.id !== "outros" && (
                <button className="icon-btn" aria-label={`Remover ${c.name}`} onClick={() => p.onRemoveCategory(c.id)}>
                  <Icon name="trash" size={18} />
                </button>
              )}
            </li>
          ))}
        </ul>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!catName.trim()) return;
            p.onAddCategory({ id: `c-${Date.now().toString(36)}`, name: catName.trim(), color: catColor });
            setCatName("");
          }}
        >
          <input aria-label="Nome da nova categoria" placeholder="Nova categoria" value={catName} onChange={(e) => setCatName(e.target.value)} />
          <input aria-label="Cor da nova categoria" type="color" value={catColor} onChange={(e) => setCatColor(e.target.value)} className="swatch" />
          <button className="btn btn-primary" type="submit">
            <Icon name="plus" size={18} /> Adicionar
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Câmbio do dólar</h2>
          <span className={`badge ${p.state.rateAuto !== false ? "badge-ok" : ""}`}>{p.state.rateAuto !== false ? "Ao vivo" : "Manual"}</span>
        </div>
        <p className="muted small">Converte o Payoneer (USD) para reais nos gráficos e totais.</p>
        <label className="check">
          <input type="checkbox" checked={p.state.rateAuto !== false} onChange={(e) => p.onRateAuto(e.target.checked)} />
          <span>Usar cotação em tempo real (atualiza a cada 5 min)</span>
        </label>
        {p.state.rateAuto !== false ? (
          <div className="rate-live">
            <strong className="num">US$ 1 = R$ {p.state.usdBrl.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</strong>
            <span className="muted small">
              {p.rate.error
                ? `${p.rate.error} Usando a última cotação conhecida.`
                : p.state.rateAt
                  ? `Atualizado às ${new Date(p.state.rateAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                  : "Buscando…"}
            </span>
            <button className="btn btn-sm" onClick={p.rate.refresh} disabled={p.rate.loading}>
              <Icon name="refresh" size={18} /> {p.rate.loading ? "Atualizando…" : "Atualizar agora"}
            </button>
          </div>
        ) : (
          <label className="field">
            <span>1 USD em BRL</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={p.state.usdBrl}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (v > 0) p.onRate(v);
              }}
            />
          </label>
        )}
        <p className="muted small">Todos os lançamentos em dólar são convertidos pela cotação de agora, inclusive os de meses anteriores.</p>
      </section>

      <section className="panel">
        <h2>Backup</h2>
        <p className="muted small">
          Os dados ficam só neste aparelho/navegador. Para levar do computador ao iPhone, exporte aqui e restaure lá.
        </p>
        <div className="row-actions">
          <button className="btn" onClick={backup}>
            <Icon name="download" size={18} /> Exportar
          </button>
          <label className="btn">
            <Icon name="upload" size={18} /> Restaurar
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => restore(e.target.files)} />
          </label>
        </div>
        <div className="danger-zone">
          <div>
            <strong>Apagar todos os dados</strong>
            <p className="muted small">Remove lançamentos, histórico de importações, saldos e o que a IA aprendeu. Contas, categorias, regras e chaves ficam.</p>
          </div>
          <button
            className="btn btn-danger"
            onClick={() => confirm("Apagar TODOS os lançamentos e o histórico de importações?\n\nIsso não pode ser desfeito (exporte um backup antes, se quiser).") && p.onClear()}
          >
            <Icon name="trash" size={18} /> Apagar tudo
          </button>
        </div>
      </section>
    </div>
  );
}
