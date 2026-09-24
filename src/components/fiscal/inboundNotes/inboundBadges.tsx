import { CheckCircle2, Ban, XCircle, Eye, Clock, Loader2, FileQuestion, Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import type { ManifestacaoPendenteTipo, ManifestacaoTipo } from '@/hooks/useInboundNotes';

/**
 * Badges de Notas Recebidas — SATURADOS por regra da casa (fundo na cor +
 * texto/ícone brancos, nunca outline dessaturado). Mesmo padrão de
 * `nfseStatus.tsx`.
 */

const SITUACAO_CLASS: Record<string, string> = {
  autorizada: 'bg-emerald-500 text-white hover:bg-emerald-500 border-transparent',
  cancelada:
    'bg-gray-800 text-white hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-600 border-transparent',
  denegada: 'bg-red-500 text-white hover:bg-red-500 border-transparent',
  substituida: 'bg-slate-500 text-white hover:bg-slate-500 border-transparent',
};

export function SituacaoBadge({ situacao, className }: { situacao: string | null; className?: string }) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse.recebidas.situacao;
  if (!situacao) return null;
  const label = t[situacao as keyof typeof t] ?? situacao;
  return (
    <Badge className={cn(SITUACAO_CLASS[situacao] ?? 'bg-muted text-muted-foreground border-transparent', className)}>
      {label}
    </Badge>
  );
}

export function ManifestacaoBadge({
  manifestacao,
  pendente,
  className,
}: {
  manifestacao: ManifestacaoTipo;
  pendente: ManifestacaoPendenteTipo | null;
  className?: string;
}) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse.recebidas;

  // Pedido em voo manda na leitura: a nota NUNCA mostra o estado conclusivo só
  // porque o usuário clicou (manifestação é assíncrona e irreversível perante
  // a Receita — o fato consumado só vem depois do aceite da SEFAZ).
  if (pendente) {
    return (
      <Badge className={cn('gap-1 bg-indigo-500 text-white hover:bg-indigo-500 border-transparent', className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        {t.manifestacaoPendente[pendente]}
      </Badge>
    );
  }

  const meta: Record<ManifestacaoTipo, { icon: typeof CheckCircle2; cls: string; label: string }> = {
    nenhuma: { icon: Clock, cls: 'bg-slate-500', label: t.manifestacao.nenhuma },
    ciencia: { icon: Eye, cls: 'bg-indigo-500', label: t.manifestacao.ciencia },
    confirmada: { icon: CheckCircle2, cls: 'bg-emerald-500', label: t.manifestacao.confirmada },
    desconhecida: { icon: XCircle, cls: 'bg-amber-500', label: t.manifestacao.desconhecida },
    nao_realizada: { icon: Ban, cls: 'bg-amber-600', label: t.manifestacao.nao_realizada },
  };
  const m = meta[manifestacao] ?? meta.nenhuma;
  const Icon = m.icon;
  return (
    <Badge className={cn('gap-1 text-white hover:opacity-100 border-transparent', m.cls, className)}>
      <Icon className="h-3 w-3" />
      {m.label}
    </Badge>
  );
}

export function ResumoBadge({ className }: { className?: string }) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse.recebidas;
  return (
    <Badge className={cn('gap-1 bg-amber-500 text-white hover:bg-amber-500 border-transparent', className)}>
      <FileQuestion className="h-3 w-3" />
      {t.resumoBadge}
    </Badge>
  );
}

export function LancadaBadge({ className }: { className?: string }) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse.recebidas;
  return (
    <Badge className={cn('gap-1 bg-emerald-600 text-white hover:bg-emerald-600 border-transparent', className)}>
      <Receipt className="h-3 w-3" />
      {t.lancadaBadge}
    </Badge>
  );
}
