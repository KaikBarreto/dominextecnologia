/**
 * Parser OFX tolerante (SGML 1.x + XML 2.x), client-side.
 *
 * Roda no BROWSER: usa apenas `TextDecoder` / `ArrayBuffer` (nada de Node).
 *
 * Trata as 3 pegadinhas do OFX de banco BR na origem:
 *  1. ENCODING — header 1.x costuma vir CHARSET:1252 (Windows-1252/ISO-8859-1).
 *     Decodificar como UTF-8 transformaria "SALÁRIO" em lixo. Faremos o sniff do
 *     charset declarado ANTES de decodificar o corpo.
 *  2. FUSO — DTPOSTED = `20260720120000[-3:BRT]`. Resolvemos o offset e mantemos o
 *     dia (sem deslocar pro 19/21). DTPOSTED sem hora (`20260720`) ancora meio-dia
 *     BRT — mesma classe do bug `useDateRangeFilter` (new Date("YYYY-MM-DD")=UTC →
 *     dia anterior no BRT). Nunca usamos `new Date(dateOnly)`.
 *  3. SGML tag-folha sem fechamento — `<TRNAMT>-42.50` sem `</TRNAMT>`. Parse por
 *     "valor até o fim da linha / próxima tag", não por regex de par aberto/fechado.
 *
 * NOTA DE IMPLEMENTAÇÃO: avaliamos `ofx-data-extractor` mas ela (a) pré-formata
 * DTPOSTED pra date-only string descartando o offset `[-3:BRT]` (impossível travar
 * a regra de fuso), (b) renomeia a tag STMTTRN→STRTTRN, e (c) só aceita string
 * (encoding fica por nossa conta de qualquer jeito). Como OFX é tag-folha trivial,
 * um parser próprio nos dá controle total das 3 pegadinhas. Sem dependência externa.
 */

export interface OfxEntry {
  fitid: string | null;
  postedAt: string; // ISO 8601 com offset resolvido (ex: 2026-07-20T12:00:00-03:00)
  amount: number; // com sinal: + crédito, − débito
  trnType: string | null;
  memo: string | null;
  name: string | null;
  /**
   * `true` quando o sinal do `amount` contradiz o `trnType` declarado (ex: TRNTYPE
   * DEBIT com TRNAMT positivo). Tem banco que exporta débito com valor positivo e
   * deixa a direção só no tipo. O parser NUNCA corrige o valor sozinho — apenas
   * marca. `trnType` desconhecido ou ausente sempre resulta em `false`.
   */
  signSuspect: boolean;
}

export interface OfxStatement {
  bankId: string | null;
  acctId: string | null;
  periodStart: string | null; // ISO date (YYYY-MM-DD)
  periodEnd: string | null; // ISO date (YYYY-MM-DD)
  ledgerBalance: number | null;
  ledgerBalanceDate: string | null; // ISO date (YYYY-MM-DD)
  entries: OfxEntry[];
  /** Avisos não-fatais do parse (ex: transações puladas por TRNAMT inválido). */
  warnings: string[];
  /**
   * Quantas linhas `<STMTTRN>` foram descartadas por serem LINHAS DE SALDO do banco
   * (memo iniciando por "SALDO"), não transações reais. Quirk do Itaú: o extrato OFX
   * emite "SALDO ANTERIOR" e "SALDO TOTAL DISPONÍVEL DIA" como `<STMTTRN>`, o que
   * infla a conciliação se importado. Ver `isBalanceLine`.
   */
  skippedBalanceLines: number;
  /**
   * `true` quando NENHUMA entry tem valor negativo E existe ao menos uma entry com
   * `trnType` de débito. Sinal de que o banco exporta tudo positivo e deixa a
   * direção (entrada/saída) só no TRNTYPE — nesse padrão, toda entry de débito
   * também vem com `signSuspect: true` individualmente; `allPositive` é o resumo
   * no nível do arquivo pra UI explicar de uma vez o padrão do banco, em vez de
   * listar entry por entry. Ver `DEBIT_TYPES`/`CREDIT_TYPES`/`classifyTrnType`.
   */
  allPositive: boolean;
  /** Quantas entries têm `signSuspect === true`. */
  signSuspectCount: number;
}

const DEFAULT_TZ_OFFSET = "-03:00"; // BRT — default para extratos BR.

/* ─────────────────────────── decodificação ─────────────────────────── */

/**
 * Descobre o charset lendo só o cabeçalho em ASCII (os primeiros bytes de qualquer
 * OFX são ASCII, seja 1.x SGML — `CHARSET:1252` — seja 2.x XML — `encoding="UTF-8"`).
 * Retorna um rótulo válido pra `TextDecoder`.
 */
function sniffCharsetLabel(bytes: ArrayBuffer): string {
  // Lê no máximo ~2KB do topo como ASCII pra achar o header sem decodificar tudo.
  const raw = new Uint8Array(bytes, 0, Math.min(2048, bytes.byteLength));
  // Pula o BOM UTF-8 (EF BB BF) se presente — senão o sniff não vê o `<?xml`
  // logo no início e o arquivo 2.x cai no ramo SGML/1252 (mojibake `Ã§`).
  const bomOffset =
    raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf ? 3 : 0;
  const head = raw.subarray(bomOffset);
  let ascii = "";
  for (let i = 0; i < head.length; i++) ascii += String.fromCharCode(head[i]);

  const isXml = ascii.trimStart().startsWith("<?xml");

  if (isXml) {
    // OFX 2.x: encoding do declaration XML.
    const m = ascii.match(/encoding\s*=\s*["']([^"']+)["']/i);
    const enc = m?.[1]?.toLowerCase();
    if (enc && enc !== "utf-8" && enc !== "utf8") {
      return normalizeCharset(enc);
    }
    return "utf-8";
  }

  // OFX 1.x SGML: header estilo `CHARSET:1252` e/ou `ENCODING:USASCII`.
  const charset = ascii.match(/CHARSET:\s*([^\r\n]+)/i)?.[1]?.trim();
  if (charset) return normalizeCharset(charset);

  const encoding = ascii.match(/ENCODING:\s*([^\r\n]+)/i)?.[1]?.trim();
  if (encoding) return normalizeCharset(encoding);

  // Default BR pra 1.x sem declaração explícita: Windows-1252.
  return "windows-1252";
}

/** Mapeia rótulos comuns de OFX pra labels aceitos por `TextDecoder`. */
function normalizeCharset(raw: string): string {
  const v = raw.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (v === "1252" || v === "cp1252" || v === "windows1252") return "windows-1252";
  if (v === "8859-1" || v === "88591" || v === "iso88591" || v === "latin1") return "iso-8859-1";
  if (v === "usascii" || v === "ascii" || v === "us-ascii") return "windows-1252"; // USASCII no header BR normalmente convive com bytes 1252 no corpo
  if (v === "utf8" || v === "utf-8") return "utf-8";
  if (v === "utf16" || v === "utf-16" || v === "unicode") return "utf-16";
  return v; // deixa o TextDecoder resolver (lança se inválido)
}

function decode(bytes: ArrayBuffer): string {
  const label = sniffCharsetLabel(bytes);
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes);
  } catch {
    // Fallback robusto: 1252 nunca lança e cobre o corpo BR.
    return new TextDecoder("windows-1252", { fatal: false }).decode(bytes);
  }
}

/* ─────────────────────────── extração de tags ─────────────────────────── */

/**
 * Lê o valor de uma tag OFX de forma tolerante ao SGML tag-folha sem fechamento.
 * `<TAG>valor` → captura tudo depois de `<TAG>` até o próximo `<` ou fim de linha.
 * Também funciona pra XML fechado `<TAG>valor</TAG>` (para antes do `</TAG>`).
 * Retorna o PRIMEIRO valor não-vazio encontrado no bloco.
 */
function tagValue(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>\\s*([^<\\r\\n]*)`, "i");
  const m = block.match(re);
  if (!m) return null;
  const v = m[1].trim();
  return v.length ? v : null;
}

/** Isola o conteúdo do primeiro `<TAG>...</TAG>` (usado só onde há fechamento real). */
function tagBlock(src: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  return src.match(re)?.[1] ?? null;
}

/** Todos os blocos `<STMTTRN>...</STMTTRN>` (STMTTRN sempre fecha, mesmo em SGML). */
function stmtTrnBlocks(src: string): string[] {
  const re = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

/* ─────────────────────────── linhas de saldo (quirk Itaú) ─────────────────────────── */

/**
 * `true` quando o MEMO representa uma LINHA DE SALDO do banco, não uma transação real.
 *
 * Quirk do Itaú: o extrato OFX emite as linhas de saldo do dia como `<STMTTRN>`
 * (mesma estrutura de uma transação: trn_type=CREDIT, valor positivo, name vazio):
 *   - "SALDO ANTERIOR"               → abertura
 *   - "SALDO TOTAL DISPONÍVEL DIA"   → fechamento (uma por dia; extrato de 30d ≈ 22)
 * Importar essas linhas como lançamento distorce a conciliação bancária (o saldo
 * entra como "transação"). Identificador determinístico e seguro: memo começando
 * com "SALDO" — nenhuma transação real do Itaú começa assim (as reais são
 * "PAGAMENTOS…", "SISPAG…", "REND PAGO APLIC AUT…").
 *
 * Risco residual de falso-positivo só existiria se algum banco pagasse rendimento
 * rotulado tipo "SALDO REMUNERADO" — o Itaú aqui usa "REND PAGO APLIC AUT", que
 * NÃO colide. Se surgir esse caso em outro banco, refinar o predicado.
 */
export function isBalanceLine(memo: string | null): boolean {
  if (memo == null) return false;
  return /^\s*SALDO\b/i.test(memo);
}

/* ─────────────────────────── normalização de data ─────────────────────────── */

/**
 * Converte DTPOSTED/DTASOF/DTSTART/DTEND (formato OFX) em ISO 8601 com offset resolvido.
 *  - `YYYYMMDDHHMMSS[-3:BRT]` → `YYYY-MM-DDTHH:MM:SS-03:00` (offset preservado, dia intacto).
 *  - `YYYYMMDDHHMMSS` (sem zona)   → assume -03:00 (BR).
 *  - `YYYYMMDD` (só data)          → **ancora meio-dia -03:00** pra nunca deslocar o dia.
 * Nunca usa `new Date(...)`, então não há conversão UTC silenciosa.
 */
function ofxDateToIso(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();

  // Offset explícito: [-3:BRT], [-3], [+0:GMT], [-03:EST]...
  let tzOffset = DEFAULT_TZ_OFFSET;
  const tzMatch = s.match(/\[\s*([+-]?\d{1,2})(?:\.\d+)?\s*(?::[^\]]*)?\]/);
  const digits = s.replace(/\[[^\]]*\]/g, "").replace(/\D/g, "");
  if (tzMatch) {
    const hours = parseInt(tzMatch[1], 10);
    const sign = hours < 0 ? "-" : "+";
    tzOffset = `${sign}${String(Math.abs(hours)).padStart(2, "0")}:00`;
  }

  if (digits.length < 8) return null;
  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);

  // Data-placeholder zerada (Bradesco manda `<DTASOF>00000000` / `<DTSERVER>0…0`).
  // Sem esse guard, vira "0000-00-00" e o Postgres rejeita a coluna date com
  // `date/time field value out of range: "0000-00-00"`, derrubando o import inteiro.
  const y = parseInt(year, 10);
  const mo = parseInt(month, 10);
  const d = parseInt(day, 10);
  if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;

  let hh = "12";
  let mm = "00";
  let ss = "00";
  if (digits.length >= 14) {
    hh = digits.slice(8, 10);
    mm = digits.slice(10, 12);
    ss = digits.slice(12, 14);
  } else if (digits.length >= 12) {
    hh = digits.slice(8, 10);
    mm = digits.slice(10, 12);
  } else {
    // Só data (YYYYMMDD): ancora meio-dia BRT — evita off-by-one do fuso.
    hh = "12";
  }

  return `${year}-${month}-${day}T${hh}:${mm}:${ss}${tzOffset}`;
}

/** Extrai só a parte de data (YYYY-MM-DD) de um campo OFX de data. */
function ofxDateToDateOnly(raw: string | null): string | null {
  if (!raw) return null;
  const iso = ofxDateToIso(raw);
  return iso ? iso.slice(0, 10) : null;
}

/**
 * Converte o valor monetário de um campo OFX em número, preservando o sinal.
 *
 * OFX canônico usa ponto decimal, mas geradores/bancos BR exportam vírgula decimal
 * e às vezes separador de milhar. Detectamos o separador DECIMAL pelo ÚLTIMO
 * separador presente (o mais à direita), tratando o outro como milhar:
 *  - "1.234,56" (milhar ponto, decimal vírgula) → 1234.56
 *  - "1,234.56" (milhar vírgula, decimal ponto) → 1234.56
 *  - "-42,50"   (só vírgula = decimal)          → -42.5
 *  - "3200.00"  (só ponto = decimal)            → 3200
 * Sem esse cuidado, `replace(",",".")` cego transformava "1.234,56" em "1.234.56"
 * → parseFloat = 1.234 (R$ 1.234,56 entrava como R$ 1,23). Bug silencioso grave.
 */
export function parseAmount(raw: string | null): number {
  if (raw == null) return NaN;
  let s = raw.trim().replace(/[^\d.,-]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    // vírgula é o decimal → pontos são milhar.
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // ponto é o decimal → vírgulas são milhar.
    s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    // só vírgula presente → decimal.
    s = s.replace(",", ".");
  }
  return parseFloat(s);
}

/* ─────────────────────────── sinal trocado ─────────────────────────── */

/**
 * TRNTYPEs que o OFX define como SAÍDA de dinheiro (débito). Fonte: spec OFX 2.x
 * seção Banking (TRNTYPE enum). Usado só pra DETECTAR sinal suspeito — nunca pra
 * corrigir o `amount` (ver `OfxEntry.signSuspect`).
 */
const DEBIT_TYPES = new Set([
  "DEBIT",
  "PAYMENT",
  "FEE",
  "SRVCHG",
  "ATM",
  "CHECK",
  "DIRECTDEBIT",
  "REPEATPMT",
  "XFER_OUT",
]);

/** TRNTYPEs de ENTRADA de dinheiro (crédito). */
const CREDIT_TYPES = new Set(["CREDIT", "DEP", "DIRECTDEP", "INT", "DIV", "XFER_IN", "CASH"]);

/**
 * Classifica um TRNTYPE (normalizado por trim + upper) em direção de dinheiro.
 * TRNTYPE ausente ou não reconhecido → `"unknown"` (nunca gera `signSuspect`).
 */
export function classifyTrnType(trnType: string | null): "debit" | "credit" | "unknown" {
  if (!trnType) return "unknown";
  const t = trnType.trim().toUpperCase();
  if (DEBIT_TYPES.has(t)) return "debit";
  if (CREDIT_TYPES.has(t)) return "credit";
  return "unknown";
}

/* ─────────────────────────── parse principal ─────────────────────────── */

export function parseOfx(bytes: ArrayBuffer): OfxStatement {
  const text = decode(bytes);
  const warnings: string[] = [];

  // #2 — múltiplas contas: contamos os statements (<STMTRS> extrato bancário +
  // <CCSTMTRS> cartão). O parser lê só o 1º bloco de cada tag; importar parcial
  // em silêncio esconderia contas inteiras. Recusar é mais seguro no MVP.
  const stmtCount =
    (text.match(/<STMTRS>/gi)?.length ?? 0) + (text.match(/<CCSTMTRS>/gi)?.length ?? 0);
  if (stmtCount > 1) {
    throw new Error(
      "Este arquivo tem mais de uma conta. Exporte o extrato de uma conta por vez.",
    );
  }

  const acctBlock = tagBlock(text, "BANKACCTFROM") ?? tagBlock(text, "CCACCTFROM") ?? "";
  const bankId = acctBlock ? tagValue(acctBlock, "BANKID") : tagValue(text, "BANKID");
  const acctId = acctBlock ? tagValue(acctBlock, "ACCTID") : tagValue(text, "ACCTID");

  const tranListBlock = tagBlock(text, "BANKTRANLIST") ?? text;
  const periodStart = ofxDateToDateOnly(tagValue(tranListBlock, "DTSTART"));
  const periodEnd = ofxDateToDateOnly(tagValue(tranListBlock, "DTEND"));

  const ledgerBlock = tagBlock(text, "LEDGERBAL");
  const ledgerBalance = ledgerBlock ? parseAmount(tagValue(ledgerBlock, "BALAMT")) : null;
  const ledgerBalanceDate = ledgerBlock ? ofxDateToDateOnly(tagValue(ledgerBlock, "DTASOF")) : null;

  const entries: OfxEntry[] = [];
  let skippedBalanceLines = 0;
  stmtTrnBlocks(tranListBlock).forEach((block) => {
    const memo = tagValue(block, "MEMO");
    // Quirk Itaú: linhas de saldo ("SALDO ANTERIOR" / "SALDO TOTAL DISPONÍVEL DIA")
    // vêm como <STMTTRN> mas NÃO são transações. Descartar ANTES de montar a entry
    // pra não inflar a conciliação. Ver isBalanceLine.
    if (isBalanceLine(memo)) {
      skippedBalanceLines++;
      return;
    }
    const fitid = tagValue(block, "FITID");
    const amount = parseAmount(tagValue(block, "TRNAMT"));
    // #11 — TRNAMT ausente/inválido vira NaN → no INSERT vira null → viola
    // NOT NULL e derruba o import inteiro. Pulamos a linha e registramos o aviso,
    // mantendo o resto do arquivo importável.
    if (!Number.isFinite(amount)) {
      warnings.push(
        `Transação sem valor (TRNAMT) válido foi ignorada${fitid ? ` (FITID ${fitid})` : ""}.`,
      );
      return;
    }
    const postedRaw = tagValue(block, "DTPOSTED");
    const postedAt = ofxDateToIso(postedRaw ?? "") ?? "";
    const trnType = tagValue(block, "TRNTYPE");
    const direction = classifyTrnType(trnType);
    // #12 — sinal trocado: tem banco que exporta débito com valor positivo e deixa
    // a direção só no TRNTYPE. Só MARCAMOS aqui — o `amount` continua exatamente o
    // que o arquivo disse. Corrigir o sinal é ato explícito do usuário na UI.
    const signSuspect =
      (direction === "debit" && amount > 0) || (direction === "credit" && amount < 0);
    entries.push({
      fitid,
      postedAt,
      amount,
      trnType,
      memo,
      name: tagValue(block, "NAME"),
      signSuspect,
    });
  });

  if (skippedBalanceLines > 0) {
    warnings.push(
      `${skippedBalanceLines} linha(s) de saldo do banco foram ignoradas (não são transações).`,
    );
  }

  const signSuspectCount = entries.filter((e) => e.signSuspect).length;
  // Banco que exporta tudo positivo (sem nenhum valor negativo) mas tem pelo menos
  // uma transação de tipo débito: a direção do dinheiro está só no TRNTYPE, não no
  // sinal do valor. Ver doc de `OfxStatement.allPositive`.
  const hasNegative = entries.some((e) => e.amount < 0);
  const hasDebitType = entries.some((e) => classifyTrnType(e.trnType) === "debit");
  const allPositive = !hasNegative && hasDebitType;

  if (signSuspectCount > 0) {
    warnings.push(
      `${signSuspectCount} transação(ões) têm o valor com sinal diferente do esperado para o tipo (ex: débito com valor positivo). O valor NÃO foi alterado automaticamente, confira antes de importar.`,
    );
  }
  if (allPositive) {
    warnings.push(
      "Todas as transações deste arquivo vieram com valor positivo, inclusive as de saída (débito). Esse banco parece não usar sinal negativo para débito, revise os tipos antes de importar.",
    );
  }

  return {
    bankId,
    acctId,
    periodStart,
    periodEnd,
    ledgerBalance: ledgerBalance != null && Number.isNaN(ledgerBalance) ? null : ledgerBalance,
    ledgerBalanceDate,
    entries,
    warnings,
    skippedBalanceLines,
    allPositive,
    signSuspectCount,
  };
}

/* ─────────────────────────── dedup key ─────────────────────────── */

/**
 * Hash determinístico e estável (FNV-1a de 32 bits em hex). Não precisa de crypto
 * nativo — roda em qualquer browser e é suficiente pra distinguir linhas do extrato.
 * (Rotulado "sha1(...)" no plano; o que importa é ser determinístico + colisão-improvável.)
 */
function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // >>> 0 pra tratar como unsigned 32-bit.
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Chave de deduplicação de uma entry entre reimports.
 *
 * Regra:
 *  - Com FITID **único** no arquivo → `bankId|acctId|fitid` (link estrutural do banco).
 *  - Sem FITID, OU FITID **repetido no mesmo arquivo** (bancos reais fazem isso, ex:
 *    duas compras de cartão no mesmo lote) → fallback determinístico
 *    `fb:hash(postedAt|amount|memo|ordinal)`. O `ordinal` garante 2 chaves distintas
 *    mesmo quando posted/amount/memo coincidem, respeitando a unique
 *    (bank_account_id, dedup_key) sem colapsar transações legítimas.
 *
 * `seen` acumula os FITIDs estruturais já emitidos NESTE arquivo pra detectar a
 * colisão. Passe o MESMO Set em toda a iteração das entries.
 */
export function computeDedupKey(
  st: OfxStatement,
  entry: OfxEntry,
  ordinal: number,
  seen: Set<string> = new Set(),
): string {
  const bankId = st.bankId ?? "";
  const acctId = st.acctId ?? "";

  if (entry.fitid) {
    const structural = `${bankId}|${acctId}|${entry.fitid}`;
    if (!seen.has(structural)) {
      seen.add(structural);
      return structural;
    }
    // FITID duplicado no mesmo arquivo → cai no fallback pra não colapsar.
  }

  const basis = `${entry.postedAt}|${entry.amount}|${entry.memo ?? ""}|${ordinal}`;
  return `fb:${stableHash(basis)}`;
}
