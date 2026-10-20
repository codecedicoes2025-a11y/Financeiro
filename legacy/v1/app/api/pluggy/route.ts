import { NextResponse } from "next/server";

/** Open Finance via Meu Pluggy (API gratuita para uso pessoal). Credenciais só passam por aqui. */
const API = "https://api.pluggy.ai";

type Body = {
  clientId?: string;
  clientSecret?: string;
  action?: "accounts" | "transactions";
  itemIds?: string[];
  accountIds?: string[];
  from?: string;
  to?: string;
};

async function auth(clientId: string, clientSecret: string): Promise<string> {
  const r = await fetch(`${API}/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, clientSecret }) });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Client ID ou Client Secret inválidos." : `Pluggy respondeu ${r.status} na autenticação.`);
  return (await r.json()).apiKey as string;
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Body;
  if (!b.clientId || !b.clientSecret) return NextResponse.json({ error: "Credenciais do Pluggy ausentes." }, { status: 400 });

  try {
    const key = await auth(b.clientId, b.clientSecret);
    const headers = { "X-API-KEY": key };

    if (b.action === "accounts") {
      const out: unknown[] = [];
      for (const itemId of (b.itemIds ?? []).slice(0, 10)) {
        const r = await fetch(`${API}/accounts?itemId=${encodeURIComponent(itemId)}`, { headers });
        if (!r.ok) return NextResponse.json({ error: `Pluggy respondeu ${r.status} para o Item ${itemId.slice(0, 8)}…` }, { status: 502 });
        const data = (await r.json()) as { results?: Record<string, unknown>[] };
        for (const a of data.results ?? []) out.push({ id: a.id, itemId, type: a.type, name: a.marketingName ?? a.name, number: a.number, currency: a.currencyCode });
      }
      return NextResponse.json({ accounts: out });
    }

    if (b.action === "transactions") {
      const out: { accountId: string; date: string; description: string; amount: number }[] = [];
      const balances: Record<string, number> = {};
      for (const accountId of (b.accountIds ?? []).slice(0, 20)) {
        const acc = await fetch(`${API}/accounts/${encodeURIComponent(accountId)}`, { headers });
        if (acc.ok) {
          const bal = (await acc.json()).balance;
          if (typeof bal === "number") balances[accountId] = bal;
        }
        let page = 1;
        let total = 1;
        while (page <= total && page <= 20) {
          const url = `${API}/transactions?accountId=${encodeURIComponent(accountId)}&from=${b.from ?? ""}&to=${b.to ?? ""}&pageSize=500&page=${page}`;
          const r = await fetch(url, { headers });
          if (!r.ok) return NextResponse.json({ error: `Pluggy respondeu ${r.status} ao buscar lançamentos.` }, { status: 502 });
          const data = (await r.json()) as { totalPages?: number; results?: { date: string; description?: string; amount: number; type?: string }[] };
          total = data.totalPages ?? 1;
          for (const t of data.results ?? []) {
            // "type" é a fonte confiável do sentido: DEBIT = saída, CREDIT = entrada.
            const abs = Math.abs(t.amount);
            const amount = t.type === "DEBIT" ? -abs : t.type === "CREDIT" ? abs : t.amount;
            out.push({ accountId, date: t.date, description: t.description ?? "Sem descrição", amount });
          }
          page++;
        }
      }
      return NextResponse.json({ transactions: out, balances });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao falar com o Pluggy." }, { status: 502 });
  }
}
