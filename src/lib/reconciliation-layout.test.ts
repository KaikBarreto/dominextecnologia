import { describe, expect, it } from 'vitest';
import {
  RECONCILIATION_TWO_PANEL_MIN_WIDTH,
  isReconciliationContainerCompact,
} from './reconciliation-layout';

describe('layout responsivo da conciliação', () => {
  it('usa lista + drawer quando a sidebar deixa o container estreito', () => {
    expect(isReconciliationContainerCompact(RECONCILIATION_TWO_PANEL_MIN_WIDTH - 1)).toBe(true);
  });

  it('mantém dois painéis quando há largura útil suficiente', () => {
    expect(isReconciliationContainerCompact(RECONCILIATION_TWO_PANEL_MIN_WIDTH)).toBe(false);
    expect(isReconciliationContainerCompact(1200)).toBe(false);
  });

  it('ignora medição inicial zerada para não forçar um drawer durante a montagem', () => {
    expect(isReconciliationContainerCompact(0)).toBe(false);
  });
});
