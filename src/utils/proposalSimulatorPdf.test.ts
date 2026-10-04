import { describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildProposalPdfMetadata,
  buildProposalSimulatorPdfDoc,
  type ProposalPdfUnit,
} from './proposalSimulatorPdf';

// Logo fake 1×1 opaco (branco) em dataURL, usado só para QA visual determinística — jsPDF
// escala qualquer tamanho de imagem pro retângulo informado em addImage.
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

describe('proposalSimulatorPdf', () => {
  it('gera código e nome de arquivo seguros para o cliente', () => {
    const metadata = buildProposalPdfMetadata(
      'Climatização São José / Filiais',
      3,
      new Date(2026, 8, 29, 12),
    );

    expect(metadata.code).toBe('DOM-20260929-CLIMATIZ');
    expect(metadata.filename).toBe('proposta-dominex-climatizacao-sao-jose-filiais.pdf');
    expect(metadata.unitSummary).toBe('3 unidades');
    expect(metadata.issuedLabel).toBe('29/09/2026');
    expect(metadata.validityLabel).toBe('14/10/2026');
  });

  it('usa rótulo singular e fallback seguro', () => {
    const metadata = buildProposalPdfMetadata('', 1, new Date(2026, 0, 1));

    expect(metadata.clientName).toBe('Cliente');
    expect(metadata.unitSummary).toBe('1 unidade');
    expect(metadata.filename).toBe('proposta-dominex-cliente.pdf');
  });

  it('monta o documento PDF (1 unidade) sem lançar erro e com metadados coerentes', async () => {
    stubFetchForFakeLogo();
    try {
      const unit: ProposalPdfUnit = {
        name: 'Matriz',
        planName: 'Essencial',
        modules: ['Gestão completa de serviços e equipes', 'Portal do cliente'],
        users: 5,
        monthly: 450,
        yearlyFull: 5400,
        yearlyDiscounted: 4320,
      };
      const { doc, metadata } = await buildProposalSimulatorPdfDoc({
        clientName: 'Climatização Exemplo',
        logoUrl: '/fake-logo.png',
        units: [unit],
        totals: {
          monthly: 450,
          yearlyFull: 5400,
          yearlyDiscounted: 4320,
          savings: 1080,
          pixInstallment: 1440,
        },
        issuedAt: new Date(2026, 8, 29, 12),
      });

      expect(metadata.code).toBe('DOM-20260929-CLIMATIZ');
      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
    } finally {
      restoreFetch();
    }
  });

  /**
   * Gera 3 amostras em public/TMP/ para inspeção visual manual (rasterizadas com PyMuPDF
   * fora deste teste). Não valida pixel a pixel — isso é feito manualmente no QA do agente.
   */
  it('gera amostras de QA em public/TMP/', async () => {
    stubFetchForFakeLogo();
    try {
      const issuedAt = new Date(2026, 9, 4, 10);

      const sampleA = await buildProposalSimulatorPdfDoc({
        clientName: 'Climatização São José',
        logoUrl: '/fake-logo.png',
        units: [
          {
            name: 'Matriz',
            planName: 'Essencial',
            modules: ['Gestão completa de serviços e equipes', 'Portal do cliente', 'CRM e Kanban'],
            users: 5,
            monthly: 450,
            yearlyFull: 5400,
            yearlyDiscounted: 4320,
          },
        ],
        totals: { monthly: 450, yearlyFull: 5400, yearlyDiscounted: 4320, savings: 1080, pixInstallment: 1440 },
        issuedAt,
      });

      const sampleB = await buildProposalSimulatorPdfDoc({
        clientName: 'Grupo Frio Certo',
        logoUrl: '/fake-logo.png',
        units: [
          {
            name: 'Filial Centro',
            planName: 'Essencial',
            modules: ['Gestão completa de serviços e equipes', 'Portal do cliente'],
            users: 4,
            monthly: 390,
            yearlyFull: 4680,
            yearlyDiscounted: 3744,
          },
          {
            name: 'Filial Sul',
            planName: 'Avançado',
            modules: ['Gestão completa de serviços e equipes', 'Financeiro avançado, DRE e DFC', 'Contratos e PMOC'],
            users: 8,
            monthly: 690,
            yearlyFull: 8280,
            yearlyDiscounted: 6624,
          },
        ],
        totals: { monthly: 1080, yearlyFull: 12960, yearlyDiscounted: 10368, savings: 2592, pixInstallment: 3456 },
        issuedAt,
      });

      const longModules = [
        'Gestão completa de serviços e equipes em campo com checklist fotográfico',
        'Portal do cliente com acompanhamento de ordens de serviço em tempo real',
        'Financeiro avançado, DRE e DFC consolidados por unidade',
        'Contratos e PMOC com geração automática de rotina preventiva',
        'CRM e Kanban comercial com funil de propostas e contratos',
        'Emissão de notas fiscais de serviço integradas à prefeitura',
        'Funcionários, ponto e RH com múltiplas jornadas por colaborador',
        'Relatórios gerenciais e indicadores operacionais consolidados',
      ];
      const sampleC = await buildProposalSimulatorPdfDoc({
        clientName: 'Associação Nacional de Climatização, Refrigeração e Engenharia de Fachadas Ltda',
        logoUrl: '/fake-logo.png',
        units: Array.from({ length: 5 }).map((_, index) => ({
          name: `Unidade ${index + 1} - Regional ${['Norte', 'Sul', 'Leste', 'Oeste', 'Centro'][index]}`,
          planName: 'Personalizado',
          modules: longModules,
          users: 6 + index,
          monthly: 800 + index * 120,
          yearlyFull: (800 + index * 120) * 12,
          yearlyDiscounted: (800 + index * 120) * 12 * 0.8,
        })),
        totals: {
          monthly: 5600,
          yearlyFull: 67200,
          yearlyDiscounted: 53760,
          savings: 13440,
          pixInstallment: 17920,
        },
        issuedAt,
      });

      const outDir = path.resolve(__dirname, '../../public/TMP');
      await mkdir(outDir, { recursive: true });
      await writeFile(path.join(outDir, 'proposta-qa-a.pdf'), Buffer.from(sampleA.doc.output('arraybuffer')));
      await writeFile(path.join(outDir, 'proposta-qa-b.pdf'), Buffer.from(sampleB.doc.output('arraybuffer')));
      await writeFile(path.join(outDir, 'proposta-qa-c.pdf'), Buffer.from(sampleC.doc.output('arraybuffer')));

      expect(sampleA.doc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
      expect(sampleB.doc.getNumberOfPages()).toBeGreaterThanOrEqual(4);
      expect(sampleC.doc.getNumberOfPages()).toBeGreaterThanOrEqual(4);
    } finally {
      restoreFetch();
    }
  });
});
