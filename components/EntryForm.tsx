"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { today } from "@/lib/dates";
import { parseAmount, uid } from "@/lib/money";
import type { Account, Category, Currency, Entry, EntryKind, EntryType } from "@/lib/types";
import { CategoryDialog } from "./CategoryDialog";
import { Icon } from "./Icon";

type Props = {
  accounts: Account[];
  categories: Category[];
  initial?: Entry;
  submitLabel: string;
  onSubmit: (entry: Entry) => void;
  onCreateAccount: (name: string, currency: Currency) => string;
  onCreateCategory: (name: string, color: string, kind: EntryType) => string;
  onCancel?: () => void;
  onDelete?: () => void;
};

/** Tempo parado, sem digitar, até o valor ser completado sozinho. */
const IDLE_FORMAT_MS = 2500;

const NEW_ACCOUNT = "__new";
const NEW_CATEGORY = "__newcat";

/** Mostra o valor como "R$ 1.234,50" ou "$ 1,234.50". */
const format = (n: number, currency: Currency) =>
  currency === "USD"
    ? `$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const KINDS: { id: EntryKind; label: string }[] = [
  { id: "out", label: "Saída" },
  { id: "in", label: "Entrada" },
  { id: "transfer", label: "Transferência" },
];

export function EntryForm({ accounts, categories, initial, submitLabel, onSubmit, onCreateAccount, onCreateCategory, onCancel, onDelete }: Props) {
  const initialAccount = initial?.accountId ?? accounts[0]?.id ?? NEW_ACCOUNT;
  const curOf = (id: string): Currency => accounts.find((a) => a.id === id)?.currency ?? "BRL";

  const [type, setType] = useState<EntryKind>(initial?.type ?? "out");
  const [amountText, setAmountText] = useState(initial ? format(initial.amount, curOf(initialAccount)) : "");
  const [date, setDate] = useState(initial?.date ?? today());
  const [accountId, setAccountId] = useState(initialAccount);
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId ?? accounts.find((a) => a.id !== initialAccount)?.id ?? "");
  const [toAmountText, setToAmountText] = useState(initial?.toAmount ? format(initial.toAmount, curOf(initial.toAccountId ?? "")) : "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [newName, setNewName] = useState("");
  const [newCur, setNewCur] = useState<Currency>("BRL");
  const [catDialog, setCatDialog] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isTransfer = type === "transfer";
  const kind: EntryType = type === "in" ? "in" : "out";
  const kindCats = useMemo(() => categories.filter((c) => c.kind === kind), [categories, kind]);
  const account = accounts.find((a) => a.id === accountId);
  const currency: Currency = accountId === NEW_ACCOUNT ? newCur : account?.currency ?? "BRL";
  const toCurrency = curOf(toAccountId);
  const crossCurrency = isTransfer && !!toAccountId && toCurrency !== currency;

  // Categoria sempre do tipo certo (entrada ou saída).
  useEffect(() => {
    if (isTransfer) return;
    if (categoryId !== NEW_CATEGORY && !kindCats.some((c) => c.id === categoryId)) setCategoryId(kindCats[0]?.id ?? "");
  }, [kindCats, categoryId, isTransfer]);

  useEffect(() => {
    if (accountId !== NEW_ACCOUNT && !accounts.some((a) => a.id === accountId)) setAccountId(accounts[0]?.id ?? NEW_ACCOUNT);
  }, [accounts, accountId]);

  // Transferência: origem e destino existem e são diferentes.
  useEffect(() => {
    if (!isTransfer) return;
    if (accountId === NEW_ACCOUNT && accounts[0]) setAccountId(accounts[0].id);
    if (!toAccountId || toAccountId === accountId || !accounts.some((a) => a.id === toAccountId)) setToAccountId(accounts.find((a) => a.id !== accountId)?.id ?? "");
  }, [isTransfer, accountId, toAccountId, accounts]);

  // Ao trocar a moeda (outra conta), reescreve o valor no formato certo.
  useEffect(() => {
    setAmountText((t) => {
      const v = parseAmount(t);
      return v > 0 ? format(v, currency) : t;
    });
  }, [currency]);
  useEffect(() => {
    setToAmountText((t) => {
      const v = parseAmount(t);
      return v > 0 ? format(v, toCurrency) : t;
    });
  }, [toCurrency]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  /** Completa "R$ 0,00" / "$ 0.00" quando você para de digitar (ou sai do campo). */
  const formatNow = () => {
    setAmountText((t) => {
      const v = parseAmount(t);
      return v > 0 ? format(v, currency) : t;
    });
  };
  const onAmountChange = (value: string) => {
    setAmountText(value);
    if (timer.current) clearTimeout(timer.current);
    // Só completa "R$ 0,00" depois de uma pausa longa (ou ao sair do campo), para não atrapalhar a digitação.
    timer.current = setTimeout(formatNow, IDLE_FORMAT_MS);
  };

  function pickCategory(value: string) {
    if (value === NEW_CATEGORY) setCatDialog(true);
    else setCategoryId(value);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseAmount(amountText);
    if (!(amount > 0)) return setError("Digite um valor maior que zero.");
    if (!date) return setError("Escolha a data.");
    const id = initial?.id ?? uid();

    if (isTransfer) {
      if (accounts.length < 2 || !toAccountId) return setError("Para transferir, crie pelo menos duas contas em Configurações › Contas.");
      if (toAccountId === accountId) return setError("Escolha contas diferentes na origem e no destino.");
      let toAmount: number | undefined;
      if (crossCurrency) {
        toAmount = parseAmount(toAmountText);
        if (!(toAmount > 0)) return setError(`Informe o valor que chegou no destino, em ${toCurrency}.`);
        toAmount = Math.round(toAmount * 100) / 100;
      }
      setError("");
      onSubmit({ id, type: "transfer", accountId, toAccountId, amount: Math.round(amount * 100) / 100, toAmount, date, description: description.trim(), categoryId: "" });
    } else {
      let accId = accountId;
      if (accId === NEW_ACCOUNT) {
        if (!newName.trim()) return setError("Dê um nome para a nova conta (ex.: Nubank).");
        accId = onCreateAccount(newName.trim(), newCur);
      }
      setError("");
      onSubmit({ id, type, accountId: accId, date, amount: Math.round(amount * 100) / 100, description: description.trim(), categoryId });
      if (!initial) setAccountId(accId);
    }
    if (!initial) {
      // Lançamento novo: limpa só valor e descrição, para lançar vários em sequência.
      setAmountText("");
      setToAmountText("");
      setDescription("");
      setNewName("");
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    }
  }

  const needTwoAccounts = isTransfer && accounts.length < 2;

  return (
    <>
      <form className="entry-form" onSubmit={submit} noValidate>
        <div className="seg type-seg type-seg-3" role="group" aria-label="Tipo do lançamento" style={{ "--n": 3 } as CSSProperties} data-type={type}>
          {KINDS.map((k) => (
            <button key={k.id} type="button" data-kind={k.id} className={type === k.id ? "on" : ""} aria-pressed={type === k.id} onClick={() => setType(k.id)}>
              {k.label}
            </button>
          ))}
        </div>

        {isTransfer && <p className="hint small">Transferência entre duas contas suas: mexe no saldo de cada conta, mas não conta como gasto nem como ganho.</p>}

        <div className="form-grid">
          <label className="field">
            <span>{isTransfer ? `Valor que saiu (${currency})` : "Valor"}</span>
            <input
              inputMode="decimal"
              autoComplete="off"
              placeholder={currency === "USD" ? "$ 0.00" : "R$ 0,00"}
              value={amountText}
              onChange={(e) => onAmountChange(e.target.value)}
              onBlur={() => {
                if (timer.current) clearTimeout(timer.current);
                formatNow();
              }}
            />
          </label>
          <label className="field">
            <span>Data</span>
            <input type="date" className="date-input" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>{isTransfer ? "De qual conta" : type === "in" ? "Entrou em qual conta" : "Saiu de qual conta"}</span>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
              {!isTransfer && <option value={NEW_ACCOUNT}>＋ Nova conta…</option>}
            </select>
          </label>
          {isTransfer ? (
            <label className="field">
              <span>Para qual conta</span>
              <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} disabled={needTwoAccounts}>
                {accounts
                  .filter((a) => a.id !== accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
              </select>
            </label>
          ) : (
            <label className="field">
              <span>Categoria</span>
              <select value={categoryId} onChange={(e) => pickCategory(e.target.value)}>
                {kindCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value={NEW_CATEGORY}>＋ Criar categoria…</option>
              </select>
            </label>
          )}
          {crossCurrency && (
            <label className="field">
              <span>Valor que chegou ({toCurrency})</span>
              <input inputMode="decimal" autoComplete="off" placeholder={toCurrency === "USD" ? "$ 0.00" : "R$ 0,00"} value={toAmountText} onChange={(e) => setToAmountText(e.target.value)} onBlur={() => setToAmountText((t) => (parseAmount(t) > 0 ? format(parseAmount(t), toCurrency) : t))} />
            </label>
          )}
        </div>

        {!isTransfer && accountId === NEW_ACCOUNT && (
          <div className="new-account">
            <label className="field">
              <span>Nome do banco / conta</span>
              <input autoComplete="off" placeholder="Ex.: Nubank, C6, Payoneer" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </label>
            <label className="field">
              <span>Moeda</span>
              <select value={newCur} onChange={(e) => setNewCur(e.target.value as Currency)}>
                <option value="BRL">Real (BRL)</option>
                <option value="USD">Dólar (USD)</option>
              </select>
            </label>
          </div>
        )}

        <label className="field">
          <span>Descrição (opcional)</span>
          <input autoComplete="off" placeholder={isTransfer ? "Ex.: Pix para minha conta do C6" : "Ex.: Almoço com cliente"} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        {!isTransfer && currency === "USD" && <p className="hint small">Conta em dólar: o valor fica em US$ e é convertido para real pela cotação do dia nos totais.</p>}
        {needTwoAccounts && <p className="result result-err">Para transferir você precisa de pelo menos duas contas. Crie em Configurações › Contas, bancos e saldo do caixa.</p>}
        {error && (
          <p className="result result-err" role="alert">
            {error}
          </p>
        )}

        <div className="row-actions">
          {onDelete && (
            <button type="button" className="btn btn-danger" onClick={onDelete}>
              <Icon name="trash" size={18} /> Excluir
            </button>
          )}
          {onCancel && (
            <button type="button" className="btn" onClick={onCancel}>
              Cancelar
            </button>
          )}
          <button type="submit" className={`btn btn-primary submit-${type}`} disabled={needTwoAccounts}>
            {saved ? "Lançado ✓" : submitLabel}
          </button>
        </div>
      </form>

      <CategoryDialog
        open={catDialog}
        kind={kind}
        onClose={() => setCatDialog(false)}
        onCreate={(name, color) => {
          setCategoryId(onCreateCategory(name, color, kind));
          setCatDialog(false);
        }}
      />
    </>
  );
}
