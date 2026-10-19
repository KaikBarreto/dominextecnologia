/**
 * Leitor de código de barras (PDV).
 *
 * Um leitor USB de balcão é um "keyboard wedge": ele não é um dispositivo
 * especial pro navegador, ele simplesmente DIGITA o código muito rápido e
 * aperta Enter. Então não existe API de leitor, existe só o teclado — e o
 * trabalho do hook é distinguir a pistola da pessoa.
 *
 * O sinal é o INTERVALO entre as teclas. A pistola manda caractere a cada
 * ~5-15ms; um humano rápido não passa de ~60-80ms por tecla. Com um teto de
 * 35ms entre teclas e um mínimo de caracteres, a separação é limpa.
 *
 * Por que isso é hook próprio e não "o campo de busca resolve": na EcoSistema o
 * combobox de material virou leitor por acidente de design (filtra por código e
 * seleciona no Enter), sem nenhum tratamento de tempo. Funciona na sorte: quem
 * digita "4" e dá Enter cai no mesmo caminho de quem escaneou, e o operador
 * perde a venda descobrindo por quê.
 *
 * ## Como se comporta
 *
 * - Escuta no `document` em fase de CAPTURA. Isso é obrigatório: o React 18
 *   escuta no container da raiz, então um listener de bolha no `document`
 *   rodaria DEPOIS do `onKeyDown` do campo e seria tarde pra impedi-lo.
 * - **Não** engole os caracteres. Eles caem no campo que estiver focado, que é
 *   o que o operador quer ver (o código aparece enquanto escaneia).
 * - No Enter de uma rajada: chama `onScan(codigo)` e corta o evento
 *   (`preventDefault` + `stopPropagation`), pro campo não disparar também uma
 *   busca por texto. **Quem consome é dono de limpar o próprio estado** dentro
 *   do `onScan`.
 * - No Enter de digitação humana: não faz nada, o Enter segue o caminho normal.
 * - Dentro de `textarea` ou `contenteditable` o hook se cala por completo: ali a
 *   pessoa está escrevendo uma observação, e rajada de tecla é problema dela.
 */
import * as React from 'react';

/** Teto de intervalo entre teclas, em ms, pra contar como rajada de leitor. */
export const DEFAULT_MAX_KEY_GAP_MS = 35;

/** Mínimo de caracteres pra um código ser levado a sério. */
export const DEFAULT_MIN_LENGTH = 4;

export interface BurstShape {
  /** Quantidade de caracteres acumulados. */
  length: number;
  /** Maior intervalo observado entre duas teclas consecutivas, em ms. */
  largestGapMs: number;
}

/**
 * O núcleo da decisão, isolado de DOM e de React pra poder ser testado.
 *
 * Rajada = comprimento suficiente E nenhum intervalo acima do teto. Basta UM
 * intervalo humano no meio pra desclassificar: é o caso do operador que começa
 * a digitar, pensa, e continua. Aquilo é busca, não leitura.
 */
export function isScannerBurst(
  shape: BurstShape,
  maxKeyGapMs: number = DEFAULT_MAX_KEY_GAP_MS,
  minLength: number = DEFAULT_MIN_LENGTH,
): boolean {
  if (shape.length < minLength) return false;
  return shape.largestGapMs <= maxKeyGapMs;
}

/** Tecla que produz caractere (e não Shift, Tab, F2, seta...). */
export function isPrintableKey(key: string): boolean {
  return key.length === 1;
}

/**
 * O alvo do evento é um lugar onde a pessoa escreve texto livre? Ali o hook não
 * se mete. Input de uma linha NÃO entra aqui de propósito: é justamente onde o
 * código escaneado deve aparecer.
 */
export function isFreeTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === 'TEXTAREA') return true;
  // `=== true` não é redundância: a função promete boolean, e `isContentEditable`
  // não existe em todo ambiente (o jsdom não implementa). Devolver `undefined`
  // de uma função tipada como boolean é mentira de contrato, mesmo que o `if`
  // de quem chama continue se comportando certo.
  return target.isContentEditable === true;
}

export interface UseBarcodeScannerOptions {
  /** Chamado com o código lido. Quem consome limpa o próprio estado aqui. */
  onScan: (code: string) => void;
  /** Desligue em telas/modais onde leitura não faz sentido. Default: true. */
  enabled?: boolean;
  maxKeyGapMs?: number;
  minLength?: number;
}

export function useBarcodeScanner({
  onScan,
  enabled = true,
  maxKeyGapMs = DEFAULT_MAX_KEY_GAP_MS,
  minLength = DEFAULT_MIN_LENGTH,
}: UseBarcodeScannerOptions): void {
  // onScan vive em ref pra que trocar o callback não reinstale o listener (e
  // não perca uma rajada no meio).
  const onScanRef = React.useRef(onScan);
  React.useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  React.useEffect(() => {
    if (!enabled) return;

    let buffer = '';
    let largestGapMs = 0;
    let lastKeyAt = 0;

    const reset = () => {
      buffer = '';
      largestGapMs = 0;
      lastKeyAt = 0;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isFreeTextTarget(event.target)) {
        reset();
        return;
      }

      if (event.key === 'Enter') {
        const shape: BurstShape = { length: buffer.length, largestGapMs };
        const code = buffer;
        reset();

        if (!isScannerBurst(shape, maxKeyGapMs, minLength)) return;

        // Corta o evento ANTES do React: o campo não pode também disparar uma
        // busca por texto com o código que acabou de ser lido.
        event.preventDefault();
        event.stopPropagation();
        onScanRef.current(code);
        return;
      }

      if (!isPrintableKey(event.key)) {
        // Shift faz parte de leitor que manda maiúscula; não quebra a rajada.
        if (event.key !== 'Shift') reset();
        return;
      }

      const now = event.timeStamp || performance.now();
      if (lastKeyAt > 0) {
        const gap = now - lastKeyAt;
        if (gap > maxKeyGapMs) {
          // Intervalo humano: a rajada morreu aqui e uma nova começa nesta tecla.
          buffer = '';
          largestGapMs = 0;
        } else if (gap > largestGapMs) {
          largestGapMs = gap;
        }
      }
      lastKeyAt = now;
      buffer += event.key;
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled, maxKeyGapMs, minLength]);
}
