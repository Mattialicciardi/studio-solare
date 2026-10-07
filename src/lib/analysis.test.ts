import { describe, expect, it } from "vitest";
import {
  buildInvestmentSummary,
  pearsonCorrelation,
  summarizeBills,
  type BillRecord,
} from "./analysis";

describe("buildInvestmentSummary", () => {
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
  });

  it("uses the total instalments paid for a financed purchase", () => {
    const result = buildInvestmentSummary({
      quoteAmount: 10_000,
      useTaxCredit: false,
      paymentMethod: "financed",
      monthlyPayment: 220,
      installments: 60,
      annualSavings: 1_320,
    });

    expect(result.outOfPocketCost).toBe(13_200);
    expect(result.financingCost).toBe(3_200);
    expect(result.netCostAfterTaxCredit).toBe(13_200);
    expect(result.simplePaybackYears).toBe(10);
  });
});

describe("summarizeBills", () => {
  it("normalizes consumption and cost by calendar day", () => {
    const bills: BillRecord[] = [
      { id: "jan", startDate: "2026-01-01", endDate: "2026-01-31", consumptionKwh: 310, totalAmount: 93 },
      { id: "feb", startDate: "2026-02-01", endDate: "2026-02-28", consumptionKwh: 280, totalAmount: 84 },
    ];

    const result = summarizeBills(bills);

    expect(result.totalConsumptionKwh).toBe(590);
    expect(result.averageDailyConsumptionKwh).toBeCloseTo(10, 4);
    expect(result.averageEnergyCostPerKwh).toBeCloseTo(0.30, 4);
  });
});

describe("pearsonCorrelation", () => {
  it("detects an inverse relationship between sun exposure and daily consumption", () => {
    const result = pearsonCorrelation([2, 4, 6, 8], [16, 12, 8, 4]);
    expect(result).toBeCloseTo(-1, 6);
  });

  it("returns null if data are insufficient or constant", () => {
    expect(pearsonCorrelation([1, 2], [3, 4])).toBeNull();
    expect(pearsonCorrelation([1, 1, 1], [3, 4, 5])).toBeNull();
  });
});
