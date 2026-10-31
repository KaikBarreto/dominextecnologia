import { formatDate } from '@/lib/format';

/**
 * Normaliza os formatos historicamente gravados pelos campos Sim/Não de
 * equipamento. O formulário atual persiste `sim`/`nao`, mas integrações e
 * dados legados também podem trazer booleanos, números ou strings booleanas.
 */
export function isEquipmentBooleanTrue(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value !== 'string') return false;

  const normalized = value.trim().toLowerCase();
  return normalized === 'sim' || normalized === 'true' || normalized === '1';
}

/** Formata um campo `date-only` sem convertê-lo primeiro para meia-noite UTC. */
export function formatEquipmentDate(
  value: unknown,
  locale: Parameters<typeof formatDate>[1],
  timezone: string,
): string {
  return formatDate(String(value ?? ''), locale, timezone);
}
