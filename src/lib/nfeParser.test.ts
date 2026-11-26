import { describe, it, expect } from 'vitest';
import { parseNfeXml, NfeParseError } from './nfeParser';

/**
 * `duplicatas` decide o vencimento real de uma conta a pagar gerada a partir
 * de uma NF-e recebida (`LancarNotaDespesaDialog`) — é dinheiro, então tem
 * teste dedicado. Os XMLs abaixo são o mínimo que o parser exige (infNFe +
 * emit + 1 det/prod + ICMSTot), variando só o bloco `<cobr>`.
 */
function buildNfeXml(opts: { cobr?: string } = {}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe Id="NFe35260812345678000199550010000012341123456789" versao="4.00">
      <emit>
        <CNPJ>12345678000199</CNPJ>
        <xNome>Fornecedor Teste LTDA</xNome>
      </emit>
      <det nItem="1">
        <prod>
          <cProd>001</cProd>
          <cEAN>SEM GTIN</cEAN>
          <xProd>Compressor 5HP</xProd>
          <uCom>UN</uCom>
          <qCom>1.0000</qCom>
          <vUnCom>1000.00</vUnCom>
          <vProd>1000.00</vProd>
          <NCM>84143091</NCM>
          <CEST>2104300</CEST>
          <CFOP>5102</CFOP>
        </prod>
        <imposto>
          <ICMS><ICMS00><orig>0</orig><CST>00</CST><vBC>1000.00</vBC><pICMS>18.00</pICMS><vICMS>180.00</vICMS></ICMS00></ICMS>
          <IPI><IPITrib><CST>50</CST><vBC>1000.00</vBC><pIPI>5.00</pIPI><vIPI>50.00</vIPI></IPITrib></IPI>
          <PIS><PISAliq><CST>01</CST><vBC>1000.00</vBC><pPIS>1.65</pPIS><vPIS>16.50</vPIS></PISAliq></PIS>
          <COFINS><COFINSAliq><CST>01</CST><vBC>1000.00</vBC><pCOFINS>7.60</pCOFINS><vCOFINS>76.00</vCOFINS></COFINSAliq></COFINS>
        </imposto>
      </det>
      <total>
        <ICMSTot>
          <vNF>1000.00</vNF>
        </ICMSTot>
      </total>
      ${opts.cobr ?? ''}
    </infNFe>
  </NFe>
</nfeProc>`;
}

describe('parseNfeXml — duplicatas (<cobr><dup>)', () => {
  it('1 parcela: due date e valor exatos da duplicata única', () => {
    const xml = buildNfeXml({
      cobr: `
      <cobr>
        <dup>
          <nDup>001</nDup>
          <dVenc>2026-10-15</dVenc>
          <vDup>1000.00</vDup>
        </dup>
      </cobr>`,
    });

    const result = parseNfeXml(xml);
    expect(result.duplicatas).toEqual([{ numero: '001', dueDate: '2026-10-15', amount: 1000 }]);
  });

  it('N parcelas: uma linha por <dup>, valores da nota (não redistribuídos)', () => {
    const xml = buildNfeXml({
      cobr: `
      <cobr>
        <dup><nDup>001</nDup><dVenc>2026-10-05</dVenc><vDup>333.34</vDup></dup>
        <dup><nDup>002</nDup><dVenc>2026-11-05</dVenc><vDup>333.33</vDup></dup>
        <dup><nDup>003</nDup><dVenc>2026-12-05</dVenc><vDup>333.33</vDup></dup>
      </cobr>`,
    });

    const result = parseNfeXml(xml);
    expect(result.duplicatas).toHaveLength(3);
    expect(result.duplicatas.map((d) => d.dueDate)).toEqual([
      '2026-10-05',
      '2026-11-05',
      '2026-12-05',
    ]);
    expect(result.duplicatas.map((d) => d.amount)).toEqual([333.34, 333.33, 333.33]);
    // Verdade é o XML, não o vNF: a soma pode divergir por desconto/frete.
    const sum = result.duplicatas.reduce((s, d) => s + d.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(1000);
    expect(result.total).toBe(1000);
  });

  it('sem <cobr>: duplicatas vazio (fallback pro chamador semear vencimento = emissão)', () => {
    const result = parseNfeXml(buildNfeXml());
    expect(result.duplicatas).toEqual([]);
  });

  it('parcela sem dVenc (opcional no leiaute) é descartada, as outras não', () => {
    const xml = buildNfeXml({
      cobr: `
      <cobr>
        <dup><nDup>001</nDup><vDup>500.00</vDup></dup>
        <dup><nDup>002</nDup><dVenc>2026-11-10</dVenc><vDup>500.00</vDup></dup>
      </cobr>`,
    });

    const result = parseNfeXml(xml);
    expect(result.duplicatas).toEqual([{ numero: '002', dueDate: '2026-11-10', amount: 500 }]);
  });

  it('parcela com vDup <= 0 é descartada (não inventa vencimento sem valor)', () => {
    const xml = buildNfeXml({
      cobr: `
      <cobr>
        <dup><nDup>001</nDup><dVenc>2026-10-01</dVenc><vDup>0</vDup></dup>
        <dup><nDup>002</nDup><dVenc>2026-11-01</dVenc><vDup>1000.00</vDup></dup>
      </cobr>`,
    });

    const result = parseNfeXml(xml);
    expect(result.duplicatas).toEqual([{ numero: '002', dueDate: '2026-11-01', amount: 1000 }]);
  });

  it('duplicatas fora de ordem no XML voltam ORDENADAS por vencimento', () => {
    const xml = buildNfeXml({
      cobr: `
      <cobr>
        <dup><nDup>003</nDup><dVenc>2026-12-20</dVenc><vDup>300.00</vDup></dup>
        <dup><nDup>001</nDup><dVenc>2026-10-20</dVenc><vDup>400.00</vDup></dup>
        <dup><nDup>002</nDup><dVenc>2026-11-20</dVenc><vDup>300.00</vDup></dup>
      </cobr>`,
    });

    const result = parseNfeXml(xml);
    expect(result.duplicatas.map((d) => d.numero)).toEqual(['001', '002', '003']);
    expect(result.duplicatas.map((d) => d.dueDate)).toEqual([
      '2026-10-20',
      '2026-11-20',
      '2026-12-20',
    ]);
  });

  it('dVenc em formato inválido (não YYYY-MM-DD) é descartado', () => {
    const xml = buildNfeXml({
      cobr: `
      <cobr>
        <dup><nDup>001</nDup><dVenc>15/10/2026</dVenc><vDup>1000.00</vDup></dup>
      </cobr>`,
    });

    const result = parseNfeXml(xml);
    expect(result.duplicatas).toEqual([]);
  });
});

describe('parseNfeXml — dados fiscais do item', () => {
  it('extrai códigos e bases/alíquotas/valores sem usar dados de cliente', () => {
    const item = parseNfeXml(buildNfeXml()).items[0];
    expect(item).toMatchObject({
      ncm: '84143091', cfop: '5102', cest: '2104300', cst: '00', csosn: null, origem: '0',
      icms: { cst: '00', base: 1000, rate: 18, amount: 180 },
      ipi: { cst: '50', base: 1000, rate: 5, amount: 50 },
      pis: { cst: '01', base: 1000, rate: 1.65, amount: 16.5 },
      cofins: { cst: '01', base: 1000, rate: 7.6, amount: 76 },
    });
  });
});

describe('parseNfeXml — erros continuam claros (regressão)', () => {
  it('XML vazio lança NfeParseError', () => {
    expect(() => parseNfeXml('')).toThrow(NfeParseError);
  });

  it('XML sem infNFe lança NfeParseError', () => {
    expect(() => parseNfeXml('<root></root>')).toThrow(NfeParseError);
  });
});
