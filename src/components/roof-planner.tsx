"use client";

import { ChangeEvent, type MouseEvent, useMemo, useRef, useState } from "react";
import { Compass, MapPinned, MousePointer2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deriveRoofEstimate, formatNumber, type MapPoint, type RoofEstimate } from "@/lib/analysis";

type Mode = "scale" | "north" | "roof" | "fall" | null;
type Pair = { start?: MapPoint; end?: MapPoint };

type RoofPlannerProps = {
  tilt: number;
  usableRoofPct: number;
  panelDensityWpM2: number;
  onApply: (estimate: RoofEstimate) => void;
};

const pointLabel = (point?: MapPoint) => point ? `${formatNumber(point.x, 1)}%, ${formatNumber(point.y, 1)}%` : "da indicare";

export function RoofPlanner({ tilt, usableRoofPct, panelDensityWpM2, onApply }: RoofPlannerProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [scale, setScale] = useState<Pair>({});
  const [north, setNorth] = useState<Pair>({});
  const [fall, setFall] = useState<Pair>({});
  const [roof, setRoof] = useState<MapPoint[]>([]);
  const [scaleMeters, setScaleMeters] = useState(10);

  const estimate = useMemo(() => deriveRoofEstimate({
    scaleStart: scale.start,
    scaleEnd: scale.end,
    scaleMeters,
    northStart: north.start,
    northEnd: north.end,
    roofPolygon: roof,
    fallStart: fall.start,
    fallEnd: fall.end,
    tilt,
    usableRoofPct,
    panelDensityWpM2,
  }), [scale, scaleMeters, north, roof, fall, tilt, usableRoofPct, panelDensityWpM2]);

  function startMode(nextMode: Mode) {
    setMode(nextMode);
    if (nextMode === "scale") setScale({});
    if (nextMode === "north") setNorth({});
    if (nextMode === "fall") setFall({});
    if (nextMode === "roof") setRoof([]);
  }

  function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => setImage(String(reader.result)));
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function addPoint(event: MouseEvent<HTMLDivElement>) {
    if (!mode || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const point = { x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 };
    if (mode === "scale") setScale((current) => current.start ? { ...current, end: point } : { start: point });
    if (mode === "north") setNorth((current) => current.start ? { ...current, end: point } : { start: point });
    if (mode === "fall") setFall((current) => current.start ? { ...current, end: point } : { start: point });
    if (mode === "roof") setRoof((current) => [...current, point]);
  }

  const reset = () => { setImage(null); setMode(null); setScale({}); setNorth({}); setFall({}); setRoof([]); };

  return <div className="space-y-4">
    <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
      <p className="font-medium text-foreground">Rilievo da screenshot</p>
      <p>Carica uno screenshot dall&apos;alto con <strong className="font-medium text-foreground">barra di scala</strong> e <strong className="font-medium text-foreground">bussola</strong> Google Maps visibili. Rimane nel browser: non viene caricato né salvato.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div><Label htmlFor="roof-screenshot">Screenshot mappa o planimetria</Label><Input id="roof-screenshot" aria-label="Screenshot mappa o planimetria" className="mt-1" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleImage} /></div>
      <div><Label htmlFor="scale-meters">Metri indicati dalla barra di scala</Label><Input id="scale-meters" className="mt-1" min="0.1" step="0.1" type="number" value={scaleMeters} onChange={(event) => setScaleMeters(Math.max(0, Number(event.target.value) || 0))} /></div>
    </div>
    {image && <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={mode === "scale" ? "default" : "outline"} onClick={() => startMode("scale")}><MousePointer2 />1. Barra di scala</Button>
        <Button type="button" size="sm" variant={mode === "north" ? "default" : "outline"} onClick={() => startMode("north")}><Compass />2. Nord (centro → punta rossa)</Button>
        <Button type="button" size="sm" variant={mode === "roof" ? "default" : "outline"} onClick={() => startMode("roof")}><MapPinned />3. Contorno falda</Button>
        <Button type="button" size="sm" variant={mode === "fall" ? "default" : "outline"} onClick={() => startMode("fall")}><Compass />4. Caduta falda (colmo → gronda)</Button>
        <Button type="button" size="sm" variant="ghost" onClick={reset}><RotateCcw />Reimposta</Button>
      </div>
      <p className="text-xs text-muted-foreground">{mode === "scale" ? "Clicca i due estremi della barra di scala." : mode === "north" ? "Clicca il centro della bussola e poi la punta rossa del Nord." : mode === "roof" ? "Clicca i vertici della singola falda; almeno tre punti." : mode === "fall" ? "Clicca dal colmo verso la gronda della falda selezionata." : "Segui i quattro passaggi per ottenere una stima ripetibile."}</p>
      <div ref={stageRef} data-testid="roof-map-stage" onClick={addPoint} className="relative min-h-64 cursor-crosshair overflow-hidden rounded-lg border bg-background" role="application" aria-label="Area di tracciamento del tetto">
        {/* The user-provided image remains client-only and is intentionally not optimized or persisted. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="Screenshot selezionato per il rilievo del tetto" className="block max-h-[520px] w-full object-contain" draggable={false} />
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {roof.length >= 2 && <polygon points={roof.map((point) => `${point.x},${point.y}`).join(" ")} fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth=".45" />}
          {roof.map((point, index) => <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r=".8" fill="currentColor" />)}
          {scale.start && <circle cx={scale.start.x} cy={scale.start.y} r=".8" fill="currentColor" />}{scale.end && <line x1={scale.start?.x} y1={scale.start?.y} x2={scale.end.x} y2={scale.end.y} stroke="currentColor" strokeWidth=".5" />}
          {north.start && <circle cx={north.start.x} cy={north.start.y} r=".8" fill="currentColor" />}{north.end && <line x1={north.start?.x} y1={north.start?.y} x2={north.end.x} y2={north.end.y} stroke="currentColor" strokeWidth=".5" />}
          {fall.start && <circle cx={fall.start.x} cy={fall.start.y} r=".8" fill="currentColor" />}{fall.end && <line x1={fall.start?.x} y1={fall.start?.y} x2={fall.end.x} y2={fall.end.y} stroke="currentColor" strokeWidth=".5" />}
        </svg>
      </div>
      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <p>Scala: {pointLabel(scale.start)} → {pointLabel(scale.end)}</p><p>Nord: {pointLabel(north.start)} → {pointLabel(north.end)}</p>
        <p>Falda: {roof.length} vertici</p><p>Direzione: {pointLabel(fall.start)} → {pointLabel(fall.end)}</p>
      </div>
    </>}
    {estimate && <div className="rounded-lg border bg-background p-4" aria-live="polite">
      <p className="text-sm font-medium">Stima della falda selezionata</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-4"><div><p className="text-xs text-muted-foreground">Superficie falda</p><p className="font-semibold">{formatNumber(estimate.roofPlaneAreaM2)} m²</p></div><div><p className="text-xs text-muted-foreground">Azimut</p><p className="font-semibold">{formatNumber(estimate.azimuthDegrees, 0)}°</p></div><div><p className="text-xs text-muted-foreground">PVGIS</p><p className="font-semibold">{formatNumber(estimate.pvgisAspect, 0)}°</p></div><div><p className="text-xs text-muted-foreground">Potenza indicativa</p><p className="font-semibold">{formatNumber(estimate.suggestedKwp)} kWp</p></div></div>
      <Button type="button" className="mt-4" onClick={() => onApply(estimate)}>Usa azimut e potenza stimata</Button>
    </div>}
  </div>;
}
