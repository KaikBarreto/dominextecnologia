import type { LucideIcon } from 'lucide-react';
import { MoreVertical, QrCode, Settings } from 'lucide-react';

import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { cn } from '@/lib/utils';

/**
 * Passo a passo de pareamento, no mesmo formato que o próprio WhatsApp usa na
 * tela de conectar aparelho: círculo numerado ligado por uma linha, termo da
 * interface em negrito e o ícone do próprio botão inline.
 *
 * Copiar o formato deles é deliberado: o cliente vai alternar entre esta tela e
 * o celular, e reconhecer a mesma instrução nos dois lugares elimina a dúvida
 * de "é isso mesmo que eu toco?".
 *
 * A diferença está no passo 4: o WhatsApp oferece "Conectar com número de
 * telefone", nós usamos o QR Code, que é o que esta tela exibe.
 */

/** Ícone inline, do tamanho do texto, imitando o botão real do aplicativo. */
function InlineIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span
      className={cn(
        'mx-0.5 inline-flex h-5 w-5 shrink-0 translate-y-1 items-center justify-center rounded-md border bg-background',
        className,
      )}
    >
      <Icon className="h-3 w-3" />
    </span>
  );
}

export function WhatsappPairingSteps({ className }: { className?: string }) {
  const steps = [
    <>
      Abra o <strong className="font-semibold text-foreground">WhatsApp</strong>
      <span className="mx-0.5 inline-flex h-5 w-5 shrink-0 translate-y-1 items-center justify-center rounded-md bg-[#25D366] text-white">
        <WhatsAppIcon className="h-3 w-3" />
      </span>
      no seu celular.
    </>,
    <>
      Toque em <strong className="font-semibold text-foreground">Mais opções</strong>
      <InlineIcon icon={MoreVertical} /> no Android ou em{' '}
      <strong className="font-semibold text-foreground">Configurações</strong>
      <InlineIcon icon={Settings} /> no iPhone.
    </>,
    <>
      Toque em <strong className="font-semibold text-foreground">Dispositivos conectados</strong> e,
      em seguida, em <strong className="font-semibold text-foreground">Conectar dispositivo</strong>.
    </>,
    <>
      Aponte a câmera para o <strong className="font-semibold text-foreground">QR Code</strong>
      <InlineIcon icon={QrCode} /> desta tela.
    </>,
  ];

  return (
    <ol className={cn('space-y-0', className)}>
      {steps.map((step, index) => (
        <li key={index} className="flex gap-3">
          {/* Coluna do número: círculo + linha que liga ao próximo, igual ao
              WhatsApp. A linha some no último item. */}
          <div className="flex flex-col items-center">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">
              {index + 1}
            </span>
            {index < steps.length - 1 && <span className="w-px flex-1 bg-border" />}
          </div>
          <p className="pb-4 text-sm leading-relaxed text-muted-foreground">{step}</p>
        </li>
      ))}
    </ol>
  );
}
