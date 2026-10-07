import { describe, expect, it } from "vitest";
import {
  buildInvestmentSummary,
  calculateMonthlyPayment,
  buildFinancingPlan,
  estimateWithoutData,
  pearsonCorrelation,
  simulateHourlyAutoconsumption,
  summarizeBills,
  type BillRecord,
} from "./analysis";

describe("buildInvestmentSummary", () => {
  it("derives total instalment cost and financing premium from only payment and months", () => {
    const result = buildFinancingPlan({ quoteAmount: 10_000, monthlyPayment: 180, installments: 60 });
    expect(result.totalPaid).toBe(10_800);
    expect(result.financingCost).toBe(800);
    expect(result.monthlyPayment).toBe(180);
    expect(result.installments).toBe(60);
  });

  it("models the 50% tax credit over ten years on the eligible quote", () => {
    const result = buildInvestmentSummary({
      quoteAmount: 12_000,
      useTaxCredit: true,
      paymentMethod: "upfront",
      monthlyPayment: 0,
      installments: 0,
      annualSavings: 1_500,
    });
    expect(result.outOfPocketCost).toBe(12_000);
    expect(result.totalTaxCredit).toBe(6_000);
    expect(result.annualTaxCredit).toBe(600);
    expect(result.netCostAfterTaxCredit).toBe(6_000);
    expect(result.simplePaybackYears).toBe(4);
    expect(result.netProfitAfterAnalysisYears).toBeGreaterThan(0);
    expect(result.roiPct).toBeGreaterThan(0);
  });

  it("models real annual operating costs and production degradation", () => {
    const result = buildInvestmentSummary({
      quoteAmount: 10_000,
      useTaxCredit: false,
      paymentMethod: "upfront",
      monthlyPayment: 0,
      installments: 0,
      annualSavings: 1_000,
      degradationPct: 1,
      maintenanceAnnual: 100,
      insuranceAnnual: 50,
      analysisYears: 25,
    });
    expect(result.annualOperatingCost).toBe(150);
    expect(result.annualCashFlows[1].savingsAfterDegradation).toBeCloseTo(990, 4);
    expect(result.dynamicPaybackYears).toBeGreaterThan(10);
  });

  it("keeps the entered instalment plan while calculating a TAN reference payment", () => {
    const result = buildInvestmentSummary({
      quoteAmount: 10_000,
      useTaxCredit: false,
      paymentMethod: "financed",
      downPayment: 2_000,
      monthlyPayment: 180,
      installments: 60,
      tanPct: 5,
      annualSavings: 1_320,
    });
    expect(result.outOfPocketCost).toBe(12_800);
    expect(result.financedPrincipal).toBe(8_000);
    expect(result.referenceMonthlyPayment).toBeCloseTo(calculateMonthlyPayment(8_000, 5, 60), 6);
  });
});

describe("summarizeBills", () => {
  it("uses the energy component rather than fixed costs for avoided-energy value", () => {
    const bills: BillRecord[] = [
      { id: "jan", startDate: "2026-01-01", endDate: "2026-01-31", consumptionKwh: 310, totalAmount: 123, energyAmount: 93, fixedAmount: 30 },
      { id: "feb", startDate: "2026-02-01", endDate: "2026-02-28", consumptionKwh: 280, totalAmount: 114, energyAmount: 84, fixedAmount: 30 },
    ];
    const result = summarizeBills(bills);
    expect(result.totalConsumptionKwh).toBe(590);
    expect(result.averageDailyConsumptionKwh).toBeCloseTo(10, 4);
    expect(result.averageEnergyCostPerKwh).toBeCloseTo(0.4017, 4);
    expect(result.averageVariableEnergyCostPerKwh).toBeCloseTo(0.30, 4);
    expect(result.fixedAmount).toBe(60);
    expect(result.usesEstimatedVariablePrice).toBe(false);
  });
});

describe("simulateHourlyAutoconsumption", () => {
  it("uses a battery to shift solar surplus to an evening load", () => {
    const result = simulateHourlyAutoconsumption(
      [
        { timestamp: "2026-06-01T12:00:00Z", kwh: 1 },
        { timestamp: "2026-06-01T20:00:00Z", kwh: 2 },
      ],
      [
        { timestamp: "2020-06-01T12:00:00Z", kwh: 3 },
        { timestamp: "2020-06-01T20:00:00Z", kwh: 0 },
      ],
      2,
    );
    expect(result.directSelfConsumed).toBe(1);
    expect(result.batteryDelivered).toBeGreaterThan(1.7);
    expect(result.gridImported).toBeLessThan(0.3);
    expect(result.exported).toBeLessThan(0.2);
  });
});

describe("pearsonCorrelation", () => {
  it("detects an inverse relationship between sun exposure and daily consumption", () => {
    expect(pearsonCorrelation([2, 4, 6, 8], [16, 12, 8, 4])).toBeCloseTo(-1, 6);
  });
  it("returns null if data are insufficient or constant", () => {
    expect(pearsonCorrelation([1, 2], [3, 4])).toBeNull();
    expect(pearsonCorrelation([1, 1, 1], [3, 4, 5])).toBeNull();
  });
});

describe("estimateWithoutData", () => {
  it("returns a transparent production range instead of zero when bills and PVGIS are missing", () => {
    const result = estimateWithoutData(6);
    expect(result.lowProductionKwh).toBe(5_700);
    expect(result.baseProductionKwh).toBe(6_600);
    expect(result.highProductionKwh).toBe(7_500);
    expect(result.assumption).toContain("1.100");
  });
});
