import { ComponentType } from 'react';
import {
  Globe, Share2, Zap, Youtube, MessageCircle, UserPlus, MapPin, Megaphone, Star,
} from 'lucide-react';
import type { OriginUtmKey } from '@/lib/whatsapp';

/** Aceita ícones do lucide (LucideIcon) E SVGs de marca próprios. */
export type OriginIcon = ComponentType<{ className?: string }>;

export interface CompanyOrigin {
  value: string;
  label: string;
  color: string; // hex
  icon: OriginIcon;
  /** Descrição curta exibida nos cards de seleção (etapa Origem do cadastro). Opcional/aditivo. */
  description?: string;
  /** Chave canônica de atribuição por UTM (bate com `company_origins.utm_key`). null = não chega por UTM. */
  utmKey?: OriginUtmKey | null;
  /** Espelha `company_origins.show_in_signup`. false = só serve pra atribuição por UTM (não vira card). */
  showInSignup?: boolean;
}

// ⚠️ FALLBACK OFFLINE do cadastro público — NÃO é mais "a lista do cadastro".
//
// A etapa Origem (Registration.tsx) lê o catálogo de verdade da RPC pública
// `get_signup_origins()` (fonte: tabela `company_origins`). Esta lista aqui só
// entra em cena se a RPC falhar, demorar ou devolver vazio — cadastro é topo
// de funil, não pode travar. Por isso os `value` ABAIXO TÊM QUE CONTINUAR
// BATENDO, nome por nome, com `company_origins.name`: um fallback com nome
// inventado recria exatamente o bug que motivou a RPC (badge sem cor, "N/A" na
// listagem, texto cru no detalhe da empresa no painel master) — só que no
// pior momento, quando o catálogo de verdade já falhou.
//
// `Tráfego Pago` entra aqui mesmo com `showInSignup: false` (não é um card)
// só pra permitir a atribuição automática por UTM funcionar mesmo offline.
export const ORIGIN_OPTIONS: CompanyOrigin[] = [
  { value: 'Site/Google',        label: 'Site/Google',        color: '#3B82F6', icon: Globe,          description: 'Busca na internet',   utmKey: 'search',    showInSignup: true },
  { value: 'Facebook/Instagram', label: 'Facebook/Instagram', color: '#8B5CF6', icon: Share2,         description: 'Perfil ou anúncio',    utmKey: 'social',    showInSignup: true },
  { value: 'ChatGPT/IAs',        label: 'ChatGPT/IAs',        color: '#F59E0B', icon: Zap,            description: 'Indicação de uma IA',  utmKey: 'ai',        showInSignup: true },
  { value: 'YouTube',            label: 'YouTube',            color: '#FF0000', icon: Youtube,        description: 'Vídeo ou anúncio',     utmKey: 'video',     showInSignup: true },
  { value: 'WhatsApp',           label: 'WhatsApp',           color: '#25D366', icon: MessageCircle,  description: 'Contato ou grupo',     utmKey: 'messaging', showInSignup: true },
  { value: 'Indicação',          label: 'Indicação',          color: '#22C55E', icon: UserPlus,       description: 'Alguém recomendou',    utmKey: null,        showInSignup: true },
  { value: 'Feira/Evento',       label: 'Feira/Evento',       color: '#F97316', icon: MapPin,         description: 'Evento presencial',    utmKey: null,        showInSignup: true },
  { value: 'Outros',             label: 'Outros',             color: '#6B7280', icon: Star,           description: 'Outra forma',          utmKey: 'other',     showInSignup: true },
  { value: 'Tráfego Pago',       label: 'Tráfego Pago',       color: '#EF4444', icon: Megaphone,      description: 'Anúncio pago',         utmKey: 'paid',      showInSignup: false },
];

export function getOrigin(value: string | null | undefined): CompanyOrigin | null {
  if (!value) return null;
  return ORIGIN_OPTIONS.find(o => o.value === value) || null;
}
