export interface DetectedInventoryBarcode { rawValue?: string }
export interface InventoryBarcodeDetector {
  detect(source: CanvasImageSource): Promise<DetectedInventoryBarcode[]>;
}
export type InventoryBarcodeDetectorConstructor = new (
  options?: { formats?: string[] },
) => InventoryBarcodeDetector;

export function getInventoryBarcodeDetectorConstructor(): InventoryBarcodeDetectorConstructor | null {
  if (typeof window === 'undefined') return null;
  return (window as Window & { BarcodeDetector?: InventoryBarcodeDetectorConstructor }).BarcodeDetector ?? null;
}

export function canScanInventoryIdentifierWithCamera(): boolean {
  return Boolean(
    getInventoryBarcodeDetectorConstructor()
    && typeof navigator !== 'undefined'
    && navigator.mediaDevices?.getUserMedia,
  );
}
