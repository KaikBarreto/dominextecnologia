import { useEffect, useState } from 'react';

export interface BrazilBank {
  code: number | null;
  name: string;
  fullName?: string;
  ispb?: string;
}

// Domínios populares para favicon
const POPULAR_BANK_DOMAINS: Record<string, string> = {
  '260': 'nubank.com.br',     // Nu Pagamentos (Nubank)
  '341': 'itau.com.br',       // Itaú
  '237': 'bradesco.com.br',   // Bradesco
  '033': 'santander.com.br',  // Santander
  '104': 'caixa.gov.br',      // Caixa
  '001': 'bb.com.br',         // Banco do Brasil
  '077': 'bancointer.com.br', // Inter
  '336': 'c6bank.com.br',     // C6
  '748': 'sicredi.com.br',    // Sicredi
  '756': 'sicoob.com.br',     // Sicoob
  '212': 'original.com.br',   // Banco Original
  '290': 'pagseguro.uol.com.br', // PagSeguro
  '323': 'mercadopago.com.br',   // Mercado Pago
  '380': 'picpay.com',           // PicPay
  '208': 'btgpactual.com',       // BTG Pactual
  '422': 'safra.com.br',         // Safra
  '655': 'votorantim.com.br',    // Votorantim/BV
  '041': 'banrisul.com.br',      // Banrisul
  '070': 'brb.com.br',           // BRB
  '743': 'bancosemear.com.br',
};

const POPULAR_NAME_DOMAINS: { match: RegExp; domain: string }[] = [
  { match: /nubank|nu pagamentos/i, domain: 'nubank.com.br' },
  { match: /ita[uú]/i, domain: 'itau.com.br' },
  { match: /bradesco/i, domain: 'bradesco.com.br' },
  { match: /santander/i, domain: 'santander.com.br' },
  { match: /caixa/i, domain: 'caixa.gov.br' },
  { match: /banco do brasil|^bb\b/i, domain: 'bb.com.br' },
  { match: /banco inter|^inter\b/i, domain: 'bancointer.com.br' },
  { match: /c6/i, domain: 'c6bank.com.br' },
  { match: /sicredi/i, domain: 'sicredi.com.br' },
  { match: /sicoob/i, domain: 'sicoob.com.br' },
  { match: /original/i, domain: 'original.com.br' },
  { match: /pagseguro/i, domain: 'pagseguro.uol.com.br' },
  { match: /mercado pago|mercadopago/i, domain: 'mercadopago.com.br' },
  { match: /picpay/i, domain: 'picpay.com' },
  { match: /btg/i, domain: 'btgpactual.com' },
  { match: /safra/i, domain: 'safra.com.br' },
  { match: /banrisul/i, domain: 'banrisul.com.br' },
  { match: /brb/i, domain: 'brb.com.br' },
  { match: /votorantim|^bv\b/i, domain: 'votorantim.com.br' },
];

export function getBankLogo(code?: number | string | null, name?: string | null): string | null {
  if (code !== undefined && code !== null) {
    const key = String(code).padStart(3, '0');
    const direct = POPULAR_BANK_DOMAINS[key] || POPULAR_BANK_DOMAINS[String(code)];
    if (direct) return `https://www.google.com/s2/favicons?domain=${direct}&sz=64`;
  }
  if (name) {
    for (const item of POPULAR_NAME_DOMAINS) {
      if (item.match.test(name)) {
        return `https://www.google.com/s2/favicons?domain=${item.domain}&sz=64`;
      }
    }
  }
  return null;
}

let cachedBanks: BrazilBank[] | null = null;
let cachePromise: Promise<BrazilBank[]> | null = null;

async function fetchBanks(): Promise<BrazilBank[]> {
  if (cachedBanks) return cachedBanks;
  if (cachePromise) return cachePromise;
  cachePromise = (async () => {
    try {
      const res = await fetch('https://brasilapi.com.br/api/banks/v1');
      if (!res.ok) throw new Error('Falha ao carregar bancos');
      const data: any[] = await res.json();
      const list: BrazilBank[] = data
        .filter(b => b.name)
        .map(b => ({
          code: b.code ?? null,
          name: b.name,
          fullName: b.fullName,
          ispb: b.ispb,
        }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      cachedBanks = list;
      return list;
    } catch (e) {
      console.error('useBrazilBanks:', e);
      return [];
    } finally {
      cachePromise = null;
    }
  })();
  return cachePromise;
}

export const POPULAR_BANK_CODES = ['260', '341', '237', '033', '104', '001', '077', '336', '748'];

export function useBrazilBanks() {
  const [banks, setBanks] = useState<BrazilBank[]>(cachedBanks || []);
  const [loading, setLoading] = useState(!cachedBanks);

  useEffect(() => {
    if (cachedBanks) return;
    let active = true;
    fetchBanks().then(list => {
      if (active) {
        setBanks(list);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, []);

  const popular = banks.filter(b => b.code !== null && POPULAR_BANK_CODES.includes(String(b.code).padStart(3, '0')))
    .sort((a, b) => POPULAR_BANK_CODES.indexOf(String(a.code).padStart(3, '0')) - POPULAR_BANK_CODES.indexOf(String(b.code).padStart(3, '0')));

  return { banks, popular, loading };
}
