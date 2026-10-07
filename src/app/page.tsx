"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { FileDown, FileSpreadsheet, MapPin, RefreshCw, Sun, Trash2, Upload } from "lucide-react";
import readXlsxFile from "read-excel-file/browser";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildInvestmentSummary,
  correlationLabel,
  formatCurrency,
  formatNumber,
  summarizeBills,
  type BillRecord,
} from "@/lib/analysis";
import { correlateBillsWithWeather, type WeatherDay } from "@/lib/weather";

type Project = {
  locationName: string;
  latitude: number | null;
  longitude: number | null;
  quoteAmount: number;
  useTaxCredit: boolean;
  paymentMethod: "upfront" | "financed";
  monthlyPayment: number;
  installments: number;
  systemKwp: number;
  batteryKwh: number;
  tilt: number;
  aspect: number;
  lossesPct: number;
  selfConsumptionPct: number;
  exportPrice: number;
  bills: BillRecord[];
};

type SolarResult = { annualKwh: number; monthly: Array<{ month: number; kwh: number }> };
const storageKey = "solare-studio-v1";
const today = new Date().toISOString().slice(0, 10);
const defaultProject: Project = {
  locationName: "",
  latitude: null,
  longitude: null,
  quoteAmount: 12000,
  useTaxCredit: true,
  paymentMethod: "upfront",
  monthlyPayment: 0,
  installments: 120,
  systemKwp: 6,
  batteryKwh: 0,
  tilt: 30,
  aspect: 0,
  lossesPct: 14,
  selfConsumptionPct: 55,
  exportPrice: 0.1,
  bills: [],
};

const numberValue = (value: string) => Number(value.replace(",", ".")) || 0;
const inputDate = (value: unknown) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const stringValue = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) return stringValue;
  const match = stringValue.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!match) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
};
const field = (row: Record<string, unknown>, terms: string[]) => {
  const key = Object.keys(row).find((candidate) => terms.some((term) => candidate.toLowerCase().includes(term)));
  return key ? row[key] : undefined;
};
const csvRows = (text: string): Record<string, unknown>[] => {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delimiter).map((header) => header.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, line.split(delimiter)[index]?.trim().replace(/^"|"$/g, "") ?? ""])));
};

export default function Home() {
  const [project, setProject] = useState<Project>(defaultProject);
  const [hydrated, setHydrated] = useState(false);
  const [locationQuery, setLocationQuery] = useState("");
  const [solar, setSolar] = useState<SolarResult | null>(null);
  const [weather, setWeather] = useState<WeatherDay[]>([]);
  const [busy, setBusy] = useState<"location" | "solar" | "weather" | "import" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    queueMicrotask(() => {
      if (saved) {
        try { setProject({ ...defaultProject, ...JSON.parse(saved) }); } catch { window.localStorage.removeItem(storageKey); }
      }
      setHydrated(true);
    });
  }, []);
  useEffect(() => { if (hydrated) window.localStorage.setItem(storageKey, JSON.stringify(project)); }, [project, hydrated]);

  const summary = useMemo(() => summarizeBills(project.bills), [project.bills]);
  const correlation = useMemo(() => correlateBillsWithWeather(project.bills, weather), [project.bills, weather]);
  const annualProduction = solar?.annualKwh ?? 0;
  const selfConsumed = annualProduction * (project.selfConsumptionPct / 100);
  const exported = annualProduction - selfConsumed;
  const annualSavings = selfConsumed * summary.averageEnergyCostPerKwh + exported * project.exportPrice;
  const investment = useMemo(() => buildInvestmentSummary({
    quoteAmount: project.quoteAmount, useTaxCredit: project.useTaxCredit, paymentMethod: project.paymentMethod,
    monthlyPayment: project.monthlyPayment, installments: project.installments, annualSavings,
  }), [project, annualSavings]);
  const update = <K extends keyof Project>(key: K, value: Project[K]) => setProject((current) => ({ ...current, [key]: value }));

  async function geocode() {
    if (!locationQuery.trim()) return;
    setBusy("location"); setNotice(null);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(locationQuery)}`);
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setProject((current) => ({ ...current, locationName: data.name, latitude: data.latitude, longitude: data.longitude }));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Località non disponibile."); }
    finally { setBusy(null); }
  }
  async function runSolar() {
    if (project.latitude === null || project.longitude === null) { setNotice("Prima cerca e conferma la località."); return; }
    setBusy("solar"); setNotice(null);
    try {
      const params = new URLSearchParams({ lat: String(project.latitude), lon: String(project.longitude), kwp: String(project.systemKwp), tilt: String(project.tilt), aspect: String(project.aspect), loss: String(project.lossesPct) });
      const response = await fetch(`/api/solar?${params}`); const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setSolar(data);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Simulazione non disponibile."); }
    finally { setBusy(null); }
  }
  async function runWeather() {
    if (project.latitude === null || project.longitude === null || project.bills.length < 3) { setNotice("Servono località e almeno tre bollette con periodo di riferimento."); return; }
    const dates = project.bills.flatMap((bill) => [bill.startDate, bill.endDate]).filter(Boolean).sort();
    if (!dates.length) return;
    setBusy("weather"); setNotice(null);
    try {
      const params = new URLSearchParams({ lat: String(project.latitude), lon: String(project.longitude), start: dates[0], end: dates[dates.length - 1] });
      const response = await fetch(`/api/weather?${params}`); const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setWeather(data.days);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Analisi meteo non disponibile."); }
    finally { setBusy(null); }
  }
  function addBill() { update("bills", [...project.bills, { id: crypto.randomUUID(), startDate: today.slice(0, 8) + "01", endDate: today, consumptionKwh: 0, totalAmount: 0, source: "manual" }]); }
  function editBill(id: string, key: keyof BillRecord, value: string) {
    update("bills", project.bills.map((bill) => ({ ...bill, ...(bill.id === id ? { [key]: key === "consumptionKwh" || key === "totalAmount" ? numberValue(value) : value } : {}) })));
  }
  function removeBill(id: string) { update("bills", project.bills.filter((bill) => bill.id !== id)); }
  function exportPdf() {
    const report = window.open("", "_blank", "noopener,noreferrer");
    if (!report) { setNotice("Il browser ha bloccato la finestra di stampa. Consenti i popup e riprova."); return; }
    const escape = (value: string) => value.replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[character] ?? character);
    const correlationRow = (label: string, value: number | null) => `<tr><td>${label}</td><td>${value === null ? "Dati insufficienti" : `${value.toFixed(2)} · ${correlationLabel(value)}`}</td></tr>`;
    report.document.write(`<!doctype html><html lang="it"><head><title>Studio Solare — Analisi</title><style>body{font:14px Arial;color:#1c1917;margin:38px}h1{font-size:30px;margin:0}h2{font-size:17px;margin:28px 0 10px;border-bottom:1px solid #d6d3d1;padding-bottom:8px}.sub{color:#57534e;margin:8px 0 24px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.card{border:1px solid #d6d3d1;border-radius:8px;padding:14px}.label{color:#78716c;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.value{font-weight:bold;font-size:20px;margin-top:6px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e7e5e4;padding:8px;text-align:left}footer{margin-top:30px;color:#78716c;font-size:10px;line-height:1.5}@media print{body{margin:20px}}</style></head><body><h1>Studio Solare</h1><p class="sub">Analisi generata il ${new Date().toLocaleDateString("it-IT")} · ${escape(project.locationName || "Località non impostata")}</p><h2>Sintesi</h2><div class="grid"><div class="card"><div class="label">Consumo medio</div><div class="value">${formatNumber(summary.averageMonthlyConsumptionKwh)} kWh/mese</div></div><div class="card"><div class="label">Produzione simulata</div><div class="value">${solar ? `${formatNumber(annualProduction)} kWh/anno` : "Non calcolata"}</div></div><div class="card"><div class="label">Risparmio annuo stimato</div><div class="value">${formatCurrency(annualSavings)}</div></div><div class="card"><div class="label">Rientro semplice</div><div class="value">${investment.simplePaybackYears ? `${formatNumber(investment.simplePaybackYears)} anni` : "Dati mancanti"}</div></div></div><h2>Impianto e investimento</h2><table><tr><td>Potenza / batteria</td><td>${formatNumber(project.systemKwp)} kWp / ${formatNumber(project.batteryKwh)} kWh</td></tr><tr><td>Preventivo</td><td>${formatCurrency(project.quoteAmount)}</td></tr><tr><td>Costo netto dopo credito</td><td>${formatCurrency(investment.netCostAfterTaxCredit)}</td></tr><tr><td>Credito annuo simulato</td><td>${formatCurrency(investment.annualTaxCredit)}</td></tr></table><h2>Bollette</h2><table><tr><th>Periodo</th><th>Consumo</th><th>Totale</th></tr>${project.bills.map((bill) => `<tr><td>${escape(bill.startDate)} — ${escape(bill.endDate)}</td><td>${formatNumber(bill.consumptionKwh)} kWh</td><td>${formatCurrency(bill.totalAmount)}</td></tr>`).join("") || "<tr><td colspan=3>Nessuna bolletta inserita</td></tr>"}</table><h2>Correlazione meteo</h2><table>${correlationRow("Temperatura", correlation.temperatureCorrelation)}${correlationRow("Irradiazione", correlation.radiationCorrelation)}${correlationRow("Pioggia", correlation.precipitationCorrelation)}</table><footer>Stima orientativa, non parere tecnico, fiscale o finanziario. Verifica requisiti fiscali, profilo di consumo, ombreggiamenti, tariffe e condizioni contrattuali con professionisti qualificati.</footer><script>window.onload=()=>window.print()<\/script></body></html>`);
    report.document.close();
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy("import"); setNotice(null);
    try {
      let rows: Record<string, unknown>[] = [];
      if (file.name.toLowerCase().endsWith(".pdf")) {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        let text = ""; for (let page = 1; page <= document.numPages; page += 1) { const content = await (await document.getPage(page)).getTextContent(); text += ` ${content.items.map((item) => ("str" in item ? item.str : "")).join(" ")}`; }
        const kwh = text.match(/(\d{1,5}(?:[.,]\d{1,2})?)\s*kWh/i)?.[1];
        const euros = text.match(/(?:totale\s+da\s+pagare|importo\s+totale|totale)\D{0,20}(\d{1,5}(?:[.,]\d{2})?)/i)?.[1];
        rows = [{ consumo_kwh: kwh, totale_euro: euros }];
        setNotice("PDF letto in modo assistito: verifica e completa le date prima di usare l'analisi.");
      } else if (file.name.toLowerCase().endsWith(".csv")) {
        rows = csvRows(await file.text());
      } else {
        const [firstSheet] = await readXlsxFile(file);
        const [headerRow = [], ...dataRows] = firstSheet?.data ?? [];
        const headers = headerRow.map((header: unknown) => String(header ?? "").trim());
        rows = dataRows.map((dataRow) => Object.fromEntries(headers.map((header, index) => [header, dataRow[index] ?? ""])));
      }
      const imported = rows.map((row) => ({
        id: crypto.randomUUID(), startDate: inputDate(field(row, ["inizio", "start", "dal"])), endDate: inputDate(field(row, ["fine", "end", "al"])),
        consumptionKwh: numberValue(String(field(row, ["kwh", "consumo"]) ?? "0")), totalAmount: numberValue(String(field(row, ["totale", "importo", "euro", "costo"]) ?? "0")), source: file.name.toLowerCase().endsWith(".pdf") ? "pdf" as const : "csv" as const,
      })).filter((bill) => bill.consumptionKwh > 0 || bill.totalAmount > 0);
      if (!imported.length) throw new Error("Nessuna riga importabile: usa colonne con consumo/kWh e totale/importo.");
      update("bills", [...project.bills, ...imported]);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Importazione non riuscita."); }
    finally { event.target.value = ""; setBusy(null); }
  }

  return <main className="min-h-screen bg-stone-50 text-stone-950"><div className="mx-auto max-w-7xl px-5 py-8 md:px-8">
    <header className="mb-8 flex flex-col justify-between gap-4 border-b border-stone-200 pb-6 md:flex-row md:items-end"><div><p className="mb-2 text-xs font-semibold tracking-[0.22em] text-stone-500">STUDIO SOLARE</p><h1 className="text-3xl font-semibold tracking-tight">Conviene davvero?</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">Analizza le bollette, simula la produzione locale e confronta costo, risparmio e tempi di rientro. I dati restano nel browser.</p></div><Badge variant="outline" className="w-fit">Locale · nessun account</Badge></header>
    {notice && <Alert className="mb-6"><AlertDescription>{notice}</AlertDescription></Alert>}
    <Tabs defaultValue="progetto"><TabsList className="mb-6 w-full justify-start overflow-auto"><TabsTrigger value="progetto">1. Progetto</TabsTrigger><TabsTrigger value="bollette">2. Bollette</TabsTrigger><TabsTrigger value="analisi">3. Analisi</TabsTrigger></TabsList>
      <TabsContent value="progetto" className="space-y-6"><div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]"><Card><CardHeader><CardTitle>Località e impianto</CardTitle><CardDescription>PVGIS calcola una stima della produzione dalle coordinate, potenza, orientamento e perdite.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="flex gap-2"><Input value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} placeholder="Es. Bologna, Italia" /><Button onClick={geocode} disabled={busy === "location"}>{busy === "location" ? <RefreshCw className="animate-spin" /> : <MapPin />} Cerca</Button></div>{project.locationName && <p className="text-sm text-stone-600">{project.locationName} · {project.latitude?.toFixed(4)}, {project.longitude?.toFixed(4)}</p>}<div className="grid gap-4 sm:grid-cols-2">{[["Potenza impianto", "systemKwp", "kWp"], ["Batteria", "batteryKwh", "kWh"], ["Inclinazione", "tilt", "°"], ["Azimut (sud = 0)", "aspect", "°"], ["Perdite impianto", "lossesPct", "%"], ["Autoconsumo stimato", "selfConsumptionPct", "%"], ["Prezzo energia immessa", "exportPrice", "€/kWh"]].map(([label, key, unit]) => <div key={key}><Label>{label}</Label><div className="mt-1 flex items-center gap-2"><Input type="number" step="0.01" value={project[key as keyof Project] as number} onChange={(event) => update(key as keyof Project, numberValue(event.target.value) as never)} /><span className="w-12 text-xs text-stone-500">{unit}</span></div></div>)}</div><Button className="w-full" onClick={runSolar} disabled={busy === "solar" || project.latitude === null}>{busy === "solar" ? <RefreshCw className="animate-spin" /> : <Sun />} Calcola produzione stimata</Button></CardContent></Card>
      <Card><CardHeader><CardTitle>Preventivo e pagamento</CardTitle><CardDescription>La detrazione è una simulazione del beneficio fiscale: verifica sempre requisiti, capienza e normativa con un professionista.</CardDescription></CardHeader><CardContent className="space-y-5"><div><Label>Costo preventivo</Label><Input className="mt-1" type="number" value={project.quoteAmount} onChange={(event) => update("quoteAmount", numberValue(event.target.value))} /></div><div className="flex items-center justify-between rounded-lg border border-stone-200 p-3"><div><p className="text-sm font-medium">Detrazione 50% in 10 anni</p><p className="text-xs text-stone-500">Applica 10 quote annuali uguali al costo del preventivo.</p></div><Switch checked={project.useTaxCredit} onCheckedChange={(value) => update("useTaxCredit", value)} /></div><div className="grid grid-cols-2 gap-3"><Button variant={project.paymentMethod === "upfront" ? "default" : "outline"} onClick={() => update("paymentMethod", "upfront")}>Pagamento subito</Button><Button variant={project.paymentMethod === "financed" ? "default" : "outline"} onClick={() => update("paymentMethod", "financed")}>Finanziamento</Button></div>{project.paymentMethod === "financed" && <div className="grid grid-cols-2 gap-4"><div><Label>Rata mensile</Label><Input className="mt-1" type="number" value={project.monthlyPayment} onChange={(event) => update("monthlyPayment", numberValue(event.target.value))} /></div><div><Label>Numero rate</Label><Input className="mt-1" type="number" value={project.installments} onChange={(event) => update("installments", numberValue(event.target.value))} /></div></div>}<div className="rounded-lg bg-stone-100 p-4 text-sm"><div className="flex justify-between"><span>Esborso complessivo</span><strong>{formatCurrency(investment.outOfPocketCost)}</strong></div><div className="mt-2 flex justify-between"><span>Credito annuo simulato</span><strong>{formatCurrency(investment.annualTaxCredit)}</strong></div></div></CardContent></Card></div></TabsContent>
      <TabsContent value="bollette" className="space-y-6"><Card><CardHeader><CardTitle>Storico bollette</CardTitle><CardDescription>Inserisci periodi e consumo reale. CSV/XLSX: colonne riconosciute includono inizio/fine, consumo/kWh e totale/importo. I PDF vengono estratti in modo assistito e vanno sempre verificati.</CardDescription></CardHeader><CardContent><div className="mb-5 flex flex-wrap gap-3"><Button onClick={addBill}>Aggiungi riga</Button><label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-stone-300 bg-transparent px-3 text-sm font-medium hover:bg-stone-100"><Upload className="size-4" /> Importa CSV, XLSX o PDF<input className="hidden" type="file" accept=".csv,.xlsx,.xls,.pdf" onChange={importFile} /></label>{busy === "import" && <Badge variant="outline"><RefreshCw className="mr-1 size-3 animate-spin" />Importazione</Badge>}</div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="border-b text-left text-stone-500"><tr><th className="pb-2">Dal</th><th className="pb-2">Al</th><th className="pb-2">Consumo kWh</th><th className="pb-2">Totale €</th><th className="pb-2">Fonte</th><th /></tr></thead><tbody>{project.bills.map((bill) => <tr key={bill.id} className="border-b border-stone-100"><td className="py-2 pr-2"><Input type="date" value={bill.startDate} onChange={(event) => editBill(bill.id, "startDate", event.target.value)} /></td><td className="py-2 pr-2"><Input type="date" value={bill.endDate} onChange={(event) => editBill(bill.id, "endDate", event.target.value)} /></td><td className="py-2 pr-2"><Input type="number" value={bill.consumptionKwh} onChange={(event) => editBill(bill.id, "consumptionKwh", event.target.value)} /></td><td className="py-2 pr-2"><Input type="number" step="0.01" value={bill.totalAmount} onChange={(event) => editBill(bill.id, "totalAmount", event.target.value)} /></td><td className="py-2"><Badge variant="outline">{bill.source ?? "manual"}</Badge></td><td className="py-2 text-right"><Button size="icon" variant="ghost" onClick={() => removeBill(bill.id)}><Trash2 /></Button></td></tr>)}{!project.bills.length && <tr><td colSpan={6} className="py-10 text-center text-stone-500">Nessuna bolletta: inserisci una riga o importa un file.</td></tr>}</tbody></table></div></CardContent></Card></TabsContent>
      <TabsContent value="analisi" className="space-y-6"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[["Consumo medio", `${formatNumber(summary.averageMonthlyConsumptionKwh)} kWh/mese`], ["Costo medio", `${formatNumber(summary.averageEnergyCostPerKwh, 3)} €/kWh`], ["Produzione simulata", solar ? `${formatNumber(annualProduction)} kWh/anno` : "Da calcolare"], ["Rientro semplice", investment.simplePaybackYears ? `${formatNumber(investment.simplePaybackYears)} anni` : "Dati mancanti"]].map(([label, value]) => <Card key={label}><CardContent className="pt-5"><p className="text-xs uppercase tracking-wider text-stone-500">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></CardContent></Card>)}</div><div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]"><Card><CardHeader><CardTitle>Esito economico</CardTitle><CardDescription>Il risparmio combina energia autoconsumata al costo medio rilevato dalle tue bollette e l&apos;energia immessa al valore configurato.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm">{[["Produzione autoconsumata", `${formatNumber(selfConsumed)} kWh/anno`], ["Energia immessa", `${formatNumber(exported)} kWh/anno`], ["Risparmio annuo stimato", formatCurrency(annualSavings)], ["Costo netto dopo credito", formatCurrency(investment.netCostAfterTaxCredit)], ["Costo finanziamento", formatCurrency(investment.financingCost)]].map(([label, value]) => <div className="flex justify-between border-b border-stone-100 pb-3" key={label}><span className="text-stone-600">{label}</span><strong>{value}</strong></div>)}{solar?.monthly?.length ? <div className="pt-2"><p className="mb-2 font-medium">Produzione mensile stimata</p><div className="flex h-28 items-end gap-1">{solar.monthly.map((item) => <div className="flex flex-1 flex-col items-center gap-1" key={item.month}><div className="w-full bg-stone-900" style={{ height: `${Math.max(4, (item.kwh / Math.max(...solar.monthly.map((month) => month.kwh))) * 85)}px` }} /><span className="text-[10px] text-stone-500">{item.month}</span></div>)}</div></div> : null}</CardContent></Card><Card><CardHeader><CardTitle>Correlazione con il meteo</CardTitle><CardDescription>Confronta il consumo giornaliero di ogni bolletta con temperatura, irradiazione e pioggia nel suo stesso periodo.</CardDescription></CardHeader><CardContent className="space-y-4"><Button className="w-full" variant="outline" onClick={exportPdf}><FileDown /> Esporta analisi in PDF</Button><Button className="w-full" variant="outline" onClick={runWeather} disabled={busy === "weather" || project.bills.length < 3 || project.latitude === null}>{busy === "weather" ? <RefreshCw className="animate-spin" /> : <FileSpreadsheet />} Estrai dati meteo del periodo</Button>{weather.length ? <><div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-stone-100 p-3"><p className="text-stone-500">Temperatura</p><strong>{correlation.temperatureCorrelation?.toFixed(2) ?? "n/d"}</strong><p>{correlationLabel(correlation.temperatureCorrelation)}</p></div><div className="rounded-lg bg-stone-100 p-3"><p className="text-stone-500">Sole</p><strong>{correlation.radiationCorrelation?.toFixed(2) ?? "n/d"}</strong><p>{correlationLabel(correlation.radiationCorrelation)}</p></div><div className="rounded-lg bg-stone-100 p-3"><p className="text-stone-500">Pioggia</p><strong>{correlation.precipitationCorrelation?.toFixed(2) ?? "n/d"}</strong><p>{correlationLabel(correlation.precipitationCorrelation)}</p></div></div><p className="text-xs leading-5 text-stone-500">Sono associazioni statistiche, non una prova di causalità. Con meno di 3 periodi completi non si calcola il coefficiente; con 12+ bollette mensili l&apos;interpretazione diventa più utile.</p></> : <p className="text-sm text-stone-500">Inserisci almeno tre periodi completi, poi estrai il meteo storico della località.</p>}</CardContent></Card></div></TabsContent></Tabs>
    <footer className="mt-10 border-t border-stone-200 pt-5 text-xs leading-5 text-stone-500">Stima orientativa, non parere tecnico, fiscale o finanziario. Verifica preventivo, requisiti della detrazione, tariffe, ombreggiamenti, profilo orario dei consumi e vincoli locali con installatore e professionista abilitato.</footer>
  </div></main>;
}
