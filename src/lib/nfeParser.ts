/**
 * Parser de XML de NF-e (modelo 55) no navegador.
 *
 * Lê o XML já em texto (FileReader.readAsText) e extrai o necessário para
 * dar entrada de estoque: chave de acesso, fornecedor (emitente) e produtos.
 *
 * NF-e usa namespace default (sem prefixo) — `getElementsByTagName` funciona
 * porque ignora namespace. Somos tolerantes a variações de caixa das tags.
 */

export interface NfeParsedItem {
  /** Código do produto no fornecedor (cProd). */
  cProd: string;
  /** Código de barras (cEAN) — pode vir "SEM GTIN". */
  ean: string | null;
  /** Nome/descrição do produto (xProd). */
  name: string;
  /** Unidade comercial (uCom). */
  unit: string;
  /** Quantidade comercial (qCom). */
  quantity: number;
  /** Valor unitário comercial (vUnCom). */
  unitCost: number;
  /** Total do item (vProd). */
  total: number;
}

export interface NfeParsedSupplier {
  /** CNPJ ou CPF do emitente (só dígitos). */
  cnpj: string | null;
  /** Razão social / nome do emitente (xNome). */
  name: string | null;
}

export interface NfeParseResult {
  /** Chave de acesso de 44 dígitos. */
  accessKey: string | null;
  supplier: NfeParsedSupplier;
  items: NfeParsedItem[];
  /** Valor total da nota (vNF), quando disponível. */
  total: number | null;
}

export class NfeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NfeParseError';
  }
}

/** Primeiro elemento com a tag (ignora namespace). */
function firstTag(scope: Element | Document, tag: string): Element | null {
  const els = scope.getElementsByTagName(tag);
  return els.length > 0 ? els[0] : null;
}

/** Texto do primeiro elemento com a tag, dentro do escopo. */
function tagText(scope: Element | Document, tag: string): string | null {
  const el = firstTag(scope, tag);
  const txt = el?.textContent?.trim();
  return txt ? txt : null;
}

/** Converte número PT/EN tolerante (NF-e usa ponto decimal). */
function toNumber(raw: string | null | undefined): number {
  if (!raw) return 0;
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Só os dígitos (CNPJ/CPF/chave). */
function onlyDigits(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D/g, '');
}

/**
 * Faz o parse do texto XML de uma NF-e.
 * @throws {NfeParseError} se o arquivo não for um XML de NF-e válido.
 */
export function parseNfeXml(text: string): NfeParseResult {
  if (!text || !text.trim()) {
    throw new NfeParseError('Arquivo vazio. Selecione o XML da NF-e.');
  }

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(text, 'application/xml');
  } catch {
    throw new NfeParseError('XML de NF-e inválido. Verifique o arquivo.');
  }

  // DOMParser não lança em XML malformado — devolve um documento com <parsererror>.
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new NfeParseError('XML de NF-e inválido. Verifique o arquivo.');
  }

  const infNFe = firstTag(doc, 'infNFe');
  if (!infNFe) {
    throw new NfeParseError('XML de NF-e inválido. Não encontramos os dados da nota.');
  }

  // --- Chave de acesso: atributo Id de infNFe ("NFe" + 44 dígitos). Fallback chNFe.
  let accessKey: string | null = null;
  const idAttr = infNFe.getAttribute('Id') || infNFe.getAttribute('id');
  if (idAttr) {
    const digits = onlyDigits(idAttr);
    if (digits.length >= 44) accessKey = digits.slice(-44);
  }
  if (!accessKey) {
    const ch = onlyDigits(tagText(doc, 'chNFe'));
    if (ch.length === 44) accessKey = ch;
  }

  // --- Emitente (fornecedor).
  const emit = firstTag(doc, 'emit');
  const supplier: NfeParsedSupplier = {
    cnpj: emit ? onlyDigits(tagText(emit, 'CNPJ') ?? tagText(emit, 'CPF')) || null : null,
    name: emit ? tagText(emit, 'xNome') : null,
  };

  // --- Produtos: cada <det> tem um <prod>.
  const dets = Array.from(doc.getElementsByTagName('det'));
  const items: NfeParsedItem[] = [];
  for (const det of dets) {
    const prod = firstTag(det, 'prod');
    if (!prod) continue;
    const name = tagText(prod, 'xProd');
    if (!name) continue; // linha sem descrição não vira item de estoque
    const eanRaw = tagText(prod, 'cEAN');
    const ean = eanRaw && eanRaw.toUpperCase() !== 'SEM GTIN' ? eanRaw : null;
    items.push({
      cProd: tagText(prod, 'cProd') ?? '',
      ean,
      name,
      unit: (tagText(prod, 'uCom') ?? 'un').toLowerCase(),
      quantity: toNumber(tagText(prod, 'qCom')),
      unitCost: toNumber(tagText(prod, 'vUnCom')),
      total: toNumber(tagText(prod, 'vProd')),
    });
  }

  if (items.length === 0) {
    throw new NfeParseError('Nenhum produto encontrado na nota.');
  }

  // --- Total da nota (vNF dentro de ICMSTot).
  const icmsTot = firstTag(doc, 'ICMSTot');
  const total = icmsTot ? toNumber(tagText(icmsTot, 'vNF')) || null : null;

  return { accessKey, supplier, items, total };
}
