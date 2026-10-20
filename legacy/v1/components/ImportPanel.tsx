"use client";

import { useRef, useState } from "react";
import { parseStatement, type StatementBalance } from "@/lib/parse";
import { brl, usd } from "@/lib/stats";
import type { Account, ParsedRow } from "@/lib/types";
import { Icon } from "./Icon";

type Props = {
  accounts: Account[];
  onImport: (accountId: string, rows: ParsedRow[], source: string, balance?: StatementBalance) => void;
};

const br = (d: string) => d.split("-").reverse().join("/");

export function ImportPanel({ accounts, onImport }: Props) {
  // Sem conta pré-selecionada: evita importar um extrato na conta errada por esquecimento.
  const [accountId, setAccountId] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const chosen = accounts.find((a) => a.id === accountId);

  async function handle(files: FileList | null) {
    if (!files?.length || !chosen) return;
    setBusy(true);
    const lines: string[] = [];
    let ok = true;
    for (const file of Array.from(files)) {
      const text = await file.text();
      let account = chosen;
      let parsed = parseStatement(text, file.name, account.card);

      // A moeda declarada no arquivo manda: um extrato em USD nunca pode cair numa conta em BRL.
      const fileCur = parsed.currency;
      if (fileCur && fileCur !== account.currency) {
        const options = accounts.filter((a) => a.currency === fileCur && !a.card);
        if (fileCur === "USD" || fileCur === "BRL") {
          if (options.length === 1) {
            account = options[0];
            parsed = parseStatement(text, file.name, account.card);
            lines.push(`${file.name}: o arquivo está em ${fileCur}, então foi para a conta ${account.name} (e não ${chosen.name}).`);
          } else {
            ok = false;
            lines.push(
              `${file.name}: o arquivo está em ${fileCur}, mas ${chosen.name} é em ${chosen.currency}. ` +
                (options.length ? "Escolha uma conta em " + fileCur + " e tente de novo." : `Você não tem conta em ${fileCur}: crie uma em Ajustes › Contas.`),
            );
            continue;
          }
        } else {
          ok = false;
          lines.push(`${file.name}: moeda ${fileCur} ainda não é suportada (só BRL e USD).`);
          continue;
        }
      }

      const { rows, warnings, balance } = parsed;
      if (!rows.length) {
        ok = false;
        lines.push(`${file.name}: nada importado.`, ...warnings);
        continue;
      }
      onImport(account.id, rows, file.name, balance);
      // Resumo do que foi LIDO no arquivo, para você conferir se a interpretação bate com o extrato.
      const fmt = account.currency === "USD" ? usd : brl;
      const inc = rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
      const exp = rows.filter((r) => r.amount < 0).reduce((s, r) => s - r.amount, 0);
      const dates = rows.map((r) => r.date).sort();
      lines.push(
        `${file.name} → ${account.name} (${account.currency}): ${rows.length} lançamentos, de ${br(dates[0])} a ${br(dates[dates.length - 1])}.`,
        `Lido como entradas ${fmt.format(inc)} e saídas ${fmt.format(exp)}.${balance ? ` Saldo no extrato: ${fmt.format(balance.value)}.` : ""}`,
        ...warnings,
      );
    }
    setMsg({ ok, text: lines });
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <section className="panel">
      <h2>Importar extrato</h2>
      <p className="muted small">
        Exporte o extrato (CSV ou OFX) no app do banco, escolha a conta correspondente e envie o arquivo. Importar o mesmo arquivo duas vezes
        não duplica lançamentos, e cada importação fica no histórico, onde você pode apagá-la.
      </p>

      <label className="field">
        <span>Conta do extrato</span>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="" disabled>
            Escolha a conta…
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency}{a.owner === "pj" ? " · PJ" : ""})
            </option>
          ))}
        </select>
      </label>

      {chosen?.card && <p className="hint small">Conta de cartão: no CSV, valores positivos são lidos como gasto.</p>}
      {chosen?.currency === "USD" && <p className="hint small">Conta em dólar: os valores ficam em US$ e são convertidos para real pela cotação ao vivo.</p>}

      <label className={`drop ${chosen ? "" : "drop-off"}`} aria-disabled={!chosen}>
        <Icon name="upload" size={28} />
        <span>{busy ? "Lendo…" : chosen ? "Escolher arquivo(s) .csv ou .ofx" : "Escolha a conta primeiro"}</span>
        <input ref={input} type="file" accept=".csv,.ofx,.txt,text/csv" multiple disabled={!chosen} onChange={(e) => handle(e.target.files)} />
      </label>

      {msg && (
        <ul className={`result ${msg.ok ? "result-ok" : "result-err"}`} role="status">
          {msg.text.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
