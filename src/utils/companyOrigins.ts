import { ComponentType } from 'react';
import {
  Search, Instagram, Facebook, Youtube, Users, Music2,
  Megaphone, MoreHorizontal,
} from 'lucide-react';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';

/** Aceita ícones do lucide (LucideIcon) E SVGs de marca próprios (ex.: WhatsAppIcon). */
export type OriginIcon = ComponentType<{ className?: string }>;

export interface CompanyOrigin {
  value: string;
  label: string;
  color: string; // hex
  icon: OriginIcon;
  /** Descrição curta exibida nos cards de seleção (etapa Origem do cadastro). Opcional/aditivo. */
  description?: string;
}

// Lista FIXA de origens — não depende da tabela `company_origins` (vazia).
// O `value` é o que vai pro self-register como `origin` (string).
export const ORIGIN_OPTIONS: CompanyOrigin[] = [
  { value: 'Google',               label: 'Google',              color: '#4285f4', icon: Search,         description: 'Busca na internet' },
  { value: 'Instagram',            label: 'Instagram',           color: '#e1306c', icon: Instagram,      description: 'Perfil ou anúncio' },
  { value: 'Facebook',             label: 'Facebook',            color: '#1877f2', icon: Facebook,       description: 'Página ou anúncio' },
  { value: 'YouTube',              label: 'YouTube',             color: '#ff0000', icon: Youtube,        description: 'Vídeo ou anúncio' },
  { value: 'Indicação de amigo',   label: 'Indicação de amigo',  color: '#10b981', icon: Users,          description: 'Alguém recomendou' },
  { value: 'TikTok',               label: 'TikTok',              color: '#1f2937', icon: Music2,          description: 'Vídeo ou anúncio' },
  { value: 'Grupos de WhatsApp',   label: 'Grupos de WhatsApp',  color: '#25d366', icon: WhatsAppIcon,    description: 'Contato ou grupo' },
  { value: 'Anúncio / Propaganda', label: 'Anúncio / Propaganda', color: '#f97316', icon: Megaphone,     description: 'Publicidade paga' },
  { value: 'Outro',                label: 'Outro',               color: '#6b7280', icon: MoreHorizontal,  description: 'Outra forma' },
];

export function getOrigin(value: string | null | undefined): CompanyOrigin | null {
  if (!value) return null;
  return ORIGIN_OPTIONS.find(o => o.value === value) || null;
}
