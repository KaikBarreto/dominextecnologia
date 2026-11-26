import { XMLParser } from "https://esm.sh/fast-xml-parser@4.5.3";

export type ManualInboundDocument =
  | {
      tipo: "nfe";
      destinatarioDocumento: string;
      values: Record<string, unknown>;
    }
  | {
      tipo: "nfse";
      destinatarioDocumento: string;
      values: Record<string, unknown>;
    };

export class InboundXmlError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: false,
  trimValues: true,
});

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const text = (value: unknown): string | null => {
  if (value == null || typeof value === "object") return null;
  const normalized = String(value).trim();
  return normalized || null;
};
const numberValue = (value: unknown): number | null => {
  const normalized = text(value)?.replace(",", ".");
  if (!normalized) return null;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
};
const first = <T>(value: T | T[] | undefined): T | undefined => Array.isArray(value) ? value[0] : value;
const get = (object: unknown, ...keys: string[]): unknown => {
  let current = object;
  for (const key of keys) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};
const documentFromParty = (party: unknown): string =>
  digits(get(party, "CNPJ") ?? get(party, "CPF") ?? get(party, "CpfCnpj", "Cnpj") ?? get(party, "CpfCnpj", "Cpf"));

function requireRecipient(actual: string, expected: string) {
  if (!actual || actual !== expected) {
    throw new InboundXmlError(
      "recipient_mismatch",
      "O XML não foi emitido para o CNPJ desta empresa. Confira o arquivo selecionado.",
    );
  }
}

function parseNfe(root: Record<string, unknown>, xml: string, expectedCnpj: string): ManualInboundDocument {
  const nfeProc = get(root, "nfeProc") as Record<string, unknown> | undefined;
  const nfe = (get(nfeProc, "NFe") ?? get(root, "NFe")) as Record<string, unknown> | undefined;
  const inf = get(nfe, "infNFe") as Record<string, unknown> | undefined;
  if (!inf) throw new InboundXmlError("invalid_xml", "O arquivo não contém uma NF-e válida.");

  const protocol = get(nfeProc, "protNFe", "infProt") as Record<string, unknown> | undefined;
  if (!protocol || text(protocol.cStat) !== "100") {
    throw new InboundXmlError("not_authorized", "A NF-e do XML não está autorizada pela SEFAZ.");
  }

  const id = text(inf["@_Id"]);
  const chave = digits(id?.replace(/^NFe/i, "") ?? protocol.chNFe);
  if (!/^\d{44}$/.test(chave) || digits(protocol.chNFe) !== chave) {
    throw new InboundXmlError("invalid_key", "A chave de acesso da NF-e é inválida ou não confere com o protocolo.");
  }

  const dest = get(inf, "dest");
  const recipient = documentFromParty(dest);
  requireRecipient(recipient, expectedCnpj);

  const ide = get(inf, "ide") as Record<string, unknown> | undefined;
  const emit = get(inf, "emit") as Record<string, unknown> | undefined;
  const total = get(inf, "total", "ICMSTot") as Record<string, unknown> | undefined;
  const det = first(get(inf, "det") as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const ref = first(get(ide, "NFref") as Record<string, unknown> | Record<string, unknown>[] | undefined);

  return {
    tipo: "nfe",
    destinatarioDocumento: recipient,
    values: {
      chave,
      origem: "manual",
      numero: numberValue(ide?.nNF),
      serie: numberValue(ide?.serie),
      emitente_cnpj: documentFromParty(emit),
      emitente_nome: text(emit?.xNome),
      valor: numberValue(total?.vNF),
      data_emissao: text(ide?.dhEmi ?? ide?.dEmi),
      natureza: text(ide?.natOp),
      cfop_principal: text(get(det, "prod", "CFOP")),
      fin_nfe: numberValue(ide?.finNFe),
      ref_nfe_key: text(get(ref, "refNFe")),
      situacao_sefaz: "autorizada",
      xml_content: xml,
      resumo: false,
    },
  };
}

function findNfse(root: Record<string, unknown>) {
  const comp = (get(root, "CompNfse") ?? get(root, "ConsultarNfseResposta", "CompNfse")) as Record<string, unknown> | undefined;
  const nfse = (get(comp, "Nfse") ?? get(root, "NFSe") ?? get(root, "Nfse")) as Record<string, unknown> | undefined;
  const inf = (get(nfse, "infNFSe") ?? get(nfse, "InfNfse") ?? get(nfse, "InfNfse")) as Record<string, unknown> | undefined;
  return { comp, nfse, inf };
}

function parseNfse(root: Record<string, unknown>, xml: string, expectedCnpj: string): ManualInboundDocument {
  const { comp, nfse, inf } = findNfse(root);
  if (!inf) throw new InboundXmlError("invalid_xml", "O arquivo não contém uma NFS-e válida.");

  const declaracao = (get(inf, "DeclaracaoPrestacaoServico", "InfDeclaracaoPrestacaoServico") ?? inf) as Record<string, unknown>;
  const servico = (get(declaracao, "Servico") ?? get(inf, "Servico")) as Record<string, unknown> | undefined;
  const valores = (get(servico, "Valores") ?? get(inf, "valores") ?? get(inf, "ValoresNFS-e")) as Record<string, unknown> | undefined;
  const prestador = (get(declaracao, "Prestador") ?? get(inf, "prest") ?? get(inf, "PrestadorServico")) as Record<string, unknown> | undefined;
  const tomador = (get(declaracao, "Tomador", "IdentificacaoTomador") ?? get(declaracao, "Tomador") ?? get(inf, "toma") ?? get(inf, "TomadorServico")) as Record<string, unknown> | undefined;
  const recipient = documentFromParty(tomador);
  requireRecipient(recipient, expectedCnpj);

  const chave = digits(inf["@_Id"] ?? get(inf, "chNFSe") ?? get(nfse, "chNFSe"));
  const chaveAcesso = /^\d{50}$/.test(chave) ? chave : null;
  const numero = text(get(inf, "Numero") ?? get(inf, "nNFSe") ?? get(inf, "numero"));
  const prestadorDocumento = documentFromParty(prestador);
  if (!chaveAcesso && (!prestadorDocumento || !numero)) {
    throw new InboundXmlError("invalid_identity", "A NFS-e não possui dados suficientes para identificar a nota.");
  }

  if (get(root, "CompNfse", "NfseCancelamento") || get(root, "CancelarNfseResposta")) {
    throw new InboundXmlError("not_authorized", "O XML selecionado é um evento de cancelamento, não uma NFS-e autorizada.");
  }

  const enderecoPrestador = (get(prestador, "Endereco") ?? prestador) as Record<string, unknown> | undefined;
  const municipio = text(get(servico, "CodigoMunicipio") ?? get(inf, "cLocIncid") ?? get(enderecoPrestador, "CodigoMunicipio"));
  const issRetidoRaw = text(get(valores, "IssRetido") ?? get(inf, "ISSQN", "tpRetISSQN"));

  return {
    tipo: "nfse",
    destinatarioDocumento: recipient,
    values: {
      origem: "manual",
      origem_ref: chaveAcesso ?? text(inf["@_Id"]),
      chave_acesso: chaveAcesso,
      numero,
      serie: text(get(inf, "Serie") ?? get(declaracao, "Rps", "IdentificacaoRps", "Serie")),
      codigo_verificacao: text(get(inf, "CodigoVerificacao") ?? get(inf, "cVerif")),
      municipio_incidencia_ibge: municipio,
      data_emissao: text(get(inf, "DataEmissao") ?? get(inf, "dhProc") ?? get(inf, "dhEmi")),
      competencia: text(get(declaracao, "Competencia") ?? get(inf, "dCompet")),
      valor_servico: numberValue(get(valores, "ValorServicos") ?? get(inf, "valores", "vServPrest", "vServ")),
      valor_liquido: numberValue(get(valores, "ValorLiquidoNfse") ?? get(inf, "valores", "vLiq")),
      valor_iss: numberValue(get(valores, "ValorIss") ?? get(inf, "valores", "trib", "tribMun", "vISSQN")),
      iss_retido: issRetidoRaw == null ? null : ["1", "true", "sim"].includes(issRetidoRaw.toLowerCase()),
      prestador_documento: prestadorDocumento,
      prestador_nome: text(get(prestador, "RazaoSocial") ?? get(inf, "prest", "xNome")),
      prestador_im: text(get(prestador, "InscricaoMunicipal") ?? get(inf, "prest", "IM")),
      prestador_municipio_ibge: text(get(enderecoPrestador, "CodigoMunicipio") ?? get(inf, "prest", "end", "cMun")),
      tomador_documento: recipient,
      tomador_nome: text(get(declaracao, "Tomador", "RazaoSocial") ?? get(inf, "toma", "xNome")),
      codigo_tributacao_nacional: text(get(servico, "ItemListaServico") ?? get(inf, "serv", "cTribNac")),
      codigo_tributacao_municipal: text(get(servico, "CodigoTributacaoMunicipio") ?? get(inf, "serv", "cTribMun")),
      discriminacao: text(get(servico, "Discriminacao") ?? get(inf, "serv", "xDescServ")),
      situacao: "autorizada",
      xml_content: xml,
      resumo: false,
    },
  };
}

export function parseInboundXml(xml: string, expectedCnpj: string): ManualInboundDocument {
  if (!xml.trim().startsWith("<")) throw new InboundXmlError("invalid_xml", "Selecione um arquivo XML válido.");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new InboundXmlError("unsafe_xml", "O XML contém declarações não permitidas.");
  }
  let root: Record<string, unknown>;
  try {
    root = parser.parse(xml) as Record<string, unknown>;
  } catch {
    throw new InboundXmlError("invalid_xml", "Não foi possível ler o XML selecionado.");
  }
  if (get(root, "procEventoNFe") || get(root, "evento") || get(root, "retEvento")) {
    throw new InboundXmlError("event_xml", "O arquivo contém um evento fiscal, não uma nota autorizada.");
  }
  if (get(root, "nfeProc") || get(root, "NFe")) return parseNfe(root, xml, expectedCnpj);
  return parseNfse(root, xml, expectedCnpj);
}
