import {
  authorizeFiscalManager,
  corsHeaders,
  jsonResponse,
} from "../_shared/fiscal-auth.ts";
import type { NfseProviderCtx } from "../_shared/nfse-provider.ts";
import {
  NfeMotorError,
  authorizeNfe,
  consultNfe,
  prepareNfe,
  prepareNfeCancellation,
  transmitNfeCancellation,
} from "../_shared/nfe-client.ts";
import {
  NfceMotorError,
  authorizeNfce,
  consultNfce,
  prepareNfce,
  prepareNfceCancellation,
  transmitNfceCancellation,
} from "../_shared/nfce-client.ts";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
const text = (value: unknown, max = 500) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const digits = (value: unknown) => text(value).replace(/\D/g, "");
const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: number) => Math.round(value * 100) / 100;
const uuid = (value: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    text(value),
  )
    ? text(value)
    : null;
const asRows = (value: unknown): JsonObject[] =>
  Array.isArray(value) ? value.map(object) : [];

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value as JsonObject)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${stable((value as JsonObject)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}
async function sha256(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(stable(value)),
  );
  return Array.from(new Uint8Array(bytes))
    .map((entry) => entry.toString(16).padStart(2, "0"))
    .join("");
}

interface NormalizedDraft {
  id: string | null;
  model: 55 | 65;
  direction: "entrada" | "saida";
  sourceType: "manual" | "pdv_sale" | "pdv_purchase" | "inventory_purchase";
  sourceId: string | null;
  nature: string;
  party: JsonObject | null;
  items: JsonObject[];
  payments: JsonObject[];
  freightMode: number;
  notes: string;
}

function normalizeDraft(raw: unknown): NormalizedDraft {
  const draft = object(raw);
  const model = Number(draft.model);
  const direction = draft.direction === "entrada" ? "entrada" : "saida";
  const sourceType = [
    "manual",
    "pdv_sale",
    "pdv_purchase",
    "inventory_purchase",
  ].includes(text(draft.sourceType))
    ? (text(draft.sourceType) as NormalizedDraft["sourceType"])
    : "manual";
  if (model !== 55 && model !== 65) throw new Error("Modelo fiscal inválido.");
  if (model === 65 && direction !== "saida")
    throw new Error("NFC-e aceita somente operação de saída.");
  if (direction === "saida" && !["manual", "pdv_sale"].includes(sourceType))
    throw new Error("A origem escolhida não pertence a uma operação de saída.");
  if (
    direction === "entrada" &&
    !["manual", "pdv_purchase", "inventory_purchase"].includes(sourceType)
  )
    throw new Error(
      "A origem escolhida não pertence a uma operação de entrada.",
    );
  const partySource = object(draft.party);
  const party = Object.keys(partySource).length
    ? {
        id: uuid(partySource.id),
        name: text(partySource.name, 120),
        document: digits(partySource.document),
        stateRegistration: digits(partySource.stateRegistration),
        email: text(partySource.email, 160),
        address: text(partySource.address, 120),
        addressNumber: text(partySource.addressNumber, 20),
        complement: text(partySource.complement, 60),
        neighborhood: text(partySource.neighborhood, 60),
        city: text(partySource.city, 60),
        state: text(partySource.state, 2).toUpperCase(),
        zipCode: digits(partySource.zipCode),
        municipalityCode: digits(partySource.municipalityCode),
      }
    : null;
  const items = asRows(draft.items)
    .slice(0, 990)
    .map((item, index) => {
      const quantity = number(item.quantity);
      const unitPrice = number(item.unitPrice);
      const discount = number(item.discount);
      return {
        id: uuid(item.id) ?? crypto.randomUUID(),
        sourceItemId: uuid(item.sourceItemId),
        inventoryId: uuid(item.inventoryId),
        description: text(item.description, 120) || `Item ${index + 1}`,
        quantity,
        unitPrice,
        discount,
        total: money(quantity * unitPrice - discount),
        unit: text(item.unit, 6).toUpperCase(),
        ncm: digits(item.ncm),
        cest: digits(item.cest),
        gtin: digits(item.gtin),
        origin: digits(item.origin),
        cfopEntryInternal: digits(item.cfopEntryInternal),
        cfopEntryInterstate: digits(item.cfopEntryInterstate),
        cfopExitInternal: digits(item.cfopExitInternal),
        cfopExitInterstate: digits(item.cfopExitInterstate),
        icmsCode: digits(item.icmsCode),
        icmsRate: number(item.icmsRate),
        icmsReductionRate: number(item.icmsReductionRate),
        pisCst: digits(item.pisCst),
        pisRate: number(item.pisRate),
        cofinsCst: digits(item.cofinsCst),
        cofinsRate: number(item.cofinsRate),
        ipiCst: digits(item.ipiCst),
        ipiRate: number(item.ipiRate),
        taxUnit: text(item.taxUnit, 6).toUpperCase(),
        ibsCbsCst: text(item.ibsCbsCst, 6),
      };
    });
  const payments = asRows(draft.payments)
    .slice(0, 20)
    .map((entry) => ({
      method: digits(entry.method).slice(0, 2),
      amount: money(number(entry.amount)),
      change: money(number(entry.change)),
    }));
  return {
    id: uuid(draft.id),
    model,
    direction,
    sourceType,
    sourceId: sourceType === "manual" ? null : uuid(draft.sourceId),
    nature: text(draft.nature, 60),
    party,
    items,
    payments,
    freightMode: Number.isInteger(Number(draft.freightMode))
      ? Number(draft.freightMode)
      : 9,
    notes: text(draft.notes, 2000),
  };
}

function validation(
  draft: NormalizedDraft,
  companyState: string,
  taxRegime: string,
): string[] {
  const errors: string[] = [];
  if (!draft.nature) errors.push("Informe a natureza da operação.");
  if (!draft.items.length) errors.push("Adicione ao menos um item.");
  if (
    draft.model === 55 &&
    (!draft.party || ![11, 14].includes(digits(draft.party.document).length))
  )
    errors.push("Informe o CPF/CNPJ do parceiro.");
  if (
    draft.model === 55 &&
    draft.party &&
    (!text(draft.party.address) ||
      !text(draft.party.neighborhood) ||
      !text(draft.party.city) ||
      !/^[A-Z]{2}$/.test(text(draft.party.state)) ||
      digits(draft.party.municipalityCode).length !== 7)
  )
    errors.push(
      "Complete o endereço fiscal do parceiro, inclusive município IBGE.",
    );
  for (const [index, item] of draft.items.entries()) {
    const prefix = `Item ${index + 1}`;
    const gross = money(number(item.quantity) * number(item.unitPrice));
    if (number(item.quantity) <= 0)
      errors.push(`${prefix}: quantidade inválida.`);
    if (number(item.unitPrice) < 0)
      errors.push(`${prefix}: valor unitário inválido.`);
    if (number(item.discount) < 0 || number(item.discount) > gross)
      errors.push(
        `${prefix}: desconto não pode ser negativo nem superar o valor bruto.`,
      );
    if (digits(item.ncm).length !== 8)
      errors.push(`${prefix}: NCM precisa ter 8 dígitos.`);
    if (!/^[0-8]$/.test(digits(item.origin)))
      errors.push(`${prefix}: origem da mercadoria inválida.`);
    const interstate =
      !!draft.party && text(draft.party.state) !== companyState;
    const cfop =
      draft.direction === "entrada"
        ? text(interstate ? item.cfopEntryInterstate : item.cfopEntryInternal)
        : text(interstate ? item.cfopExitInterstate : item.cfopExitInternal);
    if (!/^\d{4}$/.test(cfop))
      errors.push(
        `${prefix}: CFOP ${interstate ? "interestadual" : "interno"} ausente.`,
      );
    const icmsCode = digits(item.icmsCode);
    const simple = taxRegime === "simples_nacional";
    const supportedIcms = simple
      ? ["102", "103", "300", "400"]
      : ["00", "40", "41", "50", "90"];
    if (!supportedIcms.includes(icmsCode)) {
      errors.push(
        `${prefix}: ${simple ? "CSOSN" : "CST"} ${icmsCode || "vazio"} ainda exige configuração tributária adicional.`,
      );
    }
    if (
      !/^\d{2}$/.test(digits(item.pisCst)) ||
      !/^\d{2}$/.test(digits(item.cofinsCst))
    )
      errors.push(`${prefix}: CST de PIS/COFINS inválido.`);
    if (digits(item.pisCst) === "03" || digits(item.cofinsCst) === "03")
      errors.push(
        `${prefix}: CST 03 de PIS/COFINS exige alíquota por quantidade, ainda não informada neste cadastro.`,
      );
    if (!text(item.taxUnit) && !text(item.unit))
      errors.push(`${prefix}: unidade tributável ausente.`);
  }
  const total = money(
    draft.items.reduce((sum, item) => sum + number(item.total), 0),
  );
  const paid = money(
    draft.payments.reduce(
      (sum, entry) => sum + number(entry.amount) - number(entry.change),
      0,
    ),
  );
  if (!draft.payments.length)
    errors.push("Informe ao menos um meio de pagamento.");
  if (
    draft.payments.some(
      (entry) =>
        !/^\d{2}$/.test(text(entry.method)) ||
        number(entry.amount) < 0 ||
        number(entry.change) < 0,
    )
  )
    errors.push("Há um meio de pagamento ou valor inválido.");
  if (draft.model === 65 && Math.abs(total - paid) > 0.009)
    errors.push(
      "Pagamentos menos troco precisam fechar exatamente com o total da NFC-e.",
    );
  return errors;
}

function tax(
  cst: string,
  rate: number,
  reduction: number,
  baseValue: number,
  kind: "icms" | "pis" | "cofins",
) {
  const exempt =
    kind === "icms"
      ? ["40", "41", "50", "102", "103", "300", "400"]
      : ["04", "05", "06", "07", "08", "09", "49"];
  if (exempt.includes(cst))
    return kind === "icms" ? { origem: "0", cst } : { cst };
  const base = money(baseValue * (1 - Math.max(0, reduction) / 100));
  if (!(rate > 0))
    throw new Error(
      `A alíquota de ${kind.toUpperCase()} é obrigatória para o código ${cst}.`,
    );
  return kind === "icms"
    ? {
        origem: "0",
        cst,
        baseCalculo: {
          modalidadeDeterminacao: 3,
          percentualReducao: reduction || 0,
          valor: base,
        },
        aliquota: rate,
        valor: money((base * rate) / 100),
      }
    : {
        cst,
        baseCalculo: { valor: base },
        aliquota: rate,
        valor: money((base * rate) / 100),
      };
}

function buildMotorDocument(
  draft: NormalizedDraft,
  company: JsonObject,
  fiscal: JsonObject,
  series: number,
  numberValue: number,
) {
  const companyState = text(company.state, 2).toUpperCase();
  const totalProducts = money(
    draft.items.reduce(
      (sum, item) => sum + number(item.quantity) * number(item.unitPrice),
      0,
    ),
  );
  const totalDiscount = money(
    draft.items.reduce((sum, item) => sum + number(item.discount), 0),
  );
  let totalIcms = 0;
  let baseIcms = 0;
  let totalPis = 0;
  let totalCofins = 0;
  let totalIpi = 0;
  const items = draft.items.map((item, index) => {
    const grossValue = money(number(item.quantity) * number(item.unitPrice));
    const netValue = money(grossValue - number(item.discount));
    const interstate =
      !!draft.party && text(draft.party.state) !== companyState;
    const cfop =
      draft.direction === "entrada"
        ? text(interstate ? item.cfopEntryInterstate : item.cfopEntryInternal)
        : text(interstate ? item.cfopExitInterstate : item.cfopExitInternal);
    const icms = tax(
      digits(item.icmsCode),
      number(item.icmsRate),
      number(item.icmsReductionRate),
      netValue,
      "icms",
    );
    const pis = tax(
      digits(item.pisCst),
      number(item.pisRate),
      0,
      netValue,
      "pis",
    );
    const cofins = tax(
      digits(item.cofinsCst),
      number(item.cofinsRate),
      0,
      netValue,
      "cofins",
    );
    totalIcms += number(icms.valor);
    baseIcms += number(object(icms.baseCalculo).valor);
    totalPis += number(pis.valor);
    totalCofins += number(cofins.valor);
    const ipiCst = digits(item.ipiCst);
    const ipi = ipiCst
      ? {
          cst: ipiCst,
          baseCalculo: netValue,
          aliquota: number(item.ipiRate),
          valor: money((netValue * number(item.ipiRate)) / 100),
        }
      : null;
    totalIpi += number(ipi?.valor);
    return {
      codigo: text(item.inventoryId) || String(index + 1),
      descricao: text(item.description),
      ncm: digits(item.ncm),
      cfop,
      unidade: {
        comercial: text(item.unit) || text(item.taxUnit),
        tributavel: text(item.taxUnit) || text(item.unit),
      },
      quantidade: {
        comercial: number(item.quantity),
        tributavel: number(item.quantity),
      },
      valorUnitario: {
        comercial: number(item.unitPrice),
        tributavel: number(item.unitPrice),
      },
      valor: grossValue,
      valorDesconto: number(item.discount) || undefined,
      tributos: {
        icms: { ...icms, origem: digits(item.origin) },
        pis,
        cofins,
        ...(ipi ? { ipi } : {}),
      },
    };
  });
  const party = draft.party;
  const destination = party
    ? {
        cpfCnpj: digits(party.document),
        razaoSocial: text(party.name),
        indicadorInscricaoEstadual: digits(party.stateRegistration) ? 1 : 9,
        inscricaoEstadual: digits(party.stateRegistration) || undefined,
        endereco: {
          logradouro: text(party.address),
          numero: text(party.addressNumber) || "S/N",
          complemento: text(party.complement) || undefined,
          bairro: text(party.neighborhood),
          codigoCidade: digits(party.municipalityCode),
          descricaoCidade: text(party.city),
          estado: text(party.state),
          cep: digits(party.zipCode),
        },
      }
    : undefined;
  const issueDate = new Date().toISOString();
  return {
    invoice: {
      environment: text(fiscal.fiscal_ambiente) || "homologacao",
      issue_date: issueDate,
      invoice_type: draft.direction,
      status: "emitida",
    },
    fiscal_config: {
      cnpj: digits(company.document),
      inscricao_estadual: digits(fiscal.inscricao_estadual),
      razao_social: text(company.name),
      nome_fantasia: text(company.name),
      regime_tributario: text(fiscal.regime_tributario),
      is_simples_nacional:
        text(fiscal.regime_tributario) === "simples_nacional",
      uf: companyState,
      logradouro: text(company.address),
      numero: text(company.address_number) || "S/N",
      complemento: text(company.complement),
      bairro: text(company.neighborhood),
      cidade: text(company.city),
      cep: digits(company.zip_code),
      codigo_ibge: digits(fiscal.municipio_ibge),
    },
    payload: {
      numero: numberValue,
      serie: series,
      presencial: draft.model === 65 ? 1 : 0,
      consumidorFinal: draft.model === 65,
      natureza: draft.nature,
      saida: draft.direction === "saida",
      finalidade: 1,
      emitente: {
        cpfCnpj: digits(company.document),
        inscricaoEstadual: digits(fiscal.inscricao_estadual),
      },
      ...(destination ? { destinatario: destination } : {}),
      itens: items,
      total: {
        baseCalculoIcms: money(baseIcms),
        valorIcms: money(totalIcms),
        valorProdutosServicos: totalProducts,
        valorDesconto: totalDiscount,
        valorPis: money(totalPis),
        valorCofins: money(totalCofins),
        valorIpi: money(totalIpi),
        valorNfe: money(totalProducts - totalDiscount + totalIpi),
        valorAproximadoTributos: 0,
      },
      pagamentos: draft.payments.map((entry) => ({
        aVista: true,
        meio: text(entry.method),
        valor: number(entry.amount),
      })),
      ...(draft.model === 65
        ? {
            troco: money(
              draft.payments.reduce(
                (sum, entry) => sum + number(entry.change),
                0,
              ),
            ),
          }
        : {}),
      transporte: { modalidadeFrete: draft.freightMode },
      informacoesAdicionais: draft.notes || undefined,
    },
  };
}

async function saveDraft(
  auth: Awaited<ReturnType<typeof authorizeFiscalManager>> & { ok: true },
  draft: NormalizedDraft,
) {
  const table = draft.model === 55 ? "nfe_documents" : "nfce_documents";
  const common: JsonObject = {
    company_id: auth.companyId,
    source_type: draft.sourceType,
    source_id: draft.sourceId,
    draft_payload: draft,
    created_by: auth.userId,
    status: "draft",
    customer_id: draft.direction === "saida" ? uuid(draft.party?.id) : null,
  };
  if (draft.model === 55) {
    common.direction = draft.direction;
    common.supplier_id =
      draft.direction === "entrada" ? uuid(draft.party?.id) : null;
  } else {
    common.order_id = draft.sourceType === "pdv_sale" ? draft.sourceId : null;
    common.uf = text(draft.party?.state) || "SP";
    common.series = 1;
  }
  if (draft.id) {
    const { data, error } = await auth.supabase
      .from(table)
      .update(common)
      .eq("id", draft.id)
      .eq("company_id", auth.companyId)
      .eq("status", "draft")
      .select("*")
      .maybeSingle();
    if (error || !data)
      throw new Error("O rascunho não foi encontrado ou já saiu da edição.");
    return data as JsonObject;
  }
  const { data, error } = await auth.supabase
    .from(table)
    .insert(common)
    .select("*")
    .single();
  if (error || !data)
    throw new Error(
      error?.code === "23505"
        ? "Esta venda ou compra já está vinculada a outra nota ativa."
        : "Não foi possível salvar o rascunho.",
    );
  return data as JsonObject;
}

async function assertSourceBelongsToCompany(
  auth: Awaited<ReturnType<typeof authorizeFiscalManager>> & { ok: true },
  draft: NormalizedDraft,
) {
  if (draft.sourceType === "manual") return;
  if (!draft.sourceId)
    throw new Error("Selecione uma venda ou compra válida para importar.");

  if (draft.sourceType === "pdv_sale") {
    const { data } = await auth.supabase
      .from("pdv_orders")
      .select("id")
      .eq("id", draft.sourceId)
      .eq("company_id", auth.companyId)
      .neq("status", "cancelado")
      .maybeSingle();
    if (!data)
      throw new Error(
        "A venda importada não foi encontrada nesta empresa ou foi cancelada.",
      );
    return;
  }

  const { data } = await auth.supabase
    .from("compra_ordens")
    .select("id, compra_id, compras!inner(cash_session_id)")
    .eq("id", draft.sourceId)
    .eq("company_id", auth.companyId)
    .neq("status", "cancelada")
    .maybeSingle();
  const purchase = object(data);
  const compras = object(purchase.compras);
  const fromPdv = !!compras.cash_session_id;
  if (!data || (draft.sourceType === "pdv_purchase") !== fromPdv) {
    throw new Error(
      "A compra importada não foi encontrada na origem escolhida para esta empresa.",
    );
  }
}

function outcomeStatus(result: JsonObject): {
  status: string;
  official: string | null;
} {
  const official = text(result.situacaoOficial);
  const outcome = text(result.outcome);
  if (official === "autorizada" || outcome === "authorized")
    return { status: "authorized", official: "autorizada" };
  if (official === "cancelada" || outcome === "cancelled")
    return { status: "cancelled", official: "cancelada" };
  if (official === "denegada" || outcome === "denied" || outcome === "rejected")
    return { status: "rejected", official: official || "denegada" };
  return {
    status: "uncertain",
    official: official || "aguardando_confirmacao",
  };
}

const documentTable = (model: 55 | 65) =>
  model === 55 ? "nfe_documents" : "nfce_documents";
const eventTable = (model: 55 | 65) =>
  model === 55 ? "nfe_events" : "nfce_events";

async function fiscalContext(
  auth: Awaited<ReturnType<typeof authorizeFiscalManager>> & { ok: true },
  audit: string,
) {
  const { data, error } = await auth.supabase
    .from("company_fiscal_settings")
    .select("*")
    .eq("company_id", auth.companyId)
    .maybeSingle();
  if (error || !data)
    throw new Error(
      "As configurações fiscais da empresa não foram encontradas.",
    );
  const fiscal = object(data);
  return {
    fiscal,
    ctx: {
      supabase: auth.supabase,
      companyId: auth.companyId,
      fiscal,
      contextoAuditoria: audit,
    } as NfseProviderCtx,
  };
}

async function storedSignedXml(
  auth: Awaited<ReturnType<typeof authorizeFiscalManager>> & { ok: true },
  path: unknown,
) {
  const normalizedPath = text(path, 1000);
  if (!normalizedPath) return null;
  const { data, error } = await auth.supabase.storage
    .from("fiscal-artifacts")
    .download(normalizedPath);
  if (error || !data) return null;
  return await data.text();
}

async function handleDocumentAction(
  auth: Awaited<ReturnType<typeof authorizeFiscalManager>> & { ok: true },
  body: JsonObject,
  setActive: (
    document: {
      id: string;
      table: "nfe_documents" | "nfce_documents";
      events: "nfe_events" | "nfce_events";
    },
    started?: boolean,
  ) => void,
) {
  const action = text(body.action);
  const model = Number(body.model);
  const documentId = uuid(body.documentId);
  if ((model !== 55 && model !== 65) || !documentId)
    return jsonResponse(
      { error: "invalid_document", message: "Documento fiscal inválido." },
      400,
    );
  const table = documentTable(model);
  const events = eventTable(model);
  const { data, error } = await auth.supabase
    .from(table)
    .select("*")
    .eq("id", documentId)
    .eq("company_id", auth.companyId)
    .maybeSingle();
  if (error || !data)
    return jsonResponse(
      {
        error: "not_found",
        message: "Documento fiscal não encontrado nesta empresa.",
      },
      404,
    );
  const row = object(data);

  if (action === "artifact") {
    const kind = text(body.kind);
    const field =
      kind === "xml"
        ? "processed_xml_path"
        : model === 55
          ? "danfe_pdf_path"
          : "danfce_pdf_path";
    const path = text(row[field], 1000);
    if (!path)
      return jsonResponse(
        {
          error: "artifact_not_found",
          message: `${kind === "xml" ? "XML" : "PDF"} ainda não está disponível para esta nota.`,
        },
        404,
      );
    const { data: signed, error: signedError } = await auth.supabase.storage
      .from("fiscal-artifacts")
      .createSignedUrl(path, 300);
    if (signedError || !signed?.signedUrl)
      throw new Error("Não foi possível liberar o arquivo fiscal agora.");
    return jsonResponse(
      { ok: true, url: signed.signedUrl, expiresIn: 300 },
      200,
    );
  }

  const key = digits(row.access_key);
  const uf = text(row.uf, 2).toUpperCase();
  if (key.length !== 44 || !/^[A-Z]{2}$/.test(uf))
    return jsonResponse(
      {
        error: "document_not_transmitted",
        message: "Esta nota ainda não possui chave de acesso para consulta.",
      },
      409,
    );
  const { fiscal, ctx } = await fiscalContext(
    auth,
    `${action}_${model}:${documentId}`,
  );
  const signedXml = await storedSignedXml(auth, row.signed_xml_path);

  if (action === "consult") {
    const official =
      model === 55
        ? await consultNfe(ctx, { uf, key, signedXml })
        : await consultNfce(ctx, { uf, key, signedXml });
    const normalized = outcomeStatus(official as JsonObject);
    const now = new Date().toISOString();
    await auth.supabase
      .from(table)
      .update({
        status: normalized.status,
        official_status: normalized.official,
        official_checked_at: now,
        authorized_at:
          normalized.status === "authorized"
            ? text(row.authorized_at) || now
            : row.authorized_at,
        cancelled_at:
          normalized.status === "cancelled"
            ? text(row.cancelled_at) || now
            : row.cancelled_at,
        last_error_code: null,
        last_error_message: null,
        next_action:
          normalized.status === "uncertain" ? "consultar_sefaz" : null,
      })
      .eq("id", documentId)
      .eq("company_id", auth.companyId);
    await auth.supabase
      .from(events)
      .insert({
        company_id: auth.companyId,
        document_id: documentId,
        event_type: "official_consultation",
        status: normalized.status,
        official_status: normalized.official,
        cstat: text(object(official.resposta).cstat) || null,
        message: "Situação consultada diretamente na SEFAZ.",
        payload: { outcome: official.outcome, recovered: official.recovered },
      });
    return jsonResponse(
      {
        ok: true,
        status: normalized.status,
        officialStatus: normalized.official,
      },
      200,
    );
  }

  const reason = text(body.reason, 255);
  if (action !== "cancel" || reason.length < 15)
    return jsonResponse(
      {
        error: "invalid_action",
        message:
          "Informe uma justificativa de cancelamento com pelo menos 15 caracteres.",
      },
      400,
    );
  const before =
    model === 55
      ? await consultNfe(ctx, { uf, key, signedXml })
      : await consultNfce(ctx, { uf, key, signedXml });
  const beforeStatus = outcomeStatus(before as JsonObject);
  if (beforeStatus.status === "cancelled") {
    await auth.supabase
      .from(table)
      .update({
        status: "cancelled",
        official_status: "cancelada",
        cancelled_at: new Date().toISOString(),
        official_checked_at: new Date().toISOString(),
      })
      .eq("id", documentId)
      .eq("company_id", auth.companyId);
    return jsonResponse(
      {
        ok: true,
        status: "cancelled",
        officialStatus: "cancelada",
        recovered: true,
      },
      200,
    );
  }
  if (
    beforeStatus.status !== "authorized" ||
    digits(row.protocol).length !== 15
  ) {
    return jsonResponse(
      {
        error: "not_authorized",
        message:
          "A SEFAZ não confirmou uma nota autorizada com protocolo válido para cancelar.",
      },
      409,
    );
  }
  const operationId = crypto.randomUUID();
  const snapshotHash = await sha256({
    action: "cancel",
    documentId,
    key,
    reason,
    protocol: row.protocol,
  });
  const input = {
    operationId,
    snapshotHash,
    uf,
    key,
    cnpj: digits(object(fiscal).cnpj || object(fiscal).cpf_cnpj),
    protocol: digits(row.protocol),
    reason,
    occurredAt: new Date().toISOString(),
  };
  if (input.cnpj.length !== 14) {
    const company = await auth.supabase
      .from("company_settings")
      .select("document")
      .eq("company_id", auth.companyId)
      .maybeSingle();
    input.cnpj = digits(object(company.data).document);
  }
  if (input.cnpj.length !== 14)
    return jsonResponse(
      {
        error: "issuer_document_required",
        message: "Complete o CNPJ do emitente nas configurações da empresa.",
      },
      422,
    );
  const prepared =
    model === 55
      ? await prepareNfeCancellation(ctx, input)
      : await prepareNfceCancellation(ctx, input);
  const eventPath = `${auth.companyId}/${model}/${documentId}/cancelamento-assinado.xml`;
  await auth.supabase.storage
    .from("fiscal-artifacts")
    .upload(
      eventPath,
      new Blob([prepared.xmlAssinado], { type: "application/xml" }),
      { upsert: true, contentType: "application/xml" },
    );
  await auth.supabase
    .from(table)
    .update({
      status: "cancellation_pending",
      next_action: "aguardar_cancelamento",
    })
    .eq("id", documentId)
    .eq("company_id", auth.companyId);
  setActive({ id: documentId, table, events }, true);
  const batchId = String(row.number || 1).slice(-15);
  const result =
    model === 55
      ? await transmitNfeCancellation(ctx, {
          operationId,
          snapshotHash,
          uf,
          batchId,
          signedXml: prepared.xmlAssinado,
        })
      : await transmitNfceCancellation(ctx, {
          operationId,
          snapshotHash,
          uf,
          batchId,
          signedXml: prepared.xmlAssinado,
        });
  const normalized = outcomeStatus(result as JsonObject);
  const now = new Date().toISOString();
  const processedPath = text(result.xmlProcessado)
    ? `${auth.companyId}/${model}/${documentId}/cancelamento-processado.xml`
    : null;
  if (processedPath)
    await auth.supabase.storage
      .from("fiscal-artifacts")
      .upload(
        processedPath,
        new Blob([text(result.xmlProcessado)], { type: "application/xml" }),
        { upsert: true, contentType: "application/xml" },
      );
  await auth.supabase
    .from(table)
    .update({
      status: normalized.status,
      official_status: normalized.official,
      cancelled_at: normalized.status === "cancelled" ? now : null,
      official_checked_at: now,
      next_action: normalized.status === "uncertain" ? "consultar_sefaz" : null,
    })
    .eq("id", documentId)
    .eq("company_id", auth.companyId);
  await auth.supabase
    .from(events)
    .insert({
      company_id: auth.companyId,
      document_id: documentId,
      event_type: "cancellation_result",
      status: normalized.status,
      official_status: normalized.official,
      cstat: text(object(result.resposta).cstat) || null,
      message:
        normalized.status === "cancelled"
          ? "Cancelamento confirmado pela SEFAZ."
          : "Cancelamento enviado; situação registrada.",
      payload: { outcome: result.outcome, processedPath },
    });
  return jsonResponse(
    {
      ok: true,
      status: normalized.status,
      officialStatus: normalized.official,
    },
    normalized.status === "cancelled" ? 200 : 202,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST")
    return jsonResponse(
      { error: "method_not_allowed", message: "Método não permitido." },
      405,
    );
  const auth = await authorizeFiscalManager(req);
  if (!auth.ok) return auth.response;
  let activeDocument: {
    id: string;
    table: "nfe_documents" | "nfce_documents";
    events: "nfe_events" | "nfce_events";
  } | null = null;
  let transmissionStarted = false;
  try {
    const body = object(await req.json());
    const action = text(body.action);
    if (["consult", "artifact", "cancel"].includes(action)) {
      return await handleDocumentAction(
        auth,
        body,
        (document, started = false) => {
          activeDocument = document;
          if (started) transmissionStarted = true;
        },
      );
    }
    const draft = normalizeDraft(body.draft);
    if (!["save_draft", "emit"].includes(action))
      return jsonResponse(
        { error: "invalid_action", message: "Ação fiscal inválida." },
        400,
      );
    await assertSourceBelongsToCompany(auth, draft);
    let row = await saveDraft(auth, draft);
    if (action === "save_draft")
      return jsonResponse({ ok: true, id: row.id, status: "draft" }, 200);
    activeDocument = {
      id: text(row.id),
      table: draft.model === 55 ? "nfe_documents" : "nfce_documents",
      events: draft.model === 55 ? "nfe_events" : "nfce_events",
    };

    const [fiscalResult, companyResult, configResult] = await Promise.all([
      auth.supabase
        .from("company_fiscal_settings")
        .select("*")
        .eq("company_id", auth.companyId)
        .maybeSingle(),
      auth.supabase
        .from("company_settings")
        .select("*")
        .eq("company_id", auth.companyId)
        .maybeSingle(),
      auth.supabase
        .from(
          draft.model === 55 ? "company_nfe_settings" : "company_nfce_settings",
        )
        .select("*")
        .eq("company_id", auth.companyId)
        .maybeSingle(),
    ]);
    const fiscal = object(fiscalResult.data);
    const company = object(companyResult.data);
    const config = object(configResult.data);
    if (
      !fiscal.certificado_ref ||
      !fiscal.certificate_expires_at ||
      new Date(text(fiscal.certificate_expires_at)).getTime() <= Date.now()
    )
      return jsonResponse(
        {
          error: "certificate_required",
          message:
            "Envie um certificado A1 válido nas Configurações Fiscais antes de emitir.",
        },
        422,
      );
    if (config.enabled !== true)
      return jsonResponse(
        {
          error: "document_disabled",
          message: `Ative a ${draft.model === 55 ? "NF-e" : "NFC-e"} nas Configurações Fiscais.`,
        },
        422,
      );
    const environment = text(fiscal.fiscal_ambiente) === "producao" ? 1 : 2;
    if (environment === 1 && config.production_approved !== true)
      return jsonResponse(
        {
          error: "production_not_approved",
          message:
            "A emissão em produção ainda não foi liberada para esta empresa. Conclua a homologação primeiro.",
        },
        422,
      );
    if (environment === 2 && config.homologation_approved !== true)
      return jsonResponse(
        {
          error: "homologation_not_approved",
          message:
            "A homologação deste documento ainda não foi aprovada para esta empresa.",
        },
        422,
      );
    const errors = validation(
      draft,
      text(company.state).toUpperCase(),
      text(fiscal.regime_tributario),
    );
    if (errors.length)
      return jsonResponse(
        { error: "validation_failed", message: errors.slice(0, 6).join(" ") },
        422,
      );
    if (draft.model === 65) {
      const suffix = environment === 1 ? "production" : "homologation";
      if (
        !text(config[`qr_base_url_${suffix}`]) ||
        !text(config[`access_url_${suffix}`])
      ) {
        return jsonResponse(
          {
            error: "nfce_urls_required",
            message:
              "A NFC-e ainda não tem as URLs oficiais da SEFAZ configuradas para esta UF e ambiente.",
          },
          422,
        );
      }
    }

    let series = number(row.series);
    let documentNumber = number(row.number);
    if (!documentNumber) {
      const reserved = await auth.supabase.rpc("reserve_goods_fiscal_number", {
        p_company_id: auth.companyId,
        p_model: draft.model,
      });
      const reservation = Array.isArray(reserved.data)
        ? object(reserved.data[0])
        : object(reserved.data);
      if (reserved.error || !reservation.number)
        throw new Error("Não foi possível reservar a numeração fiscal.");
      series = number(reservation.series);
      documentNumber = number(reservation.number);
    }
    const document = buildMotorDocument(
      draft,
      company,
      fiscal,
      series,
      documentNumber,
    );
    const snapshotHash = await sha256(document);
    const table = draft.model === 55 ? "nfe_documents" : "nfce_documents";
    const operationId = text(row.operation_id);
    await auth.supabase
      .from(table)
      .update({
        status: "preparing",
        environment,
        uf: text(company.state).toUpperCase(),
        series,
        number: documentNumber,
        snapshot_hash: snapshotHash,
        snapshot: document,
        last_error_code: null,
        last_error_message: null,
      })
      .eq("id", row.id)
      .eq("company_id", auth.companyId);
    const ctx: NfseProviderCtx = {
      supabase: auth.supabase,
      companyId: auth.companyId,
      fiscal,
      contextoAuditoria: `emitir_${draft.model === 55 ? "nfe" : "nfce"}:${row.id}`,
    };
    const prepared =
      draft.model === 55
        ? await prepareNfe(ctx, { operationId, snapshotHash, document })
        : await prepareNfce(ctx, {
            operationId,
            snapshotHash,
            document,
            qrBaseUrl: text(
              config[
                environment === 1
                  ? "qr_base_url_production"
                  : "qr_base_url_homologation"
              ],
            ),
            accessUrl: text(
              config[
                environment === 1
                  ? "access_url_production"
                  : "access_url_homologation"
              ],
            ),
          });
    const signedXmlPath = `${auth.companyId}/${draft.model}/${row.id}/assinado.xml`;
    const signedUpload = await auth.supabase.storage
      .from("fiscal-artifacts")
      .upload(
        signedXmlPath,
        new Blob([prepared.xmlAssinado], { type: "application/xml" }),
        { upsert: true, contentType: "application/xml" },
      );
    if (signedUpload.error)
      throw new Error(
        "Não foi possível guardar o XML assinado antes do envio. Nenhuma transmissão foi iniciada.",
      );
    await auth.supabase
      .from(table)
      .update({
        status: "signed",
        access_key: prepared.chave,
        signed_xml_path: signedXmlPath,
      })
      .eq("id", row.id)
      .eq("company_id", auth.companyId);
    const batchId = String(documentNumber).slice(-15);
    transmissionStarted = true;
    const official =
      draft.model === 55
        ? await authorizeNfe(ctx, {
            operationId,
            snapshotHash,
            uf: text(company.state).toUpperCase(),
            key: prepared.chave,
            batchId,
            signedXml: prepared.xmlAssinado,
          })
        : await authorizeNfce(ctx, {
            operationId,
            snapshotHash,
            uf: text(company.state).toUpperCase(),
            key: prepared.chave,
            batchId,
            signedXml: prepared.xmlAssinado,
          });
    const normalized = outcomeStatus(official as JsonObject);
    const proof = object(official.prova);
    const basePath = `${auth.companyId}/${draft.model}/${row.id}`;
    let xmlPath: string | null = null;
    let pdfPath: string | null = null;
    if (text(official.xmlProcessado)) {
      xmlPath = `${basePath}/processado.xml`;
      await auth.supabase.storage
        .from("fiscal-artifacts")
        .upload(
          xmlPath,
          new Blob([text(official.xmlProcessado)], { type: "application/xml" }),
          { upsert: true, contentType: "application/xml" },
        );
    }
    const officialPayload = official as JsonObject;
    const pdfBase64 = text(
      officialPayload[draft.model === 65 ? "danfceBase64" : "danfeBase64"],
    );
    if (pdfBase64) {
      pdfPath = `${basePath}/${draft.model === 65 ? "danfce" : "danfe"}.pdf`;
      const bytes = Uint8Array.from(atob(pdfBase64), (char) =>
        char.charCodeAt(0),
      );
      await auth.supabase.storage
        .from("fiscal-artifacts")
        .upload(pdfPath, bytes, {
          upsert: true,
          contentType: "application/pdf",
        });
    }
    await auth.supabase
      .from(table)
      .update({
        status: normalized.status,
        official_status: normalized.official,
        protocol: text(proof.protocol) || null,
        processed_xml_path: xmlPath,
        ...(draft.model === 55
          ? { danfe_pdf_path: pdfPath }
          : { danfce_pdf_path: pdfPath }),
        official_checked_at: new Date().toISOString(),
        authorized_at:
          normalized.status === "authorized" ? new Date().toISOString() : null,
        last_error_message:
          normalized.status === "rejected"
            ? text(object(official.resposta).reason) ||
              "Documento rejeitado pela SEFAZ."
            : null,
      })
      .eq("id", row.id)
      .eq("company_id", auth.companyId);
    await auth.supabase
      .from(draft.model === 55 ? "nfe_events" : "nfce_events")
      .insert({
        company_id: auth.companyId,
        document_id: row.id,
        event_type: "authorization_result",
        status: normalized.status,
        official_status: normalized.official,
        cstat: text(object(official.resposta).cstat) || null,
        message:
          normalized.status === "authorized"
            ? "Documento autorizado pela SEFAZ."
            : "Resultado fiscal registrado.",
        payload: {
          outcome: official.outcome,
          recovered: official.recovered,
          orientacao: official.orientacao,
        },
      });
    return jsonResponse(
      {
        ok: true,
        id: row.id,
        status: normalized.status,
        officialStatus: normalized.official,
        accessKey: prepared.chave,
      },
      normalized.status === "authorized" ? 201 : 202,
    );
  } catch (error) {
    const fiscal =
      error instanceof NfeMotorError || error instanceof NfceMotorError;
    const code = fiscal ? (error as NfeMotorError).code : "internal_error";
    const message =
      (error as Error).message ||
      "Não foi possível concluir a operação fiscal.";
    if (activeDocument) {
      const status =
        transmissionStarted || code === "resultado_incerto"
          ? "uncertain"
          : "rejected";
      const officialStatus =
        status === "uncertain" ? "aguardando_confirmacao" : null;
      await auth.supabase
        .from(activeDocument.table)
        .update({
          status,
          official_status: officialStatus,
          last_error_code: code,
          last_error_message: message,
          next_action:
            status === "uncertain" ? "consultar_sefaz" : "corrigir_e_reemitir",
          official_checked_at:
            status === "uncertain" ? new Date().toISOString() : null,
        })
        .eq("id", activeDocument.id)
        .eq("company_id", auth.companyId);
      await auth.supabase.from(activeDocument.events).insert({
        company_id: auth.companyId,
        document_id: activeDocument.id,
        event_type:
          status === "uncertain"
            ? "authorization_uncertain"
            : "authorization_failed",
        status,
        official_status: officialStatus,
        message,
        payload: { code, transmissionStarted },
      });
    }
    console.error("[fiscal-goods-document]", {
      type: (error as Error).name,
      message: (error as Error).message,
    });
    return jsonResponse(
      { error: code, message },
      fiscal ? (error as NfeMotorError).status : 500,
    );
  }
});
