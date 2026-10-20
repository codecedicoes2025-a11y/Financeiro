import { NextResponse } from "next/server";

/** Relatório de "Liberações" (release_report) da API oficial do Mercado Pago. O token só passa por aqui, nunca é registrado. */
const BASE = "https://api.mercadopago.com/v1/account/release_report";

/** Colunas que o app precisa (chaves documentadas pelo Mercado Pago). Sem NET_DEBIT_AMOUNT as saídas não aparecem. */
const COLUMNS = ["DATE", "SOURCE_ID", "EXTERNAL_REFERENCE", "RECORD_TYPE", "DESCRIPTION", "NET_CREDIT_AMOUNT", "NET_DEBIT_AMOUNT", "GROSS_AMOUNT", "PAYMENT_METHOD"].map((key) => ({ key }));

type Item = { status?: string; file_name?: string; begin_date?: string; generation_date?: string; date_created?: string; id?: number };
type Body = { token?: string; action?: "create" | "fetch"; begin?: string; end?: string; known?: string[]; fallback?: boolean };

async function listReports(headers: HeadersInit): Promise<{ ok: boolean; status: number; items: Item[] }> {
  const r = await fetch(`${BASE}/list`, { headers });
  if (!r.ok) return { ok: false, status: r.status, items: [] };
  const data = await r.json();
  return { ok: true, status: r.status, items: Array.isArray(data) ? data : [] };
}

export async function POST(req: Request) {
  const { token, action, begin, end, known = [], fallback } = (await req.json().catch(() => ({}))) as Body;
  if (!token || typeof token !== "string") return NextResponse.json({ error: "Token do Mercado Pago ausente." }, { status: 400 });
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  try {
    if (action === "create") {
      if (!begin || !end) return NextResponse.json({ error: "Período inválido." }, { status: 400 });

      // Relatórios que já existem: o novo é o que NÃO está nesta lista (evita ler um arquivo antigo, com outras colunas).
      const before = await listReports(headers);
      if (before.status === 401 || before.status === 403) {
        return NextResponse.json({ error: "Mercado Pago recusou o token. Confira se é o Access Token de produção (APP_USR-…) da sua aplicação." }, { status: 401 });
      }
      const knownNames = before.items.map((i) => i.file_name).filter(Boolean);

      // Garante as colunas certas: atualiza a configuração existente ou cria uma nova.
      const config = JSON.stringify({ file_name_prefix: "financeiro", include_withdrawal_at_end: false, display_timezone: "GMT-03", separator: ";", columns: COLUMNS });
      const cfg = await fetch(`${BASE}/config`, { headers });
      await fetch(`${BASE}/config`, { method: cfg.ok ? "PUT" : "POST", headers, body: config });

      const r = await fetch(BASE, { method: "POST", headers, body: JSON.stringify({ begin_date: begin, end_date: end }) });
      const text = await r.text();
      if (!r.ok && r.status !== 202) return NextResponse.json({ error: `Mercado Pago respondeu ${r.status}: ${text.slice(0, 200)}` }, { status: 502 });
      return NextResponse.json({ ok: true, known: knownNames });
    }

    if (action === "fetch") {
      const list = await listReports(headers);
      if (!list.ok) return NextResponse.json({ error: `Mercado Pago respondeu ${list.status} ao listar relatórios.` }, { status: 502 });
      const stamp = (i: Item) => String(i.generation_date ?? i.date_created ?? i.id ?? "");
      const candidates = list.items
        // Sem "status" na listagem, vale qualquer arquivo; com status, só os processados.
        .filter((i) => i.file_name && (i.status === undefined || i.status === "processed"))
        .filter((i) => (fallback ? true : !known.includes(i.file_name as string)))
        .sort((a, b) => stamp(b).localeCompare(stamp(a)));
      const ready = candidates[0];
      if (!ready?.file_name) return NextResponse.json({ ready: false });
      const file = await fetch(`${BASE}/${encodeURIComponent(ready.file_name)}`, { headers });
      if (!file.ok) return NextResponse.json({ error: `Mercado Pago respondeu ${file.status} ao baixar o relatório.` }, { status: 502 });
      return NextResponse.json({ ready: true, csv: await file.text(), file: ready.file_name });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Não consegui falar com o Mercado Pago." }, { status: 502 });
  }
}
