import { useEffect, useState } from 'react';
import { Star, Loader2, CheckCircle2, Smile, Meh, Frown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
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

/**
 * `tone` = cor do texto/ícone grande (carinha + número) sobre fundo claro.
 * `cardBg` = fundo SATURADO do banner contextual; `cardStyle` é usado só na
 * faixa âmbar, onde o token `--warning` (38 92% 50%) é claro demais pra texto
 * branco — descemos a luminância pra garantir contraste (texto branco legível).
 */
const BAND_META: Record<
  NpsBand,
  {
    label: string;
    icon: typeof Smile;
    tone: string;
    cardBg: string;
    cardStyle?: React.CSSProperties;
  }
> = {
  detractor: {
    label: 'Vamos melhorar — obrigado por avisar',
    icon: Frown,
    tone: 'text-destructive',
    cardBg: 'bg-destructive',
  },
  passive: {
    label: 'Bom! O que faltou pra ser excelente?',
    icon: Meh,
    tone: 'text-warning',
    // Âmbar escurecido (mesma matiz do --warning, luminância menor) p/ texto branco.
    cardBg: '',
    cardStyle: { backgroundColor: 'hsl(38 92% 36%)' },
  },
  promoter: {
    label: 'Que ótimo! Ficamos muito felizes',
    icon: Smile,
    tone: 'text-success',
    cardBg: 'bg-success',
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
 * Escala NPS 0–10 remodelada: carinha grande que reage à faixa EM TEMPO REAL +
 * SLIDER arrastável (0–10, passo 1) com track em gradiente vermelho→âmbar→verde.
 *
 * Importante: a nota só "existe" depois da 1ª interação (`value !== null`).
 * O primitivo Slider exige um número, então quando ainda não tocado controlamos
 * com um valor neutro (5) só visual e marcamos a nota como definida apenas no
 * `onValueChange`. Assim não enviamos nota fantasma.
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
  // Posição visual do thumb: nota real ou centro neutro enquanto não tocado.
  const sliderValue = value ?? 5;
  // Posição horizontal da dica "Arraste aqui" (segue o thumb). 0→0%, 10→100%.
  // clamp 6%–94% pra o texto centralizado (translateX(-50%)) não cortar nas
  // bordas do container nos extremos 0 e 10.
  const hintPct = Math.min(94, Math.max(6, (sliderValue / 10) * 100));

  return (
    <div className="space-y-4">
      {/* Carinha grande + nota (reage ao arrastar) */}
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

      {/* Slider arrastável (0–10) com track em gradiente por faixa */}
      <div className="py-1">
        <Slider
          min={0}
          max={10}
          step={1}
          value={[sliderValue]}
          onValueChange={(v) => onChange(v[0])}
          aria-label="Nota de 0 a 10"
          aria-valuetext={value !== null ? `Nota ${value} de 10` : 'Arraste para escolher a nota'}
          className={cn(
            // Track (.bg-secondary) mais alto + gradiente das faixas; Range
            // (.bg-primary) some, o gradiente do track já comunica a faixa.
            '[&_.bg-secondary]:h-3',
            "[&_.bg-secondary]:bg-[linear-gradient(to_right,hsl(var(--destructive))_0%,hsl(var(--destructive))_55%,hsl(38_92%_50%)_64%,hsl(38_92%_50%)_78%,hsl(var(--success))_88%,hsl(var(--success))_100%)]",
            '[&_.bg-primary]:bg-transparent',
            // Thumb maior pra toque confortável no mobile.
            '[&_[role=slider]]:h-7 [&_[role=slider]]:w-7 [&_[role=slider]]:border-[3px] [&_[role=slider]]:border-foreground [&_[role=slider]]:bg-background [&_[role=slider]]:shadow-md',
            // Antes do 1º toque o thumb fica esmaecido (nota ainda não definida).
            value === null && '[&_[role=slider]]:opacity-50',
          )}
        />

        {/* Dica "Arraste aqui" que segue horizontalmente o thumb. Some após a
            1ª interação — aí o número grande já comunica a nota. */}
        {value === null && (
          <div className="relative h-7 select-none" aria-hidden>
            <span
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center text-[11px] font-medium text-muted-foreground transition-[left] duration-100"
              style={{ left: `${hintPct}%` }}
            >
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/70" />
              Arraste aqui
            </span>
          </div>
        )}
      </div>

      {/* Rótulos das pontas */}
      <div className="flex items-center justify-between px-1 text-[11px] font-medium text-muted-foreground">
        <span>Nada provável</span>
        <span>Muito provável</span>
      </div>

      {/* Mensagem contextual da faixa — banner SATURADO com texto branco */}
      {meta && (
        <p
          className={cn(
            'rounded-lg px-3 py-2.5 text-center text-sm font-semibold text-white shadow-sm animate-in fade-in duration-200',
            meta.cardBg,
          )}
          style={meta.cardStyle}
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
  /** Estado CONTROLADO do drawer — a página detém o open p/ poder reabrir. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Callback após envio bem-sucedido (ou detecção de "já avaliado"), pra a
   * página esconder o affordance de reabrir.
   */
  onRated?: () => void;
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
export function OSRatingSurvey({
  osId,
  rating,
  npsConfig,
  criteria,
  open,
  onOpenChange,
  onRated,
}: OSRatingSurveyProps) {
  const { toast } = useToast();
  const requireStars = npsConfig?.require_stars === true;
  const question = npsConfig?.question?.trim() || DEFAULT_QUESTION;
  const dynamicCriteria = criteria ?? [];

  const [thanked, setThanked] = useState(rating.already_rated === true);
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
      onOpenChange(false);
      onRated?.();
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
      onOpenChange(false);
      onRated?.();
      toast({ title: 'Avaliação enviada' });
      // Relatório da OS (renderizado abaixo do drawer) fica em foco.
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      if (isAlreadyRatedError(err)) {
        toast({ title: 'Esta avaliação já foi enviada. Obrigado!' });
        setThanked(true);
        onOpenChange(false);
        onRated?.();
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
      onOpenChange={onOpenChange}
      title="Como foi seu atendimento?"
      footer={
        <div className="flex w-full gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="h-12 text-base"
            size="lg"
          >
            Fechar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="h-12 flex-1 text-base"
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
        </div>
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
