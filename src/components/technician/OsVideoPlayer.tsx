import { useState } from 'react';
import { VideoOff, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface OsVideoPlayerProps {
  /** URL pública do clipe. null/''/whitespace = não renderiza nada. */
  src: string | null | undefined;
  /** Classe extra aplicada no <video> (dimensão/moldura por superfície). */
  className?: string;
}

/**
 * Player de vídeo da OS com fallback amigável. Usado em TODA superfície que
 * mostra `response_video_url` (OS do técnico, link público, relatório).
 *
 * Blindagens:
 * - URL nula/vazia/whitespace → não renderiza player (nada de <video src="">).
 * - Falha de reprodução (codec): o caso MAIS provável é um clipe webm gravado
 *   no Android aberto no Safari do iPhone (link público do cliente) — o iOS não
 *   toca webm e o <video> fica preto/morto silencioso. O onError troca o player
 *   quebrado por um card com botão "Abrir vídeo" (abre a URL direta em nova aba/
 *   download), em vez de deixar um player morto.
 * - `preload="metadata"` + `playsInline` pra não pesar nem sair de tela cheia.
 *
 * Bucket `os-photos` é público: a URL entra direta no <video>, sem assinar nem
 * fazer fetch autenticado (senão o anon do link público falharia).
 */
export function OsVideoPlayer({ src, className }: OsVideoPlayerProps) {
  const [failed, setFailed] = useState(false);

  // Guarda contra null/''/whitespace: sem URL válida não há player.
  const url = typeof src === 'string' ? src.trim() : '';
  if (!url) return null;

  if (failed) {
    return (
      <div className="rounded-lg border bg-muted/40 p-3 flex flex-col items-center gap-2 text-center">
        <VideoOff className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Não foi possível tocar o vídeo aqui. Toque para abrir.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-full sm:w-auto"
          onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
          Abrir vídeo
        </Button>
      </div>
    );
  }

  return (
    <video
      src={url}
      controls
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
      className={cn('bg-black object-contain', className)}
    />
  );
}
