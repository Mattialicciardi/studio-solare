import { daysInBillingPeriod, pearsonCorrelation, type BillRecord } from "./analysis";

export type WeatherDay = {
  date: string;
  temperatureC: number;
  radiationMj: number;
  precipitationMm: number;
};

export type WeatherBillSample = {
  billId: string;
  startDate: string;
  endDate: string;
  dailyConsumptionKwh: number;
  meanTemperatureC: number;
  meanRadiationMj: number;
  totalPrecipitationMm: number;
};

export function correlateBillsWithWeather(
  bills: BillRecord[],
  weatherDays: WeatherDay[],
) {
  const weatherByDate = new Map(weatherDays.map((day) => [day.date, day]));
  const samples: WeatherBillSample[] = [];

  for (const bill of bills) {
    const periodDays = daysInBillingPeriod(bill.startDate, bill.endDate);
    if (!periodDays || bill.consumptionKwh < 0) continue;

    const start = new Date(`${bill.startDate}T00:00:00Z`);
    const matching: WeatherDay[] = [];
    for (let offset = 0; offset < periodDays; offset += 1) {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + offset);
      const key = date.toISOString().slice(0, 10);
      const day = weatherByDate.get(key);
      if (day) matching.push(day);
    }

    if (matching.length !== periodDays) continue;
    const average = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;

    samples.push({
      billId: bill.id,
      startDate: bill.startDate,
      endDate: bill.endDate,
      dailyConsumptionKwh: bill.consumptionKwh / periodDays,
      meanTemperatureC: average(matching.map((day) => day.temperatureC)),
      meanRadiationMj: average(matching.map((day) => day.radiationMj)),
      totalPrecipitationMm: matching.reduce(
        (sum, day) => sum + day.precipitationMm,
        0,
      ),
    });
  }

  const consumption = samples.map((sample) => sample.dailyConsumptionKwh);
  return {
    samples,
    temperatureCorrelation: pearsonCorrelation(
      consumption,
      samples.map((sample) => sample.meanTemperatureC),
    ),
    radiationCorrelation: pearsonCorrelation(
      consumption,
      samples.map((sample) => sample.meanRadiationMj),
    ),
    precipitationCorrelation: pearsonCorrelation(
      consumption,
      samples.map((sample) => sample.totalPrecipitationMm),
    ),
  };
}
