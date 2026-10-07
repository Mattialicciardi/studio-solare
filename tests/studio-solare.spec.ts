import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const fixture = (name: string) => path.join(process.cwd(), "tests", "fixtures", name);


test("regression: i campi numerici mantengono focus durante la digitazione", async ({ page }) => {
  await page.goto("/");
  const input = page.getByLabel("Potenza impianto");
  await input.click();
  await input.press("Meta+A");
  await input.pressSequentially("5.8");
  await expect(input).toHaveValue("5.8");
  await expect(input).toBeFocused();
});

test("regression: i campi numerici consentono di cancellare e riscrivere un valore", async ({ page }) => {
  await page.goto("/");
  const input = page.getByLabel("Batteria");
  await input.click();
  await input.press("Meta+A");
  await input.press("Backspace");
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await input.pressSequentially("6.25");
  await expect(input).toHaveValue("6.25");
});

test("il percorso di simulazione rende visibili prerequisiti e risultati", async ({ page }) => {
  await page.goto("/");
  const status = page.getByLabel("Stato del percorso");
  await expect(status).toContainText("Località da impostare");
  await expect(status).toContainText("Fascia iniziale pronta");
  await page.getByLabel("Località").fill("Bologna, Italia");
  const geocode = page.waitForResponse((response) => response.url().includes("/api/geocode?") && response.status() === 200);
  await page.getByRole("button", { name: "Cerca" }).click();
  await geocode;
  await expect(status).toContainText("Località pronta");
  const solar = page.waitForResponse((response) => response.url().includes("/api/solar?") && response.status() === 200);
  await page.getByRole("button", { name: "Calcola produzione annua" }).click();
  await solar;
  await expect(status).toContainText("Simulazione PVGIS pronta");
});

test("tutti i campi di progetto, finanza e rilievo sono modificabili", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Conviene davvero?" })).toBeVisible();

  await page.getByLabel("Località").fill("Bologna, Italia");
  await expect(page.getByLabel("Località")).toHaveValue("Bologna, Italia");
  await page.getByLabel("Potenza impianto").fill("5.8");
  await page.getByLabel("Batteria").fill("7.5");
  await expect(page.getByLabel("Potenza impianto")).toHaveValue("5.8");
  await expect(page.getByLabel("Batteria")).toHaveValue("7.5");

  await page.getByRole("switch", { name: "Controlli avanzati" }).click();
  await expect(page.getByLabel("Inclinazione")).toBeVisible();
  for (const [label, value] of [
    ["Inclinazione", "27"], ["Azimut (sud = 0)", "-15"], ["Perdite impianto", "12"], ["Ombra stimata", "8"],
    ["Autoconsumo manuale", "61"], ["Prezzo energia immessa", "0.11"],
  ]) {
    await page.getByLabel(label).fill(value);
    await expect(page.getByLabel(label)).toHaveValue(value);
  }

  await page.getByLabel("Costo preventivo").fill("14000");
  await expect(page.getByLabel("Costo preventivo")).toHaveValue("14000");
  const taxCredit = page.getByRole("switch", { name: "Detrazione 50% in 10 anni" });
  await taxCredit.click();
  await expect(taxCredit).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "Finanziamento" }).click();
  for (const [label, value] of [["Rata mensile", "160"], ["Durata complessiva", "96"]]) {
    await page.getByLabel(label).fill(value);
    await expect(page.getByLabel(label)).toHaveValue(value);
  }
  await expect(page.locator("p").filter({ hasText: "Totale rate" }).first()).toBeVisible();
  await expect(page.locator("p").filter({ hasText: "Costo finanziamento" }).first()).toBeVisible();
});

test("tutti i campi bolletta e gli import file aggiornano i dati locali", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "2. Dati" }).click();
  await page.getByRole("button", { name: "Aggiungi riga" }).click();
  for (const [label, value] of [["Data inizio", "2026-01-01"], ["Data fine", "2026-01-31"], ["Consumo kWh", "320"], ["Totale euro", "130"], ["Quota energia euro", "92"], ["Costi fissi euro", "38"]]) {
    await page.getByLabel(label).fill(value);
    await expect(page.getByLabel(label)).toHaveValue(value);
  }
  const imports = page.locator('input[type="file"]');
  await imports.nth(0).setInputFiles(fixture("bills.csv"));
  await expect(page.getByText("csv").first()).toBeVisible();
  await imports.nth(1).setInputFiles(fixture("hourly-load.csv"));
  await expect(page.getByText(/24 letture orarie importate/)).toBeVisible();
});

test("regression: le celle numeriche delle bollette si possono cancellare e riscrivere", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "2. Dati" }).click();
  await page.getByRole("button", { name: "Aggiungi riga" }).click();
  const input = page.getByLabel("Consumo kWh");
  await input.click();
  await input.press("Meta+A");
  await input.press("Backspace");
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await input.pressSequentially("321.5");
  await expect(input).toHaveValue("321.5");
});

test("audit: ogni campo numerico visibile si cancella e si riscrive senza perdere il focus", async ({ page }) => {
  const rewrite = async (input: ReturnType<Page["locator"]>) => {
    await input.click();
    await input.press("Meta+A");
    await input.press("Backspace");
    await expect(input).toHaveValue("");
    await expect(input).toBeFocused();
    await input.pressSequentially("12.5");
    await expect(input).toHaveValue("12.5");
  };
  await page.goto("/");
  const location = page.getByLabel("Località");
  await location.click();
  await location.press("Meta+A");
  await location.press("Backspace");
  await expect(location).toHaveValue("");
  await location.pressSequentially("Bologna, Italia");
  await expect(location).toHaveValue("Bologna, Italia");

  await page.getByRole("switch", { name: "Controlli avanzati" }).click();
  await page.getByRole("button", { name: "Finanziamento" }).click();
  const projectInputs = page.locator('input[type="number"]:visible');
  const projectCount = await projectInputs.count();
  expect(projectCount).toBeGreaterThan(10);
  for (let index = 0; index < projectCount; index += 1) await rewrite(projectInputs.nth(index));

  await page.getByRole("tab", { name: "2. Dati" }).click();
  await page.getByRole("button", { name: "Aggiungi riga" }).click();
  const billInputs = page.locator('input[type="number"]:visible');
  await expect(billInputs).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) await rewrite(billInputs.nth(index));
});

test("i processi principali restituiscono risultati visibili", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Località").fill("Bologna, Italia");
  const geocode = page.waitForResponse((response) => response.url().includes("/api/geocode?") && response.status() === 200);
  await page.getByRole("button", { name: "Cerca" }).click();
  await geocode;
  await expect(page.getByText("Bologna, Emilia-Romagna, Italia", { exact: true }).first()).toBeVisible();

  const solar = page.waitForResponse((response) => response.url().includes("/api/solar?") && response.status() === 200);
  await page.getByRole("button", { name: "Calcola produzione annua" }).click();
  await solar;
  await page.getByRole("tab", { name: "3. Analisi" }).click();
  await expect(page.getByText("Produzione simulata").locator("..").getByText(/kWh\/anno/)).toBeVisible();

  await page.getByRole("tab", { name: "2. Dati" }).click();
  const imports = page.locator('input[type="file"]');
  await imports.nth(0).setInputFiles(fixture("bills.csv"));
  await page.getByRole("button", { name: "Aggiungi riga" }).click();
  const starts = page.getByLabel("Data inizio");
  const ends = page.getByLabel("Data fine");
  const consumption = page.getByLabel("Consumo kWh");
  await starts.last().fill("2026-03-01");
  await ends.last().fill("2026-03-31");
  await consumption.last().fill("295");
  const weather = page.waitForResponse((response) => response.url().includes("/api/weather?") && response.status() === 200);
  await page.getByRole("button", { name: "Calcola correlazioni" }).click();
  await weather;
  await page.getByRole("tab", { name: "3. Analisi" }).click();
  await expect(page.getByText("Produzione e clima")).toBeVisible();

  await page.getByRole("tab", { name: "2. Dati" }).click();
  await imports.nth(1).setInputFiles(fixture("hourly-load.csv"));
  const hourly = page.waitForResponse((response) => response.url().includes("/api/solar-hourly?") && response.status() === 200);
  await page.getByRole("button", { name: "Simula autoconsumo reale" }).click();
  await hourly;
  await expect(page.getByText(/profilo PVGIS 2020 pronto/)).toBeVisible();
});

test("l'esportazione PDF apre un report stampabile", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "3. Analisi" }).click();
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Esporta analisi in PDF" }).click();
  const report = await popupPromise;
  await report.waitForLoadState("domcontentloaded");
  await expect(report).toHaveTitle("Studio Solare — Analisi");
  await expect(report.getByRole("heading", { name: "Studio Solare" })).toBeVisible();
});

test("tema, tab, endpoint PVGIS e layout mobile restano funzionanti", async ({ page }) => {
  await page.goto("/");
  const wasDark = (await page.locator("main").getAttribute("class"))?.includes("dark") ?? false;
  await page.getByRole("button", { name: "Cambia tema" }).click();
  if (wasDark) await expect(page.locator("main")).not.toHaveClass(/dark/);
  else await expect(page.locator("main")).toHaveClass(/dark/);

  await page.getByRole("tab", { name: "3. Analisi" }).click();
  await expect(page.getByRole("button", { name: /Esporta analisi in PDF/ })).toBeVisible();
  const viewport = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(viewport.scroll).toBeLessThanOrEqual(viewport.width + 1);

  const annual = await page.request.get("/api/solar?lat=44.49381&lon=11.33875&kwp=6&tilt=30&aspect=0&loss=14");
  expect(annual.ok()).toBeTruthy();
  expect((await annual.json()).annualKwh).toBeGreaterThan(1_000);
});
