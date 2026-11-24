import { describe, expect, it } from 'vitest';
import { describePaidMarker } from './PaidMarker';

const texts = { by: 'Baixa por {name} em {when}', system: 'Baixa registrada em {when}' };
const when = (value: string) => `[${value}]`;

describe('describePaidMarker', () => {
  it('mostra quem deu baixa e quando', () => {
    expect(describePaidMarker(
      { paid_marked_at: '2026-11-13T21:21:00Z', settledBy: { full_name: 'Vanessa Silva', email: 'v@x.com' } },
      texts, when,
    )).toBe('Baixa por Vanessa Silva em [2026-11-13T21:21:00Z]');
  });

  it('baixa do sistema (sem usuário) mostra só a data', () => {
    expect(describePaidMarker({ paid_marked_at: '2026-11-10T11:52:00Z', settledBy: null }, texts, when))
      .toBe('Baixa registrada em [2026-11-10T11:52:00Z]');
  });

  it('usa o e-mail quando o perfil não tem nome', () => {
    expect(describePaidMarker(
      { paid_marked_at: '2026-11-13T21:21:00Z', settledBy: { full_name: ' ', email: 'v@x.com' } },
      texts, when,
    )).toBe('Baixa por v@x.com em [2026-11-13T21:21:00Z]');
  });

  it('baixa antiga, sem carimbo, não mostra nada', () => {
    expect(describePaidMarker({ paid_marked_at: null }, texts, when)).toBeNull();
    expect(describePaidMarker(null, texts, when)).toBeNull();
  });
});
