"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch } from "react";

type RateAction = { type: "setLiveRate"; value: number; at: string };

/** Cotação comercial USD→BRL em tempo real (AwesomeAPI); se falhar, usa a open.er-api.com (atualiza 1x/dia). */
async function fetchUsdBrl(): Promise<{ value: number; at: string }> {
  try {
    const r = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", { cache: "no-store" });
    if (r.ok) {
      const bid = parseFloat((await r.json()).USDBRL?.bid);
      if (bid > 0) return { value: bid, at: new Date().toISOString() };
    }
  } catch {
    /* tenta a reserva */
  }
  const r = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
  if (!r.ok) throw new Error("Não consegui buscar a cotação do dólar.");
  const brl = (await r.json()).rates?.BRL;
  if (!(brl > 0)) throw new Error("Cotação indisponível.");
  return { value: brl, at: new Date().toISOString() };
}

const EVERY_MS = 5 * 60_000;

export function useLiveRate(auto: boolean, dispatch: Dispatch<RateAction>) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const { value, at } = await fetchUsdBrl();
      dispatch({ type: "setLiveRate", value, at });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao buscar o câmbio.");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [dispatch]);

  // Atualiza ao abrir, a cada 5 min e quando você volta para a aba.
  useEffect(() => {
    if (!auto) return;
    void refresh();
    const id = setInterval(() => void refresh(), EVERY_MS);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [auto, refresh]);

  return { loading, error, refresh };
}
