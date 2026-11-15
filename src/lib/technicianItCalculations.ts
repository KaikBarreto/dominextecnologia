/** Prefixos SI/IEC: https://pml.nist.gov/cuu/Units/binary.html */
export const STORAGE_UNITS = ['MB', 'MiB', 'GB', 'GiB', 'TB', 'TiB'] as const;
export type StorageUnit = typeof STORAGE_UNITS[number];
const TO_BYTES: Record<StorageUnit, number> = {
  MB: 1_000_000, MiB: 1_048_576,
  GB: 1_000_000_000, GiB: 1_073_741_824,
  TB: 1_000_000_000_000, TiB: 1_099_511_627_776,
};
export const SPEED_UNITS = ['Kbps', 'Mbps', 'Gbps', 'KBps', 'MBps'] as const;
export type SpeedUnit = typeof SPEED_UNITS[number];
// Prefixos decimais para taxas. B = byte (8 bits); b = bit.
const TO_BPS: Record<SpeedUnit, number> = {
  Kbps: 1_000, KBps: 8_000, Mbps: 1_000_000,
  MBps: 8_000_000, Gbps: 1_000_000_000,
};

export function convertStorage(value: number, from: StorageUnit, to: StorageUnit): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const result = value * (TO_BYTES[from] / TO_BYTES[to]);
  return Number.isFinite(result) ? result : null;
}

export function convertSpeed(value: number, from: SpeedUnit, to: SpeedUnit): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const result = value * (TO_BPS[from] / TO_BPS[to]);
  return Number.isFinite(result) ? result : null;
}

/** Retorna segundos sem arredondar; apenas a apresentação escolhe a precisão. */
export function transferTimeSeconds(fileSizeMB: number, speed: number, unit: SpeedUnit): number | null {
  if (![fileSizeMB, speed].every(Number.isFinite) || fileSizeMB <= 0 || speed <= 0) return null;
  const seconds = (fileSizeMB / speed) * (8_000_000 / TO_BPS[unit]);
  return Number.isFinite(seconds) ? seconds : null;
}

export const PSU_PER_UNIT_W = { ramSticks: 5, hdds: 10, ssds: 3, coolers: 10 } as const;
export interface PsuComponents {
  cpuW: number;
  gpuW: number;
  moboW: number;
  ramSticks: number;
  hdds: number;
  ssds: number;
  coolers: number;
}

/** Faixas da ferramenta, não um limite para a potência necessária. */
export function roundUpPsu(watts: number): number | null {
  if (!Number.isFinite(watts) || watts <= 0) return null;
  return [350, 450, 550, 650, 750, 850, 1000, 1200, 1600].find((tier) => tier >= watts) ?? null;
}

export function estimatePsu(components: PsuComponents) {
  if (!Object.values(components).every((value) => Number.isFinite(value) && value >= 0)) return null;
  if (!Object.keys(PSU_PER_UNIT_W).every((key) => Number.isInteger(components[key as keyof typeof PSU_PER_UNIT_W]))) return null;
  const totalW = components.cpuW + components.gpuW + components.moboW
    + Object.entries(PSU_PER_UNIT_W).reduce((sum, [key, watts]) => sum + components[key as keyof typeof PSU_PER_UNIT_W] * watts, 0);
  const recW = Math.ceil(totalW * 1.3);
  if (!Number.isFinite(recW) || totalW <= 0) return null;
  return { totalW, recW, psuSize: roundUpPsu(recW) };
}
