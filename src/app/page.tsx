"use client";
import { useState, useMemo, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";

interface Params {
  beitrag: number; alterHeute: number; rentenEintritt: number; renditePa: number;
  basiszins: number; persSteuersatz: number;
  rentenfaktor: number; lebenserwartung: number; rentenRendite: number; ertragsanteil: number;
  fondswechselAnzahl: number; fondswechselIntervall: number;
  entnahmeDauer: number;
}

// HanseMerkur Vario Care Invest – Kostenstruktur (abgeleitet aus PIB 75€ + 700€)
const HM_ABSCHLUSS_PCT = 0.025;           // 2,50% der BWS
const HM_LAUFENDE_AV_PCT = 0.0172;        // 1,72% vom Monatsbeitrag (ab Monat 61)
const HM_VERWALTUNG_FIX = 1.01;           // 1,01€/Monat Fixanteil
const HM_VERWALTUNG_PCT = 0.0679;         // 6,79% vom Monatsbeitrag
const HM_FONDSGUTHABEN_PA = 0.00192;      // 0,192% p.a. (0,16€ pro 1.000€/Monat)
const HM_RENTEN_VERWALTUNG_PCT = 0.01;    // 1€ pro 100€ Rente = 1%

function simulate(params: Params) {
  const { beitrag, alterHeute, rentenEintritt, renditePa, basiszins, persSteuersatz, rentenfaktor, lebenserwartung, rentenRendite, ertragsanteil, fondswechselAnzahl, fondswechselIntervall, entnahmeDauer } = params;
  const monate = (rentenEintritt - alterHeute) * 12;
  const monthlyRate = renditePa / 12;
  const monthlyFondsCost = HM_FONDSGUTHABEN_PA / 12;
  const beitragsSumme = beitrag * monate;
  
  // HanseMerkur Kosten – abgeleitet vom Beitrag
  const abschlussGesamt = beitragsSumme * HM_ABSCHLUSS_PCT;
  const abschlussMonatlich = abschlussGesamt / 60;
  const laufendeAVmonatlich = beitrag * HM_LAUFENDE_AV_PCT;
  const verwaltungMonatlich = HM_VERWALTUNG_FIX + beitrag * HM_VERWALTUNG_PCT;
  
  const kest = 0.26375;
  const teilfreistellungETF = 0.30;
  const rentenMonate = (lebenserwartung - rentenEintritt) * 12;
  const rentenMonthlyRate = rentenRendite / 12;

  // Build switch points (month numbers where fund switch happens)
  const switchMonths: number[] = [];
  for (let i = 1; i <= fondswechselAnzahl; i++) {
    const switchMonth = i * fondswechselIntervall * 12;
    if (switchMonth < monate) switchMonths.push(switchMonth);
  }

  // ─── Ansparphase: Fondspolice (switches have ZERO tax impact) ───
  let fpBalance = 0;
  const fpData: {monat:number;jahr:number;fpBalance:number;trBalance:number}[] = [];
  let fpTotalCosts = 0;

  for (let m = 1; m <= monate; m++) {
    const balanceStart = fpBalance + beitrag;
    // Fondsguthabenkosten: 0,16€ pro 1.000€ Guthaben/Monat
    const fundCost = balanceStart * monthlyFondsCost;
    // Monat 1-60: Abschluss gezillmert | ab 61: laufende A&V (1,72% vom Beitrag)
    const distCost = m <= 60 ? abschlussMonatlich : laufendeAVmonatlich;
    // Verwaltung: 1,01€ + 6,79% × Beitrag (monatlich)
    const adminCost = verwaltungMonatlich;
    const netForGrowth = balanceStart - fundCost - distCost - adminCost;
    const growth = netForGrowth * monthlyRate;
    fpBalance = netForGrowth + growth;
    fpTotalCosts += fundCost + distCost + adminCost;
    if (m % 12 === 0 || m === monate) {
      fpData.push({ monat: m, jahr: Math.round(m / 12), fpBalance: Math.round(fpBalance), trBalance: 0 });
    }
  }

  // ─── Ansparphase: Trading (switches trigger full gain realization) ───
  let trBalance = 0;
  let trCostBasis = 0; // tracks what was "paid in" (contributions + reinvested after-tax)
  let trVorabpauschaleGesamt = 0;
  let trYearStartBalance = 0;
  let trYearContributions = 0;
  let trFondswechselSteuerGesamt = 0;
  const trSwitchEvents: {monat:number;jahr:number;steuer:number;gewinn:number;balanceVor:number;balanceNach:number}[] = [];

  for (let m = 1; m <= monate; m++) {
    if ((m - 1) % 12 === 0) { trYearStartBalance = trBalance; trYearContributions = 0; }
    trYearContributions += beitrag;
    trCostBasis += beitrag;
    const balanceStart = trBalance + beitrag;
    const fundCost = balanceStart * monthlyFondsCost;
    const netForGrowth = balanceStart - fundCost;
    const growth = netForGrowth * monthlyRate;
    trBalance = netForGrowth + growth;

    // Vorabpauschale at year end
    if (m % 12 === 0) {
      const basisertrag = trYearStartBalance * basiszins * 0.7;
      const actualGain = trBalance - trYearStartBalance - trYearContributions;
      const vorabBasis = Math.min(basisertrag, Math.max(0, actualGain));
      const vorabSteuer = vorabBasis * (1 - teilfreistellungETF) * kest;
      trVorabpauschaleGesamt += vorabSteuer;
      trBalance -= vorabSteuer;
    }

    // Fund switch: realize all gains, pay tax, reset cost basis
    if (switchMonths.includes(m)) {
      const gewinn = Math.max(0, trBalance - trCostBasis);
      const steuerpflichtig = gewinn * (1 - teilfreistellungETF);
      const steuer = steuerpflichtig * kest;
      const balanceVor = trBalance;
      trBalance -= steuer;
      trFondswechselSteuerGesamt += steuer;
      trCostBasis = trBalance; // reset: everything is now "paid in"
      trSwitchEvents.push({ monat: m, jahr: Math.round(m / 12), steuer: Math.round(steuer), gewinn: Math.round(gewinn), balanceVor: Math.round(balanceVor), balanceNach: Math.round(trBalance) });
    }

    if (m % 12 === 0 || m === monate) {
      const idx = fpData.findIndex(d => d.monat === m);
      if (idx >= 0) fpData[idx].trBalance = Math.round(trBalance);
    }
  }

  // ─── Exit taxes ───
  const trGewinn = trBalance - trCostBasis;
  const trSteuerpflichtig = trGewinn * (1 - teilfreistellungETF);
  const trSteuerAufwand = trSteuerpflichtig * kest;
  const trNetto = trBalance - Math.max(0, trSteuerAufwand);

  const fpGewinn = fpBalance - beitragsSumme;
  // HanseMerkur: Teilentnahme "Ein Abzug hierfür fällt nicht an" → 0% Kosten
  const fpKapitalauszahlungskosten = 0;
  const fpSteuerpflichtig = fpGewinn * 0.5;
  const fpSteuerAufwand = fpSteuerpflichtig * persSteuersatz;
  const fpNettoKapital = fpBalance - fpKapitalauszahlungskosten - fpSteuerAufwand;

  // ─── Rente ───
  const fpMonatlicheRenteBrutto = (fpBalance / 10000) * rentenfaktor;
  // HanseMerkur: Rentenverwaltung 1€ pro 100€ Rente = 1%
  const fpRentenVerwaltung = fpMonatlicheRenteBrutto * HM_RENTEN_VERWALTUNG_PCT;
  const fpMonatlicheRente = fpMonatlicheRenteBrutto - fpRentenVerwaltung;
  const fpErtragsanteil = fpMonatlicheRente * ertragsanteil;
  const fpRentenSteuer = fpErtragsanteil * persSteuersatz;
  const fpNettoRente = fpMonatlicheRente - fpRentenSteuer;

  const trGewinnAnteil = Math.max(0, (trNetto - beitragsSumme) / trNetto);
  const zielNetto = fpNettoRente;
  const zielBrutto = zielNetto / (1 - trGewinnAnteil * kest);

  let trTempKapital = trNetto;
  let trReichtMonate = 0;
  const trRentenVerlauf: {jahr:number;alter:number;trKapital:number}[] = [];

  for (let m = 1; m <= 600; m++) {
    const wachstum = trTempKapital * rentenMonthlyRate;
    trTempKapital = trTempKapital + wachstum - zielBrutto;
    if (m % 12 === 0) {
      trRentenVerlauf.push({ jahr: m / 12, alter: rentenEintritt + m / 12, trKapital: Math.max(0, Math.round(trTempKapital)) });
    }
    if (trTempKapital <= 0) { trReichtMonate = m; break; }
  }
  if (trTempKapital > 0) trReichtMonate = 600;

  let trBruttoEntnahme: number;
  if (rentenMonthlyRate > 0) {
    trBruttoEntnahme = trNetto * rentenMonthlyRate / (1 - Math.pow(1 + rentenMonthlyRate, -rentenMonate));
  } else {
    trBruttoEntnahme = trNetto / rentenMonate;
  }
  const trEntnahmeSteuer = trBruttoEntnahme * trGewinnAnteil * kest;
  const trNettoEntnahmeMax = trBruttoEntnahme - trEntnahmeSteuer;

  // ─── Kapitalentnahme (Fondspolice) über N Jahre mit Halbeinkünfteverfahren ───
  // Kapital bleibt in derselben Anlagestrategie → renditePa (nicht rentenRendite)
  // HanseMerkur: Teilentnahme ohne Kosten, Fondsguthabenkosten laufen weiter
  // Halbeinkünfteverfahren: nur 50% des Ertragsanteils × pers. Steuersatz
  let keKapital = fpBalance;
  let keCostBasis = beitragsSumme;
  const keJahre = Math.min(entnahmeDauer, lebenserwartung - rentenEintritt);
  const keRendite = renditePa; // gleiche Rendite wie Ansparphase
  
  // Annuität berechnen: gleichmäßige Brutto-Entnahme über keJahre bei keRendite
  // Berücksichtigt laufende Fondsguthabenkosten (~0,192% p.a.)
  const keNettoRendite = keRendite - HM_FONDSGUTHABEN_PA;
  let keBruttoJahr: number;
  if (keNettoRendite > 0) {
    keBruttoJahr = keKapital * keNettoRendite / (1 - Math.pow(1 + keNettoRendite, -keJahre));
  } else {
    keBruttoJahr = keKapital / keJahre;
  }

  const keVerlauf: {jahr:number;alter:number;kapital:number;brutto:number;steuer:number;netto:number}[] = [];
  let keSteuerGesamt = 0;
  let keNettoGesamt = 0;

  for (let j = 1; j <= keJahre; j++) {
    // Kapital wächst mit Ansparrendite, abzgl. laufende Fondsguthabenkosten
    keKapital = keKapital * (1 + keNettoRendite);
    
    // Entnahme (keine Kosten bei Teilentnahme laut HanseMerkur)
    const entnahme = Math.min(keBruttoJahr, keKapital);
    const gewinnAnteil = keCostBasis < keKapital ? 1 - (keCostBasis / keKapital) : 0;
    const ertragsAnteilEntnahme = entnahme * gewinnAnteil;
    // Halbeinkünfteverfahren: 50% des Ertrags × persönlicher Steuersatz
    const steuer = ertragsAnteilEntnahme * 0.5 * persSteuersatz;
    const netto = entnahme - steuer;
    
    // Cost-Basis proportional reduzieren
    const costBasisAnteil = keCostBasis / keKapital;
    keKapital -= entnahme;
    keCostBasis -= entnahme * costBasisAnteil;
    keCostBasis = Math.max(0, keCostBasis);
    
    keSteuerGesamt += steuer;
    keNettoGesamt += netto;
    
    keVerlauf.push({
      jahr: j, alter: rentenEintritt + j,
      kapital: Math.max(0, Math.round(keKapital)),
      brutto: Math.round(entnahme),
      steuer: Math.round(steuer),
      netto: Math.round(netto),
    });
  }
  
  const keNettoMonatlich = keJahre > 0 ? Math.round(keNettoGesamt / keJahre / 12) : 0;
  const keBruttoMonatlich = Math.round(keBruttoJahr / 12);
  const keEffektiverSteuersatz = keNettoGesamt > 0 ? keSteuerGesamt / (keNettoGesamt + keSteuerGesamt) : 0;

  return {
    monate, beitragsSumme, fpBalance: Math.round(fpBalance), trBalance: Math.round(trBalance),
    fpTotalCosts: Math.round(fpTotalCosts), trVorabpauschaleGesamt: Math.round(trVorabpauschaleGesamt),
    // Cost breakdown for display
    abschlussMonatlich: Math.round(abschlussMonatlich * 100) / 100,
    abschlussGesamt: Math.round(abschlussGesamt),
    verwaltungMonatlich: Math.round(verwaltungMonatlich * 100) / 100,
    laufendeAVmonatlich: Math.round(laufendeAVmonatlich * 100) / 100,
    trNetto: Math.round(trNetto), trSteuerAufwand: Math.round(Math.max(0, trSteuerAufwand)),
    fpNettoKapital: Math.round(fpNettoKapital), fpSteuerAufwand: Math.round(fpSteuerAufwand),
    fpKapitalauszahlungskosten: Math.round(fpKapitalauszahlungskosten),
    fpMonatlicheRenteBrutto: Math.round(fpMonatlicheRenteBrutto),
    fpMonatlicheRente: Math.round(fpMonatlicheRente), fpNettoRente: Math.round(fpNettoRente),
    fpRentenVerwaltung: Math.round(fpRentenVerwaltung),
    trNettoEntnahme: Math.round(zielNetto), trBruttoEntnahme: Math.round(zielBrutto),
    trNettoEntnahmeMax: Math.round(trNettoEntnahmeMax),
    trReichtMonate, trReichtJahre: Math.round(trReichtMonate / 12 * 10) / 10,
    trReichtAlter: rentenEintritt + Math.round(trReichtMonate / 12 * 10) / 10,
    ansparData: fpData, rentenVerlauf: trRentenVerlauf,
    trFondswechselSteuerGesamt: Math.round(trFondswechselSteuerGesamt),
    trSwitchEvents,
    switchYears: switchMonths.map(m => Math.round(m / 12)),
    // Kapitalentnahme
    keVerlauf, keNettoMonatlich, keBruttoMonatlich,
    keSteuerGesamt: Math.round(keSteuerGesamt),
    keNettoGesamt: Math.round(keNettoGesamt),
    keEffektiverSteuersatz,
    keJahre, keRendite,
  };
}

const fmt = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n);
const fmtEur = (n: number) => fmt(n) + " €";

function Slider({ label, value, onChange, min, max, step = 1, unit = "", helpText }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string; helpText?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline">
        <label className="text-sm text-zinc-400 font-medium">{label}</label>
        <span className="text-sm font-mono text-emerald-400 font-semibold">{typeof value === "number" && value >= 1000 ? fmt(value) : value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-zinc-700" />
      {helpText && <p className="text-xs text-zinc-500">{helpText}</p>}
    </div>
  );
}

function MetricCard({ label, value, sub, accent = false, warn = false }: { label: string; value: string; sub?: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-xl p-4 ${accent ? "bg-emerald-950/40 border border-emerald-800/30" : warn ? "bg-amber-950/30 border border-amber-800/30" : "bg-zinc-800/60 border border-zinc-700/30"}`}>
      <p className="text-xs text-zinc-400 mb-1 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-semibold font-mono ${accent ? "text-emerald-400" : warn ? "text-amber-400" : "text-zinc-100"}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
    </div>
  );
}

function CompareBar({ label, fpValue, trValue }: { label: string; fpValue: number; trValue: number }) {
  const maxVal = Math.max(Math.abs(fpValue), Math.abs(trValue));
  const fpW = maxVal > 0 ? (Math.abs(fpValue) / maxVal) * 100 : 0;
  const trW = maxVal > 0 ? (Math.abs(trValue) / maxVal) * 100 : 0;
  return (
    <div className="space-y-1.5 py-2">
      <p className="text-xs text-zinc-400">{label}</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-emerald-400 w-20 shrink-0">Fondspolice</span>
          <div className="flex-1 h-5 bg-zinc-800 rounded-md overflow-hidden">
            <div className="h-full bg-emerald-600/60 rounded-md flex items-center px-2" style={{ width: `${Math.max(fpW, 8)}%` }}>
              <span className="text-xs text-white font-mono whitespace-nowrap">{fmtEur(fpValue)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-sky-400 w-20 shrink-0">Trading</span>
          <div className="flex-1 h-5 bg-zinc-800 rounded-md overflow-hidden">
            <div className="h-full bg-sky-600/60 rounded-md flex items-center px-2" style={{ width: `${Math.max(trW, 8)}%` }}>
              <span className="text-xs text-white font-mono whitespace-nowrap">{fmtEur(trValue)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const customTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-zinc-400 mb-1">Jahr {label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any, i: number) => (<p key={i} style={{ color: p.color }} className="font-mono">{p.name}: {fmtEur(p.value)}</p>))}
    </div>
  );
};

export default function Page() {
  const [params, setParams] = useState<Params>({
    beitrag: 1000, alterHeute: 38, rentenEintritt: 67, renditePa: 0.09, basiszins: 0.032,
    persSteuersatz: 0.17, rentenfaktor: 26.18,
    lebenserwartung: 88, rentenRendite: 0.02, ertragsanteil: 0.17,
    fondswechselAnzahl: 2, fondswechselIntervall: 10,
    entnahmeDauer: 10,
  });
  const [activeTab, setActiveTab] = useState("anspar");
  const set = useCallback((key: keyof Params, val: number) => setParams(p => ({ ...p, [key]: val })), []);
  const r = useMemo(() => simulate(params), [params]);

  const tabs = [{ id: "anspar", label: "Ansparphase" }, { id: "rente", label: "Rentenbezug" }, { id: "fazit", label: "Fazit" }];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      <div className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div><h1 className="text-base font-semibold tracking-tight">Privatrente vs. Trading</h1><p className="text-xs text-zinc-500">Vergleichsrechner</p></div>
          </div>
          <div className="flex gap-1 bg-zinc-900 rounded-lg p-0.5">
            {tabs.map(t => (<button key={t.id} onClick={() => setActiveTab(t.id)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === t.id ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/30" : "text-zinc-400 hover:text-zinc-200"}`}>{t.label}</button>))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-zinc-900/70 rounded-xl border border-zinc-800/60 p-4 space-y-4 sticky top-16">
              <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Parameter</h3>
              <Slider label="Monatlicher Beitrag" value={params.beitrag} onChange={v => set("beitrag", v)} min={100} max={3000} step={50} unit=" €" />
              <Slider label="Aktuelles Alter" value={params.alterHeute} onChange={v => set("alterHeute", v)} min={20} max={55} unit=" Jahre" />
              <Slider label="Renteneintritt" value={params.rentenEintritt} onChange={v => set("rentenEintritt", v)} min={60} max={70} unit=" Jahre" />
              <Slider label="Erwartete Rendite" value={Math.round(params.renditePa * 100)} onChange={v => set("renditePa", v / 100)} min={3} max={12} step={0.5} unit="% p.a." />
              <Slider label="Basiszins" value={Math.round(params.basiszins * 1000) / 10} onChange={v => set("basiszins", v / 100)} min={0} max={5} step={0.1} unit="%" helpText="Aktuell 3,2% (Stand 2025)" />

              {/* Fund Switch Section */}
              <div className="border-t border-zinc-800 pt-3">
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
                  <p className="text-xs text-amber-400 font-semibold">Fondswechsel / Umschichtung</p>
                </div>
                <p className="text-xs text-zinc-600 mb-3">Im Versicherungsmantel steuerfrei, im Depot steuerpflichtig</p>
                <Slider label="Anzahl Fondswechsel" value={params.fondswechselAnzahl} onChange={v => set("fondswechselAnzahl", v)} min={0} max={4} unit="×" />
                {params.fondswechselAnzahl > 0 && (
                  <div className="mt-3">
                    <Slider label="Alle" value={params.fondswechselIntervall} onChange={v => set("fondswechselIntervall", v)} min={3} max={15} unit=" Jahre" />
                  </div>
                )}
                {params.fondswechselAnzahl > 0 && r.switchYears.length > 0 && (
                  <div className="mt-2 bg-zinc-800/50 rounded-lg p-2">
                    <p className="text-xs text-zinc-400">Wechsel in Jahr: <span className="text-amber-400 font-mono font-semibold">{r.switchYears.join(", ")}</span></p>
                    {r.trFondswechselSteuerGesamt > 0 && (
                      <p className="text-xs text-red-400 mt-1">Steuerverlust Depot: <span className="font-mono font-semibold">{fmtEur(r.trFondswechselSteuerGesamt)}</span></p>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-zinc-800 pt-3">
                <p className="text-xs text-zinc-500 mb-3">Erweitert</p>
                <Slider label="Persönl. Steuersatz" value={Math.round(params.persSteuersatz * 100)} onChange={v => set("persSteuersatz", v / 100)} min={0} max={42} step={1} unit="%" />
                <div className="mt-3"><Slider label="Rentenfaktor" value={params.rentenfaktor} onChange={v => set("rentenfaktor", v)} min={15} max={35} step={0.1} /></div>
                <div className="mt-3"><Slider label="Lebenserwartung" value={params.lebenserwartung} onChange={v => set("lebenserwartung", v)} min={75} max={100} unit=" Jahre" /></div>
                <div className="mt-3"><Slider label="Kapitalentnahme über" value={params.entnahmeDauer} onChange={v => set("entnahmeDauer", v)} min={1} max={30} unit=" Jahre" helpText="Steuerbegünstigte Teilentnahme (frei wählbar)" /></div>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-3">
                <p className="text-xs text-zinc-400"><span className="font-semibold text-zinc-300">{r.monate / 12} Jahre</span> Ansparzeit</p>
                <p className="text-xs text-zinc-400 mt-1"><span className="font-semibold text-zinc-300">{fmtEur(r.beitragsSumme)}</span> Gesamteinzahlung</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-3 space-y-6">
            {activeTab === "anspar" && (<>
              <div className="bg-zinc-900/70 rounded-xl border border-zinc-800/60 p-5">
                <h2 className="text-lg font-semibold text-zinc-100 mb-1">Vermögenswachstum</h2>
                <p className="text-sm text-zinc-500 mb-4">Kapitalentwicklung über die Ansparphase{r.switchYears.length > 0 && ` – Fondswechsel in Jahr ${r.switchYears.join(", ")}`}</p>
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={r.ansparData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gFp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                      <linearGradient id="gTr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.3} /><stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                    <XAxis dataKey="jahr" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#3f3f46" }} />
                    <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#3f3f46" }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                    <Tooltip content={customTooltip} />
                    {r.switchYears.map(y => (
                      <ReferenceLine key={y} x={y} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: `Wechsel`, position: "top", style: { fill: "#f59e0b", fontSize: 9 } }} />
                    ))}
                    <Area type="monotone" dataKey="fpBalance" name="Fondspolice" stroke="#10b981" fill="url(#gFp)" strokeWidth={2} />
                    <Area type="monotone" dataKey="trBalance" name="Trading Depot" stroke="#0ea5e9" fill="url(#gTr)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="flex gap-6 mt-3 justify-center">
                  <span className="flex items-center gap-2 text-xs text-zinc-400"><span className="w-3 h-3 rounded-full bg-emerald-500" /> Fondspolice</span>
                  <span className="flex items-center gap-2 text-xs text-zinc-400"><span className="w-3 h-3 rounded-full bg-sky-500" /> Trading Depot</span>
                  {r.switchYears.length > 0 && <span className="flex items-center gap-2 text-xs text-zinc-400"><span className="w-3 h-0.5 bg-amber-500" /> Fondswechsel</span>}
                </div>
              </div>

              {/* Fund Switch Impact */}
              {r.trSwitchEvents.length > 0 && (
                <div className="bg-amber-950/20 rounded-xl border border-amber-800/30 p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-900/50 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-amber-400">Fondswechsel-Kosten im Trading-Depot</h3>
                      <p className="text-sm text-zinc-400 mt-1">
                        Bei jedem Umschichten im Depot werden alle Kursgewinne realisiert und mit 26,375% KESt (nach 30% Teilfreistellung) versteuert. In der Fondspolice ist jeder Fondswechsel steuerneutral.
                      </p>
                      <div className="mt-3 space-y-2">
                        {r.trSwitchEvents.map((ev, i) => (
                          <div key={i} className="flex items-center gap-4 bg-zinc-900/60 rounded-lg px-3 py-2 text-xs flex-wrap">
                            <span className="text-amber-400 font-semibold whitespace-nowrap">Jahr {ev.jahr}</span>
                            <span className="text-zinc-400 whitespace-nowrap">Gewinn: <span className="text-zinc-200 font-mono">{fmtEur(ev.gewinn)}</span></span>
                            <span className="text-zinc-400 whitespace-nowrap">Steuer: <span className="text-red-400 font-mono font-semibold">{fmtEur(ev.steuer)}</span></span>
                            <span className="text-zinc-500 whitespace-nowrap">({fmtEur(ev.balanceVor)} → {fmtEur(ev.balanceNach)})</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 pt-3 border-t border-amber-900/30 flex justify-between items-center">
                        <span className="text-sm text-zinc-300">Gesamter Steuerverlust durch Fondswechsel</span>
                        <span className="text-lg font-bold font-mono text-red-400">{fmtEur(r.trFondswechselSteuerGesamt)}</span>
                      </div>
                      <p className="text-xs text-emerald-400 mt-2">In der Fondspolice: 0 € Steuer bei Fondswechsel</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-900/70 rounded-xl border border-emerald-800/30 p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-3"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /><h3 className="text-sm font-semibold text-emerald-400">Fondspolice / Privatrente</h3></div>
                  <MetricCard label="Endkapital (brutto)" value={fmtEur(r.fpBalance)} accent />
                  <MetricCard label="Kosten gesamt" value={fmtEur(r.fpTotalCosts)} sub={`Abschluss ${r.abschlussMonatlich}€/Mo (60 Mo) → ${r.laufendeAVmonatlich}€ | Verwaltung ${r.verwaltungMonatlich}€/Mo`} />
                  <MetricCard label="Steuer bei Auszahlung" value={fmtEur(r.fpSteuerAufwand)} sub="Halbeinkünfteverfahren (50% × pers. Satz)" />
                  <MetricCard label="Teilentnahme-Kosten" value="0 €" sub="Kein Abzug bei Entnahme (HanseMerkur)" accent />
                  {r.switchYears.length > 0 && <MetricCard label="Fondswechsel-Steuer" value="0 €" sub="Steuerfrei im Versicherungsmantel" accent />}
                  <MetricCard label="Netto verfügbar" value={fmtEur(r.fpNettoKapital)} accent />
                </div>
                <div className="bg-zinc-900/70 rounded-xl border border-sky-800/30 p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-3"><span className="w-2.5 h-2.5 rounded-full bg-sky-500" /><h3 className="text-sm font-semibold text-sky-400">Trading Depot (ETF)</h3></div>
                  <MetricCard label="Endkapital (brutto)" value={fmtEur(r.trBalance)} />
                  <MetricCard label="Vorabpauschale (kumuliert)" value={fmtEur(r.trVorabpauschaleGesamt)} sub="Jährliche Steuer auf Basisertrag" />
                  <MetricCard label="Steuer bei Verkauf" value={fmtEur(r.trSteuerAufwand)} sub="KESt 26,375% × 70% (Teilfreistellung)" />
                  {r.trFondswechselSteuerGesamt > 0 ? <MetricCard label="Fondswechsel-Steuer" value={fmtEur(r.trFondswechselSteuerGesamt)} sub={`${r.trSwitchEvents.length}× Umschichtung versteuert`} warn /> : <div className="rounded-xl p-4 bg-zinc-800/20 border border-zinc-800/20" />}
                  <MetricCard label="Netto verfügbar" value={fmtEur(r.trNetto)} />
                </div>
              </div>
              <div className="bg-zinc-900/70 rounded-xl border border-zinc-800/60 p-5">
                <h2 className="text-lg font-semibold text-zinc-100 mb-4">Direktvergleich bei Renteneintritt</h2>
                <CompareBar label="Brutto-Endkapital" fpValue={r.fpBalance} trValue={r.trBalance} />
                <CompareBar label="Netto nach Steuern & Kosten" fpValue={r.fpNettoKapital} trValue={r.trNetto} />
              </div>
            </>)}

            {activeTab === "rente" && (<>
              <div className="bg-zinc-900/70 rounded-xl border border-zinc-800/60 p-5">
                <h2 className="text-lg font-semibold text-zinc-100 mb-1">Rentenbezugsphase</h2>
                <p className="text-sm text-zinc-500 mb-4">Monatliches Einkommen ab Alter {params.rentenEintritt}</p>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-emerald-950/30 rounded-xl border border-emerald-800/20 p-4">
                    <p className="text-xs text-emerald-400/70 uppercase tracking-wider mb-2">Fondspolice – Lebenslange Rente</p>
                    <p className="text-3xl font-bold font-mono text-emerald-400">{fmtEur(r.fpNettoRente)}</p>
                    <p className="text-xs text-zinc-500 mt-1">netto / Monat – garantiert lebenslang</p>
                    <div className="mt-3 pt-3 border-t border-emerald-900/30 space-y-1">
                      <p className="text-xs text-zinc-400">Brutto: {fmtEur(r.fpMonatlicheRenteBrutto)}</p>
                      <p className="text-xs text-zinc-400">Verwaltung: −{fmtEur(r.fpRentenVerwaltung)}/Mo (1%)</p>
                      <p className="text-xs text-zinc-400">Ertragsanteilsbesteuerung: {Math.round(params.ertragsanteil * 100)}%</p>
                      <p className="text-xs text-zinc-400">Rentenfaktor: {params.rentenfaktor}</p>
                    </div>
                  </div>
                  <div className="bg-sky-950/30 rounded-xl border border-sky-800/20 p-4">
                    <p className="text-xs text-sky-400/70 uppercase tracking-wider mb-2">Trading – Entnahmeplan</p>
                    <p className="text-3xl font-bold font-mono text-sky-400">{fmtEur(r.trNettoEntnahme)}</p>
                    <p className="text-xs text-zinc-500 mt-1">netto / Monat – bis Kapital aufgebraucht</p>
                    <div className="mt-3 pt-3 border-t border-sky-900/30 space-y-1">
                      <p className="text-xs text-zinc-400">Brutto: {fmtEur(r.trBruttoEntnahme)}</p>
                      <p className="text-xs text-zinc-400">Reicht bis Alter: <span className={r.trReichtAlter < params.lebenserwartung ? "text-red-400 font-semibold" : "text-emerald-400 font-semibold"}>{Math.round(r.trReichtAlter)}</span></p>
                      <p className="text-xs text-zinc-400">Rendite in Rente: {Math.round(params.rentenRendite * 100)}% p.a.</p>
                    </div>
                  </div>
                </div>
                {r.rentenVerlauf.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm text-zinc-400 mb-3">Kapitalverlauf Trading-Depot bei gleicher Netto-Entnahme</p>
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={r.rentenVerlauf} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                        <defs><linearGradient id="gTrR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.3} /><stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                        <XAxis dataKey="alter" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#3f3f46" }} />
                        <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#3f3f46" }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                        <Tooltip content={({ active, payload }: {active?:boolean;payload?:{value:number;payload:{alter:number}}[]}) => {
                          if (!active || !payload?.[0]) return null;
                          return (<div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl text-xs"><p className="text-zinc-400">Alter {payload[0].payload.alter}</p><p className="text-sky-400 font-mono">Restkapital: {fmtEur(payload[0].value)}</p></div>);
                        }} />
                        <ReferenceLine x={params.lebenserwartung} stroke="#ef4444" strokeDasharray="5 5" />
                        <Area type="monotone" dataKey="trKapital" stroke="#0ea5e9" fill="url(#gTrR)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* ─── Kapitalentnahme (Fondspolice) ─── */}
              <div className="bg-zinc-900/70 rounded-xl border border-violet-800/30 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-100">Alternative: Kapitalentnahme</h2>
                    <p className="text-sm text-zinc-500">Steuerbegünstigte Teilentnahme über {r.keJahre} Jahre bei {Math.round(r.keRendite * 100)}% p.a. (Halbeinkünfteverfahren)</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-violet-950/30 rounded-xl border border-violet-800/20 p-3 text-center">
                    <p className="text-xs text-violet-400/70 uppercase tracking-wider mb-1">Netto / Monat</p>
                    <p className="text-2xl font-bold font-mono text-violet-400">{fmtEur(r.keNettoMonatlich)}</p>
                    <p className="text-xs text-zinc-500 mt-1">über {r.keJahre} Jahre</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-xl border border-zinc-700/30 p-3 text-center">
                    <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Eff. Steuersatz</p>
                    <p className="text-2xl font-bold font-mono text-emerald-400">{(r.keEffektiverSteuersatz * 100).toFixed(1)}%</p>
                    <p className="text-xs text-zinc-500 mt-1">vs. {(26.375 * 0.7).toFixed(1)}% im Depot</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-xl border border-zinc-700/30 p-3 text-center">
                    <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Steuer gesamt</p>
                    <p className="text-2xl font-bold font-mono text-zinc-200">{fmtEur(r.keSteuerGesamt)}</p>
                    <p className="text-xs text-zinc-500 mt-1">Halbeinkünfteverfahren</p>
                  </div>
                </div>

                <p className="text-xs text-zinc-400 mb-3">Jährliche Entnahmen – Restkapital wächst mit {Math.round(params.renditePa * 100)}% p.a. (gleiche Anlagestrategie)</p>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="py-1.5 pr-2 text-left text-zinc-500 font-medium">Jahr</th>
                        <th className="py-1.5 pr-2 text-left text-zinc-500 font-medium">Alter</th>
                        <th className="py-1.5 pr-2 text-right text-zinc-500 font-medium">Brutto</th>
                        <th className="py-1.5 pr-2 text-right text-zinc-500 font-medium">Steuer</th>
                        <th className="py-1.5 pr-2 text-right text-zinc-500 font-medium">Netto</th>
                        <th className="py-1.5 text-right text-zinc-500 font-medium">Restkapital</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.keVerlauf.map((row, i) => (
                        <tr key={i} className="border-b border-zinc-800/50">
                          <td className="py-1.5 pr-2 text-zinc-400">{row.jahr}</td>
                          <td className="py-1.5 pr-2 text-zinc-400">{row.alter}</td>
                          <td className="py-1.5 pr-2 text-right font-mono text-zinc-200">{fmtEur(row.brutto)}</td>
                          <td className="py-1.5 pr-2 text-right font-mono text-red-400">{fmtEur(row.steuer)}</td>
                          <td className="py-1.5 pr-2 text-right font-mono text-violet-400 font-semibold">{fmtEur(row.netto)}</td>
                          <td className="py-1.5 text-right font-mono text-zinc-400">{fmtEur(row.kapital)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-zinc-700">
                        <td colSpan={2} className="py-2 text-zinc-300 font-semibold">Summe</td>
                        <td className="py-2 text-right font-mono text-zinc-200 font-semibold">{fmtEur(r.keVerlauf.reduce((s, r) => s + r.brutto, 0))}</td>
                        <td className="py-2 text-right font-mono text-red-400 font-semibold">{fmtEur(r.keSteuerGesamt)}</td>
                        <td className="py-2 text-right font-mono text-violet-400 font-semibold">{fmtEur(r.keNettoGesamt)}</td>
                        <td className="py-2"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="mt-4 bg-violet-950/20 rounded-lg p-3 border border-violet-800/20">
                  <p className="text-sm text-zinc-300">
                    <span className="text-violet-400 font-semibold">Halbeinkünfteverfahren:</span> Bei Auszahlung nach dem 62. Lebensjahr und mind. 12 Jahren Vertragslaufzeit wird nur die Hälfte des Ertragsanteils mit dem persönlichen Steuersatz ({Math.round(params.persSteuersatz * 100)}%) versteuert. Effektiv zahlst du nur <span className="text-emerald-400 font-semibold">{(r.keEffektiverSteuersatz * 100).toFixed(1)}%</span> Steuern statt {(26.375 * 0.7).toFixed(1)}% KESt im Depot.
                  </p>
                  <p className="text-sm text-zinc-400 mt-2">
                    <span className="text-zinc-300 font-medium">HanseMerkur Vario Care Invest:</span> Teilentnahmen ohne Abzug. Das Restkapital bleibt investiert ({Math.round(r.keRendite * 100)}% p.a.) – laufende Fondsguthabenkosten ({(HM_FONDSGUTHABEN_PA * 100).toFixed(2)}% p.a.) werden weiter berechnet.
                  </p>
                </div>
              </div>

              <div className={`rounded-xl border p-5 ${r.trReichtAlter < params.lebenserwartung ? "bg-red-950/20 border-red-800/30" : "bg-emerald-950/20 border-emerald-800/30"}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${r.trReichtAlter < params.lebenserwartung ? "bg-red-900/50" : "bg-emerald-900/50"}`}>
                    <svg className={`w-5 h-5 ${r.trReichtAlter < params.lebenserwartung ? "text-red-400" : "text-emerald-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      {r.trReichtAlter < params.lebenserwartung
                        ? <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        : <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
                    </svg>
                  </div>
                  <div>
                    <h3 className={`font-semibold ${r.trReichtAlter < params.lebenserwartung ? "text-red-400" : "text-emerald-400"}`}>{r.trReichtAlter < params.lebenserwartung ? "Langlebigkeitsrisiko vorhanden" : "Kapital reicht"}</h3>
                    <p className="text-sm text-zinc-400 mt-1">{r.trReichtAlter < params.lebenserwartung ? `Bei gleicher Netto-Entnahme wie die Fondspolice (${fmtEur(r.fpNettoRente)}/Monat) ist das Trading-Kapital mit Alter ${Math.round(r.trReichtAlter)} aufgebraucht – ${Math.round(params.lebenserwartung - r.trReichtAlter)} Jahre vor der statistischen Lebenserwartung.` : `Das Trading-Kapital reicht bei dieser Entnahme bis Alter ${Math.round(r.trReichtAlter)}.`}</p>
                    <p className="text-sm text-zinc-400 mt-2">Die Fondspolice zahlt <span className="text-emerald-400 font-semibold">lebenslang garantiert</span> – unabhängig davon, wie alt du wirst.</p>
                  </div>
                </div>
              </div>
            </>)}

            {activeTab === "fazit" && (<>
              <div className="bg-zinc-900/70 rounded-xl border border-zinc-800/60 p-6 space-y-6">
                <h2 className="text-lg font-semibold text-zinc-100">Zusammenfassung</h2>
                <div className="grid grid-cols-3 gap-4">
                  <MetricCard label="Monatlicher Beitrag" value={fmtEur(params.beitrag)} sub={`${r.monate / 12} Jahre × 12 Monate`} />
                  <MetricCard label="Gesamteinzahlung" value={fmtEur(r.beitragsSumme)} />
                  <MetricCard label="Erwartete Rendite" value={`${Math.round(params.renditePa * 100)}% p.a.`} sub={r.switchYears.length > 0 ? `${r.switchYears.length} Fondswechsel` : "ohne Fondswechsel"} />
                </div>
                <div className="border-t border-zinc-800 pt-4 grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500" /><h3 className="text-sm font-semibold text-emerald-400">Fondspolice</h3></div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-zinc-400">Endkapital</span><span className="font-mono text-zinc-200">{fmtEur(r.fpBalance)}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-400">Netto nach Steuern</span><span className="font-mono text-emerald-400">{fmtEur(r.fpNettoKapital)}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-400">Monatl. Rente (netto)</span><span className="font-mono text-emerald-400 font-semibold">{fmtEur(r.fpNettoRente)}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-400">Dauer</span><span className="font-mono text-emerald-400">Lebenslang ∞</span></div>
                      {r.switchYears.length > 0 && <div className="flex justify-between"><span className="text-zinc-400">Fondswechsel-Steuer</span><span className="font-mono text-emerald-400">0 €</span></div>}
                      <div className="pt-2 mt-2 border-t border-zinc-800">
                        <div className="flex justify-between"><span className="text-zinc-400">Kapitalentnahme ({r.keJahre}J)</span><span className="font-mono text-violet-400 font-semibold">{fmtEur(r.keNettoMonatlich)}/M</span></div>
                        <div className="flex justify-between"><span className="text-zinc-400">Eff. Steuersatz</span><span className="font-mono text-emerald-400">{(r.keEffektiverSteuersatz * 100).toFixed(1)}%</span></div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-sky-500" /><h3 className="text-sm font-semibold text-sky-400">Trading Depot</h3></div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-zinc-400">Endkapital</span><span className="font-mono text-zinc-200">{fmtEur(r.trBalance)}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-400">Netto nach Steuern</span><span className="font-mono text-sky-400">{fmtEur(r.trNetto)}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-400">Monatl. Entnahme (netto)</span><span className="font-mono text-sky-400 font-semibold">{fmtEur(r.trNettoEntnahmeMax)}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-400">Reicht bis</span><span className={`font-mono ${r.trReichtAlter < params.lebenserwartung ? "text-red-400" : "text-sky-400"}`}>Alter {Math.round(r.trReichtAlter)}</span></div>
                      {r.trFondswechselSteuerGesamt > 0 && <div className="flex justify-between"><span className="text-zinc-400">Fondswechsel-Steuer</span><span className="font-mono text-red-400">{fmtEur(r.trFondswechselSteuerGesamt)}</span></div>}
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-950/20 rounded-xl border border-emerald-800/20 p-5">
                  <h3 className="text-sm font-semibold text-emerald-400 mb-3">Vorteile Fondspolice</h3>
                  <ul className="space-y-2 text-sm text-zinc-300">
                    <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span> Lebenslange garantierte Rente</li>
                    <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span> Halbeinkünfteverfahren</li>
                    <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span> Keine laufende Vorabpauschale</li>
                    <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span> Günstige Ertragsanteilsbesteuerung</li>
                    <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span> Kein Langlebigkeitsrisiko</li>
                    <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span> <strong>Steuerfreie Fondswechsel</strong> im Mantel</li>
                    <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span> <strong>Kapitalentnahme</strong> mit Halbeinkünfteverfahren</li>
                  </ul>
                </div>
                <div className="bg-sky-950/20 rounded-xl border border-sky-800/20 p-5">
                  <h3 className="text-sm font-semibold text-sky-400 mb-3">Vorteile Trading Depot</h3>
                  <ul className="space-y-2 text-sm text-zinc-300">
                    <li className="flex gap-2"><span className="text-sky-500 shrink-0">✓</span> Volle Flexibilität bei Entnahme</li>
                    <li className="flex gap-2"><span className="text-sky-500 shrink-0">✓</span> Keine Abschluss-/Verwaltungskosten</li>
                    <li className="flex gap-2"><span className="text-sky-500 shrink-0">✓</span> Vererbbar (Restkapital)</li>
                    <li className="flex gap-2"><span className="text-sky-500 shrink-0">✓</span> Jederzeit verfügbar</li>
                    <li className="flex gap-2"><span className="text-sky-500 shrink-0">✓</span> 30% Teilfreistellung auf Aktien-ETFs</li>
                    <li className="flex gap-2 text-zinc-500"><span className="text-red-500 shrink-0">✗</span> Fondswechsel löst Steuerzahlung aus</li>
                  </ul>
                </div>
              </div>
              <div className="bg-gradient-to-br from-emerald-950/40 to-zinc-900/70 rounded-xl border border-emerald-800/30 p-6">
                <h3 className="text-lg font-semibold text-emerald-400 mb-2">Kernaussage</h3>
                <p className="text-zinc-300 leading-relaxed">
                  Bei gleicher monatlicher Rente von <span className="font-semibold text-white">{fmtEur(r.fpNettoRente)} netto</span> reicht das Trading-Depot bis Alter <span className="font-semibold text-white">{Math.round(r.trReichtAlter)}</span>. Die Fondspolice zahlt dagegen <span className="font-semibold text-emerald-400">lebenslang</span>.
                  {r.trFondswechselSteuerGesamt > 0 && <> Durch {r.trSwitchEvents.length} Fondswechsel gehen im Depot zusätzlich <span className="font-semibold text-red-400">{fmtEur(r.trFondswechselSteuerGesamt)}</span> an Steuern verloren – in der Fondspolice wären diese Umschichtungen komplett steuerfrei.</>}
                </p>
                <p className="text-sm text-zinc-500 mt-3">Hinweis: Vereinfachte Modellrechnung. Keine Anlageberatung.</p>
              </div>
            </>)}
          </div>
        </div>
      </div>
    </div>
  );
}
