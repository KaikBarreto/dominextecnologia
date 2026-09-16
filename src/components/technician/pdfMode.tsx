import { createContext, useContext, type ReactNode } from 'react';

/**
 * Sinaliza que a árvore do relatório está sendo CLONADA pra virar PDF
 * (html2canvas), e não desenhada pra tela.
 *
 * Por que um contexto e não uma prop: o `generating` do `OSReport` precisa
 * chegar até o grid de fotos que vive lá no fundo do accordion do PMOC
 * (OSReport → ReportPmocChecklist → EquipmentGroup → SectionAccordion →
 * PmocItemCard). Seriam 3-4 saltos de prop só pra transportar um booleano.
 *
 * Importante: modo PDF NÃO é a mesma coisa que impressão. São dois caminhos
 * distintos e independentes:
 *   - "Baixar PDF"  → html2canvas clona o DOM → só este contexto sabe.
 *   - "Imprimir"    → window.print() → só as classes `print:` do CSS sabem.
 * Quem desenha algo exclusivo do documento precisa cobrir OS DOIS, senão vaza
 * pra tela (inclusive pra tela do cliente no link público `?modo=cliente`).
 *
 * Default `false`: qualquer consumidor fora do provider desenha a versão tela.
 */
const PdfModeContext = createContext(false);

export function PdfModeProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <PdfModeContext.Provider value={value}>{children}</PdfModeContext.Provider>;
}

/** `true` só enquanto o relatório está sendo rasterizado pro PDF. */
export function usePdfMode(): boolean {
  return useContext(PdfModeContext);
}
