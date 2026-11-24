import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FinancePdvCoverageNotice } from './FinancePdvCoverageNotice';

describe('limite visível do resultado da empresa', () => {
  it('explica a conciliação pendente antes de abrir qualquer conferência', () => {
    render(<FinancePdvCoverageNotice transactions={[{ id: 'compra', pdv_financial_role: 'pdv_supplier_obligation' }]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Confira antes de fechar o resultado da empresa');
    expect(screen.getByRole('status')).toHaveTextContent('materiais usados em serviços e pagamentos parciais');
    expect(screen.getByRole('status')).toHaveTextContent('Confira os relatórios do PDV e os lançamentos');
  });
  it('não atribui incompletude PDV a uma empresa apenas de serviços', () => {
    render(<FinancePdvCoverageNotice transactions={[{ id: 'servico', origin: 'geral' }]} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
