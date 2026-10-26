import type { TipoAjuste } from '../types';

type NumericInput = number | string | null | undefined;

const toFiniteNumber = (value: NumericInput): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string' || value.trim() === '') return 0;

  const normalizedValue = value.includes(',')
    ? value.replace(/\./g, '').replace(',', '.')
    : value;
  const numericValue = Number(normalizedValue);

  return Number.isFinite(numericValue) ? numericValue : 0;
};

export const calculateAdjustmentAmount = (
  value: NumericInput,
  type: TipoAjuste | string | null | undefined,
  base: NumericInput,
): number => {
  const numericValue = toFiniteNumber(value);
  if (type !== 'porcentagem') return numericValue;

  return (toFiniteNumber(base) * numericValue) / 100;
};
