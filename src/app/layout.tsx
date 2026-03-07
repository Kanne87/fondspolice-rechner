import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Privatrente vs. Trading – Vergleichsrechner",
  description: "HanseMerkur Vario Care Invest – Fondspolice und Trading-Depot im direkten Vergleich",
};

const PRESETS: Record<string, string> = {
  cockpit: "",
  premium: "theme-premium",
  "dark-gold": "theme-dark-gold",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const presetId = cookieStore.get("lo-design-preset")?.value ?? "premium";
  const themeClass = PRESETS[presetId] ?? "theme-premium";

  return (
    <html lang="de" className={themeClass}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
