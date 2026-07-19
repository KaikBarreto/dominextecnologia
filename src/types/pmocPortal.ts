/**
 * Contrato de payload do portal PMOC público.
 *
 * Fonte da verdade: edge function `pmoc-portal-share` (payload_version 1.4.0).
 *
 * Evolução:
 *  - 1.0/1.1 — Onda B: payload inicial (history).
 *  - 1.2.0 — Onda E: documentos reais + signature_status.
 *  - 1.3.0 — Redesign 2026-05-24: adiciona `schedule`, `tenant.white_label_enabled`
 *    e expõe `status` raw em cada entrada (necessário pra UI pintar badge por cor).
 *  - 1.4.0 — Redesign 2026-05-24 (cont.): header do portal espelha o do Relatório
 *    de Serviço. Tenant ganha `document`, `phone`, `email`, `zip_code` e
 *    `report_header` (configs de cor/logo); telefone/email PASSARAM A ser
 *    expostos por decisão CEO.
 *  - 1.7.0 — Validade dos documentos: cada documento real expõe `valid_until`
 *    (data de vencimento) pra o cliente ver "Válido até …" + selo de status.
 *  - 1.8.0 — Certificado de Conformidade adicionado à lista de documentos do
 *    portal (`type:'certificado'`), com o mesmo gate de liberação e o mesmo
 *    selo de validade do TRT.
 *
 * Planos:
 *  - docs/planos/2026-05-23-pmoc-v1.9-arquitetura.md §2.4
 *  - docs/planos/2026-05-24-pmoc-portal-publico-redesign.md
 */

export type PortalHealthStatus =
  | 'em_dia'
  | 'manutencao_pendente'
  | 'necessita_atencao';

export type PortalOsStatus =
  | 'agendada'
  | 'pendente'
  | 'a_caminho'
  | 'em_andamento'
  | 'pausada'
  | 'concluida'
  | 'cancelada';

/**
 * Onda C/E — tipos dos documentos reais.
 *  - `dossie_pmoc` → capa + termo RT + certificado.
 *  - `cronograma_anual` → 12 páginas (1 mês/página).
 *  - `termo_rt` → PDF de 1 página com declaração de RT.
 *  - `certificado` → Certificado de Conformidade (com validade), exposto no
 *    portal a partir de 1.8.0 com o mesmo selo "Válido até …" do TRT.
 */
export type PortalRealDocumentType =
  | 'dossie_pmoc'
  | 'cronograma_anual'
  | 'termo_rt'
  | 'certificado';

/**
 * Onda E — status da assinatura embarcada no PDF.
 *  - `'signed'`  → assinatura do RT foi embutida.
 *  - `'pending'` → PDF saiu com linha em branco pra assinar à mão.
 *  - `null`      → não se aplica (ex.: Cronograma) ou doc anterior à Onda E.
 */
export type PortalDocumentSignatureStatus = 'signed' | 'pending' | null;

export interface PortalUnit {
  /** Nome do cliente (cardápio: "Unidade Centro - Filial 1"). */
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
}

export interface PortalContract {
  name: string | null;
  start_date: string | null;
  /** Ex: "Mensal", "Trimestral" — já formatado pra exibição. */
  frequency_label: string;
  next_pmoc_generation_date: string | null;
  /** Alias estável pra mesma data, caso UI prefira outro nome. */
  next_maintenance_date: string | null;
  /** "Conforme Lei Federal 13.589/2018" (texto literal ou customizado). */
  compliance_text: string;
  status_label: string;
  health_status: PortalHealthStatus;
  overdue_count: number;
}

export interface PortalHealth {
  status: PortalHealthStatus;
  overdue_count: number;
}

export interface PortalResponsibleTechnician {
  full_name: string | null;
  cft_crea: string | null;
  modality: string | null;
  registry_number: string | null;
}

/**
 * Onda 1.4.0 — configs visuais do header do portal, espelhados do
 * Relatório de Serviço (ReportHeader). `null` (qualquer campo) → o front
 * cai no `DEFAULT_HEADER_CONFIG` do ReportHeader pro campo correspondente.
 *
 * Só é populado quando `tenant.white_label_enabled === true`.
 */
export interface PortalReportHeaderConfig {
  bg_color: string | null;
  text_color: string | null;
  logo_size: number | null;
  show_logo_bg: boolean | null;
  logo_bg_color: string | null;
  status_bar_color: string | null;
  logo_type: 'full' | 'icon' | null;
  icon_url: string | null;
}

export interface PortalTenant {
  name: string;
  logo_url: string | null;
  /** Hex string (ex: "#0066cc"). Null quando NÃO white-label (edge function decide). */
  primary_color: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  /**
   * Redesign 2026-05-24 — flag que controla a exibição do rodapé Dominex
   * no portal público. `true` → tenant white-label, esconde marca Dominex.
   */
  white_label_enabled: boolean;
  /**
   * Onda 1.4.0 — campos novos do tenant (header do portal espelha
   * o Relatório de Serviço). `document` = CNPJ formatado.
   */
  document: string | null;
  phone: string | null;
  email: string | null;
  zip_code: string | null;
  /**
   * `null` → usar `DEFAULT_HEADER_CONFIG` inteiro (não white-label).
   * Quando preenchido, cada campo `null` interno cai no default só pra ele.
   */
  report_header: PortalReportHeaderConfig | null;
  /**
   * 1.10.0 — idioma, moeda e fuso da empresa dona do contrato. O portal
   * renderiza no idioma do TENANT (não da máquina do visitante). Ausentes em
   * payloads antigos → tratar como defaults: 'pt-br', 'BRL', 'America/Sao_Paulo'.
   */
  language?: string | null;
  currency?: string | null;
  timezone?: string | null;
}

export interface PortalOsPhoto {
  url: string;
  alt: string | null;
}

/**
 * Entrada de OS no histórico (concluídas) OU no cronograma (futuras/em andamento).
 * Os dois compartilham o mesmo shape; `schedule` simplesmente tem `rating=null`
 * por construção (OS não-concluída não foi avaliada).
 */
export interface PortalOsEntry {
  number: number | null;
  scheduled_date: string | null;
  completed_at: string | null;
  /** Status raw (enum os_status) — usado pra mapear cor do badge. */
  status: PortalOsStatus;
  /** Texto exibível em PT-BR já pronto. */
  status_label: string;
  service_type_label: string | null;
  /** Descrição pública (truncada server-side em 200 chars). */
  public_description: string;
  /** Primeiro nome do técnico responsável (LGPD: nunca sobrenome). */
  technician_first_name: string | null;
  public_photos: PortalOsPhoto[];
  rating: number | null;
  rating_comment: string | null;
}

/** Alias mantido por clareza semântica nas telas. */
export type PortalHistoryEntry = PortalOsEntry;
export type PortalScheduleEntry = PortalOsEntry;

/**
 * Ocorrência do contrato (espelha a aba "Ocorrências"). Mesmo shape público da
 * OS + o `id` real da OS — usado SÓ pelo viewer logado da empresa pra montar o
 * link "Preencher OS" (/os-tecnico/:id). Anônimo recebe o id mas a UI esconde
 * o botão (read-only).
 */
export interface PortalOccurrenceEntry extends PortalOsEntry {
  id: string;
}

/**
 * Onda C/E — documento real no payload público.
 *  - `available=true` → tem PDF e `pdf_url` (signed URL TTL 24h).
 *  - `available=false` → fallback "Disponível em breve" no UI.
 */
export interface PortalRealDocument {
  type: PortalRealDocumentType;
  label: string;
  available: boolean;
  version: number | null;
  generated_at: string | null;
  pdf_url: string | null;
  signature_status: PortalDocumentSignatureStatus;
  /**
   * 1.7.0 — data de vencimento (date-only "yyyy-MM-dd"). Preenchida só para
   * documentos regulatórios com validade (TRT e, desde 1.8.0, o Certificado de
   * Conformidade); `null` para dossiê/cronograma. Ausente em payloads antigos →
   * tratar como `null`.
   */
  valid_until?: string | null;
}

/**
 * Frente F (1.9.0) — uma linha de execução de conformidade PMOC no payload do
 * portal: uma TAREFA do checklist (service_order_activities com freq_code)
 * executada numa visita do contrato, com carimbo de quando/quem e o status de
 * conformidade. Espelha o subconjunto público da view `contract_activity_execution`
 * (mesma forma do `ContractActivityExecutionRow` da aba autenticada), pro
 * componente compartilhado `PmocExecutionHistoryView` renderizar igual nos dois
 * lados. Só presente em contrato PMOC com documentos liberados.
 *
 * NOTA: o componente compartilhado tipa `rows` como `ContractActivityExecutionRow`,
 * que tem campos a mais (company_id, contract_id, plan_activity_id, …) não usados
 * na renderização. O adaptador no portal completa esses campos com defaults — esta
 * interface documenta exatamente o que a EDGE entrega.
 */
export interface PortalExecutionRow {
  service_order_id: string;
  order_number: number | null;
  scheduled_date: string | null;
  visit_conformity: string | null;
  activity_id: string;
  equipment_id: string | null;
  equipment_name: string | null;
  section: string | null;
  component: string | null;
  description: string;
  freq_code: string | null;
  is_measurement: boolean | null;
  measured_value: string | null;
  unit: string | null;
  conformity_status: 'conforme' | 'nao_conforme' | 'na' | null;
  sort_order: number | null;
  responded_at: string | null;
  responded_by_name: string | null;
}

export interface PortalPayload {
  generated_at: string;
  payload_version: string;
  /**
   * Portal do Contrato (1.6.0) — espelha get_portal_data.
   *  - `'granted'` → acesso liberado (já passou pelo gate de privacidade).
   *  - `'denied'`  → portal privado + viewer não-membro (tratado como erro
   *    `PortalPrivateError` no client; o payload de sucesso é sempre 'granted').
   * Ausente em payloads antigos → trata como 'granted' (compat).
   */
  access?: 'granted' | 'denied';
  /**
   * `true` quando quem abre é um usuário LOGADO da empresa dona → pode
   * "Preencher OS". Anônimo / outra empresa → `false` (read-only).
   */
  viewer_can_fill?: boolean;
  /**
   * `true` → contrato PMOC (mostra documentos). `false` → contrato comum
   * (esconde a seção de documentos). Ausente em payloads antigos → trata como
   * PMOC por compat (o portal antigo só existia pra PMOC).
   */
  is_pmoc?: boolean;
  unit: PortalUnit;
  contract: PortalContract;
  health: PortalHealth;
  responsible_technician: PortalResponsibleTechnician | null;
  tenant: PortalTenant;
  /** Redesign 2026-05-24 — OSs futuras + em andamento (limit 50). */
  schedule: PortalScheduleEntry[];
  /** OSs concluídas (limit 20, ordem completed_at DESC). */
  history: PortalHistoryEntry[];
  /**
   * Ocorrências do contrato (1.6.0) — linha do tempo completa das visitas
   * (espelha a aba "Ocorrências"). Read-only; carrega o `id` da OS pro link
   * "Preencher OS" do viewer logado. Ausente em payloads antigos.
   */
  occurrences?: PortalOccurrenceEntry[];
  /**
   * Gate de documentos (1.5.0). `false` → o gestor ainda não liberou os
   * documentos pro cliente final; nesse caso `documents` vem vazio e a seção
   * mostra um aviso neutro. Pode estar ausente em payloads antigos (trata como
   * `true` por compatibilidade — backfill já marcou contratos com documentos).
   * Ausente também em contrato NÃO-PMOC (não há documentos).
   */
  documents_released?: boolean;
  /**
   * Documentos reais (dossiê + cronograma + TRT + Certificado). Só presente em contrato PMOC.
   * Renomeado de `documents_real` em 1.3.0; opcional desde 1.6.0 (não-PMOC).
   */
  documents?: PortalRealDocument[];
  /**
   * Frente F (1.9.0) — histórico de execução PMOC tarefa-a-tarefa (prova de
   * cumprimento da Planilha). Só presente em contrato PMOC com documentos
   * liberados (mesmo gate de `documents_released`). Ordenado por scheduled_date
   * DESC, sort_order ASC. Ausente em payloads antigos / contrato não-PMOC.
   */
  execution_history?: PortalExecutionRow[];
}
