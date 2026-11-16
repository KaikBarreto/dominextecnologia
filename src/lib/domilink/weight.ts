import type { DomiLinkScaleReading } from './types';

export function canUseDomiLinkWeight(unit?: string | null) {
  return ['kg', 'g'].includes(unit?.trim().toLowerCase() ?? '');
}

export function domiLinkWeightQuantity(reading: DomiLinkScaleReading, unit: string | null | undefined, available: number) {
  if (!canUseDomiLinkWeight(unit)) throw new Error('A balança só pode preencher materiais em kg ou g.');
  if (reading.unit !== 'kg' || !reading.stable || !Number.isFinite(reading.weight_kg) || reading.weight_kg <= 0) throw new Error('Aguarde um peso positivo e estável na balança.');
  const quantity = Math.round(reading.weight_kg * (unit?.trim().toLowerCase() === 'g' ? 1000 : 1) * 1000) / 1000;
  if (quantity <= 0 || !Number.isFinite(available) || quantity > available) throw new Error('O peso supera o estoque disponível ou é pequeno demais para este material.');
  return quantity;
}
