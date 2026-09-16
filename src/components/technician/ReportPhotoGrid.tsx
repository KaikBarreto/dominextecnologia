import { useState, type ReactNode } from 'react';
import { PhotoCarousel } from '@/components/ui/PhotoCarousel';
import { cn } from '@/lib/utils';
import { usePdfMode } from './pdfMode';

/**
 * <img> do relatório com skeleton de carregamento e placeholder de erro.
 *
 * O WRAPPER é quem tem dimensão (e precisa de `relative`, porque o skeleton é
 * absoluto); a `className` vai no <img> INTERNO. Os placeholders herdam a
 * `className` do img (normalmente `w-full h-full`), então o wrapper TEM que ter
 * tamanho próprio — senão a linha colapsa quando a foto falha.
 *
 * Vivia dentro do OSReport; virou módulo próprio pra ser compartilhado com o
 * checklist PMOC sem import circular.
 */
export function ReportImage({ src, alt, className, onClick, wrapperClassName, errorLabel }: { src: string; alt: string; className?: string; onClick?: () => void; wrapperClassName?: string; errorLabel?: string }) {
  const isPdf = usePdfMode();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // ── Estado PDF: <img> CRU, sem skeleton e sem fade-in ──────────────────────
  // O html2canvas tira um SNAPSHOT ESTÁTICO do DOM: ele clona os nós e no clone
  // não existe React. Quando `usePdfMode()` vira true a árvore do documento
  // MONTA do zero, então toda <img> nasce com `loaded === false` — isto é, com
  // `absolute opacity-0` e um skeleton no lugar dela. Se o `onLoad` não disparar
  // ANTES do clone, essas classes ficam CONGELADAS no clone pra sempre e a foto
  // sai EM BRANCO no PDF (moldura vazia). Foi o que aconteceu com a foto da
  // pergunta 6 da OS #7601.
  //
  // Skeleton e fade-in são afordâncias de TELA; num documento estático só
  // atrapalham. O `waitForImages(clone)` do pdfPageRenderer já garante que toda
  // <img> do clone terminou de carregar antes da captura.
  //
  // Sem estado de erro aqui, de propósito: num render que vira bitmap logo em
  // seguida, o `onError` não teria como repintar o clone. O `alt` é o fallback.
  // O placeholder de erro continua valendo na tela e na impressão, onde o React
  // está vivo.
  if (isPdf) {
    return (
      <div className={wrapperClassName || 'relative inline-block'}>
        <img src={src} alt={alt} className={className} />
      </div>
    );
  }

  return (
    <div className={wrapperClassName || 'relative inline-block'}>
      {!loaded && !error && (
        <div className={cn('bg-slate-200 animate-pulse rounded-md', className?.replace(/cursor-pointer|hover:opacity-80|transition-opacity/g, '') || 'w-20 h-20')} />
      )}
      <img
        src={src}
        alt={alt}
        className={cn(className, !loaded && 'absolute opacity-0')}
        onClick={onClick}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
      {error && (
        <div className={cn('bg-slate-100 rounded-md flex items-center justify-center text-xs text-slate-400', className?.replace(/cursor-pointer|hover:opacity-80|transition-opacity/g, '') || 'w-20 h-20')}>
          {errorLabel ?? 'Err.'}
        </div>
      )}
    </div>
  );
}

// ── Régua do DOCUMENTO (PDF + impressão) ────────────────────────────────────
// ALTURA fixa de 176px (`h-44`) e LARGURA automática — a "linha justificada"
// clássica de galeria. Toda foto sai com a MESMA altura (~42 mm no papel: dá
// pra ler placa de equipamento e display de manômetro), que é o conserto do
// "tamanhos inconsistentes" do chamado VS PROJECT.
//
// Por que não o quadrado 176×176 da primeira rodada: quase toda foto de celular
// é retrato 3:4, então dentro do quadrado ela ocupava ~132×176 e sobravam ~22px
// de branco de CADA lado, dentro da borda — cara de moldura vazia, não de
// documento. Com largura automática a borda abraça a foto: mesmo tamanho
// visível de antes (a altura não mudou), sem a faixa branca; e como o tile fica
// mais estreito, cabem mais fotos por linha (documento mais curto).
//
// `min-w-[120px]` no WRAPPER: rede contra colapso enquanto a imagem ainda não
// tem dimensão intrínseca (e segura o placeholder de erro, que é um <div>).
// `max-w-[240px]` na IMG: panorâmica extrema não toma a linha inteira sozinha.
//
// Sem fundo (`bg-slate-50` saiu): com a largura acompanhando a foto não existe
// mais letterbox pra disfarçar. O cinza só apareceria no caso raro da
// panorâmica que bate no `max-w`, e ali cinza chama MAIS atenção que o branco
// do papel. Quem delimita a foto é a borda.
//
// `object-contain`: nenhuma foto é CORTADA — o `object-cover` de antes comia
// justamente a informação técnica que o cliente precisa ver.
// `shrink-0`: o flex-wrap não espreme nenhum tile pra caber mais um na linha.
const DOC_TILE_WRAPPER = 'relative h-44 w-auto shrink-0 min-w-[120px]';
// `max-w-[320px]`: teto largo o bastante pra 16:9 deitada (176px de altura ⇒
// 313px de largura) caber SEM faixa branca. Com 240px, foto de celular na
// proporção de vídeo batia no teto e o `object-contain` devolvia o letterbox
// que a altura fixa tinha acabado de eliminar (visto no QA da OS #7601).
// Só panorâmica extrema (acima de ~16:9) ainda encosta no teto.
const DOC_TILE_IMG = 'h-full w-auto max-w-[320px] object-contain rounded-md border border-slate-200';

// ── Régua da TELA (desktop) ─────────────────────────────────────────────────
// Mantida EXATAMENTE como era: thumb adaptativo à largura da coluna.
const SCREEN_TILE_WRAPPER = 'relative w-20 h-20 md:w-[30%] md:min-w-[120px] md:max-w-[220px] md:h-auto md:aspect-square';
const SCREEN_TILE_IMG = 'w-full h-full object-cover rounded-md border';

/**
 * Fonte ÚNICA de renderização das fotos anexadas a uma resposta de checklist
 * (questionário personalizado e item PMOC), em TRÊS estados — mesma régua que o
 * ramo de vídeo do OSReport já usa:
 *
 * | Estado     | Como detecta       | O que desenha                          |
 * |------------|--------------------|----------------------------------------|
 * | PDF        | `usePdfMode()`     | só o grid-documento (sem `md:`/`print:`)|
 * | Impressão  | CSS `print:`       | só o grid-documento                     |
 * | Tela       | default            | carrossel no mobile + grid no desktop   |
 *
 * Por que o estado PDF NÃO pode depender de classe responsiva: o clone do
 * html2canvas tem 794px de largura, mas as media queries do Tailwind avaliam
 * contra a largura da JANELA real. Gerando o PDF de um celular (<768px), um
 * grid `hidden md:flex` continuava `hidden` e o carrossel `print:hidden` era
 * REMOVIDO do clone pelo renderer — resultado: PDF sem nenhuma foto.
 */
export function ReportPhotoGrid({
  urls,
  onOpen,
  errorLabel,
  renderImage,
}: {
  urls: string[];
  /** Abre o visualizador em tela cheia (só na tela; documento é estático). */
  onOpen?: (index: number) => void;
  /** Texto do placeholder de erro (i18n do consumidor). */
  errorLabel?: string;
  /**
   * Render-prop opcional pro consumidor trazer o próprio componente de imagem
   * (ex.: `SignedImg` do checklist PMOC, que resolve URL assinada e tem o
   * próprio placeholder). Sem ele, usa o `ReportImage` padrão.
   */
  renderImage?: (url: string, alt: string, className: string) => ReactNode;
}) {
  const isPdf = usePdfMode();
  if (!urls?.length) return null;

  const tile = (url: string, i: number, wrapperClassName: string, imgClassName: string, clickable: boolean) => {
    const alt = `Foto ${i + 1}`;
    const handleClick = clickable && onOpen ? () => onOpen(i) : undefined;
    const interactive = handleClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : '';
    // Render-prop: o clique vai no WRAPPER (o render-prop não recebe handler).
    if (renderImage) {
      return (
        <div
          key={i}
          className={cn(wrapperClassName, interactive)}
          onClick={handleClick}
          role={handleClick ? 'button' : undefined}
        >
          {renderImage(url, alt, imgClassName)}
        </div>
      );
    }
    return (
      <ReportImage
        key={i}
        src={url}
        alt={alt}
        wrapperClassName={wrapperClassName}
        className={cn(imgClassName, interactive)}
        onClick={handleClick}
        errorLabel={errorLabel}
      />
    );
  };

  /**
   * Grid do documento. O `data-pdf-gallery` é o conserto da RAIZ da sobreposição
   * (chamado VS PROJECT / OS #7601): o renderer do PDF infla TODA <img> do clone
   * pra até 480x340 com `!important`, e quem estava num wrapper de 80x80 com
   * `overflow: visible` transbordava e pintava POR CIMA da pergunta seguinte —
   * além de empurrar a quebra de página cedo demais (meia página em branco).
   * Com este atributo o `enlargeThumb` PULA estas imagens e o tamanho do
   * documento passa a ser decidido aqui no DOM. NÃO remover.
   */
  const docGrid = (containerClassName: string) => (
    <div data-pdf-gallery className={containerClassName}>
      {urls.map((url, i) => tile(url, i, DOC_TILE_WRAPPER, DOC_TILE_IMG, false))}
    </div>
  );

  // Baixar PDF (html2canvas): só o documento, sem nenhuma condição de mídia.
  if (isPdf) return docGrid('flex flex-wrap gap-2');

  return (
    <>
      {/* Imprimir (window.print()): mesmo grid-documento do PDF. */}
      {docGrid('hidden print:flex flex-wrap gap-2')}
      {/* Tela (inclui o link público `?modo=cliente`). Fora do print. */}
      <div className="print:hidden">
        {/* Mobile: carrossel (foto grande, arrasta pro lado). */}
        <div className="md:hidden">
          <PhotoCarousel
            urls={urls}
            onOpen={(i) => onOpen?.(i)}
            renderImage={(url, alt, imgClassName) => (
              renderImage
                ? renderImage(url, alt, imgClassName)
                : <ReportImage src={url} alt={alt} className={imgClassName} wrapperClassName="block w-full h-full" errorLabel={errorLabel} />
            )}
          />
        </div>
        {/* Desktop: grid adaptativo à largura da coluna (visual inalterado). */}
        <div className="hidden md:flex flex-wrap gap-2">
          {urls.map((url, i) => tile(url, i, SCREEN_TILE_WRAPPER, SCREEN_TILE_IMG, true))}
        </div>
      </div>
    </>
  );
}
