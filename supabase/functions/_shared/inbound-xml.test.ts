import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { InboundXmlError, parseInboundXml } from "./inbound-xml.ts";

const cnpj = "12345678000190";
const key = "35260912345678000190550010000000011000000010";

function nfeXml(recipient = cnpj, status = "100") {
  return `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe${key}"><ide><nNF>1</nNF><serie>1</serie><dhEmi>2026-09-01T10:00:00-03:00</dhEmi><natOp>Compra</natOp><finNFe>1</finNFe></ide><emit><CNPJ>99887766000155</CNPJ><xNome>Fornecedor</xNome></emit><dest><CNPJ>${recipient}</CNPJ></dest><det><prod><CFOP>5102</CFOP></prod></det><total><ICMSTot><vNF>99.90</vNF></ICMSTot></total></infNFe></NFe><protNFe><infProt><cStat>${status}</cStat><chNFe>${key}</chNFe></infProt></protNFe></nfeProc>`;
}

Deno.test("lê NF-e autorizada destinada à empresa", () => {
  const result = parseInboundXml(nfeXml(), cnpj);
  assertEquals(result.tipo, "nfe");
  assertEquals(result.values.chave, key);
  assertEquals(result.values.origem, "manual");
  assertEquals(result.values.valor, 99.9);
});

Deno.test("rejeita NF-e destinada a outro CNPJ", () => {
  const error = assertThrows(() => parseInboundXml(nfeXml("11111111000191"), cnpj), InboundXmlError);
  assertEquals(error.code, "recipient_mismatch");
});

Deno.test("rejeita NF-e sem autorização", () => {
  const error = assertThrows(() => parseInboundXml(nfeXml(cnpj, "101"), cnpj), InboundXmlError);
  assertEquals(error.code, "not_authorized");
});

Deno.test("rejeita declarações DOCTYPE e ENTITY", () => {
  const xml = `<!DOCTYPE nota [<!ENTITY cnpj "${cnpj}">]>${nfeXml("&cnpj;")}`;
  const error = assertThrows(() => parseInboundXml(xml, cnpj), InboundXmlError);
  assertEquals(error.code, "unsafe_xml");
});

Deno.test("lê NFS-e ABRASF destinada à empresa", () => {
  const xml = `<CompNfse><Nfse><InfNfse Id="nfse-10"><Numero>10</Numero><CodigoVerificacao>ABC</CodigoVerificacao><DataEmissao>2026-09-01T10:00:00</DataEmissao><DeclaracaoPrestacaoServico><InfDeclaracaoPrestacaoServico><Competencia>2026-09-01</Competencia><Servico><Valores><ValorServicos>150.00</ValorServicos><ValorLiquidoNfse>145.00</ValorLiquidoNfse><IssRetido>1</IssRetido></Valores><ItemListaServico>1.01</ItemListaServico><Discriminacao>Serviço</Discriminacao><CodigoMunicipio>3550308</CodigoMunicipio></Servico><Prestador><CpfCnpj><Cnpj>99887766000155</Cnpj></CpfCnpj><RazaoSocial>Prestador</RazaoSocial></Prestador><Tomador><IdentificacaoTomador><CpfCnpj><Cnpj>${cnpj}</Cnpj></CpfCnpj></IdentificacaoTomador><RazaoSocial>Tomador</RazaoSocial></Tomador></InfDeclaracaoPrestacaoServico></DeclaracaoPrestacaoServico></InfNfse></Nfse></CompNfse>`;
  const result = parseInboundXml(xml, cnpj);
  assertEquals(result.tipo, "nfse");
  assertEquals(result.values.numero, "10");
  assertEquals(result.values.origem, "manual");
  assertEquals(result.values.iss_retido, true);
});
