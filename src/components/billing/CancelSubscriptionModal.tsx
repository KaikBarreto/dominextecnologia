import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Gift, Heart, MessageCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useCancelSubscription } from '@/hooks/useCancelSubscription';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const SUPPORT_WHATSAPP = '5521966885044';

const CANCELLATION_REASONS = [
  { value: 'preco_alto', label: 'Preço muito alto' },
  { value: 'nao_uso', label: 'Não estou usando o suficiente' },
  { value: 'funcionalidades', label: 'Faltam funcionalidades que preciso' },
  { value: 'dificuldade_uso', label: 'Dificuldade em usar o sistema' },
  { value: 'concorrente', label: 'Encontrei outra solução' },
  { value: 'fechando_empresa', label: 'Estou fechando a empresa' },
  { value: 'temporario', label: 'Pausa temporária' },
  { value: 'outro', label: 'Outro motivo' },
];

interface CancelSubscriptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  subscriptionExpiresAt?: string | null;
}

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

export function CancelSubscriptionModal({
  open,
  onOpenChange,
  companyId,
  subscriptionExpiresAt,
}: CancelSubscriptionModalProps) {
  const [step, setStep] = useState<'reason' | 'confirm' | 'done'>('reason');
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const cancelMutation = useCancelSubscription();

  const handleClose = () => {
    // Não reseta no meio de um envio em andamento.
    if (cancelMutation.isPending) return;
    setStep('reason');
    setReason('');
    setDetails('');
    onOpenChange(false);
  };

  const handleSubmit = () => {
    if (!reason) {
      toast.error('Selecione um motivo');
      return;
    }
    const reasonLabel = CANCELLATION_REASONS.find((r) => r.value === reason)?.label || reason;
    cancelMutation.mutate(
      {
        companyId,
        reason: reasonLabel,
        reasonDetails: details.trim() || null,
      },
      {
        onSuccess: () => setStep('done'),
        onError: (error: unknown) => {
          console.error('Erro ao cancelar assinatura:', error);
          toast.error('Não foi possível cancelar agora. Tente novamente ou fale com o suporte.');
        },
      },
    );
  };

  const selectedReasonData = CANCELLATION_REASONS.find((r) => r.value === reason);

  const getRetentionMessage = () => {
    switch (reason) {
      case 'preco_alto':
        return {
          icon: Gift,
          title: 'Que tal um desconto?',
          message:
            'Fale com a gente pelo WhatsApp — conseguimos negociar um valor especial pra você continuar no Dominex.',
          bg: 'bg-emerald-600',
          waText: 'Olá! Penso em cancelar minha assinatura do Dominex por causa do preço. Tem alguma condição especial?',
        };
      case 'nao_uso':
        return {
          icon: Heart,
          title: 'Podemos te ajudar!',
          message:
            'Nossa equipe faz um treinamento personalizado gratuito pra você aproveitar o sistema ao máximo.',
          bg: 'bg-blue-600',
          waText: 'Olá! Quero agendar um treinamento do Dominex antes de decidir sobre minha assinatura.',
        };
      case 'funcionalidades':
        return {
          icon: MessageCircle,
          title: 'Sua opinião é valiosa!',
          message:
            'Conte quais funcionalidades você precisa. Estamos sempre evoluindo e sua sugestão pode entrar em breve!',
          bg: 'bg-purple-600',
          waText: 'Olá! Sinto falta de algumas funcionalidades no Dominex e gostaria de sugerir antes de cancelar.',
        };
      case 'dificuldade_uso':
        return {
          icon: Heart,
          title: 'Suporte dedicado',
          message:
            'Podemos agendar uma sessão de suporte dedicada pra resolver suas dúvidas e facilitar o uso.',
          bg: 'bg-blue-600',
          waText: 'Olá! Tenho dificuldade em usar o Dominex e gostaria de uma sessão de suporte antes de cancelar.',
        };
      default:
        return null;
    }
  };

  const retention = getRetentionMessage();

  const getTitle = () => {
    if (step === 'confirm') return 'Confirmar cancelamento';
    if (step === 'done') return 'Cancelamento concluído';
    return 'Cancelar assinatura';
  };

  const footerContent =
    step === 'reason' ? (
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={handleClose}>
          Voltar
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          onClick={() => setStep('confirm')}
          disabled={!reason || (reason === 'outro' && !details.trim())}
        >
          Continuar
        </Button>
      </div>
    ) : step === 'confirm' ? (
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => setStep('reason')}
          disabled={cancelMutation.isPending}
        >
          Voltar
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          onClick={handleSubmit}
          disabled={cancelMutation.isPending}
        >
          {cancelMutation.isPending ? 'Cancelando...' : 'Confirmar cancelamento'}
        </Button>
      </div>
    ) : (
      <Button className="w-full" onClick={handleClose}>
        Entendido
      </Button>
    );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleClose}
      title={getTitle()}
      className="max-w-md"
      footer={footerContent}
    >
      {step === 'reason' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-destructive shrink-0">
              <AlertTriangle className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-semibold">Cancelar assinatura</p>
              <p className="text-sm text-muted-foreground">Nos ajude a entender o motivo</p>
            </div>
          </div>

          <div>
            <Label>Motivo do cancelamento</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent>
                {CANCELLATION_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {reason && (
            <div>
              <Label>
                {reason === 'outro' ? 'Explique seu motivo *' : 'Quer nos contar mais? (opcional)'}
              </Label>
              <Textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={
                  reason === 'outro'
                    ? 'Descreva o motivo do cancelamento...'
                    : 'Alguma sugestão ou comentário...'
                }
                className="mt-1.5 min-h-[80px]"
                required={reason === 'outro'}
              />
            </div>
          )}

          {retention && (
            <div className={`${retention.bg} rounded-xl p-4`}>
              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-white/20 shrink-0 mt-0.5">
                  <retention.icon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="font-medium text-sm text-white">{retention.title}</p>
                  <p className="text-xs text-white/80 mt-1">{retention.message}</p>
                </div>
              </div>
              <a
                href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(retention.waText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-[#25D366] hover:bg-[#20BD5A] transition-colors text-white text-sm font-medium"
              >
                <WhatsAppIcon className="h-4 w-4" />
                Falar com o suporte
              </a>
            </div>
          )}
        </div>
      )}

      {step === 'confirm' && (
        <div className="space-y-4">
          <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 space-y-2">
            <p className="text-sm font-medium">Ao confirmar:</p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>A renovação automática será cancelada</li>
              <li>
                Você continua com acesso até{' '}
                {subscriptionExpiresAt
                  ? format(new Date(subscriptionExpiresAt), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                  : 'o fim do período já pago'}
              </li>
              <li>Cobranças futuras em aberto serão canceladas automaticamente</li>
              <li>Você pode reativar quando quiser</li>
            </ul>
          </div>

          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              Motivo: <span className="font-medium text-foreground">{selectedReasonData?.label}</span>
            </p>
            {details.trim() && (
              <p className="text-xs text-muted-foreground mt-1">Detalhes: {details}</p>
            )}
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-4 text-center">
          <div className="p-3 bg-emerald-500/10 rounded-full w-fit mx-auto">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>
          <div>
            <p className="font-medium">Assinatura cancelada</p>
            <p className="text-sm text-muted-foreground mt-1">
              A renovação automática foi cancelada. Você continua com acesso
              {subscriptionExpiresAt
                ? ` até ${format(new Date(subscriptionExpiresAt), 'dd/MM/yyyy', { locale: ptBR })}`
                : ' até o fim do período já pago'}
              . Se mudar de ideia, é só reativar a qualquer momento.
            </p>
          </div>
        </div>
      )}
    </ResponsiveModal>
  );
}
