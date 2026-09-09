/**
 * domain/salary.ts — Salary data types
 */

export interface SalaryData {
  title: string;
  region: string;
  min?: number;
  max?: number;
  median?: number;
  currency: string;
  source?: string;
  year?: number;
}

export interface SalaryRange {
  min: number;
  max: number;
  median: number;
  currency: string;
}
