/** Pré-requisitos fiscais compartilhados entre a consulta de prontidão e a emissão. */
export interface GoodsReadinessIssue { code: string; message: string; section: 'empresa' | 'certificado' | 'mercadorias' }
type Row = Record<string, unknown>;
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const digits = (value: unknown) => text(value).replace(/\D/g, '');
export function goodsReadinessIssues(model: 55 | 65, company: Row, fiscal: Row, config: Row, productionEnabled: boolean, now = Date.now()): GoodsReadinessIssue[] {
  const issues: GoodsReadinessIssue[] = [];
  const add = (code: string, message: string, section: GoodsReadinessIssue['section']) => issues.push({code,message,section});
  const expiry = new Date(text(fiscal.certificate_expires_at)).getTime();
  if (!fiscal.certificado_ref || !Number.isFinite(expiry) || expiry <= now) add('certificate_required','Envie um certificado A1 válido nas Configurações Fiscais antes de emitir.','certificado');
  if (config.enabled !== true) add('document_disabled',`Ative a ${model === 55 ? 'NF-e' : 'NFC-e'} nas Configurações Fiscais.`,'mercadorias');
  const production = fiscal.fiscal_ambiente === 'producao';
  if (model === 65 && production && !productionEnabled) add('production_blocked','A emissão de NFC-e em produção está bloqueada.','mercadorias');
  if (production && config.production_approved !== true) add('production_not_approved','A emissão em produção ainda não foi liberada para esta empresa. Conclua a homologação primeiro.','mercadorias');
  if (!production && config.homologation_approved !== true) add('homologation_not_approved','A homologação deste documento ainda não foi aprovada para esta empresa.','mercadorias');
  const missing: string[] = [];
  if (digits(company.document).length !== 14) missing.push('CNPJ');
  if (!text(company.name)) missing.push('nome da empresa');
  if (!text(company.address) || !text(company.neighborhood) || !text(company.city) || !/^[A-Z]{2}$/.test(text(company.state).toUpperCase()) || digits(company.zip_code).length !== 8) missing.push('endereço completo');
  if (digits(fiscal.municipio_ibge).length !== 7) missing.push('município IBGE');
  if (!digits(fiscal.inscricao_estadual)) missing.push('inscrição estadual');
  if (missing.length) add('issuer_incomplete',`Complete nas Configurações Fiscais: ${missing.join(', ')}.`,'empresa');
  if (model === 65) {
    if (text(config.uf).toUpperCase() !== text(company.state).toUpperCase()) add('issuer_incomplete','A UF do credenciamento NFC-e deve corresponder à UF do emitente.','mercadorias');
    const suffix = production ? 'production' : 'homologation';
    if (!text(config[`qr_base_url_${suffix}`]) || !text(config[`access_url_${suffix}`])) add('nfce_urls_required','O credenciamento da NFC-e ainda precisa ser concluído para esta UF e ambiente. Fale com o suporte.','mercadorias');
  }
  return issues;
}
