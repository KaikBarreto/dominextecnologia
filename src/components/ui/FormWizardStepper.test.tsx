import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormWizardStepper } from './FormWizardStepper';

describe('FormWizardStepper', () => {
  it('usa accent preto com texto branco sem alterar o padrão dos demais fluxos', () => {
    const { container } = render(
      <FormWizardStepper
        steps={[{ key: 'file', label: 'Selecionar planilha' }, { key: 'review', label: 'Conferir' }]}
        currentIndex={0}
        accent="black"
      />,
    );

    const activeMarkers = container.querySelectorAll('.bg-black.text-white');
    expect(activeMarkers).toHaveLength(2);
    expect(screen.getAllByText('Selecionar planilha')).toHaveLength(2);
  });
});
