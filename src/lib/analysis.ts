export type PaymentMethod = "upfront" | "financed";

export type InvestmentInput = {
  quoteAmount: number;
  useTaxCredit: boolean;
  paymentMethod: PaymentMethod;
  monthlyPayment: number;
  installments: number;
  annualSavings: number;
};

export type BillRecord = {
  id: string;
  startDate: string;
  endDate: string;
  consumptionKwh: number;
  totalAmount: number;
  provider?: string;
  source?: "manual" | "csv" | "pdf";
};

function money(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function buildInvestmentSummary(input: InvestmentInput) {
  const quoteAmount = money(input.quoteAmount);
  const outOfPocketCost =
    input.paymentMethod === "financed"
      ? money(input.monthlyPayment) * Math.max(0, Math.round(input.installments))
      : quoteAmount;
  const financingCost = Math.max(0, outOfPocketCost - quoteAmount);
  const totalTaxCredit = input.useTaxCredit ? quoteAmount * 0.5 : 0;
  const annualTaxCredit = totalTaxCredit / 10;
  const netCostAfterTaxCredit = Math.max(0, outOfPocketCost - totalTaxCredit);
  const annualSavings = money(input.annualSavings);

  return {
    outOfPocketCost,
    financingCost,
    totalTaxCredit,
    annualTaxCredit,
    netCostAfterTaxCredit,
    simplePaybackYears:
      annualSavings > 0 ? netCostAfterTaxCredit / annualSavings : null,
  };
}

function dateAtMidnight(value: string) {
  const date = new Date(`${value}T00:00:00`);
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
    return (
      days !== null &&
      Number.isFinite(bill.consumptionKwh) &&
      bill.consumptionKwh >= 0 &&
      Number.isFinite(bill.totalAmount) &&
      bill.totalAmount >= 0
    );
  });
  const totalConsumptionKwh = valid.reduce(
    (sum, bill) => sum + bill.consumptionKwh,
    0,
  );
  const totalAmount = valid.reduce((sum, bill) => sum + bill.totalAmount, 0);
  const totalDays = valid.reduce(
    (sum, bill) => sum + (daysInBillingPeriod(bill.startDate, bill.endDate) ?? 0),
    0,
  );

  return {
    validBills: valid.length,
    totalConsumptionKwh,
    totalAmount,
    totalDays,
    averageDailyConsumptionKwh:
      totalDays > 0 ? totalConsumptionKwh / totalDays : 0,
    averageMonthlyConsumptionKwh:
      totalDays > 0 ? (totalConsumptionKwh / totalDays) * 30.4375 : 0,
    averageEnergyCostPerKwh:
      totalConsumptionKwh > 0 ? totalAmount / totalConsumptionKwh : 0,
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
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits }).format(value);
}
