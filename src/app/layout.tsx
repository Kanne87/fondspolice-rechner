import type { Metadata } from "next";
import { Playfair_Display, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-playfair",
});

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Privatrente vs. Trading \u2013 Vergleichsrechner",
  description: "HanseMerkur Vario Care Invest \u2013 Fondspolice und Trading-Depot im direkten Vergleich",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${playfair.variable} ${geist.variable} ${geistMono.variable}`}>
      <body className="font-[family-name:var(--font-geist)] antialiased">{children}</body>
    </html>
  );
}
