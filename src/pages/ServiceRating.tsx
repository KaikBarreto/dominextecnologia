import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Star, Smile, Meh, Frown, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  usePublicRating,
  isAlreadyRatedError,
  type PublicNpsConfig,
  type PublicNpsCriterion,
  type SubmitCriterionValue,
} from '@/hooks/useServiceRatings';
import { supabaseAnon } from '@/integrations/supabase/anonClient';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { cn } from '@/lib/utils';

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

function NpsScale({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  const band = value !== null ? bandOf(value) : null;
  const meta = band ? BAND_META[band] : null;
  const FaceIcon = meta?.icon ?? Meh;

  return (
    <div className="space-y-4">
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

      <div className="flex gap-0.5 rounded-full bg-muted/50 p-0.5" role="radiogroup" aria-label="Nota de 0 a 10">
        {Array.from({ length: 11 }, (_, n) => {
          const nBand = bandOf(n);
          const selected = value === n;
          const fillBg =
            nBand === 'detractor' ? 'bg-destructive' : nBand === 'passive' ? 'bg-warning' : 'bg-success';
          const fillFg =
            nBand === 'detractor'
              ? 'text-destructive-foreground'
              : nBand === 'passive'
                ? 'text-warning-foreground'
                : 'text-success-foreground';
          const restTint =
            nBand === 'detractor' ? 'text-destructive' : nBand === 'passive' ? 'text-warning' : 'text-success';
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

      <div className="flex items-center justify-between px-1 text-[11px] font-medium text-muted-foreground">
        <span>Nada provável</span>
        <span>Muito provável</span>
      </div>

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
        {optional && <span className="text-[11px] font-normal text-muted-foreground">(opcional)</span>}
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
                  'h-8 w-8 transition-colors duration-150',
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

const DEFAULT_QUESTION = 'De 0 a 10, qual a chance de recomendar nosso serviço?';

export default function ServiceRating() {
  const { token } = useParams<{ token: string }>();
  const { rating, isLoading, error, submitRating } = usePublicRating(token);
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [criteriaValues, setCriteriaValues] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [ratedByName, setRatedByName] = useState('');

  // Critérios dinâmicos + config de estrelas vêm de get_public_os(os_id).
  // A página já tem o os_id via service_order.id devolvido pelo RPC do token.
  const [npsConfig, setNpsConfig] = useState<PublicNpsConfig | null>(null);
  const [criteria, setCriteria] = useState<PublicNpsCriterion[]>([]);
  const osId = rating?.service_order?.id;

  useEffect(() => {
    if (!osId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabaseAnon.rpc('get_public_os', { p_os_id: osId });
      if (cancelled || !data) return;
      const payload = data as any;
      setNpsConfig((payload.nps_config as PublicNpsConfig | null) || null);
      setCriteria((payload.nps_criteria as PublicNpsCriterion[] | null) || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [osId]);

  const requireStars = npsConfig?.require_stars === true;
  const question = npsConfig?.question?.trim() || DEFAULT_QUESTION;
  const alreadyRated = rating?.rated_at != null;

  const setCriterion = (id: string, v: number) =>
    setCriteriaValues((prev) => ({ ...prev, [id]: v }));

  const handleSubmit = async () => {
    if (npsScore === null) {
      toast({ variant: 'destructive', title: 'Escolha uma nota de 0 a 10' });
      return;
    }
    if (requireStars && criteria.some((c) => !criteriaValues[c.id])) {
      toast({ variant: 'destructive', title: 'Avalie todas as categorias com estrelas' });
      return;
    }
    setSubmitting(true);
    try {
      const payloadCriteria: SubmitCriterionValue[] = criteria
        .filter((c) => (criteriaValues[c.id] ?? 0) > 0)
        .map((c) => ({ criterion_id: c.id, value: criteriaValues[c.id] }));

      await submitRating({
        nps_score: npsScore,
        criteria: payloadCriteria,
        comment: comment.trim() || undefined,
        rated_by_name: ratedByName.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err: any) {
      if (isAlreadyRatedError(err)) {
        toast({ title: 'Esta avaliação já foi enviada. Obrigado!' });
        setSubmitted(true);
        return;
      }
      toast({ variant: 'destructive', title: 'Erro ao enviar avaliação', description: getErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !rating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-3">
            <Frown className="h-12 w-12 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-bold">Link inválido</h2>
            <p className="text-muted-foreground">Esta avaliação não foi encontrada ou o link é inválido.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (alreadyRated || submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 mx-auto text-success" />
            <h2 className="text-2xl font-bold">Obrigado!</h2>
            <p className="text-muted-foreground">
              Sua avaliação foi registrada com sucesso. Agradecemos pelo seu feedback!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const osInfo = rating.service_order;

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Avaliação do Serviço</h1>
          {osInfo && (
            <p className="text-muted-foreground text-sm">
              OS #{osInfo.order_number} • {osInfo.customer?.name}
            </p>
          )}
        </div>

        {/* NPS Score */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h3 className="text-center font-semibold">{question}</h3>
            <NpsScale value={npsScore} onChange={setNpsScore} />
          </CardContent>
        </Card>

        {/* Critérios dinâmicos em estrelas */}
        {criteria.length > 0 && (
          <Card>
            <CardContent className="pt-6 space-y-5">
              {criteria.map((c) => (
                <StarRow
                  key={c.id}
                  label={c.label}
                  value={criteriaValues[c.id] ?? 0}
                  onChange={(v) => setCriterion(c.id, v)}
                  optional={!requireStars}
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Comment */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label>Seu nome (opcional)</Label>
              <Input
                placeholder="Digite seu nome"
                value={ratedByName}
                onChange={(e) => setRatedByName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Comentário (opcional)</Label>
              <Textarea
                placeholder="Conte-nos mais sobre sua experiência..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <Button onClick={handleSubmit} disabled={submitting} className="w-full h-12 text-base" size="lg">
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Enviando...
            </>
          ) : (
            'Enviar Avaliação'
          )}
        </Button>
      </div>
    </div>
  );
}
