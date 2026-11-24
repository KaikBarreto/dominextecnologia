// @vitest-environment jsdom
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PayrollAdjustmentsEditor, type PayrollAdjustmentDraft } from './PayrollAdjustmentsEditor';

const copy = {
  title: 'Ajustes desta folha', description: 'Lançamentos desta competência.',
  earnings: 'Proventos extras', deductions: 'Descontos extras',
  emptyEarnings: 'Nenhum provento.', emptyDeductions: 'Nenhum desconto.',
  earningPlaceholder: 'Ex.: Hora extra', deductionPlaceholder: 'Ex.: Empréstimo',
  amountPlaceholder: '0,00', descriptionLabel: 'Descrição', amountLabel: 'Valor em reais',
  presetsHelp: 'Os atalhos preenchem apenas a descrição. Informe o valor em reais.',
  earningPresets: ['Horas extras 50%', 'Horas extras 60%', 'DSR sobre horas extras', 'Comissão'],
  legalBases: 'Compõe as bases legais', addEarning: 'Adicionar provento',
  addDeduction: 'Adicionar desconto', remove: 'Remover rubrica',
};

function Harness() {
  const [earnings, setEarnings] = useState<PayrollAdjustmentDraft[]>([]);
  const [deductions, setDeductions] = useState<PayrollAdjustmentDraft[]>([]);
  return (
    <PayrollAdjustmentsEditor
      earnings={earnings}
      deductions={deductions}
      onEarningsChange={setEarnings}
      onDeductionsChange={setDeductions}
      onAmountChange={(value) => value}
      copy={copy}
    />
  );
}

describe('PayrollAdjustmentsEditor', () => {
  it('creates an earning from a shortcut, marks it active, and avoids duplicates', () => {
    render(<Harness />);
    const shortcut = screen.getByRole('button', { name: 'Horas extras 60%' });
    fireEvent.click(shortcut);

    expect(shortcut).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Descrição')).toHaveValue('Horas extras 60%');
    expect(screen.getByLabelText('Valor em reais')).toBeInTheDocument();

    fireEvent.click(shortcut);
    expect(screen.getAllByLabelText('Descrição')).toHaveLength(1);
  });

  it('keeps overtime and weekly rest as separate removable rows', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Horas extras 50%' }));
    fireEvent.click(screen.getByRole('button', { name: 'DSR sobre horas extras' }));

    expect(screen.getAllByLabelText('Descrição')).toHaveLength(2);
    expect(screen.getAllByRole('switch')).toHaveLength(2);
    expect(screen.getAllByRole('switch')[0]).toBeChecked();

    fireEvent.click(screen.getAllByRole('button', { name: 'Remover rubrica' })[0]);
    expect(screen.getByLabelText('Descrição')).toHaveValue('DSR sobre horas extras');
  });
});
