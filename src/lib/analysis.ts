export type PaymentMethod = "upfront" | "financed";

export type InvestmentInput = {
  quoteAmount: number;
  useTaxCredit: boolean;
  paymentMethod: PaymentMethod;
  monthlyPayment: number;
  installments: number;
  annualSavings: number;
  downPayment?: number;
  tanPct?: number;
  taegPct?: number;
  degradationPct?: number;
  maintenanceAnnual?: number;
  insuranceAnnual?: number;
  analysisYears?: number;
};

export type BillRecord = {
  id: string;
  startDate: string;
  endDate: string;
  consumptionKwh: number;
  totalAmount: number;
  energyAmount?: number;
  fixedAmount?: number;
  provider?: string;
  source?: "manual" | "csv" | "pdf";
};

export type HourlyEnergyRecord = {
  timestamp: string;
  kwh: number;
};

export type MapPoint = { x: number; y: number };

export type RoofEstimate = {
  footprintAreaM2: number;
  roofPlaneAreaM2: number;
  usableAreaM2: number;
  suggestedKwp: number;
  azimuthDegrees: number;
  pvgisAspect: number;
};

export type RoofEstimateInput = {
  scaleStart?: MapPoint;
  scaleEnd?: MapPoint;
  scaleMeters: number;
  northStart?: MapPoint;
  northEnd?: MapPoint;
  roofPolygon: MapPoint[];
  fallStart?: MapPoint;
  fallEnd?: MapPoint;
  tilt: number;
  usableRoofPct: number;
  panelDensityWpM2: number;
};

function money(value: number | undefined) {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

function pointDistance(first: MapPoint, second: MapPoint) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function polygonArea(points: MapPoint[]) {
  return Math.abs(points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2);
}

function screenBearing(start: MapPoint, end: MapPoint) {
  return ((Math.atan2(end.x - start.x, -(end.y - start.y)) * 180) / Math.PI + 360) % 360;
}

function normalizeSignedAngle(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

export function deriveRoofEstimate(input: RoofEstimateInput): RoofEstimate | null {
  const { scaleStart, scaleEnd, northStart, northEnd, fallStart, fallEnd } = input;
  if (!scaleStart || !scaleEnd || !northStart || !northEnd || !fallStart || !fallEnd || input.roofPolygon.length < 3) return null;
  const scaleLength = pointDistance(scaleStart, scaleEnd);
  const northLength = pointDistance(northStart, northEnd);
  const fallLength = pointDistance(fallStart, fallEnd);
  const footprintPixels = polygonArea(input.roofPolygon);
  if (!scaleLength || !northLength || !fallLength || !footprintPixels || !Number.isFinite(input.scaleMeters) || input.scaleMeters <= 0) return null;
  const metersPerUnit = input.scaleMeters / scaleLength;
  const footprintAreaM2 = footprintPixels * metersPerUnit ** 2;
  const tiltRadians = Math.max(0, Math.min(75, input.tilt || 0)) * Math.PI / 180;
  const roofPlaneAreaM2 = footprintAreaM2 / Math.cos(tiltRadians);
  const usableAreaM2 = roofPlaneAreaM2 * Math.max(0, Math.min(100, input.usableRoofPct)) / 100;
  const suggestedKwp = usableAreaM2 * Math.max(0, input.panelDensityWpM2) / 1000;
  const northBearing = screenBearing(northStart, northEnd);
  const fallBearing = screenBearing(fallStart, fallEnd);
  const azimuthDegrees = (fallBearing - northBearing + 360) % 360;
  return {
    footprintAreaM2,
    roofPlaneAreaM2,
    usableAreaM2,
    suggestedKwp,
    azimuthDegrees,
    pvgisAspect: normalizeSignedAngle(azimuthDegrees - 180),
  };
}

export function calculateMonthlyPayment(principal: number, tanPct: number, installments: number) {
  const amount = money(principal);
  const months = Math.max(0, Math.round(installments));
  const monthlyRate = money(tanPct) / 100 / 12;
  if (!amount || !months) return 0;
  if (!monthlyRate) return amount / months;
  return (amount * monthlyRate) / (1 - (1 + monthlyRate) ** -months);
}

export function buildInvestmentSummary(input: InvestmentInput) {
  const quoteAmount = money(input.quoteAmount);
  const downPayment = input.paymentMethod === "financed" ? Math.min(quoteAmount, money(input.downPayment)) : quoteAmount;
  const financedPrincipal = Math.max(0, quoteAmount - downPayment);
  const installments = Math.max(0, Math.round(input.installments));
  const outOfPocketCost =
    input.paymentMethod === "financed"
      ? downPayment + money(input.monthlyPayment) * installments
      : quoteAmount;
  const financingCost = Math.max(0, outOfPocketCost - quoteAmount);
  const totalTaxCredit = input.useTaxCredit ? quoteAmount * 0.5 : 0;
  const annualTaxCredit = totalTaxCredit / 10;
  const netCostAfterTaxCredit = Math.max(0, outOfPocketCost - totalTaxCredit);
  const annualSavings = money(input.annualSavings);
  const annualOperatingCost = money(input.maintenanceAnnual) + money(input.insuranceAnnual);
  const analysisYears = Math.max(1, Math.round(input.analysisYears ?? 25));
  const degradationRate = Math.min(0.2, money(input.degradationPct) / 100);

  let cumulativeCashFlow = -outOfPocketCost;
  let dynamicPaybackYears: number | null = null;
  const annualCashFlows = Array.from({ length: analysisYears }, (_, index) => {
    const year = index + 1;
    const savingsAfterDegradation = annualSavings * (1 - degradationRate) ** index;
    const taxCredit = year <= 10 ? annualTaxCredit : 0;
    const netCashFlow = savingsAfterDegradation + taxCredit - annualOperatingCost;
    const before = cumulativeCashFlow;
    cumulativeCashFlow += netCashFlow;
    if (dynamicPaybackYears === null && cumulativeCashFlow >= 0 && netCashFlow > 0) {
      dynamicPaybackYears = index + Math.max(0, -before) / netCashFlow;
    }
    return { year, savingsAfterDegradation, taxCredit, operatingCost: annualOperatingCost, netCashFlow, cumulativeCashFlow };
  });

  return {
    outOfPocketCost,
    downPayment,
    financedPrincipal,
    financingCost,
    totalTaxCredit,
    annualTaxCredit,
    netCostAfterTaxCredit,
    annualOperatingCost,
    referenceMonthlyPayment: calculateMonthlyPayment(financedPrincipal, money(input.tanPct), installments),
    simplePaybackYears: annualSavings > 0 ? netCostAfterTaxCredit / annualSavings : null,
    dynamicPaybackYears,
    cashFlowAfterAnalysisYears: cumulativeCashFlow,
    annualCashFlows,
  };
}

function dateAtMidnight(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function daysInBillingPeriod(startDate: string, endDate: string) {
  const start = dateAtMidnight(startDate);
  const end = dateAtMidnight(endDate);
  if (!start || !end || end < start) return null;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export function summarizeBills(bills: BillRecord[]) {
  const valid = bills.filter((bill) => {
    const days = daysInBillingPeriod(bill.startDate, bill.endDate);
    return days !== null && Number.isFinite(bill.consumptionKwh) && bill.consumptionKwh >= 0 && Number.isFinite(bill.totalAmount) && bill.totalAmount >= 0;
  });
  const totalConsumptionKwh = valid.reduce((sum, bill) => sum + bill.consumptionKwh, 0);
  const totalAmount = valid.reduce((sum, bill) => sum + bill.totalAmount, 0);
  const variableEnergyAmount = valid.reduce((sum, bill) => sum + (Number.isFinite(bill.energyAmount) ? money(bill.energyAmount) : money(bill.totalAmount)), 0);
  const fixedAmount = valid.reduce((sum, bill) => sum + (Number.isFinite(bill.fixedAmount) ? money(bill.fixedAmount) : 0), 0);
  const totalDays = valid.reduce((sum, bill) => sum + (daysInBillingPeriod(bill.startDate, bill.endDate) ?? 0), 0);
  const billsWithEnergyBreakdown = valid.filter((bill) => Number.isFinite(bill.energyAmount)).length;

  return {
    validBills: valid.length,
    totalConsumptionKwh,
    totalAmount,
    variableEnergyAmount,
    fixedAmount,
    billsWithEnergyBreakdown,
    usesEstimatedVariablePrice: valid.length > 0 && billsWithEnergyBreakdown < valid.length,
    totalDays,
    averageDailyConsumptionKwh: totalDays > 0 ? totalConsumptionKwh / totalDays : 0,
    averageMonthlyConsumptionKwh: totalDays > 0 ? (totalConsumptionKwh / totalDays) * 30.4375 : 0,
    averageEnergyCostPerKwh: totalConsumptionKwh > 0 ? totalAmount / totalConsumptionKwh : 0,
    averageVariableEnergyCostPerKwh: totalConsumptionKwh > 0 ? variableEnergyAmount / totalConsumptionKwh : 0,
  };
}

function normalizedTimeKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  return `${month}-${day}-${hour}`;
}

export function simulateHourlyAutoconsumption(
  consumption: HourlyEnergyRecord[],
  production: HourlyEnergyRecord[],
  batteryCapacityKwh: number,
) {
  const solarByKey = new Map<string, number>();
  for (const item of production) {
    const key = normalizedTimeKey(item.timestamp);
    if (key) solarByKey.set(key, (solarByKey.get(key) ?? 0) + money(item.kwh));
  }
  let batteryState = 0;
  const capacity = money(batteryCapacityKwh);
  const chargeEfficiency = Math.sqrt(0.9);
  const dischargeEfficiency = Math.sqrt(0.9);
  let totalLoad = 0;
  let totalProduction = 0;
  let directSelfConsumed = 0;
  let batteryDelivered = 0;
  let exported = 0;
  let gridImported = 0;

  for (const item of [...consumption].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    const key = normalizedTimeKey(item.timestamp);
    const load = money(item.kwh);
    const solar = key ? money(solarByKey.get(key)) : 0;
    totalLoad += load;
    totalProduction += solar;
    const direct = Math.min(load, solar);
    directSelfConsumed += direct;
    let remainingLoad = load - direct;
    let surplus = solar - direct;
    const fromBattery = Math.min(remainingLoad, batteryState * dischargeEfficiency);
    batteryDelivered += fromBattery;
    batteryState -= fromBattery / dischargeEfficiency;
    remainingLoad -= fromBattery;
    if (capacity > 0 && surplus > 0) {
      const storableBeforeEfficiency = Math.min(surplus, (capacity - batteryState) / chargeEfficiency);
      batteryState += storableBeforeEfficiency * chargeEfficiency;
      surplus -= storableBeforeEfficiency;
    }
    exported += surplus;
    gridImported += remainingLoad;
  }

  const selfConsumed = directSelfConsumed + batteryDelivered;
  return {
    totalLoad,
    totalProduction,
    directSelfConsumed,
    batteryDelivered,
    selfConsumed,
    exported,
    gridImported,
    selfConsumptionPct: totalProduction > 0 ? (selfConsumed / totalProduction) * 100 : 0,
    selfSufficiencyPct: totalLoad > 0 ? (selfConsumed / totalLoad) * 100 : 0,
  };
}

export function pearsonCorrelation(first: number[], second: number[]) {
  if (first.length !== second.length || first.length < 3) return null;
  if (![...first, ...second].every(Number.isFinite)) return null;
  const firstMean = first.reduce((sum, value) => sum + value, 0) / first.length;
  const secondMean = second.reduce((sum, value) => sum + value, 0) / second.length;
  let covariance = 0;
  let firstVariance = 0;
  let secondVariance = 0;
  for (let index = 0; index < first.length; index += 1) {
    const firstDelta = first[index] - firstMean;
    const secondDelta = second[index] - secondMean;
    covariance += firstDelta * secondDelta;
    firstVariance += firstDelta * firstDelta;
    secondVariance += secondDelta * secondDelta;
  }
  const denominator = Math.sqrt(firstVariance * secondVariance);
  return denominator === 0 ? null : covariance / denominator;
}

export function correlationLabel(value: number | null) {
  if (value === null) return "Dati insufficienti";
  const magnitude = Math.abs(value);
  const strength = magnitude >= 0.7 ? "forte" : magnitude >= 0.4 ? "moderata" : "debole";
  const direction = value > 0 ? "diretta" : value < 0 ? "inversa" : "assente";
  return direction === "assente" ? "Assente" : `${strength}, ${direction}`;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

export function formatNumber(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits }).format(value);
}
