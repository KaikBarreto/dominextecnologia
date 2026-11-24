import { describe, expect, it } from 'vitest';
import { convertSpeed, convertStorage, estimatePsu, roundUpPsu, transferTimeSeconds } from './technicianItCalculations';

describe('conversões de TI', () => {
  it('distingue armazenamento SI e IEC sem arredondar no cálculo', () => {
    expect(convertStorage(1, 'GiB', 'MB')).toBe(1073.741824);
    expect(convertStorage(1.5, 'TB', 'GiB')).toBeCloseTo(1396.9838619232178, 10);
    expect(convertStorage(convertStorage(1.5, 'TB', 'GiB')!, 'GiB', 'TB')).toBeCloseTo(1.5, 12);
  });
  it('distingue bits e bytes nas taxas decimais', () => {
    expect(convertSpeed(100, 'Mbps', 'MBps')).toBe(12.5);
    expect(convertSpeed(1.5, 'MBps', 'Mbps')).toBe(12);
    expect(convertSpeed(1, 'Gbps', 'Kbps')).toBe(1_000_000);
  });
  it('calcula transferência a partir da taxa original e conserva frações de segundo', () => {
    expect(transferTimeSeconds(1.5, 1.5, 'MBps')).toBe(1);
    expect(transferTimeSeconds(1.5, 1.5, 'Mbps')).toBe(8);
    expect(transferTimeSeconds(1, 3, 'Mbps')).toBeCloseTo(8 / 3, 14);
    expect(transferTimeSeconds(1, 0, 'Mbps')).toBeNull();
    expect(convertStorage(Infinity, 'TB', 'MB')).toBeNull();
    expect(convertSpeed(-1, 'Mbps', 'MBps')).toBeNull();
  });
});

describe('estimativa de fonte', () => {
  it('nunca sugere uma faixa menor que o mínimo calculado', () => {
    expect(roundUpPsu(1600)).toBe(1600);
    expect(roundUpPsu(1601)).toBeNull();
    const result = estimatePsu({ cpuW: 1000, gpuW: 1000, moboW: 50, ramSticks: 2, hdds: 0, ssds: 1, coolers: 0 });
    expect(result).toEqual({ totalW: 2063, recW: 2682, psuSize: null });
  });
  it('aceita potência decimal declarada, rejeita quantidades inválidas e não calcula certificação', () => {
    const result = estimatePsu({ cpuW: 95.5, gpuW: 450, moboW: 50, ramSticks: 2, hdds: 0, ssds: 1, coolers: 0 });
    expect(result).toEqual({ totalW: 608.5, recW: 792, psuSize: 850 });
    expect(estimatePsu({ cpuW: 95, gpuW: 0, moboW: 50, ramSticks: 1.5, hdds: 0, ssds: 1, coolers: 0 })).toBeNull();
  });
});
