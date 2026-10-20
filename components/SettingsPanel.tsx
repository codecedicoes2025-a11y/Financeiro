"use client";

import { useEffect, useRef, useState, type Dispatch } from "react";
import { FALLBACK, NEW_CATEGORY_COLORS } from "@/lib/categories";
import { addMonths, endOfMonth, fmtBR, today } from "@/lib/dates";
import { brl, fmtMoney, parseAmount, uid } from "@/lib/money";
import { accountCash } from "@/lib/stats";
import type { Action } from "@/lib/store";
import type { SyncState } from "@/lib/useRootData";
import type { Account, Currency, EntryType, Root, State, Workspace } from "@/lib/types";
import { Icon, type IconName } from "./Icon";
import { GeminiSection } from "./GeminiSection";
import { ImportSection } from "./ImportSection";
import { matchesMyName } from "@/lib/importing";
import { useAiSettings } from "@/lib/aiSettings";

/** Login e sincronização (vazio em modo local). */
export type AccountInfo = { enabled: boolean; email?: string; sync: SyncState; onSignOut: () => void; onPull: () => Promise<boolean> };

type Props = {
  /** O livro aberto (PF ou PJ). */
  state: State;
  root: Root;
  ws: Workspace;
  dispatch: Dispatch<Action>;
  onRestore: (raw: unknown) => void;
  rate: { loading: boolean; error: string | null; refresh: () => void };
  account: AccountInfo;
};

const WS_NAME: Record<Workspace, string> = { pf: "Finanças PF", pj: "Finanças PJ" };

type Section = "conta" | "contas" | "importar" | "nomes" | "gemini" | "cambio" | "categorias" | "backup";

const SECTIONS: { id: Section; title: string; hint: string; icon: IconName }[] = [
  { id: "conta", title: "Meu login e sincronização", hint: "E-mail, sair e sincronizar entre aparelhos", icon: "lock" },
  { id: "contas", title: "Contas, bancos e saldo do caixa", hint: "Crie contas e informe o saldo do dia 01 de cada mês", icon: "list" },
  { id: "importar", title: "Importar extrato", hint: "Envie CSV, OFX ou PDF do banco, revise e escolha categorias", icon: "upload" },
  { id: "nomes", title: "Meu nome (transferências)", hint: "Para reconhecer Pix e TED entre as suas contas", icon: "user" },
  { id: "gemini", title: "Gemini (ler PDF)", hint: "Chave da API para importar extratos em PDF", icon: "sparkle" },
  { id: "cambio", title: "Câmbio do dólar", hint: "Cotação usada nas contas em dólar", icon: "refresh" },
  { id: "categorias", title: "Categorias de lançamento", hint: "Despesas e entradas", icon: "tag" },
  { id: "backup", title: "Backup", hint: "Exportar, restaurar e apagar dados", icon: "download" },
];

const monthName = (m: string) => {
  const s = new Date(`${m}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/* ---------------- Contas e saldo do caixa ---------------- */

function AccountCard({ account, state, dispatch, month }: { account: Account; state: State; dispatch: Dispatch<Action>; month: string }) {
  const entries = state.entries.filter((e) => e.accountId === account.id || e.toAccountId === account.id).length;
  const inMonth = state.entries.filter((e) => (e.accountId === account.id || e.toAccountId === account.id) && e.date.startsWith(month)).length;
  const first = `${month}-01`;
  const last = endOfMonth(first);
  const now = today();
  // Até hoje (mês atual), até o fim do mês (meses passados) ou o dia 01 (meses futuros).
  const asOf = now < first ? first : now < last ? now : last;
  const line = accountCash(state, account, asOf);
  const current = account.openings?.[month];
  const fmt = (n: number) => `${account.currency === "USD" ? "$ " : "R$ "}${n.toLocaleString(account.currency === "USD" ? "en-US" : "pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const [value, setValue] = useState(current !== undefined ? fmt(current) : "");
  const [saved, setSaved] = useState(false);

  function save() {
    if (!value.trim()) {
      dispatch({ type: "setOpening", accountId: account.id, month, value: null });
      return;
    }
    const v = parseAmount(value);
    if (Number.isNaN(v)) return;
    dispatch({ type: "setOpening", accountId: account.id, month, value: v });
    setValue(fmt(v));
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  }

  return (
    <li className="account-card">
      <div className="account-top">
        <input
          className="grow"
          aria-label={`Nome da conta ${account.name}`}
          defaultValue={account.name}
          onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== account.name && dispatch({ type: "updateAccount", id: account.id, patch: { name: e.target.value.trim() } })}
        />
        <span className="badge">{account.currency}</span>
        <button
          className="icon-btn"
          aria-label={entries ? `${account.name} tem lançamentos e não pode ser removida` : `Remover ${account.name}`}
          disabled={entries > 0}
          title={entries ? "Apague ou mude os lançamentos desta conta antes de removê-la" : "Remover conta"}
          onClick={() => dispatch({ type: "removeAccount", id: account.id })}
        >
          <Icon name="trash" size={18} />
        </button>
      </div>
      <div className="opening-fields opening-simple">
        <label className="field">
          <span>Saldo no dia 01/{month.slice(5)}</span>
          <input inputMode="decimal" placeholder={account.currency === "USD" ? "$ 0.00" : "R$ 0,00"} value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => value.trim() && !Number.isNaN(parseAmount(value)) && setValue(fmt(parseAmount(value)))} onKeyDown={(e) => e.key === "Enter" && save()} />
        </label>
        <button className="btn btn-primary" onClick={save}>
          {saved ? "Salvo ✓" : "Salvar saldo"}
        </button>
      </div>
      <p className="muted small">
        {current === undefined ? "Saldo do mês ainda não informado: este mês começa do zero. " : ""}
        Caixa em {fmtBR(asOf)}: <strong className="num">{fmtMoney(line.value, account.currency)}</strong>
        {account.currency === "USD" && <> (≈ {brl.format(line.valueBrl)})</>} · {inMonth} lançamento{inMonth === 1 ? "" : "s"} no mês
      </p>
    </li>
  );
}

function AccountsSection({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const [name, setName] = useState("");
  const [cur, setCur] = useState<Currency>("BRL");

  return (
    <section className="panel" aria-labelledby="ct-h">
      <h2 id="ct-h">Contas, bancos e saldo do caixa</h2>
      <p className="muted small">
        Todo dia 01, informe o saldo em caixa de cada conta. A cada mês o painel recomeça: entradas, saídas e caixa partem do zero e do saldo que você informar para aquele mês.
      </p>

      <div className="month-stepper" role="group" aria-label="Mês do saldo">
        <button className="icon-btn" aria-label="Mês anterior" onClick={() => setMonth(addMonths(`${month}-01`, -1).slice(0, 7))}>
          <Icon name="left" />
        </button>
        <strong>{monthName(month)}</strong>
        <button className="icon-btn" aria-label="Próximo mês" onClick={() => setMonth(addMonths(`${month}-01`, 1).slice(0, 7))}>
          <Icon name="right" />
        </button>
      </div>

      {state.accounts.length === 0 && <p className="muted small">Nenhuma conta ainda. Crie abaixo ou na hora de fazer um lançamento.</p>}
      <ul className="plain accounts">
        {state.accounts.map((a) => (
          <AccountCard key={`${a.id}-${month}`} account={a} state={state} dispatch={dispatch} month={month} />
        ))}
      </ul>

      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          dispatch({ type: "addAccount", account: { id: `a-${uid()}`, name: name.trim(), currency: cur } });
          setName("");
        }}
      >
        <input aria-label="Nome da nova conta" placeholder="Ex.: Nubank, C6, Payoneer" value={name} onChange={(e) => setName(e.target.value)} />
        <select aria-label="Moeda" value={cur} onChange={(e) => setCur(e.target.value as Currency)}>
          <option value="BRL">BRL</option>
          <option value="USD">USD</option>
        </select>
        <button className="btn btn-primary" type="submit">
          <Icon name="plus" size={18} /> Adicionar
        </button>
      </form>
    </section>
  );
}

/* ---------------- Meu nome ---------------- */

function NamesSection({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const [text, setText] = useState((state.myNames ?? []).join("\n"));
  const [probe, setProbe] = useState("");
  const names = text.split("\n").map((n) => n.trim()).filter(Boolean);
  const matched = probe.trim() ? matchesMyName(probe, names) : null;
  const short = names.filter((n) => n.split(/\s+/).filter(Boolean).length < 2);

  return (
    <section className="panel" aria-labelledby="nm-h">
      <h2 id="nm-h">Meu nome (transferências)</h2>
      <p className="muted small">
        Quando o extrato mostra para quem foi um Pix ou TED (ex.: “PIX ENVIADO JOAO SILVA”), o app compara com o seu nome. Se casar, entende que foi{" "}
        <b>entre as suas contas</b>, e não um gasto, e propõe uma transferência na revisão da importação, sempre com confirmação sua.
      </p>
      <label className="field">
        <span>Seu nome (um por linha)</span>
        <textarea
          rows={4}
          spellCheck={false}
          autoComplete="off"
          placeholder={"Ex.: João Pedro da Silva\nJOAO P SILVA\nSilva Soluções Ltda"}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            dispatch({ type: "setNames", names: e.target.value.split("\n").map((n) => n.trim()).filter(Boolean) });
          }}
        />
      </label>
      <p className="muted small">
        Use nome <b>e sobrenome</b>: o app procura o primeiro e o último nome na descrição, sem ligar para acento, maiúsculas ou ordem. Se o banco abrevia ou muda o nome (ex.: “J SILVA”), cadastre
        essa variação em outra linha. Pode incluir o nome da sua empresa.
      </p>
      {short.length > 0 && <p className="result result-err">Nomes com uma palavra só são ignorados (evita confundir com outras pessoas): {short.join(", ")}.</p>}

      <label className="field">
        <span>Teste: cole uma descrição do seu extrato</span>
        <input autoComplete="off" placeholder="Ex.: PIX ENVIADO JOAO PEDRO DA SILVA" value={probe} onChange={(e) => setProbe(e.target.value)} />
      </label>
      {probe.trim() && (
        <p className={`result ${matched ? "result-ok" : "result-err"}`} role="status">
          {matched ? `Casou com “${matched}”: seria tratado como transferência entre contas suas.` : "Não casou com nenhum dos seus nomes: seria tratado como gasto ou entrada normal."}
        </p>
      )}
      <p className="muted small">
        Atenção: pessoas com o mesmo nome e sobrenome que você podem casar sem ser você. Por isso o app só sugere, e você confirma cada caso antes de importar.
      </p>
    </section>
  );
}

/* ---------------- Câmbio ---------------- */

function RateSection({ state, dispatch, rate }: Pick<Props, "state" | "dispatch" | "rate">) {
  return (
    <section className="panel" aria-labelledby="fx-h">
      <div className="panel-head">
        <h2 id="fx-h">Câmbio do dólar</h2>
        <span className={`badge ${state.rateAuto ? "badge-ok" : ""}`}>{state.rateAuto ? "Ao vivo" : "Manual"}</span>
      </div>
      <p className="muted small">Usado nas contas em dólar (ex.: Payoneer) para somar tudo em reais.</p>
      <label className="check">
        <input type="checkbox" checked={state.rateAuto} onChange={(e) => dispatch({ type: "setRateAuto", value: e.target.checked })} />
        <span>Usar cotação em tempo real (atualiza a cada 5 min)</span>
      </label>
      {state.rateAuto ? (
        <div className="rate-live">
          <strong className="num">US$ 1 = R$ {state.usdBrl.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</strong>
          <span className="muted small">
            {rate.error ? `${rate.error} Usando a última cotação conhecida.` : state.rateAt ? `Atualizado às ${new Date(state.rateAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Buscando…"}
          </span>
          <button className="btn btn-sm" onClick={rate.refresh} disabled={rate.loading}>
            <Icon name="refresh" size={18} /> {rate.loading ? "Atualizando…" : "Atualizar agora"}
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
            value={state.usdBrl}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (v > 0) dispatch({ type: "setRate", value: v });
            }}
          />
        </label>
      )}
    </section>
  );
}

/* ---------------- Categorias ---------------- */

function CategoryList({ kind, state, dispatch }: { kind: EntryType; state: State; dispatch: Dispatch<Action> }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(NEW_CATEGORY_COLORS[0]);
  const list = state.categories.filter((c) => c.kind === kind);

  return (
    <div className="cat-block">
      <h3>{kind === "out" ? "Categorias de despesas (saídas)" : "Categorias de entradas"}</h3>
      <ul className="plain">
        {list.map((c) => (
          <li key={c.id} className="line">
            <label className="color-pick" aria-label={`Cor de ${c.name}`}>
              <input type="color" value={c.color} onChange={(e) => dispatch({ type: "updateCategory", category: { ...c, color: e.target.value } })} />
              <span className="dot big" style={{ background: c.color }} />
            </label>
            <input
              className="grow"
              aria-label={`Nome da categoria ${c.name}`}
              defaultValue={c.name}
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.name && dispatch({ type: "updateCategory", category: { ...c, name: e.target.value.trim() } })}
            />
            {c.id !== FALLBACK[kind] && (
              <button className="icon-btn" aria-label={`Remover ${c.name}`} onClick={() => confirm(`Remover "${c.name}"? Lançamentos dela passam para "${kind === "out" ? "Outros" : "Outras entradas"}".`) && dispatch({ type: "removeCategory", id: c.id })}>
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
          if (!name.trim()) return;
          dispatch({ type: "addCategory", category: { id: `c-${uid()}`, name: name.trim(), color, kind } });
          setName("");
          setColor(NEW_CATEGORY_COLORS[(list.length + 1) % NEW_CATEGORY_COLORS.length]);
        }}
      >
        <input aria-label="Nome da nova categoria" placeholder="Nova categoria" value={name} onChange={(e) => setName(e.target.value)} />
        <input aria-label="Cor da nova categoria" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="swatch" />
        <button className="btn btn-primary" type="submit">
          <Icon name="plus" size={18} /> Adicionar
        </button>
      </form>
    </div>
  );
}

/* ---------------- Login e sincronização ---------------- */

const SYNC_TEXT: Record<SyncState, string> = {
  local: "Modo local: os dados ficam só neste aparelho.",
  idle: "Aguardando…",
  saving: "Salvando na nuvem…",
  saved: "Tudo salvo na nuvem.",
  error: "Não consegui salvar na nuvem agora (sem conexão?). Seus dados estão salvos neste aparelho e serão enviados quando voltar.",
};

function AccountSection({ account }: { account: AccountInfo }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (!account.enabled) {
    return (
      <section className="panel" aria-labelledby="lg-h">
        <h2 id="lg-h">Meu login e sincronização</h2>
        <p className="muted small">
          O login está <b>desligado</b> porque o Supabase ainda não foi configurado: o app funciona em modo local, com os dados só neste aparelho. Para ligar o login e a sincronização entre aparelhos, siga o
          passo a passo do arquivo <code>SETUP.md</code> (cadastrar as duas chaves do Supabase na Vercel).
        </p>
      </section>
    );
  }

  return (
    <section className="panel" aria-labelledby="lg-h">
      <div className="panel-head">
        <h2 id="lg-h">Meu login e sincronização</h2>
        <span className={`badge ${account.sync === "saved" ? "badge-ok" : ""}`}>{account.sync === "saved" ? "Sincronizado" : account.sync === "error" ? "Pendente" : "…"}</span>
      </div>
      <p className="small">
        Você entrou como <strong>{account.email}</strong>.
      </p>
      <p className="muted small">{SYNC_TEXT[account.sync]}</p>
      <div className="row-actions">
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg("");
            try {
              setMsg((await account.onPull()) ? "Dados atualizados com o que está na nuvem." : "Ainda não há nada salvo na nuvem.");
            } catch {
              setMsg("Não consegui buscar agora. Verifique a conexão.");
            }
            setBusy(false);
          }}
        >
          <Icon name="refresh" size={18} /> {busy ? "Buscando…" : "Buscar da nuvem agora"}
        </button>
        <button className="btn btn-danger" onClick={account.onSignOut}>
          Sair
        </button>
      </div>
      {msg && (
        <p className="result result-ok" role="status">
          {msg}
        </p>
      )}
      <p className="muted small">Seus dados ficam guardados na sua conta do Supabase, separados por usuário. A chave do Gemini e as senhas de PDF ficam só neste aparelho.</p>
    </section>
  );
}

/* ---------------- Backup ---------------- */

function BackupSection({ root, ws, dispatch, onRestore }: Pick<Props, "root" | "ws" | "dispatch" | "onRestore">) {
  const fileRef = useRef<HTMLInputElement>(null);

  function backup() {
    const blob = new Blob([JSON.stringify(root, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `financeiro-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function restore(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if ((data.pf && data.pj) || (Array.isArray(data.entries) && Array.isArray(data.accounts))) onRestore(data);
      else alert("Esse arquivo não é um backup desta versão do app.");
    } catch {
      alert("Não consegui ler esse arquivo.");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <section className="panel" aria-labelledby="bk-h">
      <h2 id="bk-h">Backup</h2>
      <p className="muted small">O arquivo de backup traz os dois livros (PF e PJ). Restaurar substitui tudo o que está no app agora.</p>
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
          <strong>Apagar todos os lançamentos de {WS_NAME[ws]}</strong>
          <p className="muted small">Remove todas as entradas e saídas deste livro (o outro não é afetado). Contas, categorias e saldos informados ficam.</p>
        </div>
        <button className="btn btn-danger" onClick={() => confirm("Apagar TODOS os lançamentos?\n\nIsso não pode ser desfeito (exporte um backup antes, se quiser).") && dispatch({ type: "clearEntries" })}>
          <Icon name="trash" size={18} /> Apagar tudo
        </button>
      </div>
    </section>
  );
}

/* ---------------- Tela de Ajustes ---------------- */

export function SettingsPanel({ state, root, ws, dispatch, onRestore, rate, account }: Props) {
  const [section, setSection] = useState<Section | null>(null);
  const ai = useAiSettings();
  const top = useRef<HTMLDivElement>(null);

  // Ao abrir/voltar de uma seção, volta ao topo da página.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [section]);

  if (!section) {
    return (
      <div className="settings-home" ref={top}>
        {SECTIONS.map((s) => (
          <button key={s.id} className="settings-link" onClick={() => setSection(s.id)}>
            <span className="settings-icon">
              <Icon name={s.icon} />
            </span>
            <span className="settings-text">
              <strong>{s.title}</strong>
              <span className="muted small">{s.hint}</span>
            </span>
            <Icon name="right" size={18} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="settings-page" ref={top}>
      <button className="back-btn" onClick={() => setSection(null)}>
        <Icon name="left" size={18} /> Configurações
      </button>
      {section === "contas" && <AccountsSection state={state} dispatch={dispatch} />}
      {section === "importar" && <ImportSection state={state} dispatch={dispatch} ai={ai.settings} />}
      {section === "nomes" && <NamesSection state={state} dispatch={dispatch} />}
      {section === "gemini" && <GeminiSection settings={ai.settings} onChange={ai.update} />}
      {section === "cambio" && <RateSection state={state} dispatch={dispatch} rate={rate} />}
      {section === "categorias" && (
        <section className="panel" aria-labelledby="cat-h">
          <h2 id="cat-h">Categorias de lançamento</h2>
          <div className="cats-cols">
            <CategoryList kind="out" state={state} dispatch={dispatch} />
            <CategoryList kind="in" state={state} dispatch={dispatch} />
          </div>
        </section>
      )}
      {section === "backup" && <BackupSection root={root} ws={ws} dispatch={dispatch} onRestore={onRestore} />}
      {section === "conta" && <AccountSection account={account} />}
    </div>
  );
}
