/**
 * Historische Jahresrenditen MSCI World und MSCI Emerging Markets
 * Alle Werte: EUR Net Total Return (nach Quellensteuer)
 * 
 * Quellen:
 * - 2012–2024: MSCI Index Factsheets EUR Net (msci.com)
 * - 2003–2011 EM: MSCI EM EUR Factsheet (via CFTC Filing ptc082217)
 * - 2001–2011 World, 2001–2002 EM: Konvertiert aus USD Net Returns
 *   (MSCI Factsheets USD) mittels ECB Jahresend-Wechselkursen EUR/USD
 * 
 * Hinweis: Leichte Abweichungen bei konvertierten Werten möglich
 * (ECB Fixing vs. MSCI Fixing-Zeitpunkt)
 */

export interface YearReturn {
  year: number;
  msciWorld: number;  // Dezimal, z.B. 0.266 = 26.6%
  msciEM: number;     // Dezimal, z.B. 0.147 = 14.7%
}

export const HISTORICAL_RETURNS: YearReturn[] = [
  { year: 2001, msciWorld: -0.122, msciEM:  0.031 },
  { year: 2002, msciWorld: -0.327, msciEM: -0.210 },
  { year: 2003, msciWorld:  0.105, msciEM:  0.296 },
  { year: 2004, msciWorld:  0.070, msciEM:  0.165 },
  { year: 2005, msciWorld:  0.256, msciEM:  0.544 },
  { year: 2006, msciWorld:  0.075, msciEM:  0.182 },
  { year: 2007, msciWorld: -0.025, msciEM:  0.257 },
  { year: 2008, msciWorld: -0.373, msciEM: -0.509 },
  { year: 2009, msciWorld:  0.256, msciEM:  0.729 },
  { year: 2010, msciWorld:  0.205, msciEM:  0.271 },
  { year: 2011, msciWorld: -0.024, msciEM: -0.157 },
  // Ab hier: Direkt aus MSCI EUR Net Factsheets
  { year: 2012, msciWorld:  0.1405, msciEM:  0.1641 },
  { year: 2013, msciWorld:  0.2120, msciEM: -0.0681 },
  { year: 2014, msciWorld:  0.1950, msciEM:  0.1138 },
  { year: 2015, msciWorld:  0.1042, msciEM: -0.0523 },
  { year: 2016, msciWorld:  0.1073, msciEM:  0.1451 },
  { year: 2017, msciWorld:  0.0751, msciEM:  0.2059 },
  { year: 2018, msciWorld: -0.0411, msciEM: -0.1026 },
  { year: 2019, msciWorld:  0.3002, msciEM:  0.2060 },
  { year: 2020, msciWorld:  0.0633, msciEM:  0.0854 },
  { year: 2021, msciWorld:  0.3107, msciEM:  0.0486 },
  { year: 2022, msciWorld: -0.1278, msciEM: -0.1485 },
  { year: 2023, msciWorld:  0.1960, msciEM:  0.0611 },
  { year: 2024, msciWorld:  0.2660, msciEM:  0.1468 },
];

/**
 * Gibt historische Renditen für eine bestimmte Laufzeit zurück.
 * Wenn die Laufzeit die verfügbaren Daten überschreitet, wird zyklisch wiederholt.
 */
export function getReturnsForDuration(years: number): YearReturn[] {
  const result: YearReturn[] = [];
  for (let i = 0; i < years; i++) {
    const idx = i % HISTORICAL_RETURNS.length;
    result.push({
      year: i + 1, // Jahr der Ansparphase (1, 2, 3, ...)
      msciWorld: HISTORICAL_RETURNS[idx].msciWorld,
      msciEM: HISTORICAL_RETURNS[idx].msciEM,
    });
  }
  return result;
}
