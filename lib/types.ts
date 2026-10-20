export type Currency = "BRL" | "USD";
/** Dois livros separados: finanças pessoais (PF) e da empresa (PJ). */
export type Workspace = "pf" | "pj";
export type EntryType = "in" | "out";
/** Além de entrada/saída, uma transferência entre duas contas suas (não é gasto nem ganho). */
export type EntryKind = EntryType | "transfer";

/**
 * Banco/conta criada por você (ex.: "Nubank", "Payoneer").
 * `openings`: saldo em caixa no dia 01 de cada mês ("YYYY-MM" → valor, na moeda da conta). Todo mês recomeça do que você informar.
 */
export type Account = { id: string; name: string; currency: Currency; openings?: Record<string, number>; /** Só na visão "PF + PJ": de qual livro é a conta. */ ws?: Workspace };

export type Category = { id: string; name: string; color: string; kind: EntryType };

/** Um lançamento. `amount` é sempre positivo, na moeda da conta; o sinal vem de `type`. */
export type Entry = {
  id: string;
  type: EntryKind;
  /** Conta do lançamento. Na transferência, a conta de ORIGEM. */
  accountId: string;
  /** Só transferência: conta de destino. */
  toAccountId?: string;
  /** Só transferência: valor que chegou no destino, na moeda dele (se diferente da origem). */
  toAmount?: number;
  /** YYYY-MM-DD */
  date: string;
  amount: number;
  description: string;
  categoryId: string;
  /** Importação que trouxe este lançamento (permite apagar a importação inteira). */
  importId?: string;
  /** Impressão digital para não importar o mesmo lançamento duas vezes. */
  fp?: string;
};

/** Registro de um extrato importado, para consultar e desfazer. */
export type ImportRecord = {
  id: string;
  accountId: string;
  /** Nome do arquivo. */
  source: string;
  at: string;
  count: number;
  /** Totais gravados, na moeda da conta. */
  income: number;
  expense: number;
  from: string;
  to: string;
};

export type State = {
  accounts: Account[];
  categories: Category[];
  entries: Entry[];
  usdBrl: number;
  /** Câmbio USD→BRL ao vivo. Desligado = usa o valor digitado. */
  rateAuto: boolean;
  rateAt?: string;
  imports?: ImportRecord[];
  /** Seu nome (e variações), para reconhecer Pix/TED entre suas próprias contas. */
  myNames?: string[];
};

/** Dados de um livro (PF ou PJ). */
export type Book = Pick<State, "accounts" | "categories" | "entries" | "imports">;

/** Tudo que é salvo: os dois livros mais o que vale para ambos (câmbio e seu nome). */
export type Root = {
  pf: Book;
  pj: Book;
  usdBrl: number;
  rateAuto: boolean;
  rateAt?: string;
  myNames?: string[];
};
