import type { Category, EntryType, Workspace } from "./types";

const IN: Category[] = [
  { id: "salario", name: "Salário", color: "#34D399", kind: "in" },
  { id: "vendas", name: "Vendas", color: "#60A5FA", kind: "in" },
  { id: "servicos", name: "Serviços / clientes", color: "#A78BFA", kind: "in" },
  { id: "rendimentos", name: "Rendimentos", color: "#FBBF24", kind: "in" },
  { id: "reembolsos", name: "Reembolsos", color: "#2DD4BF", kind: "in" },
  { id: "outras-entradas", name: "Outras entradas", color: "#94A3B8", kind: "in" },
];

/** Categorias iniciais de pessoa física. */
export const CATEGORIES_PF: Category[] = [
  { id: "alimentacao", name: "Alimentação", color: "#F59E0B", kind: "out" },
  { id: "mercado", name: "Mercado", color: "#10B981", kind: "out" },
  { id: "transporte", name: "Transporte", color: "#3B82F6", kind: "out" },
  { id: "casa", name: "Casa", color: "#8B5CF6", kind: "out" },
  { id: "saude", name: "Saúde", color: "#EF4444", kind: "out" },
  { id: "lazer", name: "Lazer", color: "#EC4899", kind: "out" },
  { id: "assinaturas", name: "Assinaturas", color: "#06B6D4", kind: "out" },
  { id: "compras", name: "Compras", color: "#F97316", kind: "out" },
  { id: "educacao", name: "Educação", color: "#84CC16", kind: "out" },
  { id: "impostos", name: "Impostos e taxas", color: "#A8A29E", kind: "out" },
  { id: "saques", name: "Saques e transferências", color: "#B45F7A", kind: "out" },
  { id: "outros", name: "Outros", color: "#94A3B8", kind: "out" },
  ...IN,
];

/** Categorias iniciais de pessoa jurídica. */
export const CATEGORIES_PJ: Category[] = [
  { id: "fornecedores", name: "Fornecedores", color: "#14B8A6", kind: "out" },
  { id: "pessoal", name: "Funcionários", color: "#D946EF", kind: "out" },
  { id: "impostos", name: "Impostos e taxas", color: "#A8A29E", kind: "out" },
  { id: "marketing", name: "Marketing", color: "#FACC15", kind: "out" },
  { id: "escritorio", name: "Escritório e aluguel", color: "#8B5CF6", kind: "out" },
  { id: "software", name: "Software e assinaturas", color: "#06B6D4", kind: "out" },
  { id: "contador", name: "Contador e jurídico", color: "#3B82F6", kind: "out" },
  { id: "prolabore", name: "Pró-labore e retiradas", color: "#F59E0B", kind: "out" },
  { id: "transporte", name: "Transporte e viagens", color: "#10B981", kind: "out" },
  { id: "saques", name: "Saques e transferências", color: "#B45F7A", kind: "out" },
  { id: "outros", name: "Outros", color: "#94A3B8", kind: "out" },
  { id: "vendas", name: "Vendas", color: "#60A5FA", kind: "in" },
  { id: "servicos", name: "Serviços / clientes", color: "#A78BFA", kind: "in" },
  { id: "rendimentos", name: "Rendimentos", color: "#FBBF24", kind: "in" },
  { id: "reembolsos", name: "Reembolsos", color: "#2DD4BF", kind: "in" },
  { id: "outras-entradas", name: "Outras entradas", color: "#94A3B8", kind: "in" },
];

export const defaultCategories = (ws: Workspace): Category[] => (ws === "pj" ? CATEGORIES_PJ : CATEGORIES_PF).map((c) => ({ ...c }));

/** Categoria usada quando a escolhida é apagada. */
export const FALLBACK: Record<EntryType, string> = { out: "outros", in: "outras-entradas" };

export const NEW_CATEGORY_COLORS = ["#22D3EE", "#A78BFA", "#FB7185", "#FBBF24", "#4ADE80", "#F472B6", "#60A5FA", "#FB923C"];
