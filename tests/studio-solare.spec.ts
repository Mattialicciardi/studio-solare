import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const fixture = (name: string) => path.join(process.cwd(), "tests", "fixtures", name);

async function clickRoofStage(page: Page, x: number, y: number) {
  const stage = page.getByTestId("roof-map-stage");
  const box = await stage.boundingBox();
  if (!box) throw new Error("Area di tracciamento non disponibile");
  await stage.click({ position: { x: box.width * x, y: box.height * y } });
}

test("regression: i campi numerici mantengono focus durante la digitazione", async ({ page }) => {
  await page.goto("/");
  const input = page.getByLabel("Potenza impianto");
  await input.click();
  await input.press("Meta+A");
  await input.pressSequentially("5.8");
  await expect(input).toHaveValue("5.8");
  await expect(input).toBeFocused();
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
    ["Autoconsumo manuale", "61"], ["Prezzo energia immessa", "0.11"], ["Area effettivamente utilizzabile", "78"], ["Densità pannelli", "205"],
  ]) {
    await page.getByLabel(label).fill(value);
    await expect(page.getByLabel(label)).toHaveValue(value);
  }

  await page.getByLabel("Screenshot mappa o planimetria").setInputFiles(fixture("roof-map.svg"));
  await expect(page.getByTestId("roof-map-stage")).toBeVisible();
  await page.getByLabel("Metri indicati dalla barra di scala").fill("10");
  await page.getByRole("button", { name: /1\. Barra di scala/ }).click();
  await clickRoofStage(page, 0.1, 0.1);
  await clickRoofStage(page, 0.35, 0.1);
  await page.getByRole("button", { name: /2\. Nord/ }).click();
  await clickRoofStage(page, 0.7, 0.55);
  await clickRoofStage(page, 0.7, 0.25);
  await page.getByRole("button", { name: /3\. Contorno falda/ }).click();
  for (const point of [{ x: 0.25, y: 0.3 }, { x: 0.6, y: 0.3 }, { x: 0.6, y: 0.7 }, { x: 0.25, y: 0.7 }]) {
    await clickRoofStage(page, point.x, point.y);
  }
  await page.getByRole("button", { name: /4\. Caduta falda/ }).click();
  await clickRoofStage(page, 0.45, 0.38);
  await clickRoofStage(page, 0.45, 0.64);
  await expect(page.getByText("Stima della falda selezionata")).toBeVisible();
  await page.getByRole("button", { name: "Usa azimut e potenza stimata" }).click();
  await expect(page.getByLabel("Azimut (sud = 0)")).toHaveValue("0");

  await page.getByLabel("Costo preventivo").fill("14000");
  await expect(page.getByLabel("Costo preventivo")).toHaveValue("14000");
  const taxCredit = page.getByRole("switch", { name: "Detrazione 50% in 10 anni" });
  await taxCredit.click();
  await expect(taxCredit).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "Finanziamento" }).click();
  for (const [label, value] of [["Anticipo", "2000"], ["Rata mensile", "160"], ["Numero rate", "96"], ["TAN", "4.7"], ["TAEG", "5.5"], ["Degrado annuo", "0.6"], ["Manutenzione annua", "150"], ["Assicurazione annua", "80"]]) {
    await page.getByLabel(label).fill(value);
    await expect(page.getByLabel(label)).toHaveValue(value);
  }
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
