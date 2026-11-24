import { DEFAULT_PDV_RECEIPT_SETTINGS, type PdvReceiptFormat, type PdvReceiptSettings } from './model';

export type PdvReceiptStage = 'budget' | 'sale' | 'delivery';
export interface StageReceiptPolicy {
  autoPrint: boolean;
  format: PdvReceiptFormat;
  copies: 1 | 2 | 3;
}
export type StageReceiptSettings = Record<PdvReceiptStage, StageReceiptPolicy>;
export type PdvStageReceiptSettings = PdvReceiptSettings & { stages: StageReceiptSettings };

export function resolvePdvReceiptStagePolicy(
  settings: (Partial<PdvReceiptSettings> & { stages?: Partial<StageReceiptSettings> }) | null | undefined,
  stage: PdvReceiptStage,
): StageReceiptPolicy {
  const policy = settings?.stages && Object.prototype.hasOwnProperty.call(settings.stages, stage) ? settings.stages[stage] : undefined;
  const fallbackFormat = settings?.defaultFormat ?? DEFAULT_PDV_RECEIPT_SETTINGS.defaultFormat;
  const format = policy?.format ?? fallbackFormat;
  const copies = policy?.copies ?? settings?.copies;
  return {
    autoPrint: policy ? policy.autoPrint === true : stage === 'sale' && settings?.autoPrint === true,
    format: format === 'a4' || format === '58mm' || format === '80mm' ? format : '80mm',
    copies: copies === 2 || copies === 3 ? copies : 1,
  };
}

export function resolvePdvReceiptStages(settings?: Partial<PdvReceiptSettings> & { stages?: Partial<StageReceiptSettings> }): StageReceiptSettings {
  return {
    budget: resolvePdvReceiptStagePolicy(settings, 'budget'),
    sale: resolvePdvReceiptStagePolicy(settings, 'sale'),
    delivery: resolvePdvReceiptStagePolicy(settings, 'delivery'),
  };
}
