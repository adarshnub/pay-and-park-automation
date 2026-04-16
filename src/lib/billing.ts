import { differenceInMinutes } from "date-fns";

export interface BillingInput {
  checkInAt: Date;
  checkOutAt: Date;
  hourlyRate: number;
  minimumCharge: number;
  gracePeriodMinutes?: number;
  dailyCap?: number | null;
}

export interface BillingResult {
  durationMinutes: number;
  billableHours: number;
  calculatedAmount: number;
  finalAmount: number;
  breakdown: string;
}

/**
 * final = max(minimumCharge, ceil(durationHours) * hourlyRate)
 * capped at dailyCap if set.
 * Grace period: if total duration <= grace minutes, charge minimum only.
 */
export function calculateBill(input: BillingInput): BillingResult {
  const durationMinutes = differenceInMinutes(input.checkOutAt, input.checkInAt);
  const gracePeriod = input.gracePeriodMinutes ?? 0;

  if (durationMinutes <= gracePeriod) {
    return {
      durationMinutes,
      billableHours: 0,
      calculatedAmount: 0,
      finalAmount: input.minimumCharge,
      breakdown: `Duration: ${durationMinutes}m (within ${gracePeriod}m grace period). Minimum charge applied.`,
    };
  }

  const billableHours = Math.ceil(durationMinutes / 60);
  const calculatedAmount = billableHours * input.hourlyRate;
  let finalAmount = Math.max(calculatedAmount, input.minimumCharge);

  if (input.dailyCap && finalAmount > input.dailyCap) {
    finalAmount = input.dailyCap;
  }

  const parts: string[] = [
    `Duration: ${durationMinutes}m (${billableHours}h rounded up)`,
    `Rate: ${input.hourlyRate}/hr`,
    `Calculated: ${calculatedAmount}`,
  ];
  if (calculatedAmount < input.minimumCharge) {
    parts.push(`Minimum charge applied: ${input.minimumCharge}`);
  }
  if (input.dailyCap && calculatedAmount > input.dailyCap) {
    parts.push(`Daily cap applied: ${input.dailyCap}`);
  }

  return {
    durationMinutes,
    billableHours,
    calculatedAmount,
    finalAmount,
    breakdown: parts.join(". ") + ".",
  };
}
