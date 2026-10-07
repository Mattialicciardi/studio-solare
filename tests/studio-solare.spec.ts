import { expect, test } from "@playwright/test";

test("percorso base: tema, bolletta e finanziamento", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Conviene davvero?" })).toBeVisible();
  const wasDark = (await page.locator("main").getAttribute("class"))?.includes("dark") ?? false;
  await page.getByRole("button", { name: "Cambia tema" }).click();
  if (wasDark) await expect(page.locator("main")).not.toHaveClass(/dark/);
  else await expect(page.locator("main")).toHaveClass(/dark/);

  await page.getByRole("tab", { name: "2. Dati" }).click();
  await page.getByRole("button", { name: "Aggiungi riga" }).click();
  await expect(page.getByLabel("Consumo kWh")).toBeVisible();
  await page.getByLabel("Consumo kWh").fill("320");
  await page.getByLabel("Totale euro").fill("130");
  await page.getByLabel("Quota energia euro").fill("92");

  await page.getByRole("tab", { name: "1. Progetto" }).click();
  await page.getByRole("button", { name: "Finanziamento" }).click();
  await expect(page.getByLabel("TAN")).toBeVisible();
  await page.getByLabel("TAN").fill("5");
  await page.getByLabel("TAEG").fill("6.2");
  await page.getByRole("tab", { name: "3. Analisi" }).click();
  await expect(page.getByText("Costo finanziamento")).toBeVisible();
});

test("gli endpoint PVGIS esposti dall'app restituiscono una simulazione", async ({ page }) => {
  const annual = await page.request.get("/api/solar?lat=44.49381&lon=11.33875&kwp=6&tilt=30&aspect=0&loss=14");
  expect(annual.ok()).toBeTruthy();
  const annualData = await annual.json();
  expect(annualData.annualKwh).toBeGreaterThan(1_000);

  const hourly = await page.request.get("/api/solar-hourly?lat=44.49381&lon=11.33875&kwp=6&tilt=30&aspect=0&loss=14&year=2020");
  expect(hourly.ok()).toBeTruthy();
  const hourlyData = await hourly.json();
  expect(hourlyData.hours.length).toBeGreaterThan(8_000);
});

test("layout mobile: i tab restano utilizzabili senza overflow della pagina", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "1. Progetto" })).toBeVisible();
  await page.getByRole("tab", { name: "3. Analisi" }).click();
  await expect(page.getByRole("button", { name: /Esporta analisi in PDF/ })).toBeVisible();
  const viewport = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(viewport.scroll).toBeLessThanOrEqual(viewport.width + 1);
});
