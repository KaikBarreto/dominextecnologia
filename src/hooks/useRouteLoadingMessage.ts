import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Mapeia rotas para mensagens de loading contextuais, no estilo
 * "Pensando.../Processando...". A ideia é que o usuário que espera um beat pra
 * tela montar veja o que o sistema está realmente fazendo, em vez de um
 * genérico "Carregando...".
 *
 * O match é por PREFIXO (longest-prefix vence), então rotas aninhadas caem na
 * entrada mais específica quando ela existe (ex.: /admin/empresas vence /admin).
 */
const ROUTE_MESSAGES: Array<readonly [string, string]> = [
  // Painel admin Auctus (o /admin genérico perde pros específicos via longest-prefix)
  ['/admin/dashboard', 'Montando painel admin...'],
  ['/admin/empresas', 'Carregando empresas...'],
  ['/admin/health-score', 'Calculando health score...'],
  ['/admin/financeiro', 'Consolidando financeiro...'],
  ['/admin/crm', 'Carregando CRM...'],
  ['/admin/vendedores', 'Buscando vendedores...'],
  ['/admin/configuracoes', 'Carregando configurações...'],
  ['/admin/domiflix', 'Carregando Domiflix admin...'],
  ['/admin', 'Carregando painel admin...'],

  // App principal
  ['/dashboard', 'Carregando painel...'],
  ['/ordens-servico', 'Buscando ordens de serviço...'],
  ['/servicos', 'Carregando serviços...'],
  ['/agenda', 'Carregando agenda...'],
  ['/clientes', 'Carregando clientes...'],
  ['/equipamentos', 'Carregando equipamentos...'],
  ['/crm', 'Carregando CRM...'],
  ['/orcamentos', 'Buscando orçamentos...'],
  ['/estoque', 'Calculando estoque...'],
  ['/financeiro', 'Processando financeiro...'],
  ['/notas-fiscais', 'Carregando notas fiscais...'],
  ['/pmoc', 'Carregando PMOC...'],
  ['/contratos', 'Carregando contratos...'],
  ['/configuracoes-contrato', 'Carregando configurações de contrato...'],
  ['/configuracoes', 'Carregando configurações...'],
  ['/perfil', 'Carregando perfil...'],
  ['/funcionarios', 'Carregando funcionários...'],
  ['/ponto', 'Carregando ponto...'],
  ['/mapa-ao-vivo', 'Localizando técnicos...'],
  ['/ferramentas-tecnico', 'Abrindo ferramentas...'],
  ['/assinatura', 'Carregando assinatura...'],
  ['/changelog', 'Carregando novidades...'],
  ['/domiflix', 'Carregando Domiflix...'],
];

// Fallback genérico rotativo — exibido quando a rota não tem mensagem
// específica. Troca com efeito typewriter (apaga letra por letra, pausa,
// digita a próxima letra por letra) pra dar sensação de "pensando" estilo
// Claude em vez de um swap brusco.
const FALLBACK_MESSAGES = [
  'Carregando...',
  'Processando...',
  'Sincronizando...',
  'Buscando...',
  'Calculando...',
  'Preparando...',
] as const;

// Tempos da animação typewriter (ms).
const HOLD_MS = 2500; // mensagem completa fica parada
const TYPE_OUT_MS = 30; // por char removido (apaga rápido)
const PAUSE_BETWEEN_MS = 150; // pausa após apagar, antes de digitar a próxima
const TYPE_IN_MS = 55; // por char adicionado (digita um pouco mais lento)

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export function useRouteLoadingMessage(): string {
  const { pathname } = useLocation();

  // Acha o prefixo mais longo que casa, pra rotas aninhadas preferirem a
  // entrada mais específica (ex.: /admin/empresas vence /admin).
  let best = '';
  for (const [prefix] of ROUTE_MESSAGES) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      if (prefix.length > best.length) best = prefix;
    }
  }

  const hasSpecificMessage = best.length > 0;
  const specificMessage = hasSpecificMessage
    ? ROUTE_MESSAGES.find(([p]) => p === best)?.[1] ?? FALLBACK_MESSAGES[0]
    : null;

  // Texto exibido a cada frame da animação. Começa já com a primeira mensagem
  // completa (rota específica ou primeiro fallback) pra evitar piscar vazio.
  const [displayedText, setDisplayedText] = useState<string>(
    specificMessage ?? FALLBACK_MESSAGES[0]
  );

  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    // Rota com mensagem específica: texto fixo, sem rotação.
    if (specificMessage) {
      setDisplayedText(specificMessage);
      return () => {
        cancelledRef.current = true;
      };
    }

    let messageIndex = 0;
    setDisplayedText(FALLBACK_MESSAGES[messageIndex]);

    const cycle = async () => {
      while (!cancelledRef.current) {
        // Hold da mensagem completa
        await wait(HOLD_MS);
        if (cancelledRef.current) return;

        const current = FALLBACK_MESSAGES[messageIndex];

        // Typing out: do fim pro começo (i = length-1 ... 0)
        for (let i = current.length - 1; i >= 0; i--) {
          if (cancelledRef.current) return;
          setDisplayedText(current.slice(0, i));
          await wait(TYPE_OUT_MS);
        }

        // Pausa curta entre apagar e digitar
        await wait(PAUSE_BETWEEN_MS);
        if (cancelledRef.current) return;

        // Próxima mensagem
        messageIndex = (messageIndex + 1) % FALLBACK_MESSAGES.length;
        const next = FALLBACK_MESSAGES[messageIndex];

        // Typing in: do começo pro fim (i = 1 ... length)
        for (let i = 1; i <= next.length; i++) {
          if (cancelledRef.current) return;
          setDisplayedText(next.slice(0, i));
          await wait(TYPE_IN_MS);
        }
      }
    };

    cycle();

    return () => {
      cancelledRef.current = true;
    };
  }, [specificMessage]);

  return displayedText;
}
