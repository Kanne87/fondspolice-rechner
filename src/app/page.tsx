"use client";
import { useState, useMemo, useCallback, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";

// ─── Design Presets (matching lo-board) ────────────────────────────
const PRESETS = [
  { id: "premium", label: "Premium", cssClass: "theme-premium" },
  { id: "cockpit", label: "Cockpit", cssClass: "" },
  { id: "dark-gold", label: "Dark Gold", cssClass: "theme-dark-gold" },
] as const;

function useTheme() {
  const [preset, setPreset] = useState("premium");
  useEffect(() => {
    const saved = document.cookie.match(/lo-design-preset=(\w[\w-]*)/)?.[1];
    if (saved && PRESETS.some(p => p.id === saved)) setPreset(saved);
  }, []);
  useEffect(() => {
    const html = document.documentElement;
    PRESETS.forEach(p => p.cssClass && html.classList.remove(p.cssClass));
    const active = PRESETS.find(p => p.id === preset);
    if (active?.cssClass) html.classList.add(active.cssClass);
    document.cookie = `lo-design-preset=${preset};path=/;max-age=31536000`;
  }, [preset]);
  return { preset, setPreset };
}

// ─── HanseMerkur Vario Care Invest – Kostenstruktur ───────────────
const HM_ABSCHLUSS_PCT = 0.025;
const HM_LAUFENDE_AV_PCT = 0.0172;
const HM_VERWALTUNG_FIX = 1.01;
const HM_VERWALTUNG_PCT = 0.0679;
const HM_FONDSGUTHABEN_PA = 0.00192;
const HM_RENTEN_VERWALTUNG_PCT = 0.01;

// ─── Types & Simulation ──────────────────────────────────────────
interface Params {
  beitrag: number; alterHeute: number; rentenEintritt: number; renditePa: number;
  basiszins: number; persSteuersatz: number;
  rentenfaktor: number; lebenserwartung: number; rentenRendite: number; ertragsanteil: number;
  fondswechselAnzahl: number; fondswechselIntervall: number;
  entnahmeDauer: number;
}

function simulate(params: Params) {
  const { beitrag, alterHeute, rentenEintritt, renditePa, basiszins, persSteuersatz, rentenfaktor, lebenserwartung, rentenRendite, ertragsanteil, fondswechselAnzahl, fondswechselIntervall, entnahmeDauer } = params;
  const monate = (rentenEintritt - alterHeute) * 12;
  const monthlyRate = renditePa / 12;
  const monthlyFondsCost = HM_FONDSGUTHABEN_PA / 12;
  const beitragsSumme = beitrag * monate;
  const abschlussGesamt = beitragsSumme * HM_ABSCHLUSS_PCT;
  const abschlussMonatlich = abschlussGesamt / 60;
  const laufendeAVmonatlich = beitrag * HM_LAUFENDE_AV_PCT;
  const verwaltungMonatlich = HM_VERWALTUNG_FIX + beitrag * HM_VERWALTUNG_PCT;
  const kest = 0.26375;
  const teilfreistellungETF = 0.30;
  const rentenMonate = (lebenserwartung - rentenEintritt) * 12;
  const rentenMonthlyRate = rentenRendite / 12;

  const switchMonths: number[] = [];
  for (let i = 1; i <= fondswechselAnzahl; i++) {
    const sm = i * fondswechselIntervall * 12;
    if (sm < monate) switchMonths.push(sm);
  }

  // Fondspolice Ansparphase
  let fpBalance = 0;
  const fpData: {monat:number;jahr:number;fpBalance:number;trBalance:number}[] = [];
  let fpTotalCosts = 0;
  for (let m = 1; m <= monate; m++) {
    const bs = fpBalance + beitrag;
    const fc = bs * monthlyFondsCost;
    const dc = m <= 60 ? abschlussMonatlich : laufendeAVmonatlich;
    const ac = verwaltungMonatlich;
    const net = bs - fc - dc - ac;
    fpBalance = net + net * monthlyRate;
    fpTotalCosts += fc + dc + ac;
    if (m % 12 === 0 || m === monate) fpData.push({ monat: m, jahr: Math.round(m/12), fpBalance: Math.round(fpBalance), trBalance: 0 });
  }

  // Trading Ansparphase
  let trBalance = 0; let trCostBasis = 0; let trVorabpauschaleGesamt = 0;
  let trYearStart = 0; let trYearContrib = 0; let trFondswechselSteuer = 0;
  const trSwitchEvents: {monat:number;jahr:number;steuer:number;gewinn:number;balanceVor:number;balanceNach:number}[] = [];
  for (let m = 1; m <= monate; m++) {
    if ((m-1) % 12 === 0) { trYearStart = trBalance; trYearContrib = 0; }
    trYearContrib += beitrag; trCostBasis += beitrag;
    const bs = trBalance + beitrag;
    const fc = bs * monthlyFondsCost;
    const net = bs - fc;
    trBalance = net + net * monthlyRate;
    if (m % 12 === 0) {
      const be = trYearStart * basiszins * 0.7;
      const ag = trBalance - trYearStart - trYearContrib;
      const vb = Math.min(be, Math.max(0, ag));
      const vs = vb * (1-teilfreistellungETF) * kest;
      trVorabpauschaleGesamt += vs; trBalance -= vs;
    }
    if (switchMonths.includes(m)) {
      const g = Math.max(0, trBalance - trCostBasis);
      const s = g * (1-teilfreistellungETF) * kest;
      const bv = trBalance; trBalance -= s; trFondswechselSteuer += s;
      trCostBasis = trBalance;
      trSwitchEvents.push({monat:m,jahr:Math.round(m/12),steuer:Math.round(s),gewinn:Math.round(g),balanceVor:Math.round(bv),balanceNach:Math.round(trBalance)});
    }
    if (m % 12 === 0 || m === monate) { const idx = fpData.findIndex(d=>d.monat===m); if (idx>=0) fpData[idx].trBalance = Math.round(trBalance); }
  }

  const trGewinn = trBalance - trCostBasis;
  const trSteuerAufwand = trGewinn * (1-teilfreistellungETF) * kest;
  const trNetto = trBalance - Math.max(0, trSteuerAufwand);

  const fpGewinn = fpBalance - beitragsSumme;
  const fpSteuerAufwand = fpGewinn * 0.5 * persSteuersatz;
  const fpNettoKapital = fpBalance - fpSteuerAufwand;

  const fpRenteBrutto = (fpBalance/10000)*rentenfaktor;
  const fpRenteVerwaltung = fpRenteBrutto * HM_RENTEN_VERWALTUNG_PCT;
  const fpRenteNachVerwaltung = fpRenteBrutto - fpRenteVerwaltung;
  const fpRenteSteuer = fpRenteNachVerwaltung * ertragsanteil * persSteuersatz;
  const fpNettoRente = fpRenteNachVerwaltung - fpRenteSteuer;

  const trGA = Math.max(0, (trNetto-beitragsSumme)/trNetto);
  const zielNetto = fpNettoRente;
  const zielBrutto = zielNetto / (1 - trGA*kest);
  let trTmp = trNetto; let trReichtMo = 0;
  const trRV: {jahr:number;alter:number;trKapital:number}[] = [];
  for (let m=1;m<=600;m++) { trTmp = trTmp*(1+rentenMonthlyRate)-zielBrutto; if(m%12===0) trRV.push({jahr:m/12,alter:rentenEintritt+m/12,trKapital:Math.max(0,Math.round(trTmp))}); if(trTmp<=0){trReichtMo=m;break;} }
  if(trTmp>0) trReichtMo=600;

  let trBE: number;
  if(rentenMonthlyRate>0) trBE=trNetto*rentenMonthlyRate/(1-Math.pow(1+rentenMonthlyRate,-rentenMonate)); else trBE=trNetto/rentenMonate;
  const trNEM = trBE - trBE*trGA*kest;

  // Kapitalentnahme
  let keK = fpBalance; let keCB = beitragsSumme;
  const keJ = Math.min(entnahmeDauer, lebenserwartung-rentenEintritt);
  const keR = renditePa; const keNR = keR - HM_FONDSGUTHABEN_PA;
  let keBJ: number;
  if(keNR>0) keBJ=keK*keNR/(1-Math.pow(1+keNR,-keJ)); else keBJ=keK/keJ;
  const keV: {jahr:number;alter:number;kapital:number;brutto:number;steuer:number;netto:number}[] = [];
  let keSG=0; let keNG=0;
  for(let j=1;j<=keJ;j++) {
    keK *= (1+keNR);
    const e = Math.min(keBJ,keK);
    const ga = keCB<keK ? 1-(keCB/keK) : 0;
    const st = e*ga*0.5*persSteuersatz;
    const n = e-st;
    const cba = keCB/keK; keK-=e; keCB-=e*cba; keCB=Math.max(0,keCB);
    keSG+=st; keNG+=n;
    keV.push({jahr:j,alter:rentenEintritt+j,kapital:Math.max(0,Math.round(keK)),brutto:Math.round(e),steuer:Math.round(st),netto:Math.round(n)});
  }
  const keNM = keJ>0 ? Math.round(keNG/keJ/12) : 0;
  const keES = keNG>0 ? keSG/(keNG+keSG) : 0;

  return {
    monate, beitragsSumme, fpBalance:Math.round(fpBalance), trBalance:Math.round(trBalance),
    fpTotalCosts:Math.round(fpTotalCosts), trVorabpauschaleGesamt:Math.round(trVorabpauschaleGesamt),
    abschlussMonatlich: Math.round(abschlussMonatlich*100)/100, abschlussGesamt:Math.round(abschlussGesamt),
    verwaltungMonatlich: Math.round(verwaltungMonatlich*100)/100, laufendeAVmonatlich: Math.round(laufendeAVmonatlich*100)/100,
    trNetto:Math.round(trNetto), trSteuerAufwand:Math.round(Math.max(0,trSteuerAufwand)),
    fpNettoKapital:Math.round(fpNettoKapital), fpSteuerAufwand:Math.round(fpSteuerAufwand),
    fpRenteBrutto:Math.round(fpRenteBrutto), fpRenteVerwaltung:Math.round(fpRenteVerwaltung),
    fpNettoRente:Math.round(fpNettoRente),
    trNettoEntnahme:Math.round(zielNetto), trBruttoEntnahme:Math.round(zielBrutto), trNettoEntnahmeMax:Math.round(trNEM),
    trReichtMonate:trReichtMo, trReichtAlter:rentenEintritt+Math.round(trReichtMo/12*10)/10,
    ansparData:fpData, rentenVerlauf:trRV,
    trFondswechselSteuerGesamt:Math.round(trFondswechselSteuer), trSwitchEvents,
    switchYears: switchMonths.map(m=>Math.round(m/12)),
    keVerlauf:keV, keNettoMonatlich:keNM, keSteuerGesamt:Math.round(keSG), keNettoGesamt:Math.round(keNG),
    keEffektiverSteuersatz:keES, keJahre:keJ, keRendite:keR,
  };
}

const fmt = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n);
const fmtEur = (n: number) => fmt(n) + " €";

// ─── Themed Components ───────────────────────────────────────────
function Slider({ label, value, onChange, min, max, step = 1, unit = "", helpText }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string; helpText?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline">
        <label className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>{label}</label>
        <span className="text-sm font-semibold" style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>{typeof value === "number" && value >= 1000 ? fmt(value) : value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} className="w-full" />
      {helpText && <p className="text-xs" style={{ color: "var(--text-muted)", opacity: 0.7 }}>{helpText}</p>}
    </div>
  );
}

function Card({ children, className = "", accent, warn, style }: { children: React.ReactNode; className?: string; accent?: boolean; warn?: boolean; style?: React.CSSProperties }) {
  const border = accent ? "var(--accent)" : warn ? "var(--warn)" : "var(--border)";
  const bg = accent ? "var(--accent-soft)" : warn ? "var(--warn-soft)" : "var(--bg-card)";
  return <div className={`rounded-lg p-4 ${className}`} style={{ background: bg, border: `1px solid ${border}`, ...style }}>{children}</div>;
}

function MetricCard({ label, value, sub, accent = false, warn = false }: { label: string; value: string; sub?: string; accent?: boolean; warn?: boolean }) {
  return (
    <Card accent={accent} warn={warn}>
      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="text-xl font-semibold" style={{ color: accent ? "var(--accent)" : warn ? "var(--warn)" : "var(--text)", fontFamily: "var(--font-mono)" }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{sub}</p>}
    </Card>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg px-3 py-2 shadow-xl text-xs" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <p className="mb-1" style={{ color: "var(--text-muted)" }}>Jahr {label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any, i: number) => (<p key={i} style={{ color: p.color, fontFamily: "var(--font-mono)" }}>{p.name}: {fmtEur(p.value)}</p>))}
    </div>
  );
};

// ─── Main Page ───────────────────────────────────────────────────
export default function Page() {
  const { preset, setPreset } = useTheme();
  const [params, setParams] = useState<Params>({
    beitrag: 1000, alterHeute: 38, rentenEintritt: 67, renditePa: 0.09, basiszins: 0.032,
    persSteuersatz: 0.17, rentenfaktor: 26.18,
    lebenserwartung: 88, rentenRendite: 0.02, ertragsanteil: 0.17,
    fondswechselAnzahl: 2, fondswechselIntervall: 10, entnahmeDauer: 10,
  });
  const [activeTab, setActiveTab] = useState("anspar");
  const set = useCallback((key: keyof Params, val: number) => setParams(p => ({ ...p, [key]: val })), []);
  const r = useMemo(() => simulate(params), [params]);
  const tabs = [{ id: "anspar", label: "Ansparphase" }, { id: "rente", label: "Rentenbezug" }, { id: "fazit", label: "Fazit" }];

  // Theme-aware chart colors
  const isDark = preset === "dark-gold";
  const accentColor = isDark ? "#c9a84c" : preset === "premium" ? "#b8860b" : "#3b82f6";
  const skyColor = isDark ? "#38bdf8" : "#0284c7";
  const gridColor = isDark ? "#252836" : preset === "premium" ? "#e7e5e4" : "#e2e8f0";
  const tickColor = isDark ? "#8b8fa3" : "#78716c";

  return (
    <div className="min-h-screen transition-colors duration-200" style={{ background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-body)" }}>
      {/* Header */}
      <div className="sticky top-0 z-20 backdrop-blur-sm" style={{ borderBottom: "1px solid var(--border)", background: "color-mix(in srgb, var(--bg) 90%, transparent)" }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--accent)" }}>
              <svg className="w-4 h-4" style={{ color: "var(--accent-text)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>Privatrente vs. Trading</h1>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>HanseMerkur Vario Care Invest</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 rounded-lg p-0.5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              {tabs.map(t => (<button key={t.id} onClick={() => setActiveTab(t.id)} className="px-3 py-1.5 rounded-md text-xs font-medium transition-all" style={activeTab === t.id ? { background: "var(--accent)", color: "var(--accent-text)" } : { color: "var(--text-muted)" }}>{t.label}</button>))}
            </div>
            {/* Theme Switcher */}
            <div className="flex gap-1 rounded-lg p-0.5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              {PRESETS.map(p => (<button key={p.id} onClick={() => setPreset(p.id)} className="px-2 py-1 rounded text-xs transition-all" style={preset === p.id ? { background: "var(--accent)", color: "var(--accent-text)" } : { color: "var(--text-muted)" }} title={p.label}>{p.id === "premium" ? "☀" : p.id === "cockpit" ? "◐" : "◑"}</button>))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="rounded-xl p-4 space-y-4 sticky top-16" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-heading)" }}>Parameter</h3>
              <Slider label="Monatlicher Beitrag" value={params.beitrag} onChange={v => set("beitrag", v)} min={100} max={3000} step={50} unit=" €" />
              <Slider label="Aktuelles Alter" value={params.alterHeute} onChange={v => set("alterHeute", v)} min={20} max={55} unit=" Jahre" />
              <Slider label="Renteneintritt" value={params.rentenEintritt} onChange={v => set("rentenEintritt", v)} min={60} max={70} unit=" Jahre" />
              <Slider label="Erwartete Rendite" value={Math.round(params.renditePa*100)} onChange={v => set("renditePa", v/100)} min={3} max={12} step={0.5} unit="% p.a." />
              <Slider label="Basiszins" value={Math.round(params.basiszins*1000)/10} onChange={v => set("basiszins", v/100)} min={0} max={5} step={0.1} unit="%" helpText="Aktuell 3,2% (Stand 2025)" />

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
                <div className="flex items-center gap-2 mb-1"><span style={{ color: "var(--warn)" }}>⇄</span><p className="text-xs font-semibold" style={{ color: "var(--warn)" }}>Fondswechsel</p></div>
                <p className="text-xs mb-3" style={{ color: "var(--text-muted)", opacity: 0.7 }}>Im Mantel steuerfrei, im Depot steuerpflichtig</p>
                <Slider label="Anzahl" value={params.fondswechselAnzahl} onChange={v => set("fondswechselAnzahl", v)} min={0} max={4} unit="×" />
                {params.fondswechselAnzahl > 0 && <div className="mt-3"><Slider label="Alle" value={params.fondswechselIntervall} onChange={v => set("fondswechselIntervall", v)} min={3} max={15} unit=" Jahre" /></div>}
                {params.fondswechselAnzahl > 0 && r.switchYears.length > 0 && (
                  <div className="mt-2 rounded-lg p-2" style={{ background: "var(--warn-soft)" }}>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>Wechsel: <span style={{ color: "var(--warn)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{r.switchYears.join(", ")}</span></p>
                    {r.trFondswechselSteuerGesamt > 0 && <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>Steuerverlust Depot: <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{fmtEur(r.trFondswechselSteuerGesamt)}</span></p>}
                  </div>
                )}
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
                <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>Erweitert</p>
                <Slider label="Persönl. Steuersatz" value={Math.round(params.persSteuersatz*100)} onChange={v => set("persSteuersatz", v/100)} min={0} max={42} step={1} unit="%" />
                <div className="mt-3"><Slider label="Rentenfaktor" value={params.rentenfaktor} onChange={v => set("rentenfaktor", v)} min={15} max={35} step={0.1} /></div>
                <div className="mt-3"><Slider label="Lebenserwartung" value={params.lebenserwartung} onChange={v => set("lebenserwartung", v)} min={75} max={100} unit=" Jahre" /></div>
                <div className="mt-3"><Slider label="Kapitalentnahme über" value={params.entnahmeDauer} onChange={v => set("entnahmeDauer", v)} min={1} max={30} unit=" Jahre" helpText="Steuerbegünstigte Teilentnahme (frei wählbar)" /></div>
              </div>
              <div className="rounded-lg p-3" style={{ background: "var(--bg-card-hover)" }}>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}><span className="font-semibold" style={{ color: "var(--text)" }}>{r.monate/12} Jahre</span> Ansparzeit</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}><span className="font-semibold" style={{ color: "var(--text)" }}>{fmtEur(r.beitragsSumme)}</span> Gesamteinzahlung</p>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {activeTab === "anspar" && (<>
              <Card><h2 className="text-lg font-semibold mb-1" style={{ fontFamily: "var(--font-heading)" }}>Vermögenswachstum</h2><p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>Kapitalentwicklung über die Ansparphase{r.switchYears.length > 0 && ` – Fondswechsel in Jahr ${r.switchYears.join(", ")}`}</p>
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={r.ansparData} margin={{top:10,right:10,left:10,bottom:0}}>
                    <defs>
                      <linearGradient id="gFp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={accentColor} stopOpacity={0.25}/><stop offset="100%" stopColor={accentColor} stopOpacity={0}/></linearGradient>
                      <linearGradient id="gTr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={skyColor} stopOpacity={0.25}/><stop offset="100%" stopColor={skyColor} stopOpacity={0}/></linearGradient>
                    </defs>
                    <CartesianGrid stroke={gridColor} strokeDasharray="3 3"/>
                    <XAxis dataKey="jahr" tick={{fill:tickColor,fontSize:11}} axisLine={{stroke:gridColor}}/>
                    <YAxis tick={{fill:tickColor,fontSize:11}} axisLine={{stroke:gridColor}} tickFormatter={v=>`${Math.round(v/1000)}k`}/>
                    <Tooltip content={ChartTooltip}/>
                    {r.switchYears.map(y=>(<ReferenceLine key={y} x={y} stroke="var(--warn)" strokeDasharray="4 4" strokeWidth={1.5}/>))}
                    <Area type="monotone" dataKey="fpBalance" name="Fondspolice" stroke={accentColor} fill="url(#gFp)" strokeWidth={2}/>
                    <Area type="monotone" dataKey="trBalance" name="Trading Depot" stroke={skyColor} fill="url(#gTr)" strokeWidth={2}/>
                  </AreaChart>
                </ResponsiveContainer>
                <div className="flex gap-6 mt-3 justify-center">
                  <span className="flex items-center gap-2 text-xs" style={{color:"var(--text-muted)"}}><span className="w-3 h-3 rounded-full" style={{background:accentColor}}/> Fondspolice</span>
                  <span className="flex items-center gap-2 text-xs" style={{color:"var(--text-muted)"}}><span className="w-3 h-3 rounded-full" style={{background:skyColor}}/> Trading Depot</span>
                </div>
              </Card>

              {r.trSwitchEvents.length > 0 && (
                <Card warn><div className="flex items-start gap-3"><div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{background:"var(--warn-soft)"}}><span style={{color:"var(--warn)",fontSize:18}}>⇄</span></div><div className="flex-1">
                  <h3 className="font-semibold" style={{color:"var(--warn)"}}>Fondswechsel-Kosten im Trading-Depot</h3>
                  <p className="text-sm mt-1" style={{color:"var(--text-muted)"}}>Jede Umschichtung realisiert Gewinne und löst KESt aus. In der Fondspolice steuerneutral.</p>
                  <div className="mt-3 space-y-2">{r.trSwitchEvents.map((ev,i)=>(<div key={i} className="flex items-center gap-4 rounded-lg px-3 py-2 text-xs flex-wrap" style={{background:"var(--bg)"}}>
                    <span style={{color:"var(--warn)",fontWeight:600}}>Jahr {ev.jahr}</span>
                    <span style={{color:"var(--text-muted)"}}>Gewinn: <span style={{color:"var(--text)",fontFamily:"var(--font-mono)"}}>{fmtEur(ev.gewinn)}</span></span>
                    <span style={{color:"var(--text-muted)"}}>Steuer: <span style={{color:"var(--danger)",fontFamily:"var(--font-mono)",fontWeight:600}}>{fmtEur(ev.steuer)}</span></span>
                  </div>))}</div>
                  <div className="mt-3 pt-3 flex justify-between items-center" style={{borderTop:"1px solid var(--border)"}}>
                    <span className="text-sm" style={{color:"var(--text)"}}>Gesamter Steuerverlust</span>
                    <span className="text-lg font-bold" style={{color:"var(--danger)",fontFamily:"var(--font-mono)"}}>{fmtEur(r.trFondswechselSteuerGesamt)}</span>
                  </div>
                  <p className="text-xs mt-2" style={{color:"var(--success)"}}>In der Fondspolice: 0 € Steuer bei Fondswechsel</p>
                </div></div></Card>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Card style={{borderColor:"var(--accent)"}}><div className="flex items-center gap-2 mb-3"><span className="w-2.5 h-2.5 rounded-full" style={{background:"var(--accent)"}}/><h3 className="text-sm font-semibold" style={{color:"var(--accent)",fontFamily:"var(--font-heading)"}}>Fondspolice</h3></div><div className="space-y-3">
                  <MetricCard label="Endkapital (brutto)" value={fmtEur(r.fpBalance)} accent/>
                  <MetricCard label="Kosten gesamt" value={fmtEur(r.fpTotalCosts)} sub={`Abschluss ${r.abschlussMonatlich}€/Mo (60 Mo) → ${r.laufendeAVmonatlich}€ | Verwaltung ${r.verwaltungMonatlich}€/Mo`}/>
                  <MetricCard label="Steuer bei Auszahlung" value={fmtEur(r.fpSteuerAufwand)} sub="Halbeinkünfteverfahren (50% × pers. Satz)"/>
                  <MetricCard label="Teilentnahme-Kosten" value="0 €" sub="Kein Abzug (HanseMerkur)" accent/>
                  <MetricCard label="Netto verfügbar" value={fmtEur(r.fpNettoKapital)} accent/>
                </div></Card>
                <Card style={{borderColor:"var(--sky)"}}><div className="flex items-center gap-2 mb-3"><span className="w-2.5 h-2.5 rounded-full" style={{background:"var(--sky)"}}/><h3 className="text-sm font-semibold" style={{color:"var(--sky)",fontFamily:"var(--font-heading)"}}>Trading Depot (ETF)</h3></div><div className="space-y-3">
                  <MetricCard label="Endkapital (brutto)" value={fmtEur(r.trBalance)}/>
                  <MetricCard label="Vorabpauschale (kumuliert)" value={fmtEur(r.trVorabpauschaleGesamt)} sub="Jährliche Steuer auf Basisertrag"/>
                  <MetricCard label="Steuer bei Verkauf" value={fmtEur(r.trSteuerAufwand)} sub="KESt 26,375% × 70% (Teilfreistellung)"/>
                  {r.trFondswechselSteuerGesamt > 0 ? <MetricCard label="Fondswechsel-Steuer" value={fmtEur(r.trFondswechselSteuerGesamt)} sub={`${r.trSwitchEvents.length}× Umschichtung`} warn/> : <div className="h-[88px]"/>}
                  <MetricCard label="Netto verfügbar" value={fmtEur(r.trNetto)}/>
                </div></Card>
              </div>
            </>)}

            {activeTab === "rente" && (<>
              <Card><h2 className="text-lg font-semibold mb-1" style={{fontFamily:"var(--font-heading)"}}>Rentenbezugsphase</h2><p className="text-sm mb-4" style={{color:"var(--text-muted)"}}>Monatliches Einkommen ab Alter {params.rentenEintritt}</p>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <Card accent><p className="text-xs uppercase tracking-wider mb-2" style={{color:"var(--accent)",opacity:0.7}}>Fondspolice – Lebenslange Rente</p>
                    <p className="text-3xl font-bold" style={{color:"var(--accent)",fontFamily:"var(--font-mono)"}}>{fmtEur(r.fpNettoRente)}</p>
                    <p className="text-xs mt-1" style={{color:"var(--text-muted)"}}>netto / Monat – garantiert lebenslang</p>
                    <div className="mt-3 pt-3 space-y-1" style={{borderTop:"1px solid var(--border)"}}>
                      <p className="text-xs" style={{color:"var(--text-muted)"}}>Brutto: {fmtEur(r.fpRenteBrutto)}</p>
                      <p className="text-xs" style={{color:"var(--text-muted)"}}>Verwaltung: −{fmtEur(r.fpRenteVerwaltung)}/Mo (1%)</p>
                      <p className="text-xs" style={{color:"var(--text-muted)"}}>Ertragsanteil: {Math.round(params.ertragsanteil*100)}% | Rentenfaktor: {params.rentenfaktor}</p>
                    </div>
                  </Card>
                  <Card style={{borderColor:"var(--sky)"}}><p className="text-xs uppercase tracking-wider mb-2" style={{color:"var(--sky)",opacity:0.7}}>Trading – Entnahmeplan</p>
                    <p className="text-3xl font-bold" style={{color:"var(--sky)",fontFamily:"var(--font-mono)"}}>{fmtEur(r.trNettoEntnahme)}</p>
                    <p className="text-xs mt-1" style={{color:"var(--text-muted)"}}>netto / Monat – bis Kapital aufgebraucht</p>
                    <div className="mt-3 pt-3 space-y-1" style={{borderTop:"1px solid var(--border)"}}>
                      <p className="text-xs" style={{color:"var(--text-muted)"}}>Brutto: {fmtEur(r.trBruttoEntnahme)}</p>
                      <p className="text-xs" style={{color:"var(--text-muted)"}}>Reicht bis Alter: <span style={{color: r.trReichtAlter < params.lebenserwartung ? "var(--danger)" : "var(--success)", fontWeight:600}}>{Math.round(r.trReichtAlter)}</span></p>
                      <p className="text-xs" style={{color:"var(--text-muted)"}}>Rendite in Rente: {Math.round(params.rentenRendite*100)}% p.a.</p>
                    </div>
                  </Card>
                </div>
                {r.rentenVerlauf.length > 0 && (<div className="mt-4"><p className="text-sm mb-3" style={{color:"var(--text-muted)"}}>Kapitalverlauf Trading-Depot bei gleicher Netto-Entnahme</p>
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={r.rentenVerlauf} margin={{top:10,right:10,left:10,bottom:0}}>
                      <defs><linearGradient id="gTrR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={skyColor} stopOpacity={0.25}/><stop offset="100%" stopColor={skyColor} stopOpacity={0}/></linearGradient></defs>
                      <CartesianGrid stroke={gridColor} strokeDasharray="3 3"/>
                      <XAxis dataKey="alter" tick={{fill:tickColor,fontSize:11}} axisLine={{stroke:gridColor}}/>
                      <YAxis tick={{fill:tickColor,fontSize:11}} axisLine={{stroke:gridColor}} tickFormatter={v=>`${Math.round(v/1000)}k`}/>
                      <Tooltip content={({active,payload}:{active?:boolean;payload?:{value:number;payload:{alter:number}}[]})=>{if(!active||!payload?.[0])return null;return(<div className="rounded-lg px-3 py-2 shadow-xl text-xs" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}><p style={{color:"var(--text-muted)"}}>Alter {payload[0].payload.alter}</p><p style={{color:skyColor,fontFamily:"var(--font-mono)"}}>Restkapital: {fmtEur(payload[0].value)}</p></div>);}}/>
                      <ReferenceLine x={params.lebenserwartung} stroke="var(--danger)" strokeDasharray="5 5"/>
                      <Area type="monotone" dataKey="trKapital" stroke={skyColor} fill="url(#gTrR)" strokeWidth={2}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>)}
              </Card>

              {/* Kapitalentnahme */}
              <Card style={{borderColor:"var(--violet)"}}>
                <div className="flex items-center gap-3 mb-4"><div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{background:"var(--violet)"}}><span style={{color:"#fff",fontSize:14}}>💰</span></div><div>
                  <h2 className="text-lg font-semibold" style={{fontFamily:"var(--font-heading)"}}>Alternative: Kapitalentnahme</h2>
                  <p className="text-sm" style={{color:"var(--text-muted)"}}>Steuerbegünstigte Teilentnahme über {r.keJahre} Jahre bei {Math.round(r.keRendite*100)}% p.a.</p>
                </div></div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <Card accent><p className="text-xs uppercase tracking-wider mb-1 text-center" style={{color:"var(--accent)",opacity:0.7}}>Netto / Monat</p><p className="text-2xl font-bold text-center" style={{color:"var(--accent)",fontFamily:"var(--font-mono)"}}>{fmtEur(r.keNettoMonatlich)}</p><p className="text-xs text-center mt-1" style={{color:"var(--text-muted)"}}>über {r.keJahre} Jahre</p></Card>
                  <Card><p className="text-xs uppercase tracking-wider mb-1 text-center" style={{color:"var(--text-muted)"}}>Eff. Steuersatz</p><p className="text-2xl font-bold text-center" style={{color:"var(--success)",fontFamily:"var(--font-mono)"}}>{(r.keEffektiverSteuersatz*100).toFixed(1)}%</p><p className="text-xs text-center mt-1" style={{color:"var(--text-muted)"}}>vs. {(26.375*0.7).toFixed(1)}% im Depot</p></Card>
                  <Card><p className="text-xs uppercase tracking-wider mb-1 text-center" style={{color:"var(--text-muted)"}}>Steuer gesamt</p><p className="text-2xl font-bold text-center" style={{fontFamily:"var(--font-mono)"}}>{fmtEur(r.keSteuerGesamt)}</p><p className="text-xs text-center mt-1" style={{color:"var(--text-muted)"}}>Halbeinkünfteverfahren</p></Card>
                </div>
                <p className="text-xs mb-3" style={{color:"var(--text-muted)"}}>Jährliche Entnahmen – Restkapital wächst mit {Math.round(params.renditePa*100)}% p.a.</p>
                <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr style={{borderBottom:"1px solid var(--border)"}}><th className="py-1.5 pr-2 text-left font-medium" style={{color:"var(--text-muted)"}}>Jahr</th><th className="py-1.5 pr-2 text-left font-medium" style={{color:"var(--text-muted)"}}>Alter</th><th className="py-1.5 pr-2 text-right font-medium" style={{color:"var(--text-muted)"}}>Brutto</th><th className="py-1.5 pr-2 text-right font-medium" style={{color:"var(--text-muted)"}}>Steuer</th><th className="py-1.5 pr-2 text-right font-medium" style={{color:"var(--text-muted)"}}>Netto</th><th className="py-1.5 text-right font-medium" style={{color:"var(--text-muted)"}}>Restkapital</th></tr></thead>
                <tbody>{r.keVerlauf.map((row,i)=>(<tr key={i} style={{borderBottom:"1px solid color-mix(in srgb, var(--border) 50%, transparent)"}}><td className="py-1.5 pr-2" style={{color:"var(--text-muted)"}}>{row.jahr}</td><td className="py-1.5 pr-2" style={{color:"var(--text-muted)"}}>{row.alter}</td><td className="py-1.5 pr-2 text-right" style={{fontFamily:"var(--font-mono)"}}>{fmtEur(row.brutto)}</td><td className="py-1.5 pr-2 text-right" style={{color:"var(--danger)",fontFamily:"var(--font-mono)"}}>{fmtEur(row.steuer)}</td><td className="py-1.5 pr-2 text-right font-semibold" style={{color:"var(--violet)",fontFamily:"var(--font-mono)"}}>{fmtEur(row.netto)}</td><td className="py-1.5 text-right" style={{color:"var(--text-muted)",fontFamily:"var(--font-mono)"}}>{fmtEur(row.kapital)}</td></tr>))}</tbody>
                <tfoot><tr style={{borderTop:"1px solid var(--border)"}}><td colSpan={2} className="py-2 font-semibold">Summe</td><td className="py-2 text-right font-semibold" style={{fontFamily:"var(--font-mono)"}}>{fmtEur(r.keVerlauf.reduce((s,row)=>s+row.brutto,0))}</td><td className="py-2 text-right font-semibold" style={{color:"var(--danger)",fontFamily:"var(--font-mono)"}}>{fmtEur(r.keSteuerGesamt)}</td><td className="py-2 text-right font-semibold" style={{color:"var(--violet)",fontFamily:"var(--font-mono)"}}>{fmtEur(r.keNettoGesamt)}</td><td></td></tr></tfoot></table></div>
                <div className="mt-4 rounded-lg p-3" style={{background:"var(--violet-soft)",border:"1px solid color-mix(in srgb, var(--violet) 30%, transparent)"}}>
                  <p className="text-sm"><span className="font-semibold" style={{color:"var(--violet)"}}>Halbeinkünfteverfahren:</span> <span style={{color:"var(--text-muted)"}}>Ab 62. Lebensjahr + 12 Jahre Laufzeit → nur 50% des Ertrags × {Math.round(params.persSteuersatz*100)}% Steuersatz = effektiv <span className="font-semibold" style={{color:"var(--success)"}}>{(r.keEffektiverSteuersatz*100).toFixed(1)}%</span> statt {(26.375*0.7).toFixed(1)}% KESt im Depot.</span></p>
                  <p className="text-sm mt-2" style={{color:"var(--text-muted)"}}><span className="font-medium" style={{color:"var(--text)"}}>HanseMerkur:</span> Teilentnahmen ohne Abzug. Restkapital wächst mit {Math.round(r.keRendite*100)}% p.a. weiter.</p>
                </div>
              </Card>

              {/* Langlebigkeitsrisiko */}
              <Card warn={r.trReichtAlter<params.lebenserwartung} accent={r.trReichtAlter>=params.lebenserwartung}>
                <div className="flex items-start gap-3"><div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{background: r.trReichtAlter<params.lebenserwartung ? "var(--danger-soft)" : "var(--success-soft)"}}><span style={{fontSize:18}}>{r.trReichtAlter<params.lebenserwartung ? "⚠" : "✓"}</span></div><div>
                  <h3 className="font-semibold" style={{color: r.trReichtAlter<params.lebenserwartung ? "var(--danger)" : "var(--success)"}}>{r.trReichtAlter<params.lebenserwartung ? "Langlebigkeitsrisiko" : "Kapital reicht"}</h3>
                  <p className="text-sm mt-1" style={{color:"var(--text-muted)"}}>{r.trReichtAlter<params.lebenserwartung ? `Trading-Kapital mit Alter ${Math.round(r.trReichtAlter)} aufgebraucht – ${Math.round(params.lebenserwartung-r.trReichtAlter)} Jahre vor Lebenserwartung.` : `Trading reicht bis Alter ${Math.round(r.trReichtAlter)}.`}</p>
                  <p className="text-sm mt-2" style={{color:"var(--text-muted)"}}>Die Fondspolice zahlt <span className="font-semibold" style={{color:"var(--success)"}}>lebenslang garantiert</span>.</p>
                </div></div>
              </Card>
            </>)}

            {activeTab === "fazit" && (<>
              <Card><h2 className="text-lg font-semibold mb-4" style={{fontFamily:"var(--font-heading)"}}>Zusammenfassung</h2>
                <div className="grid grid-cols-3 gap-4 mb-6"><MetricCard label="Monatlicher Beitrag" value={fmtEur(params.beitrag)} sub={`${r.monate/12} Jahre`}/><MetricCard label="Gesamteinzahlung" value={fmtEur(r.beitragsSumme)}/><MetricCard label="Erwartete Rendite" value={`${Math.round(params.renditePa*100)}% p.a.`} sub={r.switchYears.length>0?`${r.switchYears.length} Fondswechsel`:"ohne Fondswechsel"}/></div>
                <div className="grid grid-cols-2 gap-6 pt-4" style={{borderTop:"1px solid var(--border)"}}>
                  <div className="space-y-3"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{background:"var(--accent)"}}/><h3 className="text-sm font-semibold" style={{color:"var(--accent)",fontFamily:"var(--font-heading)"}}>Fondspolice</h3></div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span style={{color:"var(--text-muted)"}}>Endkapital</span><span style={{fontFamily:"var(--font-mono)"}}>{fmtEur(r.fpBalance)}</span></div>
                      <div className="flex justify-between"><span style={{color:"var(--text-muted)"}}>Netto nach Steuern</span><span style={{color:"var(--accent)",fontFamily:"var(--font-mono)"}}>{fmtEur(r.fpNettoKapital)}</span></div>
                      <div className="flex justify-between"><span style={{color:"var(--text-muted)"}}>Monatl. Rente (netto)</span><span className="font-semibold" style={{color:"var(--accent)",fontFamily:"var(--font-mono)"}}>{fmtEur(r.fpNettoRente)}</span></div>
                      <div className="flex justify-between"><span style={{color:"var(--text-muted)"}}>Dauer</span><span style={{color:"var(--success)",fontFamily:"var(--font-mono)"}}>Lebenslang ∞</span></div>
                      {r.switchYears.length>0&&<div className="flex justify-between"><span style={{color:"var(--text-muted)"}}>Fondswechsel-Steuer</span><span style={{color:"var(--success)",fontFamily:"var(--font-mono)"}}>0 €</span></div>}
                      <div className="pt-2 mt-2" style={{borderTop:"1px solid var(--border)"}}><div className="flex justify-between"><span style={{color:"var(--text-muted)"}}>Kapitalentnahme ({r.keJahre}J)</span><span className="font-semibold" style={{color:"var(--violet)",fontFamily:"var(--font-mono)"}}>{fmtEur(r.keNettoMonatlich)}/Mo</span></div><div className="flex justify-between"><span style={{color:"var(--text-muted)"}}>Eff. Steuersatz</span><span style={{color:"var(--success)",fontFamily:"var(--font-mono)"}}>{(r.keEffektiverSteuersatz*100).toFixed(1)}%</span></div></div>
                    </div>
                  </div>
                  <div className="space-y-3"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{background:"var(--sky)"}}/><h3 className="text-sm font-semibold" style={{color:"var(--sky)",fontFamily:"var(--font-heading)"}}>Trading Depot</h3></div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span style={{color:"var(--text-muted)"}}>Endkapital</span><span style={{fontFamily:"var(--font-mono)"}}>{fmtEur(r.trBalance)}</span></div>
                      <div className="flex justify-between"><span style={{color:"var(--text-muted)"}}>Netto nach Steuern</span><span style={{color:"var(--sky)",fontFamily:"var(--font-mono)"}}>{fmtEur(r.trNetto)}</span></div>
                      <div className="flex justify-between"><span style={{color:"var(--text-muted)"}}>Monatl. Entnahme</span><span className="font-semibold" style={{color:"var(--sky)",fontFamily:"var(--font-mono)"}}>{fmtEur(r.trNettoEntnahmeMax)}</span></div>
                      <div className="flex justify-between"><span style={{color:"var(--text-muted)"}}>Reicht bis</span><span style={{color:r.trReichtAlter<params.lebenserwartung?"var(--danger)":"var(--sky)",fontFamily:"var(--font-mono)"}}>Alter {Math.round(r.trReichtAlter)}</span></div>
                      {r.trFondswechselSteuerGesamt>0&&<div className="flex justify-between"><span style={{color:"var(--text-muted)"}}>Fondswechsel-Steuer</span><span style={{color:"var(--danger)",fontFamily:"var(--font-mono)"}}>{fmtEur(r.trFondswechselSteuerGesamt)}</span></div>}
                    </div>
                  </div>
                </div>
              </Card>

              <div className="grid grid-cols-2 gap-4">
                <Card accent><h3 className="text-sm font-semibold mb-3" style={{color:"var(--accent)",fontFamily:"var(--font-heading)"}}>Vorteile Fondspolice</h3><ul className="space-y-2 text-sm">{["Lebenslange garantierte Rente","Halbeinkünfteverfahren","Keine laufende Vorabpauschale","Günstige Ertragsanteilsbesteuerung","Kein Langlebigkeitsrisiko","Steuerfreie Fondswechsel im Mantel","Kapitalentnahme mit Halbeinkünfteverfahren"].map((t,i)=>(<li key={i} className="flex gap-2"><span style={{color:"var(--success)"}}>✓</span>{t}</li>))}</ul></Card>
                <Card style={{borderColor:"var(--sky)"}}><h3 className="text-sm font-semibold mb-3" style={{color:"var(--sky)",fontFamily:"var(--font-heading)"}}>Vorteile Trading Depot</h3><ul className="space-y-2 text-sm">{["Volle Flexibilität bei Entnahme","Keine Abschluss-/Verwaltungskosten","Vererbbar (Restkapital)","Jederzeit verfügbar","30% Teilfreistellung auf Aktien-ETFs"].map((t,i)=>(<li key={i} className="flex gap-2"><span style={{color:"var(--sky)"}}>✓</span>{t}</li>))}<li className="flex gap-2" style={{color:"var(--text-muted)"}}><span style={{color:"var(--danger)"}}>✗</span>Fondswechsel löst Steuer aus</li></ul></Card>
              </div>

              <Card accent><h3 className="text-lg font-semibold mb-2" style={{color:"var(--accent)",fontFamily:"var(--font-heading)"}}>Kernaussage</h3>
                <p style={{color:"var(--text)",lineHeight:1.7}}>Bei gleicher monatlicher Rente von <strong>{fmtEur(r.fpNettoRente)} netto</strong> reicht das Trading-Depot bis Alter <strong>{Math.round(r.trReichtAlter)}</strong>. Die Fondspolice zahlt dagegen <strong style={{color:"var(--success)"}}>lebenslang</strong>.{r.trFondswechselSteuerGesamt>0&&<> Durch {r.trSwitchEvents.length} Fondswechsel gehen im Depot zusätzlich <strong style={{color:"var(--danger)"}}>{fmtEur(r.trFondswechselSteuerGesamt)}</strong> an Steuern verloren – in der Fondspolice steuerfrei.</>}</p>
                <p className="text-sm mt-3" style={{color:"var(--text-muted)"}}>Hinweis: Vereinfachte Modellrechnung. Keine Anlageberatung.</p>
              </Card>
            </>)}
          </div>
        </div>
      </div>
    </div>
  );
}
