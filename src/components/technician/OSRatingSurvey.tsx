import { useEffect, useState } from 'react';
import { Star, Loader2, CheckCircle2, Smile, Meh, Frown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { cn } from '@/lib/utils';
import {
  submitPublicOsRating,
  isAlreadyRatedError,
  type PublicOsRating,
  type PublicNpsConfig,
  type PublicNpsCriterion,
  type SubmitCriterionValue,
} from '@/hooks/useServiceRatings';
import { supabaseAnon } from '@/integrations/supabase/anonClient';

/**
 * Faixa de NPS de uma nota 0–10:
 * - detrator (0–6) → destructive / triste
 * - neutro   (7–8) → warning / neutro
 * - promotor (9–10)→ success / feliz
 */
type NpsBand = 'detractor' | 'passive' | 'promoter';

function bandOf(n: number): NpsBand {
  if (n <= 6) return 'detractor';
  if (n <= 8) return 'passive';
  return 'promoter';
}

const BAND_META: Record<
  NpsBand,
  { label: string; icon: typeof Smile; tone: string; bg: string; ring: string }
> = {
  detractor: {
    label: 'Vamos melhorar — obrigado por avisar',
    icon: Frown,
    tone: 'text-destructive',
    bg: 'bg-destructive/10',
    ring: 'ring-destructive/40',
  },
  passive: {
    label: 'Bom! O que faltou pra ser excelente?',
    icon: Meh,
    tone: 'text-warning',
    bg: 'bg-warning/10',
    ring: 'ring-warning/40',
  },
  promoter: {
    label: 'Que ótimo! Ficamos muito felizes',
    icon: Smile,
    tone: 'text-success',
    bg: 'bg-success/10',
    ring: 'ring-success/40',
  },
};

function StarRow({
  value,
  onChange,
  label,
  optional,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  optional?: boolean;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-sm font-medium">
        {label}
        {optional && (
          <span className="text-[11px] font-normal text-muted-foreground">(opcional)</span>
        )}
      </Label>
      <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((star) => {
          const active = star <= (hover || value);
          return (
            <button
              key={star}
              type="button"
              aria-label={`${label}: ${star} de 5 estrelas`}
              aria-pressed={star <= value}
              onClick={() => onChange(star)}
              onMouseEnter={() => setHover(star)}
              className="rounded-md p-0.5 transition-transform duration-150 hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Star
                className={cn(
                  'h-9 w-9 transition-colors duration-150',
                  active ? 'fill-warning text-warning' : 'text-muted-foreground/30',
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Escala NPS 0–10 remodelada: carinha grande que reage à faixa + barra
 * segmentada conectada com gradiente vermelho→âmbar→verde. Cada segmento é
 * tocável (área de toque confortável no mobile). Mantém o NPS (0–10).
 */
function NpsScale({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number) => void;
}) {
  const band = value !== null ? bandOf(value) : null;
  const meta = band ? BAND_META[band] : null;
  const FaceIcon = meta?.icon ?? Meh;

  return (
    <div className="space-y-4">
      {/* Carinha grande + nota */}
      <div className="flex flex-col items-center gap-1.5">
        <FaceIcon
          className={cn(
            'h-16 w-16 transition-colors duration-300',
            meta ? meta.tone : 'text-muted-foreground/40',
          )}
          aria-hidden
        />
        <span
          className={cn(
            'text-3xl font-bold tabular-nums transition-colors duration-200',
            meta ? meta.tone : 'text-muted-foreground/50',
          )}
        >
          {value !== null ? value : '–'}
        </span>
      </div>

      {/* Barra segmentada conectada (0–10) com gradiente por faixa */}
      <div
        className="flex gap-0.5 rounded-full bg-muted/50 p-0.5"
        role="radiogroup"
        aria-label="Nota de 0 a 10"
      >
        {Array.from({ length: 11 }, (_, n) => {
          const nBand = bandOf(n);
          const selected = value === n;
          const fillBg =
            nBand === 'detractor'
              ? 'bg-destructive'
              : nBand === 'passive'
                ? 'bg-warning'
                : 'bg-success';
          const fillFg =
            nBand === 'detractor'
              ? 'text-destructive-foreground'
              : nBand === 'passive'
                ? 'text-warning-foreground'
                : 'text-success-foreground';
          const restTint =
            nBand === 'detractor'
              ? 'text-destructive'
              : nBand === 'passive'
                ? 'text-warning'
                : 'text-success';
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`Nota ${n} de 10`}
              onClick={() => onChange(n)}
              className={cn(
                'flex h-11 flex-1 items-center justify-center rounded-full text-sm font-semibold transition-all duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                selected
                  ? cn(fillBg, fillFg, 'scale-105 shadow-md')
                  : cn('bg-transparent hover:bg-background/60', restTint, 'opacity-70'),
              )}
            >
              {n}
            </button>
          );
        })}
      </div>

      {/* Rótulos das pontas */}
      <div className="flex items-center justify-between px-1 text-[11px] font-medium text-muted-foreground">
        <span>Nada provável</span>
        <span>Muito provável</span>
      </div>

      {/* Mensagem contextual da faixa */}
      {meta && (
        <p
          className={cn(
            'rounded-lg px-3 py-2 text-center text-sm font-medium ring-1 animate-in fade-in duration-200',
            meta.bg,
            meta.tone,
            meta.ring,
          )}
        >
          {meta.label}
        </p>
      )}
    </div>
  );
}

interface OSRatingSurveyProps {
  osId: string;
  rating: PublicOsRating;
  /** Config de NPS da empresa (pergunta + estrelas opcionais/obrigatórias). */
  npsConfig?: PublicNpsConfig | null;
  /** Critérios de estrela ATIVOS da empresa (dinâmicos), já ordenados. */
  criteria?: PublicNpsCriterion[];
}

const DEFAULT_QUESTION = 'De 0 a 10, o quão satisfeito(a) você ficou com o nosso serviço?';

/**
 * Pesquisa de satisfação do link público (modo cliente). Aparece num drawer
 * (de baixo no mobile) que JÁ VEM ABERTO quando a OS está concluída, a
 * pesquisa está habilitada e ainda não foi avaliada. O cliente pode fechar;
 * após enviar, o drawer fecha e o relatório da OS fica em foco.
 *
 * Escala NPS 0–10 remodelada (carinha + barra segmentada com gradiente) e
 * critérios de estrela DINÂMICOS vindos de get_public_os.nps_criteria.
 */
export function OSRatingSurvey({ osId, rating, npsConfig, criteria }: OSRatingSurveyProps) {
  const { toast } = useToast();
  const requireStars = npsConfig?.require_stars === true;
  const question = npsConfig?.question?.trim() || DEFAULT_QUESTION;
  const dynamicCriteria = criteria ?? [];

  const [thanked, setThanked] = useState(rating.already_rated === true);
  // Abre sozinho quando ainda não avaliado. Se já avaliado, fica fechado.
  const [open, setOpen] = useState(rating.already_rated !== true);
  const [submitting, setSubmitting] = useState(false);

  const [npsScore, setNpsScore] = useState<number | null>(null);
  // Estrelas por critério (id → 1..5). 0/ausente = "não tocado".
  const [criteriaValues, setCriteriaValues] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [ratedByName, setRatedByName] = useState('');

  // Se a OS chegar já avaliada (poll), garante estado "obrigado" e fechado.
  useEffect(() => {
    if (rating.already_rated === true) {
      setThanked(true);
      setOpen(false);
    }
  }, [rating.already_rated]);

  const setCriterion = (id: string, v: number) =>
    setCriteriaValues((prev) => ({ ...prev, [id]: v }));

  const handleSubmit = async () => {
    if (npsScore === null) {
      toast({ variant: 'destructive', title: 'Escolha uma nota de 0 a 10' });
      return;
    }
    // Estrelas obrigatórias só quando a empresa exige: todos os critérios.
    if (requireStars && dynamicCriteria.some((c) => !criteriaValues[c.id])) {
      toast({ variant: 'destructive', title: 'Avalie todas as categorias com estrelas' });
      return;
    }
    setSubmitting(true);
    try {
      // Envia só os critérios que o cliente avaliou (value 1..5).
      const payloadCriteria: SubmitCriterionValue[] = dynamicCriteria
        .filter((c) => (criteriaValues[c.id] ?? 0) > 0)
        .map((c) => ({ criterion_id: c.id, value: criteriaValues[c.id] }));

      await submitPublicOsRating(
        osId,
        {
          nps_score: npsScore,
          criteria: payloadCriteria,
          comment: comment.trim() || undefined,
          rated_by_name: ratedByName.trim() || undefined,
        },
        supabaseAnon,
      );
      setThanked(true);
      setOpen(false);
      toast({ title: 'Avaliação enviada' });
      // Relatório da OS (renderizado abaixo do drawer) fica em foco.
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      if (isAlreadyRatedError(err)) {
        toast({ title: 'Esta avaliação já foi enviada. Obrigado!' });
        setThanked(true);
        setOpen(false);
        return;
      }
      toast({
        variant: 'destructive',
        title: 'Não foi possível enviar',
        description: getErrorMessage(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Já avaliado / pós-envio: aviso enxuto inline (sem drawer). O relatório da
  // OS abaixo fica em foco para o cliente conferir o serviço.
  if (thanked) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-success/40 bg-success/5 px-4 py-3 text-sm animate-in fade-in zoom-in-95 duration-300">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
        <div className="min-w-0">
          <p className="font-semibold text-foreground">Avaliação enviada</p>
          <p className="text-xs text-muted-foreground">Obrigado pelo seu feedback!</p>
        </div>
      </div>
    );
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={setOpen}
      title="Como foi seu atendimento?"
      footer={
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="h-12 w-full text-base"
          size="lg"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Enviando...
            </>
          ) : (
            'Enviar avaliação'
          )}
        </Button>
      }
    >
      <div className="space-y-6">
        <p className="text-center text-sm text-muted-foreground">{question}</p>

        <NpsScale value={npsScore} onChange={setNpsScore} />

        {dynamicCriteria.length > 0 && (
          <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
            {dynamicCriteria.map((c) => (
              <StarRow
                key={c.id}
                label={c.label}
                value={criteriaValues[c.id] ?? 0}
                onChange={(v) => setCriterion(c.id, v)}
                optional={!requireStars}
              />
            ))}
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-sm">Seu nome (opcional)</Label>
          <Input
            placeholder="Digite seu nome"
            value={ratedByName}
            onChange={(e) => setRatedByName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Comentário (opcional)</Label>
          <Textarea
            placeholder="Conte como foi sua experiência..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
          />
        </div>
      </div>
    </ResponsiveModal>
  );
}
