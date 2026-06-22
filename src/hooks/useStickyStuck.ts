import { useEffect, useRef, useState } from 'react';

/**
 * Detecta quando um cabeçalho `position: sticky` está REALMENTE fixado no topo
 * ("pinned"), via DOIS sentinels de 0px + IntersectionObserver:
 *
 *  - `sentinelRef` (TOPO): renderizado LOGO ACIMA do cabeçalho. Enquanto está
 *    visível, o cabeçalho ainda NÃO grudou (rola junto). Quando sai por cima da
 *    linha do header fixo → o cabeçalho passou o LIMITE SUPERIOR (começou a grudar).
 *  - `bottomSentinelRef` (BASE): renderizado LOGO APÓS o conteúdo do item. Marca o
 *    FIM do item. Enquanto está abaixo da linha (sticky + altura do cabeçalho) o
 *    item ainda ocupa a faixa sticky. Quando ELE TAMBÉM sai por cima dessa linha,
 *    o item TERMINOU/passou do fim → o cabeçalho DESGRUDOU (solta por baixo).
 *
 * `isStuck` = passou o topo (topSentinel acima da linha) **E** ainda não passou o
 * fim (bottomSentinel abaixo da linha de baixo). Assim o fundo/sombra só aparece
 * ENQUANTO o cabeçalho está de fato fixado, e some quando você rola PASSANDO DO
 * FIM do conteúdo do equipamento (antes ficava preso true porque só se olhava o
 * limite de cima).
 *
 * Por que não `:stuck` (CSS)? Suporte praticamente nulo nos navegadores em campo.
 *
 * Uso:
 *   const { sentinelRef, bottomSentinelRef, isStuck } = useStickyStuck(topPx, headerHeight);
 *   ...
 *   <div ref={sentinelRef} aria-hidden className="h-0" />          // logo antes do header
 *   <Header className={isStuck ? 'shadow-lg' : ''} style={{ top: topPx }} />
 *   <Content />
 *   <div ref={bottomSentinelRef} aria-hidden className="h-0" />    // logo após o conteúdo
 *
 * - `enabled=false` (ex.: sem sticky / impressão) → nunca observa, isStuck=false.
 * - `topPx` entra como `rootMargin` negativo no topo do observer de TOPO (linha =
 *   base do header fixo da tela). O observer de BASE usa `topPx + headerHeight`
 *   (base do CABEÇALHO grudado), que é exatamente onde o cabeçalho solta.
 * - `headerHeight` pode chegar como 0 antes da 1ª medição. Enquanto for 0 a linha
 *   de baixo coincide com a de cima — o ramo "ainda não passou o fim" segura true
 *   no caso normal; o flicker é evitado pelo item só montar o fundo com altura > 0.
 */
export function useStickyStuck(topPx: number | undefined, headerHeight = 0) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  // Estado bruto de cada limite. `isStuck` deriva dos dois (AND).
  const [topPassed, setTopPassed] = useState(false);
  const [bottomPassed, setBottomPassed] = useState(false);
  const enabled = topPx !== undefined;

  // Observer do TOPO: dispara quando o sentinel superior cruza a base do header
  // fixo da tela. `topPassed` = sentinel saiu por CIMA (cabeçalho começou a grudar).
  useEffect(() => {
    if (!enabled) {
      setTopPassed(false);
      return;
    }
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setTopPassed(!entry.isIntersecting && entry.boundingClientRect.top < (topPx ?? 0));
      },
      { threshold: [0], rootMargin: `-${topPx ?? 0}px 0px 0px 0px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, topPx]);

  // Observer da BASE: dispara quando o sentinel do FIM do item cruza a base do
  // CABEÇALHO grudado (linha = topPx + headerHeight). `bottomPassed` = o fim do
  // item saiu por cima dessa linha → o cabeçalho desgrudou (rolamos passando do
  // fim do conteúdo). Enquanto o fim ainda está ABAIXO da linha, o item ocupa a
  // faixa sticky → não passou. Re-observa quando headerHeight muda (linha desce).
  useEffect(() => {
    if (!enabled) {
      setBottomPassed(false);
      return;
    }
    const el = bottomSentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      // Sem sentinel de base (item nunca o renderiza) → trata como "nunca passou o
      // fim": isStuck reduz ao comportamento antigo (só limite de cima).
      setBottomPassed(false);
      return;
    }
    const lineFromTop = (topPx ?? 0) + headerHeight;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setBottomPassed(!entry.isIntersecting && entry.boundingClientRect.top < lineFromTop);
      },
      { threshold: [0], rootMargin: `-${lineFromTop}px 0px 0px 0px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, topPx, headerHeight]);

  // Pinned = passou o limite de cima E ainda NÃO passou o fim por baixo.
  const isStuck = topPassed && !bottomPassed;

  return { sentinelRef, bottomSentinelRef, isStuck };
}
