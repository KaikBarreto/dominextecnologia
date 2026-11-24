import { describe, expect, it } from 'vitest';
import { DOMINEX_LEGAL } from '@/data/termsOfUse';
import { buildProposalContractSections } from '@/data/proposalContractDraft';
import {
  buildProposalContractPdfDoc,
  buildProposalContractPdfMetadata,
} from './proposalContractPdf';
import type { GenerateProposalPdfInput } from './proposalSimulatorPdf';

const FAKE_LOGO_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4/vMHAAXTAuldivnmAAAAAElFTkSuQmCC';

const originalFetch = globalThis.fetch;

function stubFetchForFakeLogo() {
  globalThis.fetch = (async () => {
    const [, base64] = FAKE_LOGO_DATA_URL.split(',');
    const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
    return new Response(bytes, { status: 200, headers: { 'Content-Type': 'image/png' } });
  }) as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

function sampleInput(overrides: Partial<GenerateProposalPdfInput> = {}): GenerateProposalPdfInput {
  return {
    clientName: 'EcoAgro Soluções Ambientais',
    logoUrl: '/fake-logo.png',
    units: [
      {
        name: 'Matriz',
        planName: 'Avançado',
        modules: ['Gestão completa de serviços e equipes', 'CRM e Kanban', 'Contratos e PMOC'],
        users: 8,
        monthly: 690,
        yearlyFull: 8280,
        yearlyDiscounted: 6624,
      },
    ],
    totals: {
      monthlyFull: 690,
      monthly: 640,
      monthlyDiscountAmount: 50,
      monthlyDiscount: { mode: 'amount', value: 50 },
      yearlyFull: 8280,
      yearlyNegotiatedBase: 7680,
      yearlyDiscounted: 6144,
      annualDiscountAmount: 1536,
      annualDiscount: { mode: 'percent', value: 20 },
      savings: 2136,
      pixInstallment: 2048,
      installments: 3,
    },
    issuedAt: new Date(2026, 10, 24, 12),
    showMonthlyPrice: true,
    showPixInstallments: true,
    ...overrides,
  };
}

function allContractText(input: GenerateProposalPdfInput): string {
  return buildProposalContractSections(input)
    .flatMap((section) => section.paragraphs.map((paragraph) => paragraph.text))
    .join('\n');
}

describe('proposalContractPdf', () => {
  it('gera código e nome de arquivo próprios da minuta', () => {
    const metadata = buildProposalContractPdfMetadata(
      'EcoAgro Soluções Ambientais',
      1,
      new Date(2026, 10, 24, 12),
    );

    expect(metadata.contractCode).toBe('MIN-20261124-ECOAGRO');
    expect(metadata.contractFilename).toBe('minuta-contratual-dominex-ecoagro-solucoes-ambientais.pdf');
    expect(metadata.clientName).toBe('EcoAgro Soluções Ambientais');
  });

  it('usa dados e valores da proposta sem recalcular preços', () => {
    const text = allContractText(sampleInput());

    expect(text).toContain('R$ 6.144,00 por ano');
    expect(text).toContain('R$ 640,00 por mês');
    expect(text).toContain('3 parcelas de R$ 2.048,00');
    expect(text).toContain('Matriz: plano Avançado, 8 usuários');
    expect(text).toContain(DOMINEX_LEGAL.razaoSocial);
    expect(text).toContain(DOMINEX_LEGAL.cnpj);
    expect(text).toContain(DOMINEX_LEGAL.foro);
  });

  it('respeita as opções que ocultam mensalidade e parcelamento no Pix', () => {
    const text = allContractText(sampleInput({
      showMonthlyPrice: false,
      showPixInstallments: false,
    }));

    expect(text).not.toContain('R$ 640,00 por mês');
    expect(text).not.toContain('parcelamento no Pix');
    expect(text).toContain('R$ 6.144,00 por ano');
  });

  it('inclui LGPD, Controlador/Operador e sigilo de todos os públicos solicitados', () => {
    const text = allContractText(sampleInput());

    expect(text).toContain('Lei nº 13.709/2018 (LGPD)');
    expect(text).toContain('Controladora');
    expect(text).toContain('Operadora');
    expect(text).toContain('clientes, funcionários, fornecedores, parceiros, prestadores e demais terceiros');
    expect(text).toContain('dados pessoais, comerciais, financeiros, operacionais, técnicos e estratégicos');
    expect(text).toContain('não representam garantia absoluta');
    expect(text).toContain('incidente confirmado');
  });

  it('monta o PDF completo para uma e várias unidades', async () => {
    stubFetchForFakeLogo();
    try {
      const single = await buildProposalContractPdfDoc(sampleInput());
      const multi = await buildProposalContractPdfDoc(sampleInput({
        units: Array.from({ length: 5 }, (_, index) => ({
          name: `Unidade ${index + 1}`,
          planName: index % 2 === 0 ? 'Avançado' : 'Personalizado',
          modules: [
            'Gestão completa de serviços e equipes',
            'CRM e Kanban comercial',
            'Contratos, PMOC e rotinas preventivas',
            'Relatórios operacionais consolidados',
          ],
          users: 6 + index,
          monthly: 600 + index * 100,
          yearlyFull: (600 + index * 100) * 12,
          yearlyDiscounted: (600 + index * 100) * 9.6,
        })),
      }));

      expect(single.doc.getNumberOfPages()).toBeGreaterThanOrEqual(4);
      expect(multi.doc.getNumberOfPages()).toBeGreaterThanOrEqual(single.doc.getNumberOfPages());
      expect(multi.doc.getNumberOfPages()).toBeGreaterThanOrEqual(5);
      expect(single.metadata.contractCode).toBe('MIN-20261124-ECOAGRO');
    } finally {
      restoreFetch();
    }
  });
});
