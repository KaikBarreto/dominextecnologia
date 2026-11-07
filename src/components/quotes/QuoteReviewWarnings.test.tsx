import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuoteReviewWarnings } from './QuoteReviewWarnings';
import { buildQuoteReviewIssues } from '@/lib/quote-review';

describe('QuoteReviewWarnings', () => {
  it('não ocupa espaço quando não há pontos de atenção', () => {
    const { container } = render(<QuoteReviewWarnings issues={[]} onEditSection={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('orienta sem bloquear a conclusão e leva a ação à seção correspondente', () => {
    const onEdit = vi.fn();
    render(<QuoteReviewWarnings issues={buildQuoteReviewIssues({
      items: [{ item_type: 'material', description: 'Cabo elétrico', quantity: 2, unit_price: 0 }], finalTotal: 0,
    })} onEditSection={onEdit} />);
    expect(screen.getByText('Você pode continuar se estas condições forem intencionais.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rever materiais' }));
    expect(onEdit).toHaveBeenCalledWith('materials');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
