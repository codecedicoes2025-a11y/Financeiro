"use client";

import { useEffect, useRef, useState } from "react";
import { makeKey } from "@/lib/categories";
import { brl, usd } from "@/lib/stats";
import type { Account, Category, Tx } from "@/lib/types";
import { Icon } from "./Icon";

type Props = {
  tx: Tx | null;
  account?: Account;
  categories: Category[];
  onClose: () => void;
  onSave: (categoryId: string, applySimilar: boolean) => void;
  onDelete: () => void;
};

export function EditSheet({ tx, account, categories, onClose, onSave, onDelete }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState("");
  const [similar, setSimilar] = useState(true);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (tx) {
      setSelected(tx.categoryId);
      setSimilar(true);
      if (!d.open) d.showModal();
    } else if (d.open) d.close();
  }, [tx]);

  const key = tx ? makeKey(tx.description) : "";
  const fmt = account?.currency === "USD" ? usd : brl;

  return (
    <dialog ref={ref} className="sheet" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      {tx && (
        <div className="sheet-body">
          <div className="sheet-head">
            <div>
              <h2>{tx.description}</h2>
              <p className="muted small">
                {tx.date.split("-").reverse().join("/")} · {account?.name} ·{" "}
                <span className={tx.amount < 0 ? "neg num" : "pos num"}>{fmt.format(tx.amount)}</span>
              </p>
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="Fechar">
              <Icon name="close" />
            </button>
          </div>

          <fieldset className="cat-grid">
            <legend className="small muted">Categoria</legend>
            {categories.map((c) => (
              <label key={c.id} className={`chip ${selected === c.id ? "chip-on" : ""}`}>
                <input type="radio" name="cat" value={c.id} checked={selected === c.id} onChange={() => setSelected(c.id)} />
                <span className="dot" style={{ background: c.color }} />
                {c.name}
              </label>
            ))}
          </fieldset>

          {key && (
            <label className="check">
              <input type="checkbox" checked={similar} onChange={(e) => setSimilar(e.target.checked)} />
              <span>
                Aplicar a lançamentos parecidos com <b>“{key}”</b>, inclusive os próximos
              </span>
            </label>
          )}

          <div className="row-actions">
            <button className="btn btn-danger" onClick={onDelete}>
              <Icon name="trash" size={18} /> Excluir
            </button>
            <button className="btn btn-primary" onClick={() => onSave(selected, similar)}>
              Salvar
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
