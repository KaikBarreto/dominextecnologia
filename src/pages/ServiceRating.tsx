import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Star, Smile, Meh, Frown, CheckCircle2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { usePublicRating } from '@/hooks/useServiceRatings';
import { useToast } from '@/hooks/use-toast';

const npsEmojis = [
  { min: 0, max: 3, icon: Frown, label: 'Insatisfeito', color: 'text-destructive' },
  { min: 4, max: 6, icon: Frown, label: 'Neutro', color: 'text-warning' },
  { min: 7, max: 8, icon: Meh, label: 'Satisfeito', color: 'text-info' },
  { min: 9, max: 10, icon: Smile, label: 'Muito Satisfeito', color: 'text-success' },
];

function StarRating({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className="transition-transform hover:scale-110"
          >
            <Star
              className={`h-8 w-8 ${star <= value ? 'fill-warning text-warning' : 'text-muted-foreground/30'}`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ServiceRating() {
  const { token } = useParams<{ token: string }>();
  const { rating, isLoading, error, submitRating } = usePublicRating(token);
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [npsScore, setNpsScore] = useState<number>(8);
  const [qualityRating, setQualityRating] = useState(0);
  const [punctualityRating, setPunctualityRating] = useState(0);
  const [professionalismRating, setProfessionalismRating] = useState(0);
  const [comment, setComment] = useState('');
  const [ratedByName, setRatedByName] = useState('');

  const currentEmoji = npsEmojis.find((e) => npsScore >= e.min && npsScore <= e.max) || npsEmojis[0];
  const EmojiIcon = currentEmoji.icon;

  const alreadyRated = rating?.rated_at != null;

  const handleSubmit = async () => {
    if (qualityRating === 0 || punctualityRating === 0 || professionalismRating === 0) {
      toast({ variant: 'destructive', title: 'Preencha todas as avaliações com estrelas' });
      return;
    }
    setSubmitting(true);
    try {
      await submitRating({
        nps_score: npsScore,
        quality_rating: qualityRating,
        punctuality_rating: punctualityRating,
        professionalism_rating: professionalismRating,
        comment: comment || undefined,
        rated_by_name: ratedByName || undefined,
      });
      setSubmitted(true);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao enviar avaliação', description: err.message });
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
            <div className="text-center space-y-1">
              <h3 className="font-semibold">De 0 a 10, qual a chance de recomendar nosso serviço?</h3>
              <div className="flex items-center justify-center gap-2 mt-3">
                <EmojiIcon className={`h-10 w-10 ${currentEmoji.color}`} />
                <span className="text-4xl font-bold">{npsScore}</span>
              </div>
              <p className={`text-sm font-medium ${currentEmoji.color}`}>{currentEmoji.label}</p>
            </div>
            <div className="flex items-center gap-3 px-2">
              <ThumbsDown className="h-4 w-4 text-destructive shrink-0" />
              <Slider
                value={[npsScore]}
                onValueChange={([v]) => setNpsScore(v)}
                min={0}
                max={10}
                step={1}
                className="flex-1"
              />
              <ThumbsUp className="h-4 w-4 text-success shrink-0" />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground px-2">
              <span>0</span>
              <span>5</span>
              <span>10</span>
            </div>
          </CardContent>
        </Card>

        {/* Star Ratings */}
        <Card>
          <CardContent className="pt-6 space-y-5">
            <StarRating label="Qualidade do Serviço" value={qualityRating} onChange={setQualityRating} />
            <StarRating label="Pontualidade" value={punctualityRating} onChange={setPunctualityRating} />
            <StarRating label="Profissionalismo" value={professionalismRating} onChange={setProfessionalismRating} />
          </CardContent>
        </Card>

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
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full h-12 text-base"
          size="lg"
        >
          {submitting ? 'Enviando...' : 'Enviar Avaliação'}
        </Button>
      </div>
    </div>
  );
}
