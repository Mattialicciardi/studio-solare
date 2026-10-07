import { expect, it } from "vitest";
import { correlateBillsWithWeather, type WeatherDay } from "./weather";

it("aligns each bill period with mean daily weather and consumption", () => {
  const weather: WeatherDay[] = [
    { date: "2026-01-01", temperatureC: 4, radiationMj: 2, precipitationMm: 2 },
    { date: "2026-01-02", temperatureC: 6, radiationMj: 4, precipitationMm: 0 },
    { date: "2026-02-01", temperatureC: 12, radiationMj: 10, precipitationMm: 0 },
    { date: "2026-02-02", temperatureC: 14, radiationMj: 12, precipitationMm: 0 },
    { date: "2026-03-01", temperatureC: 20, radiationMj: 18, precipitationMm: 0 },
    { date: "2026-03-02", temperatureC: 22, radiationMj: 20, precipitationMm: 0 },
  ];

  const result = correlateBillsWithWeather(
    [
      { id: "cold", startDate: "2026-01-01", endDate: "2026-01-02", consumptionKwh: 24, totalAmount: 6 },
      { id: "warm", startDate: "2026-02-01", endDate: "2026-02-02", consumptionKwh: 12, totalAmount: 3 },
      { id: "hot", startDate: "2026-03-01", endDate: "2026-03-02", consumptionKwh: 6, totalAmount: 2 },
    ],
    weather,
  );

  expect(result.samples).toHaveLength(3);
  expect(result.samples[0].meanTemperatureC).toBe(5);
  expect(result.samples[0].meanRadiationMj).toBe(3);
  expect(result.samples[0].dailyConsumptionKwh).toBe(12);
  expect(result.temperatureCorrelation).toBeLessThan(-0.9);
  expect(result.radiationCorrelation).toBeLessThan(-0.9);
});
