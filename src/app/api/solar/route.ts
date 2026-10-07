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
  if (latitude === null || longitude === null || peakPower === null) {
    return NextResponse.json({ error: "Parametri fotovoltaici non validi." }, { status: 400 });
  }

  const url = new URL("https://re.jrc.ec.europa.eu/api/v5_3/PVcalc");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("peakpower", String(peakPower));
  url.searchParams.set("loss", String(loss));
  url.searchParams.set("angle", String(tilt));
  url.searchParams.set("aspect", String(aspect));
  url.searchParams.set("outputformat", "json");

  const response = await fetch(url, { next: { revalidate: 86_400 } });
  if (!response.ok) {
    return NextResponse.json({ error: "PVGIS non ha restituito una simulazione." }, { status: 502 });
  }

  const payload = (await response.json()) as {
    outputs?: { totals?: { fixed?: { E_y?: number } }; monthly?: { fixed?: Array<{ month: number; E_m: number }> } };
  };
  const annualKwh = payload.outputs?.totals?.fixed?.E_y;
  if (!annualKwh) {
    return NextResponse.json({ error: "Risposta PVGIS incompleta." }, { status: 502 });
  }

  return NextResponse.json({
    annualKwh,
    monthly: (payload.outputs?.monthly?.fixed ?? []).map((item) => ({
      month: item.month,
      kwh: item.E_m,
    })),
  });
}
