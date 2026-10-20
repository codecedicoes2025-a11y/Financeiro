import { parseDate, type ParsedRow } from "./parse";
import { PdfPasswordError, readPdfText } from "./pdfText";

export type AiSettings = {
  apiKey: string;
  /** Em ordem de preferência. Cada modelo tem cota gratuita própria, então alternamos entre eles. */
  models: string[];
  /** Senhas de PDFs de bancos (ex.: C6). Só são usadas neste aparelho, para abrir o arquivo antes de enviar o texto. */
  pdfPasswords: string[];
};

/** Modelos estáveis, mais novos e baratos primeiro (docs: ai.google.dev/gemini-api/docs/models). */
export const DEFAULT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.6-flash", "gemini-3.8-flash", "gemini-2.5-flash-lite"];

export const DEFAULT_AI: AiSettings = { apiKey: "", models: DEFAULT_MODELS, pdfPasswords: [] };

const BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
export const MAX_PDF_MB = 15;

class FatalAiError extends Error {}

/** Modelos em pausa (cota estourada ou indisponíveis), por timestamp de retorno. */
const cooldown = new Map<string, number>();
let cursor = 0;

function nextModels(models: string[]): string[] {
  const now = Date.now();
  const ready = models.filter((m) => (cooldown.get(m) ?? 0) <= now);
  if (!ready.length) return [];
  const start = cursor++ % ready.length;
  return [...ready.slice(start), ...ready.slice(0, start)];
}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

const SCHEMA = {
  type: "OBJECT",
  properties: {
    currency: { type: "STRING" },
    transactions: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { date: { type: "STRING" }, description: { type: "STRING" }, amount: { type: "NUMBER" } }, required: ["date", "description", "amount"] },
    },
  },
  required: ["transactions"],
};

async function generate(model: string, apiKey: string, parts: Part[]): Promise<{ text: string; truncated: boolean }> {
  const send = (withThinking: boolean) =>
    fetch(`${BASE}${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "Você extrai lançamentos de extratos bancários. Responda somente com o JSON pedido." }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: SCHEMA,
          maxOutputTokens: 32768,
          ...(withThinking ? { thinkingConfig: { thinkingLevel: "minimal" } } : {}),
        },
      }),
    });

  let res = await send(true);
  // Modelos sem suporte ao campo de raciocínio respondem 400: repete sem ele.
  if (res.status === 400 && /thinking/i.test(await res.clone().text())) res = await send(false);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 400 && /api key|API_KEY_INVALID/i.test(detail)) throw new FatalAiError("Chave de API inválida. Confira a chave em Configurações › Gemini.");
    if (res.status === 401 || res.status === 403) throw new FatalAiError("A chave não tem permissão para a API Gemini.");
    const wait = res.status === 429 ? (/per day|PerDay/i.test(detail) ? 60 * 60_000 : 65_000) : res.status === 404 ? 6 * 60 * 60_000 : 30_000;
    cooldown.set(model, Date.now() + wait);
    throw new Error(`${model}: erro ${res.status}`);
  }
  const data = await res.json();
  const cand = data?.candidates?.[0];
  const text: string | undefined = cand?.content?.parts?.find((p: { text?: string }) => p.text)?.text;
  if (!text) throw new Error(`${model}: resposta vazia`);
  return { text, truncated: cand?.finishReason === "MAX_TOKENS" };
}

type Raw = { currency?: string; transactions?: { date?: string; description?: string; amount?: number }[] };

function parseJson(text: string, truncated: boolean): Raw {
  try {
    return JSON.parse(text);
  } catch {
    if (!truncated) throw new Error("Resposta em formato inesperado.");
    // Resposta cortada no meio: aproveita os lançamentos completos que vieram.
    const cut = text.lastIndexOf("}");
    return JSON.parse(`${text.slice(0, cut + 1)}]}`);
  }
}

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Não consegui ler o arquivo."));
    r.readAsDataURL(file);
  });

export type PdfResult = { rows: ParsedRow[]; currency?: string; warnings: string[]; model: string };

function prompt(cardMode: boolean) {
  return [
    "Extraia TODOS os lançamentos deste extrato bancário (compras, Pix, transferências, tarifas, pagamentos, rendimentos).",
    "Regras:",
    "- date: formato AAAA-MM-DD. Use o ano do período do extrato quando a linha mostrar só dia e mês.",
    "- description: o texto do lançamento como aparece, curto.",
    `- amount: número com ponto decimal, NEGATIVO para dinheiro que saiu e POSITIVO para o que entrou.${cardMode ? " É fatura de cartão: compras são negativas; pagamentos e estornos da fatura são positivos." : ""}`,
    "- Não inclua saldos, totais, limites, resumos nem linhas de cabeçalho. Não invente lançamentos.",
    "- currency: código ISO da moeda do extrato (BRL ou USD).",
  ].join("\n");
}

export type SendInfo = { mode: "text" | "file"; chars: number; usedPassword: boolean };
export type ExtractHooks = {
  onStatus?: (message: string) => void;
  onModel?: (model: string) => void;
  /** Chamado antes de enviar qualquer coisa ao Google. Devolva false para cancelar. */
  confirmSend?: (info: SendInfo) => boolean;
};

/**
 * Lê um PDF de extrato com o Gemini. O PDF é aberto NESTE aparelho (com as senhas salvas, se precisar) e só o TEXTO
 * extraído é enviado. O arquivo em si só vai se não tiver senha e não tiver texto (PDF escaneado).
 * Devolve null se você cancelar o envio.
 */
export async function extractFromPdf(file: File, settings: AiSettings, cardMode: boolean, hooks: ExtractHooks = {}): Promise<PdfResult | null> {
  if (!settings.apiKey) throw new FatalAiError("Cole sua chave do Gemini em Configurações › Gemini para ler PDFs.");
  if (file.size > MAX_PDF_MB * 1024 * 1024) throw new FatalAiError(`O PDF tem mais de ${MAX_PDF_MB} MB. Divida o extrato em partes menores.`);
  const models = settings.models.filter(Boolean);
  if (!models.length) throw new FatalAiError("Nenhum modelo configurado em Configurações › Gemini.");

  // 1) Abre e extrai o texto aqui no aparelho.
  hooks.onStatus?.("Abrindo o PDF…");
  let text = "";
  let usedPassword = false;
  let localFailed = false;
  try {
    const r = await readPdfText(file, settings.pdfPasswords);
    text = r.text;
    usedPassword = r.usedPassword;
  } catch (e) {
    if (e instanceof PdfPasswordError) throw new FatalAiError(e.message);
    localFailed = true; // PDF fora do padrão: tenta mandar o arquivo.
  }

  // 2) Decide o que enviar.
  const hasText = text.replace(/\s/g, "").length >= 150;
  let parts: Part[];
  let info: SendInfo;
  if (hasText) {
    parts = [{ text: `Texto extraído de um extrato bancário em PDF (colunas separadas por espaços):\n\n${text}\n\n${prompt(cardMode)}` }];
    info = { mode: "text", chars: text.length, usedPassword };
  } else {
    if (usedPassword) throw new FatalAiError("Esse PDF tem senha e não tem texto legível (parece escaneado), então não consigo ler. Baixe o extrato em CSV ou OFX.");
    parts = [{ inlineData: { mimeType: "application/pdf", data: await toBase64(file) } }, { text: prompt(cardMode) }];
    info = { mode: "file", chars: 0, usedPassword: false };
    void localFailed;
  }
  if (hooks.confirmSend && !hooks.confirmSend(info)) return null;

  // 3) Envia, alternando entre os modelos.
  let lastError = "";
  for (const model of nextModels(models)) {
    try {
      hooks.onModel?.(model);
      const { text: answer, truncated } = await generate(model, settings.apiKey, parts);
      const raw = parseJson(answer, truncated);
      const rows: ParsedRow[] = [];
      for (const t of raw.transactions ?? []) {
        const date = t.date ? parseDate(t.date) : null;
        const amount = typeof t.amount === "number" ? t.amount : NaN;
        if (date && Number.isFinite(amount) && amount !== 0) rows.push({ date, description: (t.description ?? "").trim() || "Sem descrição", amount });
      }
      const warnings: string[] = [];
      if (truncated) warnings.push("O PDF é grande e a leitura foi cortada: confira se faltam lançamentos e, se faltar, envie o extrato em partes.");
      if (!rows.length) warnings.push("O Gemini não encontrou lançamentos nesse PDF.");
      const cur = (raw.currency ?? "").trim().toUpperCase();
      return { rows, currency: /^[A-Z]{3}$/.test(cur) ? cur : undefined, warnings, model };
    } catch (e) {
      if (e instanceof FatalAiError) throw e;
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`Cota gratuita esgotada ou modelos indisponíveis agora. Tente de novo em alguns minutos.${lastError ? ` (${lastError})` : ""}`);
}

/** Teste rápido (sem PDF): devolve o modelo que respondeu. */
export async function testConnection(settings: AiSettings): Promise<string> {
  if (!settings.apiKey) throw new FatalAiError("Cole a chave primeiro.");
  let lastError = "";
  for (const model of nextModels(settings.models.filter(Boolean))) {
    try {
      await generate(model, settings.apiKey, [{ text: 'Responda {"transactions":[]}' }]);
      return model;
    } catch (e) {
      if (e instanceof FatalAiError) throw e;
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`Nenhum modelo respondeu agora. ${lastError}`);
}
