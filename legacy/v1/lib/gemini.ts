import { normalize } from "./categories";

export type AiSettings = {
  apiKey: string;
  /** Em ordem de preferência. Cada modelo tem cota gratuita própria, então alternamos entre eles. */
  models: string[];
  autoRun: boolean;
  allowNew: boolean;
};

/** Modelos estáveis, mais novos e baratos primeiro (docs: ai.google.dev/gemini-api/docs/models). */
export const DEFAULT_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.8-flash",
  "gemini-2.5-flash-lite",
];

export const DEFAULT_AI: AiSettings = { apiKey: "", models: DEFAULT_MODELS, autoRun: true, allowNew: true };

const BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const BATCH = 40;

/** Chave de cache: descrição sem números/símbolos, para "IFOOD *123" e "IFOOD *456" valerem o mesmo. */
export function aiKey(description: string): string {
  return normalize(description).replace(/[0-9*#/\\._-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 50);
}

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

async function generate(model: string, apiKey: string, prompt: string, count: number): Promise<string> {
  const send = async (withThinking: boolean) =>
    fetch(`${BASE}${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "Você classifica lançamentos bancários brasileiros em categorias. Responda somente com o JSON pedido." }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: { type: "OBJECT", properties: { i: { type: "INTEGER" }, c: { type: "STRING" } }, required: ["i", "c"] },
          },
          maxOutputTokens: Math.max(512, count * 24),
          ...(withThinking ? { thinkingConfig: { thinkingLevel: "minimal" } } : {}),
        },
      }),
    });

  let res = await send(true);
  // Modelos sem suporte ao campo de raciocínio respondem 400: repete sem ele.
  if (res.status === 400) {
    const text = await res.clone().text();
    if (/thinking/i.test(text)) res = await send(false);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 400 && /api key|API_KEY_INVALID/i.test(detail)) throw new FatalAiError("Chave de API inválida.");
    if (res.status === 401 || res.status === 403) throw new FatalAiError("Chave sem permissão para a API Gemini.");
    const wait = res.status === 429 ? (/per day|PerDay/i.test(detail) ? 60 * 60_000 : 65_000) : res.status === 404 ? 6 * 60 * 60_000 : 30_000;
    cooldown.set(model, Date.now() + wait);
    throw new Error(`${model}: erro ${res.status}`);
  }
  const data = await res.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text;
  if (!text) throw new Error(`${model}: resposta vazia`);
  return text;
}

export type AiItem = { key: string; text: string; sign: "+" | "-" };
export type AiCategory = { id: string; name: string; ignore?: boolean };
export type AiResult = { key: string; categoryId?: string; newName?: string };

function buildPrompt(items: AiItem[], cats: AiCategory[], allowNew: boolean): string {
  const list = cats
    .map((c, i) => `${i}=${c.name}${c.ignore ? " (pagamento de fatura ou transferência entre contas do próprio dono)" : ""}`)
    .join("\n");
  const fallback = cats.findIndex((c) => c.id === "outros");
  const none = allowNew ? `Se nenhuma servir, responda "+Nome curto" para criar categoria nova (use o mesmo nome para itens parecidos).` : `Se nenhuma servir, use ${fallback}.`;
  const lines = items.map((it, i) => `${i}|${it.sign}|${it.text}`).join("\n");
  return `Categorias (índice=nome):\n${list}\n${none}\nItens (i|sinal|descrição; + entrada, - saída). Responda [{"i":i,"c":"índice"}].\n${lines}`;
}

export type Progress = { done: number; total: number; model: string };

export async function categorizeItems(
  items: AiItem[],
  cats: AiCategory[],
  settings: AiSettings,
  onBatch: (results: AiResult[], progress: Progress) => void,
  signal?: AbortSignal,
): Promise<{ failed: number }> {
  const models = settings.models.filter(Boolean);
  if (!models.length) throw new FatalAiError("Nenhum modelo configurado.");
  let done = 0;
  let failed = 0;

  for (let start = 0; start < items.length; start += BATCH) {
    if (signal?.aborted) break;
    const batch = items.slice(start, start + BATCH);
    const prompt = buildPrompt(batch, cats, settings.allowNew);
    let ok = false;
    let lastError = "";
    for (const model of nextModels(models)) {
      try {
        const raw = await generate(model, settings.apiKey, prompt, batch.length);
        const parsed: { i: number; c: string }[] = JSON.parse(raw);
        const results: AiResult[] = [];
        for (const row of parsed) {
          const item = batch[row.i];
          if (!item) continue;
          const c = String(row.c).trim();
          if (c.startsWith("+")) {
            const name = c.slice(1).trim();
            if (name && settings.allowNew) results.push({ key: item.key, newName: name.slice(0, 28) });
          } else {
            const cat = cats[Number(c)];
            if (cat) results.push({ key: item.key, categoryId: cat.id });
          }
        }
        done += batch.length;
        onBatch(results, { done, total: items.length, model });
        ok = true;
        break;
      } catch (e) {
        if (e instanceof FatalAiError) throw e;
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
    if (!ok) {
      failed += batch.length;
      if (!nextModels(models).length) {
        throw new Error("Cota gratuita esgotada em todos os modelos agora. Tente novamente em alguns minutos." + (lastError ? ` (${lastError})` : ""));
      }
    }
  }
  return { failed };
}

/** Teste rápido: 1 item, devolve o modelo que respondeu. */
export async function testConnection(settings: AiSettings): Promise<string> {
  let used = "";
  await categorizeItems(
    [{ key: "teste", text: "SUPERMERCADO EXEMPLO", sign: "-" }],
    [{ id: "mercado", name: "Mercado" }, { id: "outros", name: "Outros" }],
    { ...settings, allowNew: false },
    (_r, p) => (used = p.model),
  );
  if (!used) throw new Error("Nenhum modelo respondeu.");
  return used;
}
