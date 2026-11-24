import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FormQuestion } from '@/types/database';
import type { ChecklistEquipmentGroup } from '@/hooks/useOsActivityChecklist';
import { VisitChecklistPanel } from './VisitChecklistPanel';

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br' }),
}));

vi.mock('@/components/SignaturePad', () => ({
  SignaturePad: ({
    disabled,
    onChange,
  }: {
    disabled?: boolean;
    onChange: (value: string | null) => void;
  }) => (
    <div>
      <button type="button" disabled={disabled} onClick={() => onChange('assinatura-traço-1')}>
        Primeiro traço
      </button>
      <button type="button" disabled={disabled} onClick={() => onChange('assinatura-traço-2')}>
        Segundo traço
      </button>
    </div>
  ),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const signatureQuestion = {
  id: 'question-signature',
  template_id: 'template-1',
  question: 'Assinatura do responsável',
  question_type: 'signature',
  description: null,
  is_required: true,
  position: 1,
} as FormQuestion;

const groups: ChecklistEquipmentGroup[] = [
  {
    equipmentId: null,
    equipmentName: 'Checklist de encerramento',
    equipment: null,
    activities: [
      {
        id: 'activity-1',
        equipment_id: null,
        section: null,
        component: null,
        description: 'Aceite do cliente',
        guidance: null,
        freq_code: null,
        is_measurement: false,
        unit: null,
        expected_min: null,
        expected_max: null,
        sort_order: 1,
        conformity_status: null,
        measured_value: null,
        activity_photos: null,
        form_template_id: 'template-1',
      },
    ],
  },
];

describe('VisitChecklistPanel — assinatura', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('aceita novos traços enquanto o snapshot anterior ainda está salvando', () => {
    const pendingSave = new Promise<void>(() => {});
    const onSaveFormResponse = vi.fn(() => pendingSave);

    render(
      <VisitChecklistPanel
        serviceOrderId="os-1"
        groups={groups}
        onSave={vi.fn(async () => {})}
        formQuestionsByTemplate={{ 'template-1': [signatureQuestion] }}
        getFormResponse={() => undefined}
        onSaveFormResponse={onSaveFormResponse}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Primeiro traço' }));
    fireEvent.click(screen.getByRole('button', { name: 'Segundo traço' }));

    expect(onSaveFormResponse).toHaveBeenNthCalledWith(
      1,
      null,
      'question-signature',
      { response_value: 'assinatura-traço-1' },
    );
    expect(onSaveFormResponse).toHaveBeenNthCalledWith(
      2,
      null,
      'question-signature',
      { response_value: 'assinatura-traço-2' },
    );
  });
});
