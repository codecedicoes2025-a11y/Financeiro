export type Currency = "BRL" | "USD";

export type Owner = "pf" | "pj";

export type Account = {
  id: string;
  name: string;
  currency: Currency;
  /** Cartão: no CSV, valores positivos são gastos. */
  card: boolean;
  /** Pessoa física ou jurídica. Sem valor = física. */
  owner?: Owner;
  /** Saldo informado pelo extrato/banco (ou corrigido por você) em uma data; lançamentos posteriores somam por cima. */
  balance?: { value: number; date: string; manual?: boolean; importId?: string };
};

export type Category = {
  id: string;
  name: string;
  color: string;
  /** Fora dos totais (ex.: pagamento de fatura, transferência entre contas). */
  ignore?: boolean;
};

export type Tx = {
  id: string;
  accountId: string;
  /** YYYY-MM-DD */
  date: string;
  description: string;
  /** Com sinal, na moeda da conta. Negativo = saída. */
  amount: number;
  categoryId: string;
  /** Categoria definida manualmente: regras não sobrescrevem. */
  manual?: boolean;
  /** Importação que trouxe este lançamento (para poder apagar a importação inteira). */
  importId?: string;
};

export type ImportRecord = {
  id: string;
  accountId: string;
  /** Nome do arquivo ou "Mercado Pago · sincronização". */
  source: string;
  at: string;
  /** Lançamentos novos gravados e repetidos ignorados. */
  added: number;
  skipped: number;
  /** Totais do que foi gravado, na moeda da conta. */
  income: number;
  expense: number;
  from: string;
  to: string;
};

export type Rule = { key: string; categoryId: string };

export type State = {
  accounts: Account[];
  transactions: Tx[];
  categories: Category[];
  rules: Rule[];
  usdBrl: number;
  /** Respostas da IA por descrição normalizada (aiKey) → categoria. Evita gastar cota repetindo. */
  aiCache: Record<string, string>;
  /** Câmbio USD→BRL automático (ao vivo). Desligado = usa o valor digitado. */
  rateAuto?: boolean;
  /** Quando a cotação ao vivo foi obtida (ISO). */
  rateAt?: string;
  imports?: ImportRecord[];
  /** Versão das migrações de dados já aplicadas. */
  migration?: number;
};

export type ParsedRow = { date: string; description: string; amount: number };
