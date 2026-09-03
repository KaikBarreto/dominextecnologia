// =============================================================================
// _shared/providers/sefin.ts — motor fiscal PRÓPRIO (Sefin Nacional).
// =============================================================================
// Adaptador HTTP para o microserviço `dominex-fiscal` (services/dominex-fiscal),
// que roda na VPS. A Edge Function não faz mTLS — e o padrão nacional autentica
// EXCLUSIVAMENTE por mTLS com o certificado A1 do próprio cliente. Daí o salto.
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ DESENHO DE CUSTÓDIA (§Custódia do plano — decisão do CEO 2026-09-03)      │
// │                                                                           │
// │   .pfx  --cifrado com DEK (AES-256-GCM, uma por empresa)--> ciphertext     │
// │                                              [Supabase Storage, privado]  │
// │   DEK   --cifrada com KEK--------------------------------> DEK envelopada │
// │                                              [company_fiscal_settings]    │
// │   KEK   ................................................ só na VPS        │
// │                                                                           │
// │ ⚠️ A VPS NUNCA guarda acervo e NUNCA fala com a Supabase. É ESTA edge que  │
// │    lê o ciphertext e o envelope e manda no corpo da requisição. Comprometer│
// │    a Supabase sozinha não dá nada (não há KEK); comprometer a VPS sozinha  │
// │    não dá nada (não há acervo). É preciso comprometer as duas.            │
// │                                                                           │
// │ ⚠️ Se algum dia alguém for "otimizar" fazendo o microserviço ler o Storage │
// │    direto, essa propriedade morre. Não faça.                              │
// └───────────────────────────────────────────────────────────────────────────┘
//
// TRILHA DE AUDITORIA: toda decifra vira linha em `fiscal_certificate_audit`.
// Quem grava é a edge (o microserviço não tem banco). É uma exceção consciente
// à regra 3 da fronteira ("provedor não escreve no banco"): a auditoria é do
// MECANISMO de custódia, que é do provedor, e o handler não teria como saber
// quando uma decifra aconteceu.
// =============================================================================

import {
  NfseProviderError,
  NfseProviderUnconfiguredError,
} from "../nfse-provider.ts";
import type {
  NfseCertificadoResultado,
  NfseCoberturaResultado,
  NfseDanfseResultado,
  NfseEmitirInput,
  NfseProvider,
  NfseProviderCtx,
  NfseResultado,
} from "../nfse-provider.ts";
import { mapNfseStatus, NFSE_STATUS } from "../nfse-status.ts";

// -----------------------------------------------------------------------------
// Configuração
// -----------------------------------------------------------------------------

/** Bucket PRIVADO do ciphertext do certificado. Sem policy = só service_role. */
export const BUCKET_CERTIFICADOS = "fiscal-certificates";

const TAG = "[nfse:sefin]";

function env(nome: string): string {
  return (Deno.env.get(nome) ?? "").trim();
}

function baseDoServico(): string {
  const base = env("FISCAL_SERVICE_URL");
  const token = env("FISCAL_SERVICE_TOKEN");
  if (!base || !token) {
    throw new NfseProviderUnconfiguredError(
      "A emissão fiscal própria ainda não está configurada. Fale com o suporte.",
    );
  }
  return base.replace(/\/+$/, "");
}

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function digits(v: unknown): string {
  return clean(v).replace(/\D/g, "");
}

/** company_id encurtado para log (nunca o id inteiro). */
function logId(companyId: string): string {
  return companyId.slice(0, 8) + "...";
}

/**
 * 1 = produção · 2 = homologação.
 * O ambiente é do TENANT (`fiscal_ambiente`), nunca do servidor — e na dúvida
 * cai em homologação, que é o lado seguro do erro.
 */
function ambienteDe(ctx: NfseProviderCtx): number {
  return clean(ctx.fiscal?.fiscal_ambiente).toLowerCase() === "producao" ? 1 : 2;
}

// -----------------------------------------------------------------------------
// Transporte
// -----------------------------------------------------------------------------

interface ErroDoServico {
  erro?: { codigo?: string; mensagem?: string };
}

const INDISPONIVEL =
  "A emissão fiscal está indisponível no momento. Tente novamente em alguns minutos.";

/**
 * Chama o microserviço. Traduz QUALQUER falha em erro neutro com mensagem PT-BR.
 * O usuário nunca vê URL, biblioteca nem stack — só o que dá para agir.
 */
async function chamar(
  caminho: string,
  corpo: unknown,
  opts: { aceitaPdf?: boolean } = {},
): Promise<Response> {
  const url = `${baseDoServico()}${caminho}`;
  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env("FISCAL_SERVICE_TOKEN")}`,
        "Content-Type": "application/json",
        "Accept": opts.aceitaPdf ? "application/pdf" : "application/json",
      },
      body: JSON.stringify(corpo),
    });
  } catch (err) {
    console.error(`${TAG} rede`, { caminho, message: (err as Error)?.message });
    throw new NfseProviderError(INDISPONIVEL, 503, { codigo: "servico_indisponivel" });
  }

  if (resposta.ok) return resposta;

  // 401 do microserviço = token errado do NOSSO lado. Nunca contar isso ao
  // usuário: para ele é indisponibilidade, e para nós é alarme no log.
  if (resposta.status === 401 || resposta.status === 403) {
    console.error(`${TAG} auth`, { caminho, status: resposta.status });
    throw new NfseProviderError(INDISPONIVEL, 503, { codigo: "servico_indisponivel" });
  }

  let payload: ErroDoServico = {};
  try {
    payload = (await resposta.json()) as ErroDoServico;
  } catch {
    payload = {};
  }
  const mensagem = clean(payload?.erro?.mensagem) ||
    "Não foi possível concluir a operação com a nota fiscal. Tente novamente.";
  const codigo = clean(payload?.erro?.codigo) || undefined;
  console.error(`${TAG} erro`, { caminho, status: resposta.status, codigo });
  throw new NfseProviderError(mensagem, resposta.status, { codigo, raw: payload });
}

async function chamarJson<T>(caminho: string, corpo: unknown): Promise<T> {
  const resposta = await chamar(caminho, corpo);
  return (await resposta.json()) as T;
}

// -----------------------------------------------------------------------------
// Custódia: montar o bloco `certificado` que viaja em toda requisição
// -----------------------------------------------------------------------------

interface BlocoCertificado {
  pfxCifradoB64: string;
  dekEnvelopadaB64: string;
  senhaCifradaB64: string;
  nonceB64: string;
  algoritmo: string;
}

const SEM_CERTIFICADO =
  "Envie o certificado digital da empresa nas configurações fiscais antes de emitir notas.";

/**
 * Lê o ciphertext do Storage + o envelope do banco.
 *
 * ⚠️ O conteúdo do objeto é o ciphertext em BASE64 (texto), não binário: assim
 * ele atravessa JSON sem reencode e o que está no bucket já é ilegível mesmo
 * para quem tiver a chave de service_role do Storage.
 */
async function carregarCertificado(ctx: NfseProviderCtx): Promise<BlocoCertificado> {
  const ref = clean(ctx.fiscal?.certificado_ref);
  const dek = clean(ctx.fiscal?.certificado_dek_envelopada);
  const senha = clean(ctx.fiscal?.certificado_senha_cifrada);
  if (!ref || !dek || !senha) {
    throw new NfseProviderError(SEM_CERTIFICADO, 422, { codigo: "certificado_ausente" });
  }

  const { data, error } = await ctx.supabase.storage
    .from(BUCKET_CERTIFICADOS)
    .download(ref);
  if (error || !data) {
    console.error(`${TAG} storage`, {
      company_id: logId(ctx.companyId),
      message: error?.message ?? "objeto ausente",
    });
    throw new NfseProviderError(
      "Não foi possível ler o certificado digital da empresa. Envie o certificado novamente.",
      422,
      { codigo: "certificado_ilegivel" },
    );
  }

  return {
    pfxCifradoB64: (await data.text()).trim(),
    dekEnvelopadaB64: dek,
    senhaCifradaB64: senha,
    nonceB64: clean(ctx.fiscal?.certificado_nonce),
    algoritmo: clean(ctx.fiscal?.certificado_algoritmo) || "AES-256-GCM",
  };
}

/**
 * Registra o uso do certificado (append-only).
 *
 * Nunca derruba a operação: perder uma linha de auditoria é ruim, impedir o
 * cliente de faturar por causa disso é pior. A falha vai para o log.
 */
async function auditar(
  ctx: NfseProviderCtx,
  operacao: string,
  contexto: string,
): Promise<void> {
  try {
    await ctx.supabase.from("fiscal_certificate_audit").insert({
      company_id: ctx.companyId,
      operacao,
      contexto,
      origem: "edge:nfse",
    });
  } catch (err) {
    console.error(`${TAG} auditoria`, {
      company_id: logId(ctx.companyId),
      message: (err as Error)?.message,
    });
  }
}

/** Bloco comum de toda requisição autenticada ao microserviço. */
async function corpoBase(
  ctx: NfseProviderCtx,
  contextoAuditoria: string,
): Promise<Record<string, unknown>> {
  const certificado = await carregarCertificado(ctx);
  await auditar(ctx, "decifra", contextoAuditoria);
  return {
    empresaId: ctx.companyId,
    ambiente: ambienteDe(ctx),
    certificado,
  };
}

// -----------------------------------------------------------------------------
// Resposta do microserviço
// -----------------------------------------------------------------------------

interface RespostaNfse {
  status?: string;
  chaveAcesso?: string;
  numero?: string;
  idDps?: string;
  dataEmissao?: string;
  ambiente?: number;
  xml?: string;
  cancelada?: boolean;
  alertas?: Array<{ codigo?: string; descricao?: string }>;
}

/**
 * Normaliza para o contrato da fronteira.
 *
 * O microserviço já responde no vocabulário canônico PT-BR; ainda assim tudo
 * passa por `mapNfseStatus` com fallback — status que não sabemos ler NUNCA
 * pode rebaixar uma nota autorizada.
 *
 * ⚠️ `referencia` do motor próprio é a CHAVE DE ACESSO (50 dígitos): é ela que
 * identifica a nota no governo (não existe "id do documento no fornecedor").
 * O handler grava em `fisqal_dps_id` — coluna que a Fase D3 renomeia para
 * `provider_referencia`.
 */
function paraResultado(
  dados: RespostaNfse,
  fallbackStatus: string,
  referencia?: string,
): NfseResultado {
  const chave = clean(dados.chaveAcesso) || clean(referencia) || null;
  const status = mapNfseStatus(dados.status, fallbackStatus);
  return {
    status,
    referencia: chave,
    requisicaoId: null,
    numero: clean(dados.numero) || null,
    chaveAcesso: chave,
    protocolo: null,
    emitidaEm: clean(dados.dataEmissao) || null,
    xml: dados.xml ?? null,
    // O XML autorizado é o documento fiscal: vai no `raw` para ficar guardado
    // em `nfse_events.payload` (append-only) até existir coluna própria.
    raw: dados,
  };
}

// -----------------------------------------------------------------------------
// Provider
// -----------------------------------------------------------------------------

export const sefinProvider: NfseProvider = {
  nome: "sefin",

  // ---------------------------------------------------------------------------
  // Emissão — POST /v1/nfse/emitir. SÍNCRONA: volta autorizada ou rejeitada.
  // ---------------------------------------------------------------------------
  async emitir(ctx: NfseProviderCtx, input: NfseEmitirInput): Promise<NfseResultado> {
    const { dps, tomador, servico, valores } = input;
    const base = await corpoBase(ctx, "emitir_nfse");

    const valoresPayload: Record<string, unknown> = { valorServico: valores.valorServico };
    // Campo AUSENTE = não enviar (≠ zero). A supressão da alíquota (E0625) já
    // chega decidida do handler — aqui não se recalcula nem se chuta.
    if (valores.aliquotaIssqn !== undefined) valoresPayload.aliquotaIssqn = valores.aliquotaIssqn;
    if (valores.tribIssqn !== undefined) valoresPayload.tribIssqn = valores.tribIssqn;
    if (valores.tpRetIssqn !== undefined) valoresPayload.tpRetIssqn = valores.tpRetIssqn;
    if (valores.valorPis !== undefined) valoresPayload.valorPis = valores.valorPis;
    if (valores.valorCofins !== undefined) valoresPayload.valorCofins = valores.valorCofins;
    if (valores.valorCsll !== undefined) valoresPayload.valorCsll = valores.valorCsll;
    if (valores.percentualTotalTributosSimplesNacional !== undefined) {
      valoresPayload.percentualTotalTributosSimplesNacional =
        valores.percentualTotalTributosSimplesNacional;
    }

    const dados = await chamarJson<RespostaNfse>("/v1/nfse/emitir", {
      ...base,
      dps: {
        id: dps.idDps,
        serie: dps.serieDps,
        numero: dps.numeroDps,
        dataCompetencia: dps.dataCompetencia,
        codigoMunicipioEmissor: dps.codigoMunicipioEmissor,
      },
      // ⚠️ Só CNPJ, e-mail e regime do prestador. Nome/endereço/IM NÃO vão:
      // quando o prestador é o emitente, o governo puxa do cadastro e rejeita
      // com E0121/E0128/E0120 se mandarmos (armadilhas 2 e 3 do spike).
      prestador: {
        tipoInscricao: dps.tipoInscricaoPrestador,
        inscricaoFederal: dps.inscricaoFederalPrestador,
        email: clean(dps.emailPrestador) || undefined,
        opSimpNac: dps.opSimpNac ?? undefined,
        regApTribSN: dps.regApTribSN ?? undefined,
      },
      tomador: {
        tipoInscricao: tomador.tipoInscricao,
        inscricaoFederal: tomador.inscricaoFederal,
        razaoSocial: tomador.razaoSocial,
        email: clean(tomador.email) || undefined,
        endereco: tomador.endereco
          ? {
            municipioIbge: clean(tomador.endereco.municipioIbge) || undefined,
            cep: digits(tomador.endereco.cep) || undefined,
            logradouro: clean(tomador.endereco.logradouro) || undefined,
            numero: clean(tomador.endereco.numero) || undefined,
            complemento: clean(tomador.endereco.complemento) || undefined,
            bairro: clean(tomador.endereco.bairro) || undefined,
          }
          : undefined,
      },
      servico: {
        codigoServico: servico.codigoServico,
        codigoNbs: servico.codigoNbs,
        municipioIncidencia: servico.municipioIncidencia,
        discriminacao: servico.discriminacao,
        // Rede de segurança: último ponto antes da prefeitura (E0312).
        codigoTributacaoMunicipal: /^\d{3}$/.test(clean(servico.codigoTributacaoMunicipal))
          ? clean(servico.codigoTributacaoMunicipal)
          : undefined,
      },
      valores: valoresPayload,
    });

    return paraResultado(dados, NFSE_STATUS.AUTORIZADA);
  },

  // ---------------------------------------------------------------------------
  // Consulta — POST /v1/nfse/{chave}/consultar.
  // ⚠️ Alias POST da rota GET do contrato: o `fetch` do Deno recusa corpo em GET,
  // e o bloco `certificado` PRECISA viajar no corpo (a VPS não guarda acervo).
  // ---------------------------------------------------------------------------
  async consultar(
    ctx: NfseProviderCtx,
    referencia: string,
    opts?: { statusAtual?: string },
  ): Promise<NfseResultado> {
    const chave = digits(referencia);
    const base = await corpoBase(ctx, chave || "consultar_nfse");
    const dados = await chamarJson<RespostaNfse>(`/v1/nfse/${chave}/consultar`, base);
    return paraResultado(
      dados,
      clean(opts?.statusAtual) || NFSE_STATUS.PENDENTE,
      chave,
    );
  },

  // ---------------------------------------------------------------------------
  // Cancelamento — POST /v1/nfse/{chave}/cancelar (evento 101101).
  // ⚠️ Cancelar é REGISTRAR EVENTO: a NFS-e continua com cStat 100 e a situação
  // vem do evento vinculado à chave. Por isso `consultar` também olha o evento.
  // ---------------------------------------------------------------------------
  async cancelar(
    ctx: NfseProviderCtx,
    referencia: string,
    motivo: string,
  ): Promise<NfseResultado> {
    const chave = digits(referencia);

    // CNPJ do autor do evento = o emitente. Vem de `companies`, filtrado por id.
    const { data: empresa } = await ctx.supabase
      .from("companies")
      .select("cnpj")
      .eq("id", ctx.companyId)
      .maybeSingle();
    const cnpjAutor = digits(empresa?.cnpj);
    if (!cnpjAutor) {
      throw new NfseProviderError(
        "Cadastre o CNPJ da empresa antes de cancelar uma nota fiscal.",
        422,
        { codigo: "cnpj_ausente" },
      );
    }

    const base = await corpoBase(ctx, chave || "cancelar_nfse");
    const dados = await chamarJson<RespostaNfse>(`/v1/nfse/${chave}/cancelar`, {
      ...base,
      cnpjAutor,
      motivo,
      // cMotivo do layout: 1 erro na emissão · 2 serviço não prestado · 9 outros.
      codigoMotivo: "1",
    });

    return paraResultado(dados, NFSE_STATUS.CANCELADA, chave);
  },

  // ---------------------------------------------------------------------------
  // DANFSE — POST /v1/nfse/{chave}/danfse. O microserviço tenta o PDF oficial
  // do governo e cai para geração local quando ele está fora (esteve 503).
  // ---------------------------------------------------------------------------
  async danfse(ctx: NfseProviderCtx, referencia: string): Promise<NfseDanfseResultado> {
    const chave = digits(referencia);
    const base = await corpoBase(ctx, chave || "danfse");
    const resposta = await chamar(`/v1/nfse/${chave}/danfse`, base, { aceitaPdf: true });

    const bytes = new Uint8Array(await resposta.arrayBuffer());
    if (bytes.length === 0) {
      throw new NfseProviderError(
        "Não foi possível gerar o PDF da nota fiscal agora. A nota continua válida — tente novamente em instantes.",
        503,
        { codigo: "danfse_indisponivel" },
      );
    }

    // Base64 em blocos: `String.fromCharCode(...bytes)` estoura a pilha num PDF
    // de algumas centenas de KB.
    let binario = "";
    const BLOCO = 0x8000;
    for (let i = 0; i < bytes.length; i += BLOCO) {
      binario += String.fromCharCode(...bytes.subarray(i, i + BLOCO));
    }
    return { pdfBase64: btoa(binario) };
  },

  // ---------------------------------------------------------------------------
  // Certificado A1 — cifra no microserviço, ciphertext no Storage privado.
  //
  // ⚠️ Por que o .pfx em claro vai até a VPS (uma vez, por TLS) em vez de a edge
  // cifrar e só pedir o envelopamento da DEK: assim existe UMA implementação de
  // cripto (Python), não duas (Deno + Python) que precisam concordar byte a byte
  // para sempre. A edge nunca vê DEK nem KEK; ela recebe só ciphertext. E a
  // exposição não é nova: o material já trafega browser→edge e a VPS já o decifra
  // a cada emissão. Em troca, ganhamos a validade do certificado (que o provedor
  // anterior não devolvia, deixando `certificate_expires_at` sempre nulo).
  // ---------------------------------------------------------------------------
  async enviarCertificado(
    ctx: NfseProviderCtx,
    arquivo: File,
    senha: string,
    _nome?: string,
  ): Promise<NfseCertificadoResultado> {
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    let binario = "";
    const BLOCO = 0x8000;
    for (let i = 0; i < bytes.length; i += BLOCO) {
      binario += String.fromCharCode(...bytes.subarray(i, i + BLOCO));
    }

    const selado = await chamarJson<{
      certificado: BlocoCertificado;
      validadeAte?: string;
      titular?: string;
      cnpj?: string;
    }>("/v1/certificado/selar", {
      empresaId: ctx.companyId,
      pfxB64: btoa(binario),
      senha,
    });

    const cifrado = selado?.certificado;
    if (!cifrado?.pfxCifradoB64 || !cifrado?.dekEnvelopadaB64) {
      return {
        ok: false,
        mensagem: "Não foi possível guardar o certificado com segurança. Tente novamente.",
      };
    }

    await garantirBucket(ctx);

    // Caminho com timestamp: o certificado novo NÃO sobrescreve o anterior no
    // mesmo instante em que a linha do banco ainda aponta para o antigo (evita
    // a janela em que o ciphertext e a DEK envelopada não são do mesmo par).
    const caminho = `${ctx.companyId}/cert-${Date.now()}.b64`;
    const { error: erroUpload } = await ctx.supabase.storage
      .from(BUCKET_CERTIFICADOS)
      .upload(caminho, new Blob([cifrado.pfxCifradoB64], { type: "text/plain" }), {
        contentType: "text/plain",
        upsert: false,
      });
    if (erroUpload) {
      console.error(`${TAG} upload`, {
        company_id: logId(ctx.companyId),
        message: erroUpload.message,
      });
      return {
        ok: false,
        mensagem: "Não foi possível guardar o certificado digital. Tente novamente.",
      };
    }

    let validadeAte: string | null = null;
    if (selado.validadeAte) {
      const d = new Date(selado.validadeAte);
      if (!Number.isNaN(d.getTime())) validadeAte = d.toISOString();
    }

    return {
      ok: true,
      referenciaCertificado: caminho,
      status: "ativo",
      validadeAte,
      mensagem: "Certificado digital enviado e guardado com segurança.",
      custodia: {
        certificadoRef: caminho,
        dekEnvelopada: cifrado.dekEnvelopadaB64,
        senhaCifrada: cifrado.senhaCifradaB64,
        nonce: cifrado.nonceB64 ?? "",
        algoritmo: cifrado.algoritmo || "AES-256-GCM",
      },
    };
  },

  // ---------------------------------------------------------------------------
  // Cobertura municipal.
  //
  // ⚠️ No padrão nacional NÃO existe "cobertura por fornecedor": quem aderiu está
  // no ADN e pronto (~3.413 municípios). Consultamos a parametrização do ADN só
  // para confirmar e trazer município/UF.
  //
  // Regra da dúvida (deliberada): só devolvemos `podeEmitir: false` quando o ADN
  // AFIRMA que o município não está parametrizado (404). Se o ADN não responde
  // ou exige certificado, seguimos com `true` — bloquear todo mundo por causa de
  // uma indisponibilidade do governo seria pior, e a prova definitiva acontece
  // na emissão, que devolve erro legível da prefeitura.
  // ---------------------------------------------------------------------------
  async checarCobertura(
    ctx: NfseProviderCtx,
    ibge: string,
  ): Promise<NfseCoberturaResultado> {
    const producao = ambienteDe(ctx) === 1;
    const base = producao ? "https://adn.nfse.gov.br" : "https://adn.producaorestrita.nfse.gov.br";
    const hoje = new Date();
    const competencia = `${hoje.getUTCFullYear()}-${
      String(hoje.getUTCMonth() + 1).padStart(2, "0")
    }-01`;

    let status = 0;
    let corpo: unknown = null;
    try {
      const resposta = await fetch(
        `${base}/parametrizacao/${ibge}/${competencia}/retencoes`,
        { headers: { "Accept": "application/json" } },
      );
      status = resposta.status;
      corpo = await resposta.json().catch(() => null);
    } catch (err) {
      console.error(`${TAG} cobertura`, { message: (err as Error)?.message });
    }

    const naoParametrizado = status === 404;
    return {
      podeEmitir: !naoParametrizado,
      municipio: null,
      uf: null,
      raw: {
        origem: "padrao_nacional",
        consultaAdn: { status, corpo },
        observacao: naoParametrizado
          ? "Este município ainda não está no padrão nacional de NFS-e."
          : "Município atendido pelo padrão nacional de NFS-e.",
      },
    };
  },

  // ---------------------------------------------------------------------------
  // NÃO IMPLEMENTADOS DE PROPÓSITO (o handler já responde bem sem eles):
  //
  //   registrarEmpresa — o padrão nacional NÃO tem cadastro prévio; a credencial
  //     é o certificado A1. `emit.ts` usa a AUSÊNCIA deste método para saber que
  //     não deve exigir "empresa registrada". Implementar aqui quebraria isso.
  //
  //   buscarCatalogo — o governo não publica API de catálogo de cTribNac/NBS.
  //     O handler responde 501 e o campo da tela continua aceitando digitação
  //     manual do código. Ver pendência no relatório da Fase C.
  // ---------------------------------------------------------------------------
};

/**
 * Garante o bucket privado do ciphertext (idempotente).
 *
 * ⚠️ Sem policy de Storage, bucket privado = só `service_role` lê/escreve, que é
 * exatamente o que queremos: nem o tenant dono do certificado tem acesso ao
 * arquivo. Criar por API mantém o serviço funcional; a migration equivalente é
 * do dev-database (ver relatório).
 */
async function garantirBucket(ctx: NfseProviderCtx): Promise<void> {
  try {
    const { error } = await ctx.supabase.storage.createBucket(BUCKET_CERTIFICADOS, {
      public: false,
      fileSizeLimit: 1024 * 1024 * 2, // .pfx real tem alguns KB; 2 MB é folga
    });
    // "already exists" é o caminho normal a partir do segundo upload.
    if (error && !/exist/i.test(error.message ?? "")) {
      console.error(`${TAG} bucket`, { message: error.message });
    }
  } catch (err) {
    console.error(`${TAG} bucket`, { message: (err as Error)?.message });
  }
}
