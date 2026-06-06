/**
 * Templates HTML base dos documentos rich-text PMOC (Onda C — v1.9.x).
 *
 * Quando o gestor abre o editor pela primeira vez (ou clica "Restaurar texto
 * padrão"), estes templates são pré-preenchidos com **nós de variável PMOC**
 * — `<span data-pmoc-var="...">` — que o editor rich renderiza como badges
 * visuais coloridos (azul=valor cheio, vermelho=valor vazio).
 *
 * O HTML emitido aqui **não** contém os valores reais. Substituição acontece:
 *  - no editor (badge mostra valor real ao gestor enquanto edita) — via NodeView;
 *  - na edge function de geração de PDF (via `substituteVariables` portado
 *    pra Deno — TODO Tech Lead).
 *
 * Texto exato do CEO está em
 * docs/planos/2026-05-23-pmoc-onda-C-dossie-cronograma.md §3.2 e §3.3.
 *
 * Plano Onda H (badges visuais): docs/planos/2026-05-23-pmoc-onda-H-variaveis-badges.md
 */

import type { PmocVariableKey } from './pmocVariables';

/**
 * Mantido por compatibilidade com `PmocContractDocsTab` e ContractDetail,
 * que ainda recebem este shape (depois mapeado pra `PmocVariableContext`).
 *
 * Esse contexto NÃO é mais usado pelos `buildDefault*Html` (que não recebem
 * mais ctx). Vive aqui só pra alimentar o NodeView via `templateContext` no
 * editor + diagnóstico de campos faltantes na aba de Documentos.
 */
export interface PmocTemplateContext {
  empresa_razao_social: string;
  empresa_cnpj: string;
  empresa_endereco: string;
  rt_nome: string;
  rt_modalidade: string;
  rt_cft_crea: string;
  cidade: string;
  customer_name: string;
  customer_document: string;
  customer_address: string;
  contract_frequency_label: string;
  contract_start_date_extenso: string;
  /** ISO date do contracts.created_at — usado pra derivar dia/mês/ano de criação no editor. */
  contract_created_at_iso: string;
  generated_at_extenso: string;
}

/**
 * Renderiza um `<span data-pmoc-var="key"></span>` no HTML template, pra
 * ser reconhecido pelo PmocVariableNode no parse.
 *
 * Usamos `data-pmoc-label` adicional pra que copy-paste pra fora do editor
 * (ex: Word) mostre algo legível.
 */
function v(key: PmocVariableKey): string {
  return `<span data-pmoc-var="${key}"></span>`;
}

/**
 * Template base do Termo de Responsabilidade Técnica (página 2 do Dossiê).
 *
 * Os badges são inseridos em todos os pontos onde antes havia placeholder
 * literal ou valor pré-substituído.
 */
export function buildDefaultTermoRtHtml(): string {
  return `
<h2>TERMO DE RESPONSABILIDADE TÉCNICA — PMOC</h2>

<p>A empresa <strong>${v('empresa.razao_social')}</strong>, inscrita no CNPJ nº <strong>${v('empresa.cnpj')}</strong>, responsável pela execução dos serviços de manutenção preventiva, corretiva e higienização dos sistemas de climatização da unidade contratante <strong>${v('cliente.nome')}</strong>, inscrita no CNPJ nº <strong>${v('cliente.documento')}</strong>, localizada em <strong>${v('cliente.endereco')}</strong>, declara para os devidos fins que os serviços relacionados ao Plano de Manutenção, Operação e Controle (PMOC) serão executados sob supervisão técnica do profissional abaixo identificado:</p>

<h3>RESPONSÁVEL TÉCNICO</h3>

<p><strong>Nome:</strong> ${v('rt.nome')}<br>
<strong>Modalidade:</strong> ${v('rt.modalidade')}<br>
<strong>Registro Profissional CFT:</strong> ${v('rt.cft_crea')}</p>

<p>O responsável técnico acima qualificado será responsável pela supervisão técnica do PMOC, validação dos procedimentos executados, orientações técnicas e conformidade dos serviços relacionados aos sistemas de climatização da unidade atendida.</p>

<p>Os serviços operacionais poderão ser executados por equipe técnica operacional da <strong>${v('empresa.razao_social')}</strong>, devidamente treinada e orientada, ficando o responsável técnico encarregado da supervisão geral do plano de manutenção.</p>

<p>A documentação referente ao PMOC ficará disponível na unidade para apresentação aos órgãos fiscalizadores competentes.</p>

<p>${v('empresa.cidade')}, ${v('contrato.criado_dia')} de ${v('contrato.criado_mes')} de ${v('contrato.criado_ano')}.</p>

<p>&nbsp;</p>
<p>&nbsp;</p>
<p>&nbsp;</p>
`.trim();
}

/**
 * Template base do Certificado de Conformidade (página 3 do Dossiê).
 */
export function buildDefaultCertificadoHtml(): string {
  return `
<h2>CERTIFICADO DE CONFORMIDADE</h2>

<p>A empresa <strong>${v('empresa.razao_social')}</strong>, inscrita no CNPJ nº <strong>${v('empresa.cnpj')}</strong>, certifica que a unidade <strong>${v('cliente.nome')}</strong>, inscrita no CNPJ nº <strong>${v('cliente.documento')}</strong>, localizada em ${v('cliente.endereco')}, está sob plano formal de manutenção preventiva e operacional conforme estabelecido pela Lei Federal nº 13.589 de 4 de janeiro de 2018, sob supervisão técnica de <strong>${v('rt.nome')}</strong> (${v('rt.modalidade')} — CFT ${v('rt.cft_crea')}).</p>

<p><strong>Periodicidade das manutenções:</strong> ${v('contrato.frequencia')}.<br>
<strong>Vigência:</strong> a partir de ${v('contrato.vigencia_inicio')}.</p>

<p>Documento gerado em ${v('data.hoje_extenso')}.</p>

<p>&nbsp;</p>
<p>&nbsp;</p>
`.trim();
}

/**
 * Extrai um preview curto (texto puro) de um HTML rich, útil pra mostrar no
 * sub-card antes do botão "Editar".
 *
 * IMPORTANTE: o HTML agora pode conter `<span data-pmoc-var="...">` vazio
 * (badge de variável). `DOMParser.textContent` retorna string vazia pra esses
 * nós, então o preview pode sair "esfarrapado" se o template tiver muitos
 * badges. Pra UX melhor, substituímos cada badge pelo LABEL antes de extrair
 * texto.
 */
export function htmlPreview(html: string | null | undefined, maxLength = 180): string {
  if (!html) return '';
  // Substitui spans de variável pelo label legível antes de strip-tags, pra
  // que o preview no card mostre "Razão Social" em vez de cair no vazio.
  const replaced = html.replace(
    /<span\b[^>]*\bdata-pmoc-label\s*=\s*"([^"]*)"[^>]*>[\s\S]*?<\/span>/gi,
    (_m, label) => label,
  );
  // strip tags via DOMParser quando disponível (ambiente browser).
  if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(replaced, 'text/html');
      const text = doc.body?.textContent ?? '';
      const trimmed = text.replace(/\s+/g, ' ').trim();
      return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}…` : trimmed;
    } catch {
      // fallback abaixo
    }
  }
  const plain = replaced.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > maxLength ? `${plain.slice(0, maxLength)}…` : plain;
}
