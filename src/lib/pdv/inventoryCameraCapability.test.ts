import { afterEach, describe, expect, it } from 'vitest';
import { canScanInventoryIdentifierWithCamera } from '@/lib/pdv/inventoryCameraCapability';

describe('canScanInventoryIdentifierWithCamera', () => {
  const original = Object.getOwnPropertyDescriptor(window, 'BarcodeDetector');
  const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

  afterEach(() => {
    if (original) Object.defineProperty(window, 'BarcodeDetector', original);
    else delete (window as Window & { BarcodeDetector?: unknown }).BarcodeDetector;
    if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
    else delete (navigator as unknown as { mediaDevices?: MediaDevices }).mediaDevices;
  });

  it('mantem fallback manual quando BarcodeDetector nao existe', () => {
    delete (window as Window & { BarcodeDetector?: unknown }).BarcodeDetector;
    expect(canScanInventoryIdentifierWithCamera()).toBe(false);
  });

  it('habilita camera somente quando detector e getUserMedia existem', () => {
    Object.defineProperty(window, 'BarcodeDetector', { configurable: true, value: class {} });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.resolve({}) },
    });
    expect(canScanInventoryIdentifierWithCamera()).toBe(true);
  });
});
