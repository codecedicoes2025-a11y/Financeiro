"use client";

import { useEffect, useRef } from "react";
import type { Account, Category, Currency, Entry, EntryType } from "@/lib/types";
import { EntryForm } from "./EntryForm";
import { Icon } from "./Icon";

type Props = {
  entry: Entry | null;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
  onSave: (entry: Entry) => void;
  onDelete: (id: string) => void;
  onCreateAccount: (name: string, currency: Currency) => string;
  onCreateCategory: (name: string, color: string, kind: EntryType) => string;
};

/** Folha para editar ou excluir um lançamento. */
export function EntryDialog({ entry, accounts, categories, onClose, onSave, onDelete, onCreateAccount, onCreateCategory }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (entry && !d.open) d.showModal();
    else if (!entry && d.open) d.close();
  }, [entry]);

  return (
    <dialog ref={ref} className="sheet" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      {entry && (
        <div className="sheet-body">
          <div className="sheet-head">
            <h2>Editar lançamento</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Fechar">
              <Icon name="close" />
            </button>
          </div>
          <EntryForm
            key={entry.id}
            accounts={accounts}
            categories={categories}
            initial={entry}
            submitLabel="Salvar"
            onSubmit={(e) => {
              onSave(e);
              onClose();
            }}
            onCreateAccount={onCreateAccount}
            onCreateCategory={onCreateCategory}
            onCancel={onClose}
            onDelete={() => confirm("Excluir este lançamento?") && (onDelete(entry.id), onClose())}
          />
        </div>
      )}
    </dialog>
  );
}
