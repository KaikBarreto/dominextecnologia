import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PartyLabelBadges } from '@/components/customers/PartyLabelBadge';
import type { PartyLabel } from '@/hooks/usePartyLabels';

const labels: PartyLabel[] = [
  { id: 'blocked', company_id: 'company', name: 'BLOQUEADO', color: '#DC2626', is_active: true, scope: 'party', show_in_portal: false, created_at: '' },
  { id: 'vip', company_id: 'company', name: 'VIP', color: '#2563EB', is_active: true, scope: 'party', show_in_portal: false, created_at: '' },
];

describe('PartyLabelBadges', () => {
  it('resume múltiplas etiquetas e revela todas por foco', async () => {
    render(<PartyLabelBadges labels={labels} mode="compact" />);
    const summary = screen.getByLabelText('Etiquetas: BLOQUEADO, VIP');
    expect(summary).toHaveTextContent('+1');
    expect(summary.querySelector('[aria-label="Etiqueta: BLOQUEADO"]')).toBeInTheDocument();

    fireEvent.focus(summary);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('BLOQUEADO');
    expect(tooltip).toHaveTextContent('VIP');
  });
});
