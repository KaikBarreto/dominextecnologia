import { afterEach, describe, expect, it, vi } from 'vitest';
import { trackWhatsAppLead } from './gtag';

describe('trackWhatsAppLead', () => {
  afterEach(() => {
    delete window.gtag;
  });

  it('envia somente dimensoes publicas e categoricas no generate_lead', () => {
    const gtag = vi.fn();
    window.gtag = gtag;

    trackWhatsAppLead({
      pagePath: '/blog/modelo-de-pmoc',
      locale: 'pt-br',
      placement: 'floating_button',
      acquisitionChannel: 'ai',
    });

    expect(gtag).toHaveBeenCalledWith('event', 'generate_lead', {
      method: 'whatsapp',
      lead_source: 'public_site',
      page_path: '/blog/modelo-de-pmoc',
      page_locale: 'pt-br',
      cta_placement: 'floating_button',
      acquisition_channel: 'ai',
    });
    expect(JSON.stringify(gtag.mock.calls)).not.toMatch(/phone|message|campaign|term|content/i);
  });

  it('nao interfere no clique quando a Google tag nao esta disponivel', () => {
    expect(() =>
      trackWhatsAppLead({
        pagePath: '/',
        locale: 'pt-br',
        placement: 'inline_cta',
        acquisitionChannel: 'direct',
      }),
    ).not.toThrow();
  });
});
