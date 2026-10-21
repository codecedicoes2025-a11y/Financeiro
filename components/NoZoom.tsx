"use client";

import { useEffect } from "react";

/**
 * Impede o zoom por pinça no iPhone (o Safari do iOS ignora `user-scalable=no`; só os eventos de gesto resolvem).
 * O zoom por toque duplo é bloqueado pelo CSS (`touch-action`), sem engolir toques rápidos em botões.
 */
export function NoZoom() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const pinch = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    const opts = { passive: false } as AddEventListenerOptions;
    document.addEventListener("gesturestart", stop, opts);
    document.addEventListener("gesturechange", stop, opts);
    document.addEventListener("gestureend", stop, opts);
    document.addEventListener("touchmove", pinch, opts);
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
      document.removeEventListener("gestureend", stop);
      document.removeEventListener("touchmove", pinch);
    };
  }, []);
  return null;
}
