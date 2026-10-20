"use client";

import { useEffect, useRef, useState } from "react";
import { NEW_CATEGORY_COLORS } from "@/lib/categories";
import type { EntryType } from "@/lib/types";
import { Icon } from "./Icon";

type Props = {
  open: boolean;
  kind: EntryType;
  onClose: () => void;
  onCreate: (name: string, color: string) => void;
};

/** Pop-up para criar uma categoria na hora, sem sair do lançamento. */
export function CategoryDialog({ open, kind, onClose, onCreate }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(NEW_CATEGORY_COLORS[0]);
  const [error, setError] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setName("");
      setError("");
      setColor(NEW_CATEGORY_COLORS[Math.floor(Math.random() * NEW_CATEGORY_COLORS.length)]);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!name.trim()) return setError("Dê um nome para a categoria.");
    onCreate(name.trim(), color);
  }

  return (
    <dialog ref={ref} className="sheet sheet-sm" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-labelledby="newcat-h">
      <form className="sheet-body" onSubmit={submit} noValidate>
        <div className="sheet-head">
          <h2 id="newcat-h">Nova categoria de {kind === "out" ? "saída" : "entrada"}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <Icon name="close" />
          </button>
        </div>
        <label className="field">
          <span>Nome</span>
          <input autoFocus autoComplete="off" placeholder={kind === "out" ? "Ex.: Pets, Viagem, Academia" : "Ex.: Freelance, Aluguel recebido"} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <fieldset className="swatches">
          <legend className="small muted">Cor</legend>
          {NEW_CATEGORY_COLORS.map((c) => (
            <label key={c} className={`swatch-opt ${color === c ? "on" : ""}`} style={{ background: c }}>
              <input type="radio" name="catcolor" value={c} checked={color === c} onChange={() => setColor(c)} aria-label={`Cor ${c}`} />
            </label>
          ))}
          <label className="swatch-opt custom" title="Outra cor">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Escolher outra cor" />+
          </label>
        </fieldset>
        {error && (
          <p className="result result-err" role="alert">
            {error}
          </p>
        )}
        <div className="row-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary">
            Criar categoria
          </button>
        </div>
      </form>
    </dialog>
  );
}
