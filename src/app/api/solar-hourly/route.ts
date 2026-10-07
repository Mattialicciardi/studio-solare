import { NextRequest, NextResponse } from "next/server";

function numberInRange(value: string | null, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export async function GET(request: NextRequest) {
  const latitude = numberInRange(request.nextUrl.searchParams.get("lat"), -90, 90);
  const longitude = numberInRange(request.nextUrl.searchParams.get("lon"), -180, 180);
  const peakPower = numberInRange(request.nextUrl.searchParams.get("kwp"), 0.1, 100);
  const loss = numberInRange(request.nextUrl.searchParams.get("loss"), 0, 40) ?? 14;
  const tilt = numberInRange(request.nextUrl.searchParams.get("tilt"), 0, 90) ?? 30;
  const aspect = numberInRange(request.nextUrl.searchParams.get("aspect"), -180, 180) ?? 0;
  const year = numberInRange(request.nextUrl.searchParams.get("year"), 2005, 2020) ?? 2020;
  if (latitude === null || longitude === null || peakPower === null) {
    return NextResponse.json({ error: "Parametri fotovoltaici non validi." }, { status: 400 });
  }

  const url = new URL("https://re.jrc.ec.europa.eu/api/v5_3/seriescalc");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("startyear", String(year));
  url.searchParams.set("endyear", String(year));
  url.searchParams.set("pvcalculation", "1");
  url.searchParams.set("peakpower", String(peakPower));
  url.searchParams.set("loss", String(loss));
  url.searchParams.set("angle", String(tilt));
  url.searchParams.set("aspect", String(aspect));
  url.searchParams.set("outputformat", "json");

  const response = await fetch(url, { next: { revalidate: 86_400 } });
  if (!response.ok) return NextResponse.json({ error: "PVGIS non ha restituito il profilo orario." }, { status: 502 });
  const payload = (await response.json()) as { outputs?: { hourly?: Array<{ time?: string; P?: number }> } };
  const hours = (payload.outputs?.hourly ?? [])
    .map((item) => {
      const raw = item.time ?? "";
      const match = raw.match(/^(\d{4})(\d{2})(\d{2}):(\d{2})/);
      if (!match || !Number.isFinite(item.P)) return null;
      return { timestamp: `${match[1]}-${match[2]}-${match[3]}T${match[4]}:00:00Z`, kwh: Math.max(0, Number(item.P) / 1000) };
    })
    .filter((item): item is { timestamp: string; kwh: number } => item !== null);
  if (hours.length < 8_000) return NextResponse.json({ error: "Risposta PVGIS oraria incompleta." }, { status: 502 });

  return NextResponse.json({ year, hours });
}
