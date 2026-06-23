import { useSubscriptionBlock } from "@/hooks/useSubscriptionBlock";

/**
 * Gate de assinatura — espelha o comportamento do EcoSistema (ProtectedRoute):
 * quando o teste/assinatura da empresa vence (ou a empresa é desativada), troca
 * o conteúdo do app pela tela cheia de ativação/renovação, que empurra o cliente
 * pro `/checkout`.
 *
 * A DECISÃO de bloqueio vive no hook `useSubscriptionBlock` (fonte única,
 * reusada por telas fora do AppLayout, ex.: `/os-tecnico/:id` no modo técnico).
 *
 * Decisões:
 * - Admin Auctus (super_admin/vendedores) NÃO tem assinatura de tenant — passa direto.
 * - Renderizado DENTRO do AppLayout, então a rota `/checkout` (fora do layout)
 *   nunca é bloqueada — evita loop "gate ↔ checkout".
 * - Empresa DESATIVADA (`inactive`) bloqueia na hora; trial bloqueia ao vencer;
 *   assinatura paga tem 1 dia de carência. (ver hook)
 */
export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { blocked, screen } = useSubscriptionBlock();

  if (blocked) {
    return <>{screen}</>;
  }

  return <>{children}</>;
}
