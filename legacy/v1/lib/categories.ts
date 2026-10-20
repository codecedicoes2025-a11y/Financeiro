import type { Account, Category, Rule } from "./types";

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "alimentacao", name: "Alimentação", color: "#F59E0B" },
  { id: "mercado", name: "Mercado", color: "#10B981" },
  { id: "transporte", name: "Transporte", color: "#3B82F6" },
  { id: "casa", name: "Casa", color: "#8B5CF6" },
  { id: "saude", name: "Saúde", color: "#EF4444" },
  { id: "lazer", name: "Lazer", color: "#EC4899" },
  { id: "assinaturas", name: "Assinaturas", color: "#06B6D4" },
  { id: "compras", name: "Compras", color: "#F97316" },
  { id: "educacao", name: "Educação", color: "#84CC16" },
  { id: "taxas", name: "Impostos e taxas", color: "#A8A29E" },
  { id: "renda", name: "Renda", color: "#34D399" },
  { id: "saques", name: "Saques e transferências", color: "#B45F7A" },
  { id: "transferencias", name: "Faturas e transferências", color: "#64748B", ignore: true },
  { id: "outros", name: "Outros", color: "#94A3B8" },
];

export const FALLBACK_CATEGORY = "outros";

const r = (categoryId: string, ...keys: string[]): Rule[] =>
  keys.map((key) => ({ key, categoryId }));

export const DEFAULT_RULES: Rule[] = [
  ...r("transferencias", "pagamento de fatura", "pagamento fatura", "pagamento recebido", "pagamento efetuado", "fatura c6", "transferencia entre contas"),
  // Saque para um banco que NÃO está no app é dinheiro que saiu: conta como saída.
  ...r("saques", "transfer to bank", "withdrawal", "withdraw to", "saque"),
  ...r("alimentacao", "ifood", "restaurante", "lanchonete", "padaria", "pizzaria", "burger", "mcdonald", "starbucks", "cafe", "rappi"),
  ...r("mercado", "supermercado", "mercado", "carrefour", "assai", "atacadao", "pao de acucar", "extra", "dia supermercado", "hortifruti"),
  ...r("transporte", "uber", "99app", "99 pop", "posto", "shell", "ipiranga", "estacionamento", "pedagio", "sem parar", "metro", "bilhete unico"),
  ...r("casa", "aluguel", "condominio", "energia", "enel", "cpfl", "sabesp", "internet", "vivo fibra", "claro", "tim ", "leroy", "telhanorte"),
  ...r("saude", "farmacia", "drogaria", "drogasil", "raia", "pague menos", "hospital", "clinica", "laboratorio", "unimed", "dentista"),
  ...r("lazer", "cinema", "ingresso", "steam", "playstation", "xbox", "airbnb", "booking", "hotel", "show"),
  ...r("assinaturas", "netflix", "spotify", "youtube", "disney", "hbo", "prime video", "amazon prime", "icloud", "apple.com", "google one", "chatgpt", "openai", "anthropic", "github", "notion"),
  ...r("compras", "amazon", "mercado livre", "mercadolivre", "shopee", "aliexpress", "magalu", "americanas", "shein", "zara", "renner"),
  ...r("educacao", "curso", "udemy", "alura", "faculdade", "escola", "livraria"),
  ...r("taxas", "iof", "tarifa", "anuidade", "juros", "multa", "imposto", "darf", "das "),
  ...r("renda", "salario", "pagamento recebido de", "payment from", "rendimento", "payoneer", "dividendo", "cashback"),
];

export const DEFAULT_ACCOUNTS: Account[] = [
  { id: "c6-conta", name: "C6 Conta", currency: "BRL", card: false },
  { id: "c6-cartao", name: "C6 Cartão", currency: "BRL", card: true },
  { id: "mp-conta", name: "Mercado Pago", currency: "BRL", card: false },
  { id: "mp-cartao", name: "Mercado Pago Cartão", currency: "BRL", card: true },
  { id: "payoneer", name: "Payoneer", currency: "USD", card: false },
];

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const GENERIC = new Set([
  "compra", "pix", "pagamento", "enviado", "recebido", "debito", "credito", "em", "de", "para",
  "transferencia", "no", "cartao", "ted", "doc", "via", "com", "da", "do", "a", "o",
]);

/** Chave estável para "lançamentos parecidos": 1–2 primeiras palavras relevantes. */
export function makeKey(description: string): string {
  const tokens = normalize(description)
    .replace(/[0-9*#/\\._-]+/g, " ")
    .split(" ")
    .filter((t) => t.length >= 3 && !GENERIC.has(t));
  return tokens.slice(0, 2).join(" ");
}

export function categorize(description: string, userRules: Rule[]): string {
  const d = normalize(description);
  const byLength = (a: Rule, b: Rule) => b.key.length - a.key.length;
  for (const rule of [...userRules].sort(byLength)) {
    if (rule.key && d.includes(rule.key)) return rule.categoryId;
  }
  for (const rule of [...DEFAULT_RULES].sort(byLength)) {
    if (d.includes(rule.key)) return rule.categoryId;
  }
  return FALLBACK_CATEGORY;
}
