import { beforeEach, describe, expect, it } from 'vitest';
import {
  captureUtmParams,
  getAcquisitionAttribution,
  getLeadOriginLabel,
  resolveCompanyOriginKey,
} from '@/lib/whatsapp';

describe('atribuição de aquisição internacional', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, '', '/en/blog/field-service-guide');
    Object.defineProperty(document, 'referrer', { configurable: true, value: '' });
  });

  it('preserva UTM do ChatGPT com first e last touch', () => {
    captureUtmParams('?utm_source=chatgpt.com&utm_medium=referral&utm_campaign=answer');
    captureUtmParams('');

    expect(getLeadOriginLabel()).toBe('ChatGPT');
    expect(resolveCompanyOriginKey()).toBe('ai');
    expect(getAcquisitionAttribution()).toMatchObject({
      first_touch: {
        source: 'chatgpt.com',
        medium: 'referral',
        campaign: 'answer',
        page_path: '/en/blog/field-service-guide',
        locale: 'en',
      },
      last_touch: { source: 'chatgpt.com', campaign: 'answer' },
    });
  });

  it('reconhece referral de IA mesmo sem UTM', () => {
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: 'https://www.perplexity.ai/search/example',
    });
    captureUtmParams('');

    expect(getLeadOriginLabel()).toBe('Perplexity');
    expect(resolveCompanyOriginKey()).toBe('ai');
    expect(getAcquisitionAttribution()?.first_touch).toMatchObject({
      source: 'perplexity.ai',
      medium: 'ai_referral',
      referrer_host: 'perplexity.ai',
    });
  });
});
