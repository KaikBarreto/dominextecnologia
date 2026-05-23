/**
 * Templates HTML base dos documentos rich-text PMOC (Onda C — v1.9.x).
 *
 * Quando o gestor abre o editor pela primeira vez (ou clica "Restaurar texto
 * padrão"), estes templates são pré-preenchidos com placeholders simples
 * `{{empresa.razao_social}}`, `{{rt.nome}}` etc. e renderizados no editor
 * rich.
 *
 * Mesmo template é depois enviado pra edge function de geração de PDF —
 * mas a edge faz sua própria renderização autoritativa (não confia no HTML
 * do cliente). Este HTML só serve como ponto de partida pra edição.
 *
 * Texto exato do CEO está em
 * docs/planos/2026-05-23-pmoc-onda-C-dossie-cronograma.md §3.2 e §3.3.
 */

export interface PmocTemplateContext {
  empresa_razao_social: string;
  empresa_cnpj: string;
  rt_nome: string;
  rt_modalidade: string;
  rt_cft_crea: string;
  cidade: string;
  customer_name: string;
  customer_address: string;
  contract_frequency_label: string;
  contract_start_date_extenso: string;
  generated_at_extenso: string;
}

const FALLBACK_LINE = '____________________';

function s(value: string | null | undefined, fallback = FALLBACK_LINE): string {
  if (!value || value.trim() === '') return fallback;
  return value;
}

function escapeHtmlMinimal(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Template base do Termo de Responsabilidade Técnica (página 2 do Dossiê).
 */
export function buildDefaultTermoRtHtml(ctx: Partial<PmocTemplateContext> = {}): string {
  const razao = escapeHtmlMinimal(s(ctx.empresa_razao_social, '[razão social da empresa]'));
  const cnpj = escapeHtmlMinimal(s(ctx.empresa_cnpj, '[CNPJ]'));
  const rtNome = escapeHtmlMinimal(s(ctx.rt_nome, '[nome do responsável técnico]'));
  const rtMod = escapeHtmlMinimal(s(ctx.rt_modalidade, '[modalidade]'));
  const rtCft = escapeHtmlMinimal(s(ctx.rt_cft_crea, FALLBACK_LINE));
  const cidade = escapeHtmlMinimal(s(ctx.cidade, '[cidade]'));
  const razaoUpper = razao.toUpperCase();

  return `
<h2>TERMO DE RESPONSABILIDADE TÉCNICA — PMOC</h2>

<p>A empresa <strong>${razao}</strong>, inscrita no CNPJ nº <strong>${cnpj}</strong>, responsável pela execução dos serviços de manutenção preventiva, corretiva e higienização dos sistemas de climatização da unidade contratante, declara para os devidos fins que os serviços relacionados ao Plano de Manutenção, Operação e Controle (PMOC) serão executados sob supervisão técnica do profissional abaixo identificado:</p>

<h3>RESPONSÁVEL TÉCNICO</h3>

<p><strong>Nome:</strong> ${rtNome}<br>
<strong>Modalidade:</strong> ${rtMod}<br>
<strong>Registro Profissional CFT:</strong> ${rtCft}</p>

<p>O responsável técnico acima qualificado será responsável pela supervisão técnica do PMOC, validação dos procedimentos executados, orientações técnicas e conformidade dos serviços relacionados aos sistemas de climatização da unidade atendida.</p>

<p>Os serviços operacionais poderão ser executados por equipe técnica operacional da <strong>${razao}</strong>, devidamente treinada e orientada, ficando o responsável técnico encarregado da supervisão geral do plano de manutenção.</p>

<p>A documentação referente ao PMOC ficará disponível na unidade para apresentação aos órgãos fiscalizadores competentes.</p>

<p>${cidade}, ____ de ___________________ de 20____.</p>

<p><strong>CONTRATANTE:</strong></p>

<p>___________________________________________</p>

<p><strong>${razaoUpper}:</strong></p>

<p>___________________________________________</p>

<p><strong>RESPONSÁVEL TÉCNICO:</strong></p>

<p>___________________________________________</p>

<p>${rtNome}<br>
${rtMod}<br>
CFT: ${rtCft}</p>
`.trim();
}

/**
 * Template base do Certificado de Conformidade (página 3 do Dossiê).
 */
export function buildDefaultCertificadoHtml(ctx: Partial<PmocTemplateContext> = {}): string {
  const customerName = escapeHtmlMinimal(s(ctx.customer_name, '[cliente]'));
  const customerAddress = escapeHtmlMinimal(s(ctx.customer_address, '[endereço]'));
  const rtNome = escapeHtmlMinimal(s(ctx.rt_nome, '[responsável técnico]'));
  const rtMod = escapeHtmlMinimal(s(ctx.rt_modalidade, '[modalidade]'));
  const rtCft = escapeHtmlMinimal(s(ctx.rt_cft_crea, FALLBACK_LINE));
  const freq = escapeHtmlMinimal(s(ctx.contract_frequency_label, '[frequência]'));
  const start = escapeHtmlMinimal(s(ctx.contract_start_date_extenso, '[data de início]'));
  const generatedAt = escapeHtmlMinimal(s(ctx.generated_at_extenso, '[data de geração]'));

  return `
<h2>CERTIFICADO DE CONFORMIDADE</h2>

<p>Certificamos que a unidade <strong>${customerName}</strong>, localizada em ${customerAddress}, está sob plano formal de manutenção preventiva e operacional conforme estabelecido pela Lei Federal nº 13.589 de 4 de janeiro de 2018, sob supervisão técnica de <strong>${rtNome}</strong> (${rtMod} — CFT ${rtCft}).</p>

<p><strong>Periodicidade das manutenções:</strong> ${freq}.<br>
<strong>Vigência:</strong> a partir de ${start}.</p>

<p>Documento gerado em ${generatedAt}.</p>

<p>___________________________________________<br>
${rtNome}<br>
${rtMod} — CFT ${rtCft}</p>
`.trim();
}

/**
 * Extrai um preview curto (texto puro) de um HTML rich, útil pra mostrar no
 * sub-card antes do botão "Editar".
 */
export function htmlPreview(html: string | null | undefined, maxLength = 180): string {
  if (!html) return '';
  // strip tags via DOMParser quando disponível (ambiente browser).
  if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const text = doc.body?.textContent ?? '';
      const trimmed = text.replace(/\s+/g, ' ').trim();
      return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}…` : trimmed;
    } catch {
      // fallback abaixo
    }
  }
  const plain = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > maxLength ? `${plain.slice(0, maxLength)}…` : plain;
}
