import type { Category, Entry, EntryType } from "./types";

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Impressão digital do lançamento: o mesmo extrato importado duas vezes gera as mesmas e é ignorado. `n` separa linhas idênticas no mesmo arquivo. */
export const fingerprint = (accountId: string, date: string, amount: number, type: EntryType, description: string, n: number) =>
  hash(`${accountId}|${date}|${Math.round(amount * 100)}|${type}|${norm(description)}|${n}`);

const OUT: [string[], string][] = [
  [["ifood", "restaurante", "lanchonete", "padaria", "pizzaria", "burger", "mcdonald", "starbucks", "cafe", "rappi", "sorvete"], "alimentacao"],
  [["supermercado", "carrefour", "assai", "atacadao", "pao de acucar", "hortifruti", "mercado "], "mercado"],
  [["uber", "99app", "99 pop", "posto ", "shell", "ipiranga", "estacionamento", "pedagio", "sem parar", "bilhete unico", "metro"], "transporte"],
  [["aluguel", "condominio", "energia", "enel", "cpfl", "sabesp", "internet", "vivo fibra", "claro", "leroy", "telhanorte"], "casa"],
  [["farmacia", "drogaria", "drogasil", "raia", "pague menos", "hospital", "clinica", "laboratorio", "unimed", "dentista"], "saude"],
  [["cinema", "ingresso", "steam", "playstation", "xbox", "airbnb", "booking", "hotel"], "lazer"],
  [["netflix", "spotify", "youtube", "disney", "hbo", "prime video", "icloud", "apple.com", "google one", "chatgpt", "openai", "anthropic", "github", "notion"], "assinaturas"],
  [["amazon", "mercado livre", "mercadolivre", "shopee", "aliexpress", "magalu", "americanas", "shein", "zara", "renner"], "compras"],
  [["curso", "udemy", "alura", "faculdade", "escola", "livraria"], "educacao"],
  [["iof", "tarifa", "anuidade", "juros", "multa", "imposto", "darf"], "impostos"],
];
const IN: [string[], string][] = [
  [["salario", "folha de pagamento"], "salario"],
  [["venda", "vendas"], "vendas"],
  [["payment from", "freela", "cliente", "servico", "honorario"], "servicos"],
  [["rendimento", "dividendo", "juros recebido", "cashback", "resgate"], "rendimentos"],
  [["estorno", "reembolso", "devolucao"], "reembolsos"],
];

const GENERIC = new Set(["compra", "pix", "pagamento", "enviado", "recebido", "debito", "credito", "transferencia", "cartao", "ted", "doc", "via", "com", "para", "from", "payment", "to"]);
const key = (d: string) =>
  norm(d)
    .replace(/[0-9*#/\\._-]+/g, " ")
    .split(" ")
    .filter((t) => t.length >= 3 && !GENERIC.has(t))
    .slice(0, 2)
    .join(" ");

/**
 * Sugere a categoria de cada linha: primeiro o que você já usou para descrições parecidas, depois palavras-chave comuns.
 * Sempre só sugere: você revisa antes de importar.
 */
export function makeSuggester(entries: Entry[], categories: Category[]) {
  const exists = (id: string) => categories.some((c) => c.id === id);
  const learned = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const k = `${e.type}:${key(e.description)}`;
    if (!key(e.description)) continue;
    const m = learned.get(k) ?? new Map<string, number>();
    m.set(e.categoryId, (m.get(e.categoryId) ?? 0) + 1);
    learned.set(k, m);
  }
  return (description: string, type: EntryType): string => {
    const k = key(description);
    const hit = k ? learned.get(`${type}:${k}`) : undefined;
    if (hit) {
      const best = [...hit.entries()].sort((a, b) => b[1] - a[1])[0][0];
      if (exists(best)) return best;
    }
    const d = ` ${norm(description)} `;
    for (const [words, id] of type === "out" ? OUT : IN) {
      if (words.some((w) => d.includes(w)) && exists(id)) return id;
    }
    return type === "out" ? "outros" : "outras-entradas";
  };
}

/**
 * Bloqueio/liberação de saldo (ex.: "reserve_for_payment" do Mercado Pago): o dinheiro é separado e devolvido durante um
 * pagamento, então a saída + a entrada se anulam e o gasto real vem em outra linha ("payment"). Não é gasto nem ganho.
 */
export const isBalanceHold = (description: string) => /(^|[\s_-])reserve([_\s-]|$)/i.test(description.trim());

/* ---------------- Transferências entre contas suas ---------------- */

import { daysBetween } from "./dates";
import type { Account } from "./types";

const STOP = new Set(["de", "da", "do", "das", "dos", "e"]);
const words = (s: string) =>
  norm(s)
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));

/**
 * A descrição contém o seu nome? Compara sem acento e sem maiúsculas, em qualquer ordem: basta ter o PRIMEIRO e o ÚLTIMO nome
 * cadastrado. Nomes com menos de 2 palavras são ignorados (evita falso positivo). Devolve o nome que casou.
 */
export function matchesMyName(description: string, names: string[]): string | null {
  const dw = new Set(words(description));
  for (const name of names) {
    const t = words(name);
    if (t.length < 2) continue;
    if (dw.has(t[0]) && dw.has(t[t.length - 1])) return name;
  }
  return null;
}

const sameMoney = (a: number, b: number) => Math.abs(a - b) < 0.005;
const curOf = (accounts: Account[], id: string) => accounts.find((a) => a.id === id)?.currency;

type Row = { type: "in" | "out"; amount: number; date: string };

/**
 * Procura, em OUTRA conta sua, o outro lado da transferência: lançamento de tipo oposto, mesmo valor (mesma moeda) e datas até 2 dias
 * de diferença. `used` evita usar o mesmo lançamento duas vezes.
 */
export function findPair(row: Row, accountId: string, accounts: Account[], entries: Entry[], used: Set<string>): Entry | undefined {
  const cur = curOf(accounts, accountId);
  return entries
    .filter(
      (e) =>
        !used.has(e.id) &&
        (e.type === "in" || e.type === "out") &&
        e.type !== row.type &&
        e.accountId !== accountId &&
        curOf(accounts, e.accountId) === cur &&
        sameMoney(e.amount, row.amount) &&
        Math.abs(daysBetween(e.date, row.date)) <= 2,
    )
    .sort((a, b) => Math.abs(daysBetween(a.date, row.date)) - Math.abs(daysBetween(b.date, row.date)))[0];
}

/** Já existe uma transferência registrada que cobre esta linha (ex.: você lançou a transferência antes de importar o extrato)? */
export function findCovered(row: Row, accountId: string, accounts: Account[], entries: Entry[], used: Set<string>): Entry | undefined {
  return entries.find((e) => {
    if (e.type !== "transfer" || used.has(e.id)) return false;
    const receives = row.type === "in" && e.toAccountId === accountId && sameMoney(e.toAmount ?? e.amount, row.amount);
    const sends = row.type === "out" && e.accountId === accountId && sameMoney(e.amount, row.amount);
    return (receives || sends) && Math.abs(daysBetween(e.date, row.date)) <= 2;
  });
}

/** Palpite de destino: conta do app cujo nome aparece na descrição (ex.: "Pix para C6"), senão a única outra conta. */
export function guessDestination(description: string, accountId: string, accounts: Account[]): string {
  const others = accounts.filter((a) => a.id !== accountId);
  const d = ` ${norm(description)} `;
  const byName = others.find((a) => d.includes(` ${norm(a.name)} `) || norm(a.name).split(" ").some((w) => w.length >= 3 && d.includes(` ${w} `)));
  if (byName) return byName.id;
  return others.length === 1 ? others[0].id : "";
}
