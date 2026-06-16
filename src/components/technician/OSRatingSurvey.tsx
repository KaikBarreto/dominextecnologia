import { useState } from 'react';
import { Star, ThumbsUp, ThumbsDown, Loader2, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { cn } from '@/lib/utils';
import {
  submitPublicOsRating,
  isAlreadyRatedError,
  type PublicOsRating,
  type PublicNpsConfig,
} from '@/hooks/useServiceRatings';
import { supabaseAnon } from '@/integrations/supabase/anonClient';

/**
 * Faixa de NPS de uma nota 0–10:
 * - detrator (0–6) → destructive
 * - neutro   (7–8) → warning
 * - promotor (9–10)→ success
 */
type NpsBand = 'detractor' | 'passive' | 'promoter';

function bandOf(n: number): NpsBand {
  if (n <= 6) return 'detractor';
  if (n <= 8) return 'passive';
  return 'promoter';
}

const BAND_LABEL: Record<NpsBand, string> = {
  detractor: 'Vamos melhorar — obrigado por avisar',
  passive: 'Bom! O que faltou pra ser excelente?',
  promoter: 'Que ótimo! Ficamos muito felizes',
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

interface OSRatingSurveyProps {
  osId: string;
  rating: PublicOsRating;
  /** Config de NPS da empresa (pergunta + estrelas opcionais). */
  npsConfig?: PublicNpsConfig | null;
}

const DEFAULT_QUESTION = 'De 0 a 10, o quão satisfeito(a) você ficou com o nosso serviço?';

/**
 * Bloco "carona" de avaliação que aparece no link público de acompanhamento
 * (modo cliente) quando a OS está concluída e ainda não foi avaliada.
 * Fluxo 1-clique: escala NPS 0–10 visível de cara; ao tocar uma nota, revela
 * estrelas + comentário + nome + Enviar. Grava pela RPC submit_public_os_rating.
 *
 * Após enviar (ou se já avaliado), o bloco colapsa para um aviso enxuto de
 * sucesso e dá foco ao relatório da OS (renderizado logo abaixo), rolando o
 * topo da página pra ele.
 */
export function OSRatingSurvey({ osId, rating, npsConfig }: OSRatingSurveyProps) {
  const { toast } = useToast();
  const [thanked, setThanked] = useState(rating.already_rated === true);
  const [submitting, setSubmitting] = useState(false);

  const requireStars = npsConfig?.require_stars === true;
  const question = npsConfig?.question?.trim() || DEFAULT_QUESTION;

  const [npsScore, setNpsScore] = useState<number | null>(null);
  // 0 = "não tocado". No envio convertemos 0 → null (estrelas opcionais).
  const [qualityRating, setQualityRating] = useState(0);
  const [punctualityRating, setPunctualityRating] = useState(0);
  const [professionalismRating, setProfessionalismRating] = useState(0);
  const [comment, setComment] = useState('');
  const [ratedByName, setRatedByName] = useState('');

  const revealed = npsScore !== null;
  const band = npsScore !== null ? bandOf(npsScore) : null;

  const handleSubmit = async () => {
    if (npsScore === null) return;
    // Estrelas obrigatórias só quando a empresa exige.
    if (requireStars && (qualityRating === 0 || punctualityRating === 0 || professionalismRating === 0)) {
      toast({ variant: 'destructive', title: 'Toque nas estrelas das três categorias' });
      return;
    }
    setSubmitting(true);
    try {
      await submitPublicOsRating(
        osId,
        {
          nps_score: npsScore,
          // Estrela não tocada (0) vira null — nunca 0.
          quality_rating: qualityRating || null,
          punctuality_rating: punctualityRating || null,
          professionalism_rating: professionalismRating || null,
          comment: comment.trim() || undefined,
          rated_by_name: ratedByName.trim() || undefined,
        },
        supabaseAnon,
      );
      setThanked(true);
      toast({ title: 'Avaliação enviada' });
      // Foco volta ao relatório da OS (renderizado abaixo deste bloco).
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      if (isAlreadyRatedError(err)) {
        toast({ title: 'Esta avaliação já foi enviada. Obrigado!' });
        setThanked(true);
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

  // Pós-envio / já avaliado: aviso enxuto, sem ocupar a tela toda.
  // O relatório da OS abaixo fica em foco para o cliente conferir o serviço.
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
    <Card className="overflow-hidden border-primary/30 shadow-sm">
      <CardContent className="space-y-6 pt-6">
        {/* Cabeçalho acolhedor */}
        <div className="space-y-1.5 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Sua opinião importa
          </div>
          <h3 className="text-lg font-bold text-foreground">Como foi seu atendimento?</h3>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">{question}</p>
        </div>

        {/* Escala NPS 0–10 — 1-clique, faixas por cor */}
        <div className="space-y-3">
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
            {Array.from({ length: 11 }, (_, n) => {
              const selected = npsScore === n;
              const nBand = bandOf(n);
              return (
                <button
                  key={n}
                  type="button"
                  aria-label={`Nota ${n} de 10`}
                  aria-pressed={selected}
                  onClick={() => setNpsScore(n)}
                  className={cn(
                    'flex h-11 items-center justify-center rounded-lg border text-base font-semibold transition-all duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    selected
                      ? nBand === 'detractor'
                        ? 'border-destructive bg-destructive text-destructive-foreground shadow-md ring-destructive/50'
                        : nBand === 'passive'
                          ? 'border-warning bg-warning text-warning-foreground shadow-md ring-warning/50'
                          : 'border-success bg-success text-success-foreground shadow-md ring-success/50'
                      : 'border-border bg-muted/40 text-foreground hover:bg-muted focus-visible:ring-primary/50',
                  )}
                >
                  {n}
                </button>
              );
            })}
          </div>

          {/* Régua das faixas (sempre visível, comunica o padrão NPS) */}
          <div className="flex h-1.5 overflow-hidden rounded-full">
            <div className="flex-[7] bg-destructive/70" />
            <div className="flex-[2] bg-warning/70" />
            <div className="flex-[2] bg-success/70" />
          </div>

          <div className="flex items-center justify-between px-0.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <ThumbsDown className="h-3 w-3 text-destructive" /> Nada provável
            </span>
            <span className="flex items-center gap-1">
              Muito provável <ThumbsUp className="h-3 w-3 text-success" />
            </span>
          </div>

          {/* Feedback da faixa selecionada */}
          {band && (
            <p
              className={cn(
                'rounded-md px-3 py-2 text-center text-sm font-medium animate-in fade-in duration-200',
                band === 'detractor'
                  ? 'bg-destructive/10 text-destructive'
                  : band === 'passive'
                    ? 'bg-warning/10 text-warning'
                    : 'bg-success/10 text-success',
              )}
            >
              {BAND_LABEL[band]}
            </p>
          )}
        </div>

        {revealed && (
          <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
              <StarRow
                label="Qualidade do serviço"
                value={qualityRating}
                onChange={setQualityRating}
                optional={!requireStars}
              />
              <StarRow
                label="Pontualidade"
                value={punctualityRating}
                onChange={setPunctualityRating}
                optional={!requireStars}
              />
              <StarRow
                label="Profissionalismo"
                value={professionalismRating}
                onChange={setProfessionalismRating}
                optional={!requireStars}
              />
            </div>

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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
