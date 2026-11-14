import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WhatsAppCtaLink from './WhatsAppCtaLink';

describe('WhatsAppCtaLink', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
    delete window.gtag;
  });

  it('mantém a mensagem contextual no href e na abertura por clique', () => {
    window.sessionStorage.setItem(
      'dominex_utm_params',
      JSON.stringify({ utm_source: 'instagram' }),
    );
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const gtag = vi.fn();
    window.gtag = gtag;

    render(
      <MemoryRouter initialEntries={['/area-do-tecnico']}>
        <WhatsAppCtaLink>Falar no WhatsApp</WhatsAppCtaLink>
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: /falar no whatsapp/i });
    const href = decodeURIComponent(link.getAttribute('href') ?? '');

    expect(href).toContain('?text=');
    expect(href).toContain('Área do Técnico™');
    expect(href).toContain('Instagram');

    fireEvent.click(link);

    expect(open).toHaveBeenCalledTimes(1);
    expect(decodeURIComponent(String(open.mock.calls[0][0]))).toContain('Área do Técnico™');
    expect(gtag).toHaveBeenCalledWith('event', 'generate_lead', {
      method: 'whatsapp',
      lead_source: 'public_site',
      page_path: '/area-do-tecnico',
      page_locale: 'pt-br',
      cta_placement: 'inline_cta',
      acquisition_channel: 'social',
    });
  });
});
