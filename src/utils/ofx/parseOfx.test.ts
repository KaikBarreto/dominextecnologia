import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseOfx, computeDedupKey, parseAmount, classifyTrnType } from "./parseOfx";

// Fixtures são bytes crus (o parser decodifica pelo charset declarado).
// Lemos como Buffer e passamos o ArrayBuffer exato (respeitando byteOffset/length
// pra não vazar o pool interno do Node Buffer).
const load = (f: string): ArrayBuffer => {
  const buf = readFileSync(path.join(__dirname, "fixtures", f));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};

describe("parseOfx", () => {
  it("SGML 1.x: preserva acento (CHARSET 1252) e sinal do débito", () => {
    const st = parseOfx(load("itau_sgml.ofx"));
    expect(st.entries.length).toBe(3);
    // Acento tem que sobreviver à decodificação Windows-1252 (não UTF-8).
    expect(st.entries.some((e) => e.memo?.includes("SALÁRIO"))).toBe(true);
    expect(st.entries.some((e) => e.memo?.includes("MANUTENÇÃO"))).toBe(true);
    // Débito preserva o sinal negativo.
    expect(st.entries.some((e) => e.amount < 0)).toBe(true);
    expect(st.entries.find((e) => e.memo?.includes("TARIFA"))?.amount).toBe(-42.5);
    // Crédito positivo.
    expect(st.entries.find((e) => e.memo?.includes("SALÁRIO"))?.amount).toBe(3200);
  });

  it("SGML 1.x: tag-folha sem fechamento parseia (BANKID, ACCTID, NAME)", () => {
    const st = parseOfx(load("itau_sgml.ofx"));
    expect(st.bankId).toBe("0341");
    expect(st.acctId).toBe("12345-6");
    expect(st.entries.find((e) => e.memo?.includes("TARIFA"))?.name).toBe("TARIFA PACOTE");
  });

  it("DTPOSTED com fuso [-3:BRT] não desloca o dia", () => {
    const st = parseOfx(load("itau_sgml.ofx"));
    // 1ª transação: 20260720120000[-3:BRT] → dia 20, não 19/21.
    expect(st.entries[0].postedAt.slice(0, 10)).toBe("2026-07-20");
    // ISO deve trazer o offset resolvido -03:00.
    expect(st.entries[0].postedAt).toContain("-03:00");
  });

  it("DTPOSTED sem hora ancora meio-dia BRT (sem off-by-one)", () => {
    const st = parseOfx(load("itau_sgml.ofx"));
    // 2ª transação: 20260721 (sem hora) → dia 21 ancorado ao meio-dia -03:00.
    const debito = st.entries.find((e) => e.memo?.includes("TARIFA"))!;
    expect(debito.postedAt.slice(0, 10)).toBe("2026-07-21");
    expect(debito.postedAt).toBe("2026-07-21T12:00:00-03:00");
  });

  it("XML 2.x (Nubank) parseia igual", () => {
    const st = parseOfx(load("nubank_xml.ofx"));
    expect(st.entries.length).toBe(2);
    expect(st.ledgerBalance).not.toBeNull();
    expect(st.ledgerBalance).toBe(410.1);
    expect(st.entries[0].memo).toContain("Transferência");
    expect(st.entries.some((e) => e.amount < 0)).toBe(true);
    expect(st.entries[0].postedAt.slice(0, 10)).toBe("2026-07-10");
  });

  it("extrai ledgerBalance, data do saldo e período", () => {
    const st = parseOfx(load("itau_sgml.ofx"));
    expect(typeof st.ledgerBalance).toBe("number");
    expect(st.ledgerBalance).toBe(3307.5);
    expect(st.ledgerBalanceDate).toBe("2026-07-25");
    expect(st.periodStart).toBe("2026-07-01");
    expect(st.periodEnd).toBe("2026-07-25");
  });
});

describe("linhas de saldo do Itaú emitidas como STMTTRN", () => {
  it("descarta 'SALDO ...' das entries, mantém as transações reais e conta skippedBalanceLines", () => {
    const st = parseOfx(load("itau_saldo.ofx"));

    // (a) nenhuma linha começando por "SALDO" entra em entries.
    expect(st.entries.some((e) => /^\s*SALDO\b/i.test(e.memo ?? ""))).toBe(false);

    // (b) as transações reais estão presentes.
    expect(st.entries.length).toBe(3);
    expect(st.entries.some((e) => e.memo?.includes("PAGAMENTOS A FORNECEDORES"))).toBe(true);
    expect(st.entries.some((e) => e.memo?.includes("SISPAG FORNECEDORES"))).toBe(true);
    expect(st.entries.find((e) => e.memo?.includes("REND PAGO APLIC AUT"))?.amount).toBe(0.23);
    // "REND PAGO..." NÃO é falso-positivo (não começa com SALDO).
    expect(st.entries.some((e) => e.memo?.includes("REND PAGO APLIC AUT"))).toBe(true);

    // (c) contou as 2 linhas de saldo puladas + avisou.
    expect(st.skippedBalanceLines).toBe(2);
    expect(st.warnings.some((w) => /linha\(s\) de saldo/i.test(w))).toBe(true);

    // (d) ledgerBalance veio do LEDGERBAL (não de uma linha SALDO).
    expect(st.ledgerBalance).toBe(3450.23);
    expect(st.ledgerBalanceDate).toBe("2026-07-01");
  });
});

describe("parseAmount — separador de milhar (#1)", () => {
  it("BR simples com vírgula decimal: -42,50 → -42.5", () => {
    expect(parseAmount("-42,50")).toBe(-42.5);
  });
  it("BR com milhar ponto + vírgula decimal: 1.234,56 → 1234.56", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
  });
  it("US com milhar vírgula + ponto decimal: 1,234.56 → 1234.56", () => {
    expect(parseAmount("1,234.56")).toBe(1234.56);
  });
  it("ponto decimal puro: 3200.00 → 3200", () => {
    expect(parseAmount("3200.00")).toBe(3200);
  });
  it("BR negativo com milhar: -1.000,00 → -1000", () => {
    expect(parseAmount("-1.000,00")).toBe(-1000);
  });
  it("valor com milhar num extrato real não corrompe (fixture)", () => {
    const st = parseOfx(load("milhar_br.ofx"));
    // R$ 1.234,56 de crédito e -R$ 1.000,00 de débito, não 1,23 / -1,00.
    expect(st.entries.find((e) => e.memo?.includes("CREDITO"))?.amount).toBe(1234.56);
    expect(st.entries.find((e) => e.memo?.includes("DEBITO"))?.amount).toBe(-1000);
    expect(st.ledgerBalance).toBe(234.56);
  });
});

describe("múltiplas contas (#2)", () => {
  it("arquivo com 2 STMTRS é recusado com erro claro", () => {
    expect(() => parseOfx(load("multi_conta.ofx"))).toThrow(
      /mais de uma conta/i,
    );
  });
});

describe("BOM UTF-8 em XML 2.x (#9)", () => {
  it("pula o BOM e decodifica acento como UTF-8 (sem mojibake)", () => {
    const st = parseOfx(load("nubank_xml_bom.ofx"));
    expect(st.entries.length).toBeGreaterThan(0);
    expect(st.entries.some((e) => e.memo?.includes("Transferência"))).toBe(true);
    // Se caísse no ramo SGML/1252, viraria "TransferÃªncia".
    expect(st.entries.some((e) => e.memo?.includes("Ã"))).toBe(false);
  });
});

describe("TRNAMT ausente/inválido (#11)", () => {
  it("pula entries sem valor numérico e mantém as válidas, contabilizando warnings", () => {
    const st = parseOfx(load("trnamt_faltando.ofx"));
    expect(st.entries.length).toBe(2); // 1 sem TRNAMT descartada
    expect(st.entries.every((e) => Number.isFinite(e.amount))).toBe(true);
    expect(st.warnings.some((w) => /TRNAMT|valor/i.test(w))).toBe(true);
  });
});

describe("data placeholder zerada (Bradesco DTASOF 00000000)", () => {
  it("não vira '0000-00-00': ledgerBalanceDate = null, saldo e transações importam", () => {
    const st = parseOfx(load("bradesco_dtasof_zero.ofx"));
    // O veneno: DTASOF=00000000 não pode virar '0000-00-00' (Postgres rejeita a coluna date).
    expect(st.ledgerBalanceDate).toBeNull();
    // O saldo em si é válido e deve ser preservado.
    expect(st.ledgerBalance).toBe(-238836.86);
    // As transações têm datas válidas e importam normalmente.
    expect(st.entries.length).toBe(2);
    expect(st.entries.every((e) => e.postedAt.startsWith("2026-07-01"))).toBe(true);
  });
});

describe("computeDedupKey", () => {
  it("FITID único → chave estrutural bankId|acctId|fitid", () => {
    const st = parseOfx(load("itau_sgml.ofx"));
    const seen = new Set<string>();
    const key = computeDedupKey(st, st.entries[0], 0, seen);
    expect(key).toBe("0341|12345-6|2026072000001");
  });

  it("FITID duplicado no mesmo arquivo → 2 chaves distintas (fallback ordinal)", () => {
    const st = parseOfx(load("santander_fitid_dup.ofx"));
    expect(st.entries.length).toBe(2);
    expect(st.entries[0].fitid).toBe(st.entries[1].fitid); // MESMO FITID
    const seen = new Set<string>();
    const k0 = computeDedupKey(st, st.entries[0], 0, seen);
    const k1 = computeDedupKey(st, st.entries[1], 1, seen);
    expect(k0).not.toBe(k1);
  });

  it("sem FITID → fallback sha1(posted|amount|memo|ordinal)", () => {
    const st = parseOfx(load("itau_sgml.ofx"));
    const fake = { ...st.entries[0], fitid: null };
    const seen = new Set<string>();
    const key = computeDedupKey(st, fake, 7, seen);
    // fallback é determinístico e não é a chave estrutural.
    expect(key).not.toContain("2026072000001");
    expect(key.length).toBeGreaterThan(0);
    // mesma entrada + mesmo ordinal → mesma chave (idempotência).
    expect(computeDedupKey(st, fake, 7, new Set())).toBe(key);
  });
});

describe("classifyTrnType", () => {
  it("reconhece tipos de débito (normalizando trim + upper)", () => {
    expect(classifyTrnType("DEBIT")).toBe("debit");
    expect(classifyTrnType(" payment ")).toBe("debit");
    expect(classifyTrnType("fee")).toBe("debit");
    expect(classifyTrnType("ATM")).toBe("debit");
  });
  it("reconhece tipos de crédito", () => {
    expect(classifyTrnType("CREDIT")).toBe("credit");
    expect(classifyTrnType("dep")).toBe("credit");
    expect(classifyTrnType("Int")).toBe("credit");
  });
  it("tipo ausente ou desconhecido → unknown", () => {
    expect(classifyTrnType(null)).toBe("unknown");
    expect(classifyTrnType("")).toBe("unknown");
    expect(classifyTrnType("XYZ123")).toBe("unknown");
  });
});

describe("sinal trocado — detecção sem correção automática", () => {
  it("marca signSuspect só na linha com DEBIT positivo, preserva o amount original", () => {
    const st = parseOfx(load("sinal_trocado.ofx"));
    expect(st.entries.length).toBe(3);

    const credito = st.entries.find((e) => e.memo?.includes("PIX RECEBIDO BOM"))!;
    const debitoCorreto = st.entries.find((e) => e.memo?.includes("TARIFA PACOTE CORRETA"))!;
    const debitoTrocado = st.entries.find((e) => e.memo?.includes("SINAL TROCADO"))!;

    // Linhas corretas não são marcadas.
    expect(credito.signSuspect).toBe(false);
    expect(debitoCorreto.signSuspect).toBe(false);

    // Só a linha com DEBIT + valor positivo é marcada.
    expect(debitoTrocado.signSuspect).toBe(true);
    // O parser NUNCA corrige o valor: continua exatamente como no arquivo (+95.00).
    expect(debitoTrocado.amount).toBe(95);

    // Nem toda transação é positiva aqui (tem a TARIFA correta em -42.50) → não é
    // o padrão "banco exporta tudo positivo".
    expect(st.allPositive).toBe(false);
    expect(st.signSuspectCount).toBe(1);
    expect(st.warnings.some((w) => /sinal diferente do esperado/i.test(w))).toBe(true);
  });
});

describe("tudo positivo — banco que não usa sinal negativo para débito", () => {
  it("marca allPositive e signSuspect em cada linha de débito, sem alterar nenhum amount", () => {
    const st = parseOfx(load("tudo_positivo.ofx"));
    expect(st.entries.length).toBe(4);

    // Todos os valores do arquivo são positivos.
    expect(st.entries.every((e) => e.amount > 0)).toBe(true);
    expect(st.allPositive).toBe(true);

    const debito = st.entries.find((e) => e.trnType === "DEBIT")!;
    const pagamento = st.entries.find((e) => e.trnType === "PAYMENT")!;
    const credito = st.entries.find((e) => e.trnType === "CREDIT")!;
    const deposito = st.entries.find((e) => e.trnType === "DEP")!;

    // Tipos de débito ficam marcados (mesmo com valor positivo, amount intacto).
    expect(debito.signSuspect).toBe(true);
    expect(debito.amount).toBe(50);
    expect(pagamento.signSuspect).toBe(true);
    expect(pagamento.amount).toBe(30);

    // Tipos de crédito, com valor positivo, não são suspeitos.
    expect(credito.signSuspect).toBe(false);
    expect(deposito.signSuspect).toBe(false);

    expect(st.signSuspectCount).toBe(2);
    expect(st.warnings.some((w) => /todas as transações.*positivo/i.test(w))).toBe(true);
  });
});
