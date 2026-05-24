/**
 * Contrato de payload do portal PMOC público.
 *
 * Fonte da verdade: edge function `pmoc-portal-share` (payload_version 1.3.0).
 *
 * Evolução:
 *  - 1.0/1.1 — Onda B: payload inicial (history).
 *  - 1.2.0 — Onda E: documentos reais + signature_status.
 *  - 1.3.0 — Redesign 2026-05-24: adiciona `schedule`, `tenant.white_label_enabled`
 *    e expõe `status` raw em cada entrada (necessário pra UI pintar badge por cor).
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
 */
export type PortalRealDocumentType =
  | 'dossie_pmoc'
  | 'cronograma_anual'
  | 'termo_rt';

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
}

export interface PortalPayload {
  generated_at: string;
  payload_version: string;
  unit: PortalUnit;
  contract: PortalContract;
  health: PortalHealth;
  responsible_technician: PortalResponsibleTechnician | null;
  tenant: PortalTenant;
  /** Redesign 2026-05-24 — OSs futuras + em andamento (limit 50). */
  schedule: PortalScheduleEntry[];
  /** OSs concluídas (limit 20, ordem completed_at DESC). */
  history: PortalHistoryEntry[];
  /** Documentos reais (dossiê + cronograma + TRT). Renomeado de `documents_real` em 1.3.0. */
  documents: PortalRealDocument[];
}
