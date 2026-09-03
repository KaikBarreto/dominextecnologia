// =============================================================================
// _shared/providers/fisqal.ts — implementação do NfseProvider para a Fisqal.
// =============================================================================
// B2 do plano "NFS-e motor próprio": TODA conversa com a Fisqal mora aqui.
// Nenhuma edge conhece este arquivo — elas falam com `_shared/nfse-provider.ts`.
//
// REFACTOR PURO: a lógica é a MESMA que morava nas edges `fisqal-*`, incluindo
// as correções de 2026-09-02 que não podem regredir:
//   - `opSimpNac` / `regApTribSN` derivados do regime (calculados no handler e
//     entregues prontos aqui, no vocabulário do layout nacional);
//   - supressão de `aliquotaIssqn` na tripla opSimpNac='3' + regApTribSN='1' +
//     tpRetIssqn='1' (rejeição E0625) — o handler já entrega `valores` sem o
//     campo; aqui só repassamos o que veio (campo ausente = não enviar);
//   - `PATCH /v1/companies/{id}` quando a empresa já está registrada;
//   - status canônico PT-BR na fronteira (`_shared/nfse-status.ts`).
//
// Este arquivo some inteiro na Fase D3 (saída definitiva da Fisqal).
// =============================================================================

import {
  buildQuery,
  fisqal,
  FisqalApiError,
  FisqalConfigError,
  idempotencyHeader,
} from "../fisqal-client.ts";
import {
  mapNfseCancelStatus,
  mapNfseStatus,
  NFSE_STATUS,
} from "../nfse-status.ts";
import {
  NfseProviderError,
  NfseProviderUnconfiguredError,
} from "../nfse-provider.ts";
import type {
  NfseCatalogoItem,
  NfseCatalogoResultado,
  NfseCertificadoResultado,
  NfseCoberturaResultado,
  NfseDanfseResultado,
  NfseEmitirInput,
  NfseEmpresaInput,
  NfseEmpresaResultado,
  NfseProvider,
  NfseProviderCtx,
  NfseResultado,
} from "../nfse-provider.ts";

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Converte o erro cru da Fisqal no erro NEUTRO da fronteira.
 * Nenhum handler importa FisqalApiError/FisqalConfigError — o nome do
 * fornecedor não atravessa esta função.
 */
function toProviderError(err: unknown): never {
  if (err instanceof FisqalConfigError) {
    throw new NfseProviderUnconfiguredError("Integração fiscal não configurada.");
  }
  if (err instanceof FisqalApiError) {
    throw new NfseProviderError(err.message, err.status, {
      codigo: err.code,
      raw: err.fisqalError,
    });
  }
  throw err;
}

/** Executa uma chamada à Fisqal já traduzindo o erro para a fronteira neutra. */
async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    toProviderError(err);
  }
}

/** Id da empresa do tenant na Fisqal (coluna legada `fisqal_company_id`). */
function empresaRef(ctx: NfseProviderCtx): string {
  return clean(ctx.fiscal?.fisqal_company_id);
}

// -----------------------------------------------------------------------------
// Catálogos (normalização compartilhada com a edge de tax-codes)
// -----------------------------------------------------------------------------

function normalizeCatalogo(raw: unknown): NfseCatalogoResultado {
  let list: any[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.items)) list = obj.items as any[];
    else if (Array.isArray(obj.data)) list = obj.data as any[];
  }

  const items: NfseCatalogoItem[] = list.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    const item: NfseCatalogoItem = {
      codigo: String(r.codigo ?? r.code ?? r.cTribNac ?? "").trim(),
      descricao: String(r.descricao ?? r.description ?? "").trim(),
    };
    const lc116 = r.itemLc116 ?? r.itemLC116 ?? r.lc116;
    if (lc116 !== undefined && lc116 !== null && `${lc116}` !== "") {
      item.itemLc116 = String(lc116).trim();
    }
    return item;
  });

  const totalRaw = (raw && typeof raw === "object")
    ? (raw as Record<string, unknown>).total
    : undefined;
  const total = typeof totalRaw === "number" ? totalRaw : items.length;

  return { items, total };
}

// -----------------------------------------------------------------------------
// Provider
// -----------------------------------------------------------------------------

export const fisqalProvider: NfseProvider = {
  nome: "fisqal",

  // ---------------------------------------------------------------------------
  // Emissão — POST /v1/nfse (CreateNfseDpsDto) com Idempotency-Key.
  // ---------------------------------------------------------------------------
  async emitir(ctx: NfseProviderCtx, input: NfseEmitirInput): Promise<NfseResultado> {
    const { dps, tomador, servico, valores } = input;

    // `valores`: campo AUSENTE = não enviar (não é o mesmo que zero). A supressão
    // da alíquota (E0625) já chega decidida do handler — aqui não se recalcula.
    const valoresPayload: Record<string, unknown> = {
      valorServico: valores.valorServico,
    };
    if (valores.aliquotaIssqn !== undefined) {
      valoresPayload.aliquotaIssqn = valores.aliquotaIssqn;
    }
    if (valores.tribIssqn !== undefined) valoresPayload.tribIssqn = valores.tribIssqn;
    if (valores.tpRetIssqn !== undefined) valoresPayload.tpRetIssqn = valores.tpRetIssqn;
    if (valores.valorPis !== undefined) valoresPayload.valorPis = valores.valorPis;
    if (valores.valorCofins !== undefined) valoresPayload.valorCofins = valores.valorCofins;
    if (valores.valorCsll !== undefined) valoresPayload.valorCsll = valores.valorCsll;
    if (valores.percentualTotalTributosSimplesNacional !== undefined) {
      valoresPayload.percentualTotalTributosSimplesNacional =
        valores.percentualTotalTributosSimplesNacional;
    }

    const servicoPayload: Record<string, unknown> = {
      codigoServico: servico.codigoServico,
      codigoNbs: servico.codigoNbs,
      municipioIncidencia: servico.municipioIncidencia,
      discriminacao: servico.discriminacao,
    };
    // cTribMun: só entra quando informado E no formato do layout nacional
    // (3 dígitos). O handler já valida — aqui é rede de segurança, porque este é
    // o último ponto antes da prefeitura.
    // ⚠️ O campo no DTO da Fisqal é `codigoTributacaoMunicipio` (docs/integracoes/
    // fisqal.md §8.1), NÃO `...Municipal`: nome errado = campo ignorado em
    // silêncio e rejeição E0312 sem pista nenhuma.
    const cTribMun = clean(servico.codigoTributacaoMunicipal);
    if (/^\d{3}$/.test(cTribMun)) {
      servicoPayload.codigoTributacaoMunicipio = cTribMun;
    }

    const payload: Record<string, unknown> = {
      companyId: empresaRef(ctx),
      idDps: dps.idDps,
      serieDps: dps.serieDps,
      numeroDps: dps.numeroDps,
      codigoMunicipioEmissor: dps.codigoMunicipioEmissor,
      tipoInscricaoPrestador: dps.tipoInscricaoPrestador,
      inscricaoFederalPrestador: dps.inscricaoFederalPrestador,
      dataCompetencia: dps.dataCompetencia,
      ...(dps.opSimpNac ? { opSimpNac: dps.opSimpNac } : {}),
      ...(dps.regApTribSN ? { regApTribSN: dps.regApTribSN } : {}),
      tomador: {
        tipoInscricao: tomador.tipoInscricao,
        inscricaoFederal: tomador.inscricaoFederal,
        razaoSocial: tomador.razaoSocial,
        email: clean(tomador.email) || undefined,
      },
      servico: servicoPayload,
      valores: valoresPayload,
    };

    const created = await call(() =>
      fisqal.post<{ dpsId?: string; status?: string; fiscalRequestId?: string }>(
        "/v1/nfse",
        payload,
        idempotencyHeader(input.idempotencyKey),
      )
    );

    return {
      // Status SEMPRE canônico PT-BR — a Fisqal responde em inglês.
      status: mapNfseStatus(created?.status, NFSE_STATUS.PENDENTE),
      referencia: clean(created?.dpsId) || null,
      requisicaoId: clean(created?.fiscalRequestId) || null,
      raw: created ?? null,
    };
  },

  // ---------------------------------------------------------------------------
  // Consulta — GET /v1/nfse/{id} (+ timeline, pdf e xml quando autorizada).
  // ---------------------------------------------------------------------------
  async consultar(
    _ctx: NfseProviderCtx,
    referencia: string,
    opts?: { statusAtual?: string },
  ): Promise<NfseResultado> {
    const doc = await call(() =>
      fisqal.get<Record<string, any>>(`/v1/nfse/${referencia}`)
    );

    let timeline: Record<string, any> | null = null;
    try {
      timeline = await fisqal.get<Record<string, any>>(`/v1/nfse/${referencia}/status`);
    } catch (_) {
      // Timeline é complementar; falha não impede atualizar pelo doc.
      timeline = null;
    }

    // Desconhecido/vazio → mantém o status atual (não rebaixa a nota).
    const status = mapNfseStatus(
      doc?.status,
      clean(opts?.statusAtual) || NFSE_STATUS.PENDENTE,
    );

    const resultado: NfseResultado = {
      status,
      referencia,
      raw: { doc, timeline },
    };

    if (status === NFSE_STATUS.AUTORIZADA) {
      try {
        const pdf = await fisqal.get<Record<string, any>>(`/v1/nfse/${referencia}/pdf`);
        const pdfUrl = clean(pdf?.url) || clean(pdf?.pdfUrl) || clean(pdf?.signedUrl);
        if (pdfUrl) resultado.pdfUrl = pdfUrl;
      } catch (_) { /* best-effort */ }
      try {
        const xml = await fisqal.get<Record<string, any>>(`/v1/nfse/${referencia}/xml`);
        const xmlUrl = clean(xml?.url) || clean(xml?.xmlUrl) || clean(xml?.signedUrl);
        if (xmlUrl) resultado.xmlUrl = xmlUrl;
      } catch (_) { /* best-effort */ }

      const numero = clean(doc?.numero_nfse) || clean(doc?.numeroNfse) || clean(doc?.numero);
      const chave = clean(doc?.chave_acesso) || clean(doc?.chaveAcesso);
      const protocolo = clean(doc?.protocolo);
      if (numero) resultado.numero = numero;
      if (chave) resultado.chaveAcesso = chave;
      if (protocolo) resultado.protocolo = protocolo;
      resultado.emitidaEm = clean(doc?.emitida_em) || clean(doc?.emitidaEm) || null;
    }

    if (status === NFSE_STATUS.REJEITADA || status === NFSE_STATUS.FALHOU) {
      const motivo = clean(doc?.message) || clean(doc?.motivo);
      if (motivo) resultado.erro = { mensagem: motivo };
    }

    return resultado;
  },

  // ---------------------------------------------------------------------------
  // Cancelamento — POST /v1/nfse/{id}/cancel (motivoCancelamento 15..255).
  // ---------------------------------------------------------------------------
  async cancelar(
    _ctx: NfseProviderCtx,
    referencia: string,
    motivo: string,
  ): Promise<NfseResultado> {
    const result = await call(() =>
      fisqal.post<Record<string, any>>(`/v1/nfse/${referencia}/cancel`, {
        motivoCancelamento: motivo,
      })
    );

    // A fila de cancelamento da Fisqal é assíncrona: pending/processing/sent aqui
    // querem dizer "cancelamento pendente", não "pendente". Ver _shared/nfse-status.ts.
    return {
      status: mapNfseCancelStatus(result?.status),
      referencia,
      raw: result ?? null,
    };
  },

  // ---------------------------------------------------------------------------
  // DANFSE — GET /v1/nfse/{id}/pdf (URL assinada).
  // ---------------------------------------------------------------------------
  async danfse(_ctx: NfseProviderCtx, referencia: string): Promise<NfseDanfseResultado> {
    const pdf = await call(() =>
      fisqal.get<Record<string, any>>(`/v1/nfse/${referencia}/pdf`)
    );
    const pdfUrl = clean(pdf?.url) || clean(pdf?.pdfUrl) || clean(pdf?.signedUrl);
    return { pdfUrl: pdfUrl || null };
  },

  // ---------------------------------------------------------------------------
  // Registro da empresa — POST /v1/companies (1ª vez) ou PATCH (já registrada).
  // ---------------------------------------------------------------------------
  async registrarEmpresa(
    _ctx: NfseProviderCtx,
    dados: NfseEmpresaInput,
  ): Promise<NfseEmpresaResultado> {
    const existente = clean(dados.referenciaExistente);
    const isUpdate = existente.length > 0;

    const payload = {
      razao_social: dados.razaoSocial,
      nome_fantasia: clean(dados.nomeFantasia) || dados.razaoSocial,
      cnpj: dados.cnpj,
      inscricao_municipal: dados.inscricaoMunicipal,
      inscricao_estadual: clean(dados.inscricaoEstadual) || undefined,
      codigo_municipio: dados.codigoMunicipio,
      municipio: dados.municipio,
      uf: dados.uf,
      logradouro: dados.logradouro,
      numero: clean(dados.numero) || undefined,
      bairro: clean(dados.bairro) || undefined,
      cep: dados.cep,
      email: clean(dados.email) || undefined,
      telefone: clean(dados.telefone) || undefined,
      fiscal_ambiente: dados.ambiente,
    };

    if (isUpdate) {
      // PATCH propaga correção de Inscrição Municipal, endereço e troca de
      // ambiente. Sem isso o 1º registro virava beco sem saída.
      await call(() =>
        fisqal.patch<{ id?: string }>(`/v1/companies/${existente}`, payload)
      );
      return {
        ok: true,
        referenciaEmpresa: existente,
        atualizado: true,
        mensagem: "Dados da empresa atualizados na emissão fiscal.",
      };
    }

    const created = await call(() =>
      fisqal.post<{ id?: string }>("/v1/companies", payload)
    );
    const novoId = clean(created?.id);
    if (!novoId) {
      return {
        ok: false,
        referenciaEmpresa: null,
        atualizado: false,
        mensagem:
          "A emissão fiscal respondeu sem identificador da empresa. Tente novamente.",
      };
    }
    return {
      ok: true,
      referenciaEmpresa: novoId,
      atualizado: false,
      mensagem: "Empresa registrada na emissão fiscal com sucesso.",
    };
  },

  // ---------------------------------------------------------------------------
  // Certificado A1 — POST /v1/companies/{id}/certificates (multipart).
  // NUNCA persistimos o .pfx nem a senha: só o id do certificado e a validade.
  // ---------------------------------------------------------------------------
  async enviarCertificado(
    ctx: NfseProviderCtx,
    arquivo: File,
    senha: string,
    nome?: string,
  ): Promise<NfseCertificadoResultado> {
    const empresa = empresaRef(ctx);
    if (!empresa) {
      return {
        ok: false,
        mensagem: "Registre a empresa na emissão fiscal antes de enviar o certificado.",
      };
    }

    const fwd = new FormData();
    fwd.append("file", arquivo, arquivo.name);
    fwd.append("password", senha);
    fwd.append("nome", clean(nome) || arquivo.name);

    const result = await call(() =>
      fisqal.post<{
        id?: string;
        nome?: string;
        status?: string;
        // A doc §10 não confirma o campo de validade — lemos defensivamente.
        validade?: string;
        valid_to?: string;
        expires_at?: string;
        not_after?: string;
      }>(`/v1/companies/${empresa}/certificates`, fwd)
    );

    const certificateId = clean(result?.id);
    if (!certificateId) {
      return {
        ok: false,
        mensagem:
          "A emissão fiscal respondeu sem identificador do certificado. Tente novamente.",
      };
    }

    const rawExpires = result?.validade ?? result?.valid_to ?? result?.expires_at ??
      result?.not_after ?? null;
    let validadeAte: string | null = null;
    if (rawExpires) {
      const d = new Date(rawExpires);
      if (!Number.isNaN(d.getTime())) validadeAte = d.toISOString();
    }

    return {
      ok: true,
      referenciaCertificado: certificateId,
      status: result?.status ?? null,
      validadeAte,
      mensagem: "Certificado digital enviado com sucesso.",
    };
  },

  // ---------------------------------------------------------------------------
  // Cobertura municipal — GET /v1/nfse/municipios/{ibge}/cobertura.
  // ---------------------------------------------------------------------------
  async checarCobertura(
    _ctx: NfseProviderCtx,
    ibge: string,
  ): Promise<NfseCoberturaResultado> {
    const coverage = await call(() =>
      fisqal.get<{
        codigoMunicipioIbge?: string;
        municipio?: string;
        uf?: string;
        podeEmitir?: boolean;
        provedor?: string;
        padraoNfse?: string;
        ambiente?: string;
        nacionalAderido?: boolean;
        nacionalParametrizado?: boolean;
      }>(`/v1/nfse/municipios/${ibge}/cobertura`)
    );

    return {
      podeEmitir: coverage?.podeEmitir === true,
      municipio: clean(coverage?.municipio) || null,
      uf: clean(coverage?.uf) || null,
      raw: coverage,
    };
  },

  // ---------------------------------------------------------------------------
  // Catálogos oficiais — códigos de tributação (cTribNac/LC116) e NBS.
  // ---------------------------------------------------------------------------
  async buscarCatalogo(
    _ctx: NfseProviderCtx,
    params: { tipo: "servico" | "nbs"; q?: string; limit?: number },
  ): Promise<NfseCatalogoResultado> {
    if (params.tipo === "nbs") {
      const raw = await call(() =>
        fisqal.get(
          "/v1/nfse/codigos-nbs",
          buildQuery({ q: params.q, limit: params.limit }),
        )
      );
      return normalizeCatalogo(raw);
    }
    const raw = await call(() =>
      fisqal.get(
        "/v1/nfse/codigos-tributacao",
        buildQuery({ q: params.q || undefined, limit: params.limit }),
      )
    );
    return normalizeCatalogo(raw);
  },
};
