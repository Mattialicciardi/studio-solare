import { NextRequest, NextResponse } from "next/server";

function coordinate(value: string | null, limit: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= limit ? parsed : null;
}

function date(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function GET(request: NextRequest) {
  const latitude = coordinate(request.nextUrl.searchParams.get("lat"), 90);
  const longitude = coordinate(request.nextUrl.searchParams.get("lon"), 180);
  const startDate = date(request.nextUrl.searchParams.get("start"));
  const endDate = date(request.nextUrl.searchParams.get("end"));
  if (latitude === null || longitude === null || !startDate || !endDate || startDate > endDate) {
    return NextResponse.json({ error: "Parametri meteo non validi." }, { status: 400 });
  }

  const requestedDays = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000 + 1;
  if (requestedDays > 1_850) {
    return NextResponse.json({ error: "Il periodo massimo è di cinque anni." }, { status: 400 });
  }

  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);
  url.searchParams.set("daily", "temperature_2m_mean,shortwave_radiation_sum,precipitation_sum");
  url.searchParams.set("timezone", "GMT");

  const response = await fetch(url, { next: { revalidate: 86_400 } });
  if (!response.ok) {
    return NextResponse.json({ error: "Archivio meteo non disponibile per il periodo scelto." }, { status: 502 });
  }

  const payload = (await response.json()) as {
    daily?: { time?: string[]; temperature_2m_mean?: number[]; shortwave_radiation_sum?: number[]; precipitation_sum?: number[] };
  };
  const daily = payload.daily;
  if (!daily?.time) {
    return NextResponse.json({ error: "Dati meteo incompleti." }, { status: 502 });
  }

  return NextResponse.json({
    days: daily.time.map((day, index) => ({
      date: day,
      temperatureC: daily.temperature_2m_mean?.[index] ?? 0,
      radiationMj: daily.shortwave_radiation_sum?.[index] ?? 0,
      precipitationMm: daily.precipitation_sum?.[index] ?? 0,
    })),
  });
}
