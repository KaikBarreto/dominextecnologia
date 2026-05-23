/**
 * Contrato de payload do portal PMOC público (Onda B — v1.9.1).
 *
 * Fonte da verdade do schema vive na edge function `pmoc-portal-share`
 * (a ser implementada pelo dev-database). Este type é o contrato provisório
 * que a tela consome — quando a edge function real for deployada, este arquivo
 * pode precisar de ajustes pontuais. Mantido flexível (campos podem evoluir).
 *
 * Plano mestre: docs/planos/2026-05-23-pmoc-v1.9-arquitetura.md §2.4
 * Plano da onda: docs/planos/2026-05-23-pmoc-onda-B-portal-publico.md §3.2
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

export type PortalDocumentType =
  | 'pmoc_formal'
  | 'termo_rt'
  | 'cronograma'
  | 'certificado';

export interface PortalUnit {
  name: string;
  address: string | null;
  customer_name: string;
}

export interface PortalContract {
  name: string;
  start_date: string;
  /** Ex: "Mensal", "Trimestral" — já formatado pra exibição. */
  frequency_label: string;
  next_pmoc_generation_date: string | null;
  /** "Conforme Lei Federal 13.589/2018" (texto literal). */
  compliance_text: string;
  health_status: PortalHealthStatus;
  overdue_count: number;
}

export interface PortalResponsibleTechnician {
  full_name: string;
  cft_crea: string | null;
  modality: string | null;
}

export interface PortalTenant {
  name: string;
  logo_url: string | null;
  /** Hex string (ex: "#0066cc"). Edge function decide fallback se nulo. */
  primary_color: string | null;
}

export interface PortalOsPhoto {
  url: string;
  caption: string | null;
}

export interface PortalHistoryEntry {
  os_number: number;
  scheduled_date: string;
  completed_date: string | null;
  status: PortalOsStatus;
  service_type_label: string | null;
  /** Descrição pública — sem notas internas. */
  description: string | null;
  technician_first_name: string | null;
  public_photos: PortalOsPhoto[];
  rating: number | null;
}

export interface PortalDocumentPlaceholder {
  type: PortalDocumentType;
  label: string;
  /** Onda B: sempre `false`. Onda C trocará pra `true` quando documentos reais existirem. */
  available: boolean;
}

export interface PortalPayload {
  unit: PortalUnit;
  contract: PortalContract;
  responsible_technician: PortalResponsibleTechnician | null;
  tenant: PortalTenant;
  history: PortalHistoryEntry[];
  documents_placeholder: PortalDocumentPlaceholder[];
}
