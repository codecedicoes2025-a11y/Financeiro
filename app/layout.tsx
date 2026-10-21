import type { Metadata, Viewport } from "next";
import { NoZoom } from "@/components/NoZoom";
import "./globals.css";

export const metadata: Metadata = {
  title: "Financeiro",
  description: "Extratos, categorias e gastos em um só lugar.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Financeiro", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Sem zoom por pinça nem por toque duplo (Android e iPhone). O iOS ignora esta tag, então há também <NoZoom /> e o CSS.
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  themeColor: "#161616",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cal+Sans&family=Geist+Mono:wght@400;500&display=swap" />
      </head>
      <body>
        <NoZoom />
        {children}
      </body>
    </html>
  );
}
