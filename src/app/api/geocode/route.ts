import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query || query.length > 120) {
    return NextResponse.json({ error: "Inserisci una località valida." }, { status: 400 });
  }

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "it");
  url.searchParams.set("format", "json");

  const response = await fetch(url, { next: { revalidate: 86_400 } });
  if (!response.ok) {
    return NextResponse.json({ error: "Geocodifica non disponibile." }, { status: 502 });
  }

  const payload = (await response.json()) as {
    results?: Array<{ name: string; country?: string; admin1?: string; latitude: number; longitude: number }>;
  };
  const result = payload.results?.[0];
  if (!result) {
    return NextResponse.json({ error: "Località non trovata." }, { status: 404 });
  }

  return NextResponse.json({
    name: [result.name, result.admin1, result.country].filter(Boolean).join(", "),
    latitude: result.latitude,
    longitude: result.longitude,
  });
}
