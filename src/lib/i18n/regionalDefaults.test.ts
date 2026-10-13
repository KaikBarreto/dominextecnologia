import { afterEach, describe, expect, it, vi } from 'vitest';
import { currencyFlag, getCurrencyDef } from '@/lib/i18n/currencies';
import {
  countryFromLanguageTag,
  getCountryDef,
  getCountryOptions,
} from '@/lib/i18n/countries';
import { detectRegionalFromMachine } from '@/lib/i18n/regionalDefaults';
import { formatMoney, getCurrencySymbol, parseMoney } from '@/lib/format';
import { currencyMask, parseCurrency } from '@/utils/employeeCalculations';

describe('defaults regionais por país', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolve Cabo Verde para português, CVE e fuso local', () => {
    expect(getCountryDef('CV')).toMatchObject({
      code: 'CV',
      language: 'pt-br',
      currency: 'CVE',
      timezone: 'Atlantic/Cape_Verde',
    });
    expect(getCurrencyDef('CVE').name).toBe('Escudo cabo-verdiano');
  });

  it('detecta o país pela região do navegador', () => {
    vi.stubGlobal('navigator', { language: 'pt-CV' });

    expect(detectRegionalFromMachine()).toMatchObject({
      countryCode: 'CV',
      language: 'pt-br',
      currency: 'CVE',
    });
  });

  it('normaliza tags BCP-47 e rejeita regiões fora do catálogo', () => {
    expect(countryFromLanguageTag('es-MX')).toBe('MX');
    expect(countryFromLanguageTag('pt_CV')).toBe('CV');
    expect(countryFromLanguageTag('xx-ZZ')).toBeNull();
  });

  it('expõe Cabo Verde no seletor e mantém o código pesquisável', () => {
    const capeVerde = getCountryOptions('pt-br').find((option) => option.value === 'CV');

    expect(capeVerde?.label).toMatch(/Cabo Verde/i);
    expect(capeVerde?.keywords).toEqual(['CV', 'CVE']);
  });

  it('formata e relê CVE sem alterar o valor persistido', () => {
    const formatted = formatMoney(1234.56, 'CVE', 'pt-br');

    expect(formatted).toContain('CVE');
    expect(getCurrencySymbol('CVE', 'pt-br')).toBe('CVE');
    expect(parseMoney(formatted, 'pt-br')).toBe(1234.56);

    const inputValue = currencyMask('123456', 'CVE', 'pt-br');
    expect(inputValue).toContain('CVE');
    expect(parseCurrency(inputValue)).toBe(1234.56);
  });

  it('exibe a bandeira correspondente no seletor de moedas', () => {
    expect(currencyFlag('BRL')).toBe('🇧🇷');
    expect(currencyFlag('CVE')).toBe('🇨🇻');
    expect(currencyFlag('EUR')).toBe('🇪🇺');
    expect(currencyFlag('USD', 'TL')).toBe('🇹🇱');
    expect(currencyFlag('ZZZ')).toBe('🌐');
  });
});
