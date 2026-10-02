// ─────────────────────────────────────────────────────────────────────────────
// ActivityArtButton — botão pronto pra plugar: gera a arte PNG do período
// (ActivityArtCard, via `src/utils/salespersonActivityArt.ts`) e oferece
// Baixar / Compartilhar.
//
// Recebe os dados já prontos via prop `data` (contrato `ActivityArtInput`) —
// não toca em Supabase, hook de dados nem tela existente. Quem decide QUANDO
// renderizar este botão (ex.: só quando o período já está preenchido) é quem
// consome este componente.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Download, Share2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  downloadActivityArtPng,
  shareActivityArtPng,
  type ActivityArtInput,
} from '@/utils/salespersonActivityArt';

interface ActivityArtButtonProps {
  data: ActivityArtInput;
  className?: string;
}

type BusyState = 'idle' | 'downloading' | 'sharing';

/** Feature-detect de Web Share API COM arquivo. `canShare` com um File de
 * teste é o jeito confiável de saber se o navegador aceita compartilhar
 * imagem (iOS Safari/Chrome Android aceitam; desktop em geral não). */
function supportsFileShare(): boolean {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.share !== 'function' ||
    typeof navigator.canShare !== 'function'
  ) {
    return false;
  }
  try {
    const probe = new File([''], 'probe.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export function ActivityArtButton({ data, className }: ActivityArtButtonProps) {
  const [busy, setBusy] = useState<BusyState>('idle');
  const [canShareFiles] = useState(supportsFileShare);

  // A arte estampa "gerado em DD/MM/AAAA às HH:MM" e o CEO usa isso como hora do
  // relatório. Quem monta o `data` calcula `generatedAtIso` no render, então o
  // valor envelheceria se a aba ficasse aberta. Carimbamos no CLIQUE.
  const stamped = () => ({ ...data, generatedAtIso: new Date().toISOString() });

  const handleDownload = async () => {
    setBusy('downloading');
    try {
      await downloadActivityArtPng(stamped());
      toast.success('Imagem baixada com sucesso.');
    } catch {
      toast.error('Não foi possível gerar a imagem. Tente novamente.');
    } finally {
      setBusy('idle');
    }
  };

  const handleShare = async () => {
    setBusy('sharing');
    try {
      await shareActivityArtPng(stamped());
    } catch {
      toast.error('Não foi possível compartilhar a imagem. Tente novamente.');
    } finally {
      setBusy('idle');
    }
  };

  const isBusy = busy !== 'idle';

  return (
    <div className={cn('flex min-w-0 flex-wrap gap-2', className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-w-0 flex-1 gap-1.5 sm:flex-none"
        onClick={handleDownload}
        disabled={isBusy}
      >
        {busy === 'downloading' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        <span className="truncate">Baixar PNG</span>
      </Button>

      {canShareFiles ? (
        <Button
          type="button"
          size="sm"
          className="min-w-0 flex-1 gap-1.5 sm:flex-none"
          onClick={handleShare}
          disabled={isBusy}
        >
          {busy === 'sharing' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
          <span className="truncate">Compartilhar</span>
        </Button>
      ) : null}
    </div>
  );
}
