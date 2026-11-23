import { goodsReadinessIssues } from '../_shared/fiscal-goods-readiness.ts';
import { goodsOutcome, sourceFinancialsMatch } from "../_shared/fiscal-goods-policy.ts";
import {
  isGoodsFinalConsumerCompatible,
  resolveGoodsFinalConsumer,
} from "../_shared/fiscal-goods-final-consumer.ts";
import {
  authorizeFiscalGoodsIssuer,
  corsHeaders,
  jsonResponse,
} from "../_shared/fiscal-goods-auth.ts";
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
const SAFE_FISCAL_MESSAGE_CODES = new Set([
  "dados_invalidos",
  "certificado_invalido",
  "documento_rejeitado",
]);
function safeFiscalMessage(error: NfeMotorError | NfceMotorError): string | null {
  const message = text(error.message, 1500);
  if (!SAFE_FISCAL_MESSAGE_CODES.has(error.code) || !message) return null;
  if (/SQLSTATE|constraint|public\.|rpc|supabase|token|certificate_ref|235\d\d|42\w{3}/i.test(message)) {
    return null;
  }
  return message;
}
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

class GoodsDocumentError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 422,
    public diagnostic: JsonObject = {},
  ) {
    super(message);
    this.name = "GoodsDocumentError";
  }
}

interface NormalizedDraft {
  id: string | null;
  model: 55 | 65;
  direction: "entrada" | "saida";
  stockId: string | null;
  seriesId: string | null;
  carrierId: string | null;
  sourceType: "manual" | "pdv_sale" | "pdv_purchase" | "inventory_purchase";
  sourceId: string | null;
  nature: string;
  finalConsumer: boolean;
  party: JsonObject | null;
  items: JsonObject[];
  payments: JsonObject[];
  freightMode: number;
  notes: string;
}

export function normalizeDraft(raw: unknown): NormalizedDraft {
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
  const finalConsumer = resolveGoodsFinalConsumer({
    model,
    direction,
    stateRegistration: party?.stateRegistration,
    requested: draft.finalConsumer,
  });
  if (asRows(draft.items).length > 990 || asRows(draft.payments).length > 100)
    throw new GoodsDocumentError('invalid_draft', 'Revise a quantidade de itens e formas de pagamento da nota.');
  const items = asRows(draft.items)
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
    .map((entry) => ({
      method: digits(entry.method).slice(0, 2),
      amount: money(number(entry.amount)),
      change: money(number(entry.change)),
      deferred: entry.deferred === true,
    }));
  return {
    id: uuid(draft.id),
    model,
    direction,
    stockId: uuid(draft.stockId),
    seriesId: model === 55 ? uuid(draft.seriesId) : null,
    carrierId: model === 55 ? uuid(draft.carrierId) : null,
    sourceType,
    sourceId: sourceType === "manual" ? null : uuid(draft.sourceId),
    nature: text(draft.nature, 60),
    finalConsumer,
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
  if (!draft.stockId) errors.push("Selecione o local de estoque da operação.");
  if (!draft.nature) errors.push("Informe a natureza da operação.");
  if (!isGoodsFinalConsumerCompatible({
    model: draft.model,
    direction: draft.direction,
    stateRegistration: draft.party?.stateRegistration,
    requested: draft.finalConsumer,
  })) errors.push("Destinatário sem inscrição estadual precisa ser consumidor final.");
  if (!draft.items.length) errors.push("Adicione ao menos um item.");
  if (
    draft.model === 55 &&
    (!draft.party || ![11, 14].includes(digits(draft.party.document).length))
  )
    errors.push("Informe o CPF/CNPJ do parceiro.");
  if (draft.model === 65 && draft.party && ![11,14].includes(digits(draft.party.document).length))
    errors.push('Informe um CPF/CNPJ válido ou remova a identificação do consumidor.');
  if (
    draft.model === 55 && draft.party &&
    (!text(draft.party.name) || !text(draft.party.address) ||
      !text(draft.party.neighborhood) ||
      !text(draft.party.city) ||
      !/^[A-Z]{2}$/.test(text(draft.party.state)) ||
      digits(draft.party.municipalityCode).length !== 7)
  )
    errors.push(
      'Complete o endereço fiscal do parceiro, inclusive município IBGE.',
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
      draft.model === 55 && !!draft.party && !!text(draft.party.state) && text(draft.party.state) !== companyState;
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

export function buildMotorDocument(
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
      draft.model === 55 && !!draft.party && !!text(draft.party.state) && text(draft.party.state) !== companyState;
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
        ...((draft.model === 55 || (text(party.address) && text(party.neighborhood) && text(party.city) && text(party.state) && digits(party.municipalityCode).length === 7)) ? { endereco: {
          logradouro: text(party.address),
          numero: text(party.addressNumber) || "S/N",
          complemento: text(party.complement) || undefined,
          bairro: text(party.neighborhood),
          codigoCidade: digits(party.municipalityCode),
          descricaoCidade: text(party.city),
          estado: text(party.state),
          cep: digits(party.zipCode),
        }} : {}),
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
      consumidorFinal: draft.finalConsumer,
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
        aVista: entry.deferred !== true,
        meio: text(entry.method),
        valor: number(entry.amount),
        ...(text(entry.method) === '99' ? { descricaoMeio: 'Outros' } : {}),
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

async function loadGoodsIssuer(auth: Awaited<ReturnType<typeof authorizeFiscalGoodsIssuer>> & { ok: true }): Promise<JsonObject> {
  const [canonicalResult, settingsResult] = await Promise.all([
    auth.supabase.from('companies').select('cnpj,name,address,address_number,street_number,complement,neighborhood,city,state,zip_code').eq('id', auth.companyId).maybeSingle(),
    auth.supabase.from('company_settings').select('name,address,address_number,complement,neighborhood,city,state,zip_code').eq('company_id', auth.companyId).maybeSingle(),
  ]);
  if (canonicalResult.error || !canonicalResult.data || settingsResult.error) throw new Error('Não foi possível identificar o emitente desta empresa.');
  const canonical = object(canonicalResult.data); const settings = object(settingsResult.data);
  const issuer: JsonObject = { document: digits(canonical.cnpj) };
  for (const key of ['name','address','address_number','complement','neighborhood','city','state','zip_code']) issuer[key] = text(settings[key]) || text(canonical[key]);
  issuer.address_number = text(issuer.address_number) || text(canonical.street_number);
  return issuer;
}

interface GoodsDocumentFence { operationId:string; status:string; updatedAt:string }
interface ActiveGoodsDocument { id:string; table:'nfe_documents'|'nfce_documents'; events:'nfe_events'|'nfce_events'; fence:GoodsDocumentFence }
function goodsDocumentFence(row:JsonObject):GoodsDocumentFence {
  const operationId=text(row.operation_id);const status=text(row.status);const updatedAt=text(row.updated_at);
  if(!operationId || !status || !updatedAt)throw new GoodsDocumentError('document_changed','A situação fiscal mudou. Consulte esta mesma nota para atualizar os dados antes de continuar.',409);
  return {operationId,status,updatedAt};
}
async function storeGoodsDocument(auth: Awaited<ReturnType<typeof authorizeFiscalGoodsIssuer>> & { ok: true }, table: string, id: string, patch: JsonObject, fence:GoodsDocumentFence):Promise<GoodsDocumentFence> {
  const stored = await auth.supabase.from(table).update(patch).eq('id',id).eq('company_id',auth.companyId)
    .eq('operation_id',fence.operationId).eq('status',fence.status).eq('updated_at',fence.updatedAt)
    .select('id,operation_id,status,updated_at').maybeSingle();
  if(stored.error)throw new GoodsDocumentError('persistence_failed','Não foi possível registrar a operação fiscal com segurança. Consulte esta mesma nota antes de tentar novamente.',503);
  if(!stored.data)throw new GoodsDocumentError('document_changed','A situação fiscal mudou. Consulte esta mesma nota para atualizar os dados antes de continuar.',409);
  return goodsDocumentFence(object(stored.data));
}
async function storeGoodsEvent(auth: Awaited<ReturnType<typeof authorizeFiscalGoodsIssuer>> & { ok: true }, table: string, event: JsonObject) {
  const stored = await auth.supabase.from(table).insert(event);
  if (stored.error) throw new GoodsDocumentError('persistence_failed','Não foi possível registrar toda a evidência fiscal. Consulte esta mesma nota para atualizar os dados.',503);
}

async function officialArtifacts(auth: Awaited<ReturnType<typeof authorizeFiscalGoodsIssuer>> & { ok: true }, model: 55 | 65, documentId: string, official: JsonObject) {
  const patch: JsonObject = {};
  const xml = typeof official.xmlProcessado === 'string' ? official.xmlProcessado : '';
  const pdf = official[model === 65 ? 'danfceBase64' : 'danfeBase64'];
  // Conteúdo endereçado por hash: resposta antiga não substitui arquivo já vinculado por outra revisão.
  const artifactVersion=await sha256({xml,pdf:typeof pdf==='string'?pdf:''});
  const artifactBase=`${auth.companyId}/${model}/${documentId}/artifacts/${artifactVersion}`;
  if (xml) {
    const path = `${artifactBase}/processado.xml`;
    const saved = await auth.supabase.storage.from('fiscal-artifacts').upload(path, new Blob([xml], {type:'application/xml'}), {upsert:true,contentType:'application/xml'});
    if (saved.error) throw new Error('Não foi possível guardar o XML fiscal confirmado. Consulte esta nota novamente.');
    patch.processed_xml_path = path;
  }
  if (typeof pdf === 'string' && pdf) {
    const path = `${artifactBase}/${model === 65 ? 'danfce' : 'danfe'}.pdf`;
    const saved = await auth.supabase.storage.from('fiscal-artifacts').upload(path, Uint8Array.from(atob(pdf), c => c.charCodeAt(0)), {upsert:true,contentType:'application/pdf'});
    if (saved.error) throw new Error('Não foi possível guardar o documento auxiliar. Consulte esta nota novamente.');
    patch[model === 65 ? 'danfce_pdf_path' : 'danfe_pdf_path'] = path;
  }
  const proof = object(official.prova);
  if (/^[0-9]{15}$/.test(text(proof.protocol))) patch.protocol = text(proof.protocol);
  return patch;
}

async function saveDraft(
  auth: Awaited<ReturnType<typeof authorizeFiscalGoodsIssuer>> & { ok: true },
  draft: NormalizedDraft,
) {
  const table = draft.model === 55 ? "nfe_documents" : "nfce_documents";
  const common: JsonObject = {
    company_id: auth.companyId,
    stock_id: draft.stockId,
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
    // UF e série do emitente serão resolvidas no servidor antes da preparação.
    const config = await auth.supabase.from("company_nfce_settings").select("uf,series").eq("company_id", auth.companyId).maybeSingle();
    if (!config.data?.uf) throw new Error("Configure a UF de emissão nas Configurações Fiscais.");
    common.uf = config.data.uf;
    common.series = config.data.series;
  }
  if (!draft.id && draft.sourceId) {
    const existing = await auth.supabase.from(table).select('*')
      .eq('company_id', auth.companyId).eq('source_type', draft.sourceType).eq('source_id', draft.sourceId)
      .not('status', 'in', '(cancelled,rejected)').maybeSingle();
    if (existing.error) throw new Error('Não foi possível consultar a nota vinculada à venda.');
    if (existing.data) draft.id = text(existing.data.id);
  }
  if (draft.id) {
    const existing = await auth.supabase.from(table).select('*').eq('id', draft.id).eq('company_id', auth.companyId).maybeSingle();
    if (existing.error || !existing.data) throw new Error('Nota não encontrada nesta empresa.');
    if (existing.data.source_type !== draft.sourceType || existing.data.source_id !== draft.sourceId) throw new Error('A origem de uma nota já salva não pode ser alterada.');
    if (existing.data.status !== 'draft') return object(existing.data);
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
  if (error?.code === '23505' && draft.sourceId) {
    const existing = await auth.supabase.from(table).select('*').eq('company_id', auth.companyId).eq('source_type', draft.sourceType).eq('source_id', draft.sourceId)
      .not('status', 'in', '(cancelled,rejected)').maybeSingle();
    if (!existing.error && existing.data) return object(existing.data);
  }
  if (error || !data)
    throw new Error(
      error?.code === "23505"
        ? "Esta venda ou compra já está vinculada a outra nota ativa."
        : "Não foi possível salvar o rascunho.",
    );
  return data as JsonObject;
}

async function assertFiscalStock(
  auth: Awaited<ReturnType<typeof authorizeFiscalGoodsIssuer>> & { ok: true },
  draft: NormalizedDraft,
) {
  if (!draft.stockId) {
    throw new GoodsDocumentError('stock_required', 'Selecione o local de estoque da operação.');
  }
  const [stock, access] = await Promise.all([
    auth.supabase.from('stocks').select('id').eq('id', draft.stockId)
      .eq('company_id', auth.companyId).is('customer_id', null).maybeSingle(),
    auth.supabase.rpc('can_access_stock', {
      _user_id: auth.userId,
      _stock_id: draft.stockId,
    }),
  ]);
  if (stock.error || !stock.data || access.error || access.data !== true) {
    throw new GoodsDocumentError('stock_forbidden', 'O local de estoque não está disponível para seu acesso.', 403);
  }
  if (draft.sourceType === 'manual') return;
  if (!draft.sourceId) {
    throw new GoodsDocumentError('source_invalid', 'Selecione uma venda ou compra válida para importar.');
  }

  let inheritedStockId: string | null = null;
  if (draft.sourceType === 'pdv_sale') {
    const source = await auth.supabase.from('pdv_orders').select('stock_id')
      .eq('id', draft.sourceId).eq('company_id', auth.companyId).maybeSingle();
    if (source.error) throw new Error('Não foi possível validar o local da venda importada.');
    inheritedStockId = uuid(source.data?.stock_id);
  } else {
    const source = await auth.supabase.from('compra_ordens')
      .select('compras!inner(stock_id)').eq('id', draft.sourceId)
      .eq('company_id', auth.companyId).maybeSingle();
    if (source.error) throw new Error('Não foi possível validar o local da compra importada.');
    inheritedStockId = uuid(object(source.data?.compras).stock_id);
  }
  if (!inheritedStockId || inheritedStockId !== draft.stockId) {
    throw new GoodsDocumentError(
      'stock_source_mismatch',
      'O local de estoque da nota precisa ser o mesmo da venda ou compra importada.',
      409,
    );
  }
}

async function assertSourceBelongsToCompany(
  auth: Awaited<ReturnType<typeof authorizeFiscalGoodsIssuer>> & { ok: true },
  draft: NormalizedDraft,
) {
  const permission = await auth.supabase.rpc('fiscal_goods_user_can_access_source', {
    p_user_id: auth.userId, p_company_id: auth.companyId, p_source_type: draft.sourceType, p_source_id: draft.sourceId,
  });
  if (permission.error || permission.data !== true) throw new GoodsDocumentError('source_forbidden', 'Esta venda ou compra não está disponível para seu acesso fiscal.', 403);
  if (draft.party?.id) {
    const partner = await auth.supabase.from(draft.direction === 'entrada' ? 'suppliers' : 'customers').select('id').eq('id', draft.party.id).eq('company_id', auth.companyId).maybeSingle();
    if (partner.error || !partner.data) throw new Error('Parceiro não encontrado nesta empresa.');
  }
  const inventoryIds = [...new Set(draft.items.map(i => i.inventoryId).filter(Boolean))];
  if (inventoryIds.length) {
    const inventory = await auth.supabase.from('inventory').select('id').eq('company_id', auth.companyId).in('id', inventoryIds);
    if (inventory.error || inventory.data?.length !== inventoryIds.length) throw new Error('Um material não está disponível nesta empresa.');
  }
  if (draft.sourceType === "manual") return;
  if (!draft.sourceId)
    throw new Error("Selecione uma venda ou compra válida para importar.");

  if (draft.sourceType === "pdv_sale") {
    const readiness = await auth.supabase.rpc('fiscal_goods_sale_ready', { p_company: auth.companyId, p_order: draft.sourceId });
    if (readiness.error || readiness.data !== true) throw new GoodsDocumentError('source_not_ready', 'A venda precisa estar confirmada nesta empresa antes da emissão.', 403);
    const { data } = await auth.supabase
      .from("pdv_orders")
      .select("id,total")
      .eq("id", draft.sourceId)
      .eq("company_id", auth.companyId)
      .neq("status", "cancelado")
      .maybeSingle();
    if (!data)
      throw new Error(
        "A venda importada não foi encontrada nesta empresa ou foi cancelada.",
      );
    const [items, payments] = await Promise.all([
      auth.supabase.from('pdv_order_items').select('id,inventory_id,quantity,unit_price,total,discount_amount').eq('company_id', auth.companyId).eq('order_id', draft.sourceId).order('sort_order',{ascending:true}).order('id',{ascending:true}),
      auth.supabase.from('pdv_order_payments').select('method,amount,change_amount,contract_version,coverage_status').eq('company_id', auth.companyId).eq('order_id', draft.sourceId),
    ]);
    const covered = asRows(payments.data).filter(p => p.contract_version !== 2 || p.coverage_status === 'authorized');
    if (items.error || payments.error || !sourceFinancialsMatch(draft, number(data.total), asRows(items.data), covered))
      throw new GoodsDocumentError('source_mismatch', 'Os itens, descontos e pagamentos precisam corresponder à venda concluída. Importe novamente.');
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

async function assertFiscalCatalogsBelongToCompany(
  auth: Awaited<ReturnType<typeof authorizeFiscalGoodsIssuer>> & { ok: true },
  draft: NormalizedDraft,
) {
  if (draft.model !== 55) return;
  if (draft.seriesId) {
    const series = await auth.supabase.from('nfe_series').select('id,direction,active')
      .eq('id', draft.seriesId).eq('company_id', auth.companyId).maybeSingle();
    const allowedDirections = draft.direction === 'entrada' ? ['entrada', 'ambos'] : ['saida', 'ambos'];
    if (series.error || !series.data || series.data.active !== true || !allowedDirections.includes(text(series.data.direction))) {
      throw new GoodsDocumentError('series_forbidden', 'A série escolhida não está ativa para esta operação ou não pertence à empresa.', 403);
    }
  }
  if (draft.carrierId) {
    const carrier = await auth.supabase.from('fiscal_goods_carriers').select('id,active')
      .eq('id', draft.carrierId).eq('company_id', auth.companyId).maybeSingle();
    if (carrier.error || !carrier.data || carrier.data.active !== true) {
      throw new GoodsDocumentError('carrier_forbidden', 'A transportadora escolhida não está ativa ou não pertence à empresa.', 403);
    }
  }
}

const outcomeStatus = goodsOutcome;

const documentTable = (model: 55 | 65) =>
  model === 55 ? "nfe_documents" : "nfce_documents";
const eventTable = (model: 55 | 65) =>
  model === 55 ? "nfe_events" : "nfce_events";

async function fiscalContext(
  auth: Awaited<ReturnType<typeof authorizeFiscalGoodsIssuer>> & { ok: true },
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
  auth: Awaited<ReturnType<typeof authorizeFiscalGoodsIssuer>> & { ok: true },
  path: unknown,
) {
  const normalizedPath = text(path, 1000);
  if (!normalizedPath || !normalizedPath.startsWith(`${auth.companyId}/`) || normalizedPath.split('/').includes('..')) return null;
  const { data, error } = await auth.supabase.storage
    .from("fiscal-artifacts")
    .download(normalizedPath);
  if (error || !data) return null;
  return await data.text();
}

async function transmitSavedGoods(
  auth: Awaited<ReturnType<typeof authorizeFiscalGoodsIssuer>> & {ok:true}, model:55|65,
  row:JsonObject, ctx:NfseProviderCtx, signedXml:string,
  setActive:(document:ActiveGoodsDocument|null,started?:boolean)=>void,
) {
  const table=documentTable(model);const events=eventTable(model);const id=text(row.id);const operationId=text(row.operation_id);
  const claim=await auth.supabase.from(table).update({status:'transmitting'}).eq('id',id).eq('company_id',auth.companyId).eq('operation_id',operationId).eq('status','signed').eq('updated_at',text(row.updated_at)).select('id,operation_id,status,updated_at').maybeSingle();
  if(claim.error)throw new GoodsDocumentError('persistence_failed','Não foi possível iniciar a emissão com segurança. Consulte esta mesma nota.',503);
  if(!claim.data)throw new GoodsDocumentError('document_changed','A situação fiscal mudou. Consulte esta mesma nota para atualizar os dados antes de continuar.',409);
  const transmissionFence=goodsDocumentFence(object(claim.data));
  setActive({id,table,events,fence:transmissionFence},true);
  const input={operationId,snapshotHash:text(row.snapshot_hash),uf:text(row.uf).toUpperCase(),key:digits(row.access_key),batchId:String(row.number).slice(-15),signedXml};
  const official=model===55?await authorizeNfe(ctx,input):await authorizeNfce(ctx,input);
  const normalized=outcomeStatus(official as JsonObject);
  const artifacts=await officialArtifacts(auth,model,id,official as JsonObject);
  await storeGoodsDocument(auth,table,id,{
    status:normalized.status,official_status:normalized.official,...artifacts,
    official_checked_at:new Date().toISOString(),authorized_at:normalized.status==='authorized'?new Date().toISOString():null,
    last_error_code:normalized.status==='rejected'?`sefaz_${text(object(official.resposta).cstat)}`:null,
    last_error_message:normalized.status==='rejected'?'Documento rejeitado pela SEFAZ. Revise o cadastro fiscal.':null,
    next_action:normalized.status==='uncertain'?'consultar_sefaz':null,
  },transmissionFence);
  setActive(null);
  await storeGoodsEvent(auth,events,{company_id:auth.companyId,document_id:id,event_type:'authorization_result',status:normalized.status,official_status:normalized.official,cstat:text(object(official.resposta).cstat)||null,message:normalized.status==='authorized'?'Documento autorizado pela SEFAZ.':'Resultado fiscal registrado.',payload:{outcome:official.outcome,recovered:official.recovered,orientacao:official.orientacao}});
  const rejectionCode = normalized.status === 'rejected'
    ? `sefaz_${text(object(official.resposta).cstat)}`
    : null;
  return jsonResponse({
    ok:true,
    id,
    status:normalized.status,
    officialStatus:normalized.official,
    accessKey:input.key,
    ...(rejectionCode ? { rejectionCode } : {}),
  },normalized.status==='authorized'?201:202);
}

async function handleDocumentAction(
  auth: Awaited<ReturnType<typeof authorizeFiscalGoodsIssuer>> & { ok: true },
  body: JsonObject,
  setActive: (
    document: ActiveGoodsDocument | null,
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
  const custody = await auth.supabase.rpc('fiscal_goods_user_can_access_source', {
    p_user_id: auth.userId, p_company_id: auth.companyId, p_source_type: row.source_type, p_source_id: row.source_id,
  });
  if (custody.error || custody.data !== true) return jsonResponse({ error: 'forbidden', message: 'Esta nota não está disponível para seu acesso.' }, 403);

  if (action === "artifact") {
    const kind = text(body.kind);
    if (!['xml','pdf'].includes(kind)) return jsonResponse({error:'invalid_action',message:'Escolha XML ou PDF para abrir o arquivo fiscal.'},400);
    const field =
      kind === "xml"
        ? "processed_xml_path"
        : model === 55
          ? "danfe_pdf_path"
          : "danfce_pdf_path";
    const path = text(row[field], 1000);
    if (!path || !path.startsWith(`${auth.companyId}/${model}/${documentId}/`) || path.split('/').includes('..'))
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

  if (action === 'revise') {
    const age=Date.now()-new Date(text(row.updated_at)).getTime();
    const eligible=!row.access_key && (row.status==='rejected' || (row.status==='preparing' && Number.isFinite(age) && age>=300_000));
    if(!eligible)return jsonResponse({error:'revision_blocked',message:'Esta nota ainda exige consulta ou está em processamento. Aguarde antes de revisar.'},409);
    await storeGoodsEvent(auth,events,{company_id:auth.companyId,document_id:documentId,event_type:'draft_revision_requested',status:text(row.status),message:'Revisão solicitada antes de qualquer transmissão.',payload:{operationId:row.operation_id,snapshotHash:row.snapshot_hash}});
    let update=auth.supabase.from(table).update({status:'draft',operation_id:crypto.randomUUID(),snapshot:null,snapshot_hash:null,signed_xml_path:null,last_error_code:null,last_error_message:null,next_action:null})
      .eq('id',documentId).eq('company_id',auth.companyId).eq('status',text(row.status)).eq('operation_id',text(row.operation_id)).is('access_key',null);
    if(row.updated_at)update=update.eq('updated_at',text(row.updated_at));
    const revised=await update.select('id').maybeSingle();
    if(revised.error)throw new GoodsDocumentError('persistence_failed','Não foi possível reabrir este rascunho com segurança. Consulte a nota.',503);
    if(!revised.data)throw new GoodsDocumentError('draft_changed','A nota mudou em outro atendimento. Consulte a situação atual antes de continuar.',409);
    return jsonResponse({ok:true,id:documentId,status:'draft'},200);
  }
  if (action === 'resume') {
    if(row.status!=='signed')return jsonResponse({error:'resume_blocked',message:'Consulte a situação desta nota antes de continuar. Nenhum novo envio foi iniciado.'},409);
    const {fiscal,ctx}=await fiscalContext(auth,`retomar_${model}:${documentId}`);
    const [company,configResult]=await Promise.all([loadGoodsIssuer(auth),auth.supabase.from(model===55?'company_nfe_settings':'company_nfce_settings').select('*').eq('company_id',auth.companyId).maybeSingle()]);
    if(configResult.error)throw new GoodsDocumentError('readiness_unavailable','Não foi possível conferir a configuração fiscal. Tente novamente.',503);
    const issues=goodsReadinessIssues(model,company,fiscal,object(configResult.data),Deno.env.get('FISCAL_NFCE_PRODUCAO_HABILITADA')==='1');
    if(issues.length)return jsonResponse({error:issues[0].code,message:issues[0].message},422);
    if(Number(row.environment)!==(fiscal.fiscal_ambiente==='producao'?1:2) || text(row.uf).toUpperCase()!==text(company.state).toUpperCase())throw new GoodsDocumentError('fiscal_context_changed','O ambiente ou a UF mudou desde a preparação. Consulte o suporte antes de continuar.',409);
    if(!/^[0-9a-f]{64}$/.test(text(row.snapshot_hash)) || await sha256(row.snapshot)!==row.snapshot_hash || digits(row.access_key).length!==44)throw new GoodsDocumentError('snapshot_unavailable','Não foi possível recuperar os dados fiscais preparados. Nenhum novo envio foi iniciado.',409);
    const storedDraft = normalizeDraft(row.draft_payload);
    await assertSourceBelongsToCompany(auth, storedDraft);
    await assertFiscalCatalogsBelongToCompany(auth, storedDraft);
    const xml=await storedSignedXml(auth,row.signed_xml_path);
    if(!xml)throw new GoodsDocumentError('snapshot_unavailable','O XML assinado ainda não está disponível. Nenhum novo envio foi iniciado.',409);
    return await transmitSavedGoods(auth,model,row,ctx,xml,setActive);
  }

  if(action==='cancel' && row.status==='cancelled')return jsonResponse({ok:true,status:'cancelled',existing:true},200);
  if(action==='cancel' && row.status==='cancellation_pending')return jsonResponse({ok:true,status:'cancellation_pending',existing:true,refreshRequired:true},202);
  if(action==='cancel' && row.status!=='authorized')throw new GoodsDocumentError('not_authorized','Consulte a situação desta mesma nota antes de solicitar cancelamento.',409);
  if(action==='consult' && row.status==='cancelled')return jsonResponse({ok:true,status:'cancelled',existing:true},200);
  // Assinada ainda não foi transmitida; uma consulta prematura não pode convertê-la em incerta.
  if(action==='consult' && row.status==='signed')return jsonResponse({ok:true,id:documentId,status:'signed',notTransmitted:true},200);
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
    // Consulta inconclusiva não desfaz estados fiscais já conclusivos nem libera cancelamento em andamento.
    if(row.status==='cancellation_pending' && normalized.status!=='cancelled')return jsonResponse({ok:true,status:'cancellation_pending',existing:true,refreshRequired:true,checkInconclusive:true},202);
    if(row.status==='authorized' && !['authorized','cancelled'].includes(normalized.status))return jsonResponse({ok:true,status:'authorized',existing:true,refreshRequired:true,checkInconclusive:true},202);
    if(row.status==='rejected' && normalized.status==='uncertain')return jsonResponse({ok:true,status:'rejected',existing:true,refreshRequired:true,checkInconclusive:true},202);
    const recoveredArtifacts = await officialArtifacts(auth, model, documentId, official as JsonObject);
    const now = new Date().toISOString();
    await storeGoodsDocument(auth, table, documentId, {
        ...recoveredArtifacts,
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
        last_error_code: normalized.status === 'rejected' ? `sefaz_${text(object(official.resposta).cstat)}` : null,
        last_error_message: normalized.status === 'rejected' ? 'Documento rejeitado pela SEFAZ. Revise o cadastro fiscal.' : null,
        next_action:
          normalized.status === "uncertain" ? "consultar_sefaz" : null,
      },goodsDocumentFence(row));
    await storeGoodsEvent(auth, events, {
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
    await storeGoodsDocument(auth, table, documentId, {
        status: "cancelled",
        official_status: "cancelada",
        cancelled_at: new Date().toISOString(),
        official_checked_at: new Date().toISOString(),
      },goodsDocumentFence(row));
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
  const cancellationClaim = await auth.supabase.from(table).update({status:'cancellation_pending',next_action:'consultar_sefaz'})
    .eq('id',documentId).eq('company_id',auth.companyId).eq('operation_id',text(row.operation_id)).eq('status','authorized').eq('updated_at',text(row.updated_at)).select('id,operation_id,status,updated_at').maybeSingle();
  if (cancellationClaim.error) throw new Error('Não foi possível iniciar o cancelamento.');
  if (!cancellationClaim.data) throw new GoodsDocumentError('document_changed','A situação fiscal mudou. Consulte esta mesma nota antes de solicitar cancelamento novamente.',409);
  let cancellationFence=goodsDocumentFence(object(cancellationClaim.data));
  setActive({ id: documentId, table, events, fence:cancellationFence }, true);
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
  if (input.cnpj.length !== 14) input.cnpj = digits((await loadGoodsIssuer(auth)).document);
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
  const eventPath = `${auth.companyId}/${model}/${documentId}/events/${operationId}/cancelamento-assinado.xml`;
  const signedCancellation = await auth.supabase.storage
    .from("fiscal-artifacts")
    .upload(
      eventPath,
      new Blob([prepared.xmlAssinado], { type: "application/xml" }),
      { upsert: true, contentType: "application/xml" },
    );
  if (signedCancellation.error) throw new GoodsDocumentError('persistence_failed','Não foi possível guardar o cancelamento assinado. Consulte esta mesma nota.',503);
  cancellationFence=await storeGoodsDocument(auth, table, documentId, {
      status: "cancellation_pending",
      next_action: "aguardar_cancelamento",
    },cancellationFence);
  setActive({ id: documentId, table, events, fence:cancellationFence }, true);
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
  const cancellationOutcome = outcomeStatus(result as JsonObject);
  const normalized=cancellationOutcome.status==='cancelled'?cancellationOutcome:{status:'cancellation_pending',official:'aguardando_confirmacao'};
  const now = new Date().toISOString();
  const processedPath = (typeof result.xmlProcessado === "string" ? result.xmlProcessado : "")
    ? `${auth.companyId}/${model}/${documentId}/events/${operationId}/${await sha256(result.xmlProcessado)}/cancelamento-processado.xml`
    : null;
  if (processedPath) {
    const cancellationResult = await auth.supabase.storage
      .from("fiscal-artifacts")
      .upload(
        processedPath,
        new Blob([(typeof result.xmlProcessado === "string" ? result.xmlProcessado : "")], { type: "application/xml" }),
        { upsert: true, contentType: "application/xml" },
      );
    if (cancellationResult.error) throw new GoodsDocumentError('persistence_failed','Não foi possível guardar a confirmação do cancelamento. Consulte esta mesma nota.',503);
  }
  await storeGoodsDocument(auth, table, documentId, {
      status: normalized.status,
      official_status: normalized.official,
      cancelled_at: normalized.status === "cancelled" ? now : null,
      official_checked_at: now,
      next_action: normalized.status === "cancellation_pending" ? "consultar_sefaz" : null,
    },cancellationFence);
  setActive(null);
  await storeGoodsEvent(auth, events, {
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
      payload: { outcome: result.outcome, processedPath, signedPath:eventPath, operationId },
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
  const auth = await authorizeFiscalGoodsIssuer(req);
  if (!auth.ok) return auth.response;
  let activeDocument: ActiveGoodsDocument | null = null;
  let transmissionStarted = false;
  try {
    const body = object(await req.json());
    const action = text(body.action);
    if (["consult", "artifact", "cancel", "revise", "resume"].includes(action)) {
      return await handleDocumentAction(
        auth,
        body,
        (document, started = false) => {
          activeDocument = document;
          if (started) transmissionStarted = true;
        },
      );
    }
    if (action === 'readiness') {
      const model = Number(body.model);
      if (model !== 55 && model !== 65) throw new GoodsDocumentError('invalid_draft','Escolha NF-e ou NFC-e para conferir a configuração.',400);
      const [fiscalResult, company, configResult] = await Promise.all([
        auth.supabase.from('company_fiscal_settings').select('*').eq('company_id',auth.companyId).maybeSingle(),
        loadGoodsIssuer(auth),
        auth.supabase.from(model === 55 ? 'company_nfe_settings' : 'company_nfce_settings').select('*').eq('company_id',auth.companyId).maybeSingle(),
      ]);
      if (fiscalResult.error || configResult.error) throw new GoodsDocumentError('readiness_unavailable','Não foi possível conferir a configuração fiscal. Tente novamente.',503);
      const fiscal = object(fiscalResult.data);
      const issues = goodsReadinessIssues(model,company,fiscal,object(configResult.data),Deno.env.get('FISCAL_NFCE_PRODUCAO_HABILITADA') === '1');
      return jsonResponse({ok:true,model,ready:issues.length === 0,environment:fiscal.fiscal_ambiente === 'producao' ? 'producao' : 'homologacao',issues},200);
    }
    let draft: NormalizedDraft;
    try { draft = normalizeDraft(body.draft); }
    catch { throw new GoodsDocumentError('invalid_draft', 'Revise o modelo, a direção e a origem do documento fiscal.'); }
    if (!["save_draft", "emit"].includes(action))
      return jsonResponse(
        { error: "invalid_action", message: "Ação fiscal inválida." },
        400,
      );
    await assertSourceBelongsToCompany(auth, draft);
    await assertFiscalStock(auth, draft);
    await assertFiscalCatalogsBelongToCompany(auth, draft);
    const row = await saveDraft(auth, draft);
    if (action === "save_draft" || row.status !== 'draft')
      return jsonResponse({ ok: true, id: row.id, status: row.status, existing: row.status !== 'draft' }, 200);


    const [fiscalResult, companyResult, configResult] = await Promise.all([
      auth.supabase
        .from("company_fiscal_settings")
        .select("*")
        .eq("company_id", auth.companyId)
        .maybeSingle(),
      loadGoodsIssuer(auth),
      auth.supabase
        .from(
          draft.model === 55 ? "company_nfe_settings" : "company_nfce_settings",
        )
        .select("*")
        .eq("company_id", auth.companyId)
        .maybeSingle(),
    ]);
    const fiscal = object(fiscalResult.data);
    const company = object(companyResult);
    const config = object(configResult.data);
    if (fiscalResult.error || configResult.error) throw new GoodsDocumentError('readiness_unavailable','Não foi possível conferir a configuração fiscal. Tente novamente.',503);
    const readiness = goodsReadinessIssues(draft.model, company, fiscal, config, Deno.env.get('FISCAL_NFCE_PRODUCAO_HABILITADA') === '1');
    if (readiness.length) return jsonResponse({error:readiness[0].code,message:readiness[0].message},422);
    const environment = fiscal.fiscal_ambiente === 'producao' ? 1 : 2;
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
    const table = draft.model === 55 ? 'nfe_documents' : 'nfce_documents';
    const claim = await auth.supabase.from(table).update({ status: 'preparing' })
      .eq('id', row.id).eq('company_id', auth.companyId).eq('status', 'draft')
      .eq('draft_payload', JSON.stringify(row.draft_payload ?? draft)).eq('operation_id',text(row.operation_id)).eq('updated_at',text(row.updated_at)).select('id,operation_id,status,updated_at').maybeSingle();
    if (claim.error) throw new Error('Não foi possível iniciar a preparação da nota.');
    if (!claim.data) throw new GoodsDocumentError('draft_changed','A nota foi alterada em outro atendimento. Abra o rascunho novamente antes de emitir.',409);
    let preparationFence=goodsDocumentFence(object(claim.data));
    activeDocument = { id: text(row.id), table, events: draft.model === 55 ? 'nfe_events' : 'nfce_events', fence:preparationFence };
    let series = number(row.series);
    let documentNumber = number(row.number);
    if (!documentNumber) {
      const reserved = await auth.supabase.rpc("reserve_goods_fiscal_number", {
        p_company_id: auth.companyId,
        p_model: draft.model,
        p_series_id: draft.seriesId,
        p_direction: draft.direction,
      });
      const reservation = Array.isArray(reserved.data)
        ? object(reserved.data[0])
        : object(reserved.data);
      if (reserved.error || !reservation.number)
        throw new GoodsDocumentError(
          "number_reservation_failed",
          "Não foi possível reservar a numeração fiscal. Nenhum número foi consumido.",
          503,
          {
            stage: "reserve_number",
            databaseCode: text(reserved.error?.code, 32) || null,
          },
        );
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
    const operationId = text(row.operation_id);
    preparationFence=await storeGoodsDocument(auth, table, text(row.id), {
        status: "preparing",
        environment,
        uf: text(company.state).toUpperCase(),
        series,
        number: documentNumber,
        snapshot_hash: snapshotHash,
        snapshot: document,
        last_error_code: null,
        last_error_message: null,
      },preparationFence);
    activeDocument.fence=preparationFence;
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
    if (prepared.tenantId !== auth.companyId || prepared.operationId !== operationId || prepared.snapshotHash !== snapshotHash || prepared.status !== 'preparada' || !/^\d{44}$/.test(prepared.chave) || prepared.chave.slice(20,22) !== String(draft.model) || prepared.chave.slice(6,20) !== digits(company.document) || !text(prepared.xmlAssinado,2_000_000))
      throw new GoodsDocumentError('motor_response_mismatch','Não foi possível confirmar a preparação fiscal desta empresa. Nenhuma transmissão foi iniciada.',502);
    const signedXmlPath = `${auth.companyId}/${draft.model}/${row.id}/${operationId}/assinado.xml`;
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
    preparationFence=await storeGoodsDocument(auth, table, text(row.id), {
        status: "signed",
        access_key: prepared.chave,
        signed_xml_path: signedXmlPath,
      },preparationFence);
    activeDocument.fence=preparationFence;
    activeDocument = null;
    return await transmitSavedGoods(auth,draft.model,{...row,operation_id:preparationFence.operationId,status:preparationFence.status,updated_at:preparationFence.updatedAt,number:documentNumber,uf:text(company.state).toUpperCase(),snapshot_hash:snapshotHash,access_key:prepared.chave},ctx,prepared.xmlAssinado,(document,started=false)=>{activeDocument=document;if(started)transmissionStarted=true;});
  } catch (error) {
    const fiscal =
      error instanceof NfeMotorError || error instanceof NfceMotorError;
    const code = fiscal ? (error as NfeMotorError).code : error instanceof GoodsDocumentError ? error.code : 'internal_error';
    const message = transmissionStarted || code === 'resultado_incerto'
      ? 'A confirmação não voltou. Consulte esta mesma nota antes de tentar novamente.'
      : fiscal && safeFiscalMessage(error as NfeMotorError)
      ? safeFiscalMessage(error as NfeMotorError)!
      : 'Não foi possível concluir a operação fiscal. Confira o cadastro fiscal e tente novamente.';
    if (activeDocument) {
      const status = activeDocument.fence.status==='cancellation_pending' ? 'cancellation_pending' :
        transmissionStarted || code === "resultado_incerto" ? "uncertain" : "rejected";
      const officialStatus =
        ['uncertain','cancellation_pending'].includes(status) ? "aguardando_confirmacao" : null;
      let recovery = auth.supabase
        .from(activeDocument.table)
        .update({
          status,
          official_status: officialStatus,
          last_error_code: code,
          last_error_message: message,
          next_action:
            ['uncertain','cancellation_pending'].includes(status) ? "consultar_sefaz" : "corrigir_e_reemitir",
          official_checked_at:
            ['uncertain','cancellation_pending'].includes(status) ? new Date().toISOString() : null,
        })
        .eq("id", activeDocument.id)
        .eq("company_id", auth.companyId);
      recovery = recovery.eq('operation_id',activeDocument.fence.operationId).eq('status',activeDocument.fence.status).eq('updated_at',activeDocument.fence.updatedAt);
      const recoveryResult=await recovery.select('id').maybeSingle();
      await auth.supabase.from(activeDocument.events).insert({
        company_id: auth.companyId,
        document_id: activeDocument.id,
        event_type: !recoveryResult.data ? 'stale_operation_response' : status==='cancellation_pending' ? 'cancellation_uncertain' : status==='uncertain' ? 'authorization_uncertain' : 'authorization_failed',
        status:recoveryResult.data?status:null,
        official_status: officialStatus,
        message,
        payload: { code, transmissionStarted, operationId: activeDocument.fence.operationId, stateApplied:!!recoveryResult.data },
      });
    }
    console.error('[fiscal-goods-document]', {
      code,
      transmissionStarted,
      ...(error instanceof GoodsDocumentError ? error.diagnostic : {
        errorType: error instanceof Error ? error.name : typeof error,
      }),
    });
    return jsonResponse(
      { error: code, message: error instanceof GoodsDocumentError ? error.message : message },
      error instanceof GoodsDocumentError ? error.status : fiscal ? (error as NfeMotorError).status : 500,
    );
  }
});
