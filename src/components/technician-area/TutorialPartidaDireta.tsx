import { Zap, ToggleLeft, Layers, Cable, GitBranch } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';

interface TutorialPartidaDiretaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Cabeçalho de seção do tutorial: ícone + título. */
function Secao({ icon: Icon, titulo }: { icon: typeof Zap; titulo: string }) {
  return (
    <div className="mt-5 flex items-center gap-2 first:mt-0">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <h3 className="text-sm font-semibold text-foreground md:text-base">{titulo}</h3>
    </div>
  );
}

/**
 * Tutorial didático de comando de PARTIDA DIRETA de motor trifásico:
 * o que é contator, tipos, circuito de potência e de comando (com selo).
 * 100% offline — sem imagens externas; diagrama em texto/ASCII.
 */
export function TutorialPartidaDireta({ open, onOpenChange }: TutorialPartidaDiretaProps) {
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Como montar a partida direta"
    >
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
        {/* O contator */}
        <Secao icon={Zap} titulo="O contator (contatora)" />
        <p>
          É um interruptor eletromagnético. Uma <strong className="text-foreground">bobina</strong>{' '}
          (comando, baixa corrente) é energizada, cria campo magnético e fecha os{' '}
          <strong className="text-foreground">contatos de força</strong> (potência, que alimentam o
          motor). Solta a bobina e abre por mola. Tem contatos de{' '}
          <strong className="text-foreground">força</strong> (NA, para o motor) e{' '}
          <strong className="text-foreground">auxiliares</strong> (NA/NF, para a lógica de comando).
        </p>
        <ul className="ml-1 space-y-1.5">
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>
              <strong className="text-foreground">NA (normalmente aberto)</strong>: bobina desligada
              = aberto; energiza = fecha.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>
              <strong className="text-foreground">NF (normalmente fechado)</strong>: bobina
              desligada = fechado; energiza = abre.
            </span>
          </li>
        </ul>

        {/* Tipos */}
        <Secao icon={Layers} titulo="Tipos" />
        <ul className="ml-1 space-y-1.5">
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>
              <strong className="text-foreground">Tripolar (de potência)</strong>: 3 contatos de
              força — padrão para motor trifásico.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>
              <strong className="text-foreground">Bipolar</strong>: 2 polos — bifásico/monofásico de
              maior potência.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>
              <strong className="text-foreground">Mini contator / auxiliar</strong>: comando e
              lógica, correntes pequenas.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>
              <strong className="text-foreground">Categoria de emprego</strong>: dimensione sempre
              em <strong className="text-foreground">AC-3</strong> (motor de indução). AC-1 é carga
              resistiva.
            </span>
          </li>
        </ul>

        {/* Circuito de potência */}
        <Secao icon={Cable} titulo="Partida direta — circuito de potência" />
        <p>O caminho da energia até o motor passa, em ordem, por:</p>
        <div className="rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs text-foreground">
          Rede → Contator (K1) → Relé térmico (FT1) → Motor trifásico
        </div>

        {/* Circuito de comando */}
        <Secao icon={GitBranch} titulo="Partida direta — circuito de comando" />
        <ol className="ml-1 space-y-1.5">
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 font-semibold text-primary">1.</span>
            <span>
              Botoeira <strong className="text-foreground">vermelha NF (desliga / S0)</strong> em
              série com botoeira <strong className="text-foreground">verde NA (liga / S1)</strong>.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 font-semibold text-primary">2.</span>
            <span>
              Apertar a verde energiza a{' '}
              <strong className="text-foreground">bobina do contator (A1/A2)</strong> → fecha os
              contatos de força → motor liga.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 font-semibold text-primary">3.</span>
            <span>
              Um <strong className="text-foreground">contato auxiliar NA do próprio contator faz o
              "selo"</strong> (em paralelo com a botoeira verde): mantém a bobina energizada depois
              de soltar o botão.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 font-semibold text-primary">4.</span>
            <span>
              O <strong className="text-foreground">contato NF do relé térmico</strong> fica no
              comando: se houver sobrecarga, ele abre e desliga tudo.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 font-semibold text-primary">5.</span>
            <span>
              Apertar a vermelha (NF) corta o comando → desfaz o selo → motor para.
            </span>
          </li>
        </ol>

        <div className="mt-4 flex gap-2.5 rounded-lg border border-border bg-muted/40 p-3">
          <ToggleLeft className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-xs leading-relaxed">
            <span className="font-semibold text-foreground">Resumo do selo: </span>a botoeira verde
            só dá o "pulso"; quem segura o motor ligado é o contato auxiliar NA do contator em
            paralelo com ela. A botoeira vermelha (NF) e o relé térmico ficam em série no comando —
            qualquer um que abrir, derruba o selo e para o motor.
          </p>
        </div>
      </div>
    </ResponsiveModal>
  );
}
