import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import iphoneFrame from '@/assets/iphone-17-pro-deep-blue.svg';
import { useLocale } from '@/lib/i18n';
import { localizeHash } from '@/lib/i18n/localizeHash';

const HERO_VIDEO_URL =
  'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/landingpage/Dominex%20-%20Completo.MP4';
// Capa estática leve (~16KB) — frame ~0,8s do vídeo. Evita baixar o MP4 de 38MB só pra
// pintar o pôster (o truque #t=10 era o que travava o LCP no PageSpeed).
const HERO_POSTER_URL =
  'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/landingpage/hero-poster.webp';

export default function HeroSection() {
  const ref = useScrollReveal();
  const [typedCount, setTypedCount] = useState(0);
  const { locale, messages } = useLocale();
  const t = messages.home.hero;
  const FULL_TEXT_PRE = t.typedPre;
  const FULL_TEXT_HIGHLIGHT = t.typedHighlight;
  const TOTAL_LENGTH = FULL_TEXT_PRE.length + FULL_TEXT_HIGHLIGHT.length;

  useEffect(() => {
    if (typedCount >= TOTAL_LENGTH) return;
    const timeout = setTimeout(() => setTypedCount((c) => c + 1), 45);
    return () => clearTimeout(timeout);
  }, [typedCount]);

  const isDone = typedCount >= TOTAL_LENGTH;

  // O texto COMPLETO fica sempre no DOM (crawler/prerender/leitor de tela veem
  // a frase inteira desde o load). A animação de "typing" é apenas um reveal
  // visual por opacidade — nenhum caractere é removido do DOM em momento algum.
  const renderTyped = (text: string, offset: number) =>
    text.split('').map((char, i) => (
      <span
        key={i}
        style={{ opacity: offset + i < typedCount ? 1 : 0 }}
        className="transition-opacity duration-75"
      >
        {char}
      </span>
    ));

  return (
    <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(160,100%,39%,0.08)_0%,transparent_70%)]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(hsl(0,0%,40%) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <div ref={ref} className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 lg:py-32 scroll-reveal">
        <div className="grid lg:grid-cols-2 gap-6 lg:gap-16 items-center">
          {/* Left — texto (depois do video no mobile) */}
          <div className="min-w-0 space-y-5 lg:space-y-8 order-2 lg:order-1 text-center lg:text-left">
            <h1
              lang={locale === 'pt-br' ? 'pt-BR' : locale}
              className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white leading-[1.1] tracking-tight min-h-[2.5em] break-words hyphens-auto"
            >
              {/* Texto estável keyword-rico para SEO/leitores de tela —
                  invisível visualmente, mas é conteúdo real do H1 lido por SR. */}
              <span className="sr-only">{t.srHeadline}</span>
              {/* Frase visível COMPLETA, sempre presente no DOM (crawler/prerender
                  capturam a frase inteira no load). O "typing" é só reveal por
                  opacidade. aria-hidden p/ não duplicar leitura no SR. */}
              <span aria-hidden="true">
                <span>{renderTyped(FULL_TEXT_PRE, 0)}</span>
                <span className="bg-gradient-to-r from-primary to-[hsl(160,80%,55%)] bg-clip-text text-transparent">
                  {renderTyped(FULL_TEXT_HIGHLIGHT, FULL_TEXT_PRE.length)}
                </span>
                <span
                  className={`inline-block w-[3px] sm:w-[4px] lg:w-[5px] h-[0.9em] -mb-[0.1em] ml-1 bg-primary align-middle ${
                    isDone ? 'animate-caret-blink' : ''
                  }`}
                  style={{ opacity: typedCount > 0 ? 1 : 0 }}
                />
              </span>
            </h1>

            <p className="text-lg text-white/50 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              {t.subtitle}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Button
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 text-base px-8 py-6 shadow-brand-glow w-full sm:w-auto whitespace-normal h-auto text-center leading-tight"
                asChild
              >
                <Link to="/cadastro?origem=Site">
                  {t.ctaPrimary}
                  <ArrowRight className="ml-2 h-5 w-5 shrink-0" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="text-white border border-white/20 hover:bg-white/10 hover:text-white px-8 py-6 w-full sm:w-auto whitespace-normal h-auto text-center leading-tight"
                asChild
              >
                <a href={`#${localizeHash('precos', locale)}`}>{t.ctaSecondary}</a>
              </Button>
            </div>
          </div>

          {/* Right — Demo video dentro da moldura do iPhone 17 Pro — antes do texto no mobile */}
          <div className="relative flex justify-center order-1 lg:order-2">
            <div className="relative aspect-[880/1832] w-full max-w-[190px] sm:max-w-[240px] lg:max-w-[320px] mx-auto">
              {/* Recorte EXATO da tela do iPhone (squircle, extraído do SVG e normalizado p/ escalar) */}
              <svg width="0" height="0" className="absolute" aria-hidden="true">
                <defs>
                  <clipPath id="iphone-screen-clip" clipPathUnits="objectBoundingBox">
                    <path d="M0.250746 0C0.162977 0 0.119091 0 0.085568 0.007856C0.056080 0.014767 0.032105 0.025794 0.017080 0.039358C0 0.054783 0 0.074961 0 0.115332V0.884668C0 0.924983 0 0.945223 0.017080 0.960641C0.032105 0.974205 0.056080 0.985235 0.085568 0.992145C0.119091 1 0.162977 1 0.250746 1H0.749254C0.836999 1 0.880908 1 0.914431 0.992145C0.943920 0.985235 0.967896 0.974205 0.982920 0.960641C1 0.945223 1 0.924983 1 0.884668V0.115332C1 0.074961 1 0.054783 0.982920 0.039358C0.967896 0.025794 0.943920 0.014767 0.914431 0.007856C0.880908 0 0.836999 0 0.749254 0H0.250746Z" />
                  </clipPath>
                </defs>
              </svg>
              {/* Vídeo na área da tela — ATRÁS da moldura. Cantos/ilha vêm do SVG por cima. */}
              <video
                src={HERO_VIDEO_URL}
                poster={HERO_POSTER_URL}
                controls
                preload="none"
                playsInline
                className="absolute object-cover bg-black"
                style={{ top: '2.29%', left: '4.32%', width: '91.36%', height: '95.41%', clipPath: 'url(#iphone-screen-clip)' }}
                aria-label={t.videoLabel}
              >
                {t.videoUnsupported}
              </video>
              {/* Moldura do iPhone por cima — pointer-events-none p/ liberar os controles do vídeo */}
              <img
                src={iphoneFrame}
                alt=""
                aria-hidden="true"
                width={880}
                height={1832}
                draggable={false}
                className="pointer-events-none select-none absolute inset-0 h-full w-full"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
