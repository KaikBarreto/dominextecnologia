import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, ArrowRight, Camera, Check, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FaceCaptureExperience } from '@/components/ponto/FaceCaptureExperience';
import { PublicAppLocaleProvider } from '@/contexts/AppLocaleContext';
import { useFaceEnrollment } from '@/hooks/useFaceEnrollment';
import { MESSAGES } from '@/lib/i18n/messages';
import type { LocaleCode } from '@/lib/i18n/locales';
import type { FaceTemplatePayload } from '@/lib/face/faceCapture';
import dominexLogoWhite from '@/assets/logo-white-horizontal.png';

const DEFAULT_ACCENT = '#22c55e';

function safeAccent(value: string | null | undefined): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_ACCENT;
}

function EnrollmentBackdrop({ accent }: { accent: string }) {
  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10"
      style={{
        background: [
          `radial-gradient(900px 480px at 50% -120px, color-mix(in srgb, ${accent}, transparent 75%), transparent 72%)`,
          'radial-gradient(100% 75% at 50% 10%, transparent 35%, rgba(0,0,0,0.6))',
          '#070708',
        ].join(', '),
      }}
    />
  );
}

export default function FaceEnrollment() {
  const { token } = useParams<{ token: string }>();
  const enrollment = useFaceEnrollment(token);
  const [stage, setStage] = useState<'intro' | 'scanning' | 'saving' | 'success'>('intro');

  useLayoutEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    const referrerMeta = document.querySelector<HTMLMetaElement>('meta[name="referrer"]');
    const previousReferrer = referrerMeta?.content;
    const robotsMeta = document.createElement('meta');
    robotsMeta.name = 'robots';
    robotsMeta.content = 'noindex, nofollow, noarchive';
    root.classList.add('dark');
    if (referrerMeta) referrerMeta.content = 'no-referrer';
    document.head.appendChild(robotsMeta);
    return () => {
      if (!hadDark) root.classList.remove('dark');
      if (referrerMeta && previousReferrer) referrerMeta.content = previousReferrer;
      robotsMeta.remove();
    };
  }, []);

  const locale: LocaleCode = enrollment.context?.language ?? 'pt-br';
  const t = MESSAGES[locale].app.timeclock.faceEnrollment;
  const accent = safeAccent(enrollment.context?.white_label_primary_color);
  const logo = enrollment.context?.white_label_enabled
    ? enrollment.context.white_label_logo_url || enrollment.context.logo_url
    : dominexLogoWhite;

  const complete = enrollment.complete;
  const retryEnrollment = enrollment.retry;
  const pointPath = enrollment.context?.point_path;
  const goToPoint = useCallback(() => {
    if (pointPath) window.location.replace(pointPath);
  }, [pointPath]);

  useEffect(() => {
    if (stage !== 'success' || !pointPath) return;
    const timer = window.setTimeout(goToPoint, 1800);
    return () => window.clearTimeout(timer);
  }, [goToPoint, pointPath, stage]);

  const handleCaptureComplete = useCallback(async (templates: FaceTemplatePayload[]) => {
    setStage('saving');
    try {
      await complete(templates);
      setStage('success');
    } catch {
      setStage('intro');
    }
  }, [complete]);

  const retry = useCallback(() => { void retryEnrollment(); }, [retryEnrollment]);
  const publicCopy = useMemo(() => t.capture, [t.capture]);

  if (stage === 'scanning' && enrollment.context) {
    return (
      <PublicAppLocaleProvider language={locale}>
        <FaceCaptureExperience
          accentColor={accent}
          copy={publicCopy}
          onComplete={handleCaptureComplete}
          onCancel={() => setStage('intro')}
        />
      </PublicAppLocaleProvider>
    );
  }

  const invalid = enrollment.error === 'invalid_or_expired_link';
  const hasTransientError = !!enrollment.error && !invalid;

  return (
    <PublicAppLocaleProvider language={locale}>
      <div className="dark flex min-h-[100svh] flex-col items-center justify-center px-5 py-10 text-center text-white">
        <EnrollmentBackdrop accent={accent} />
        <main className="flex w-full max-w-lg flex-col items-center">
          {enrollment.loading ? (
            <>
              <Loader2 className="h-10 w-10 animate-spin motion-reduce:animate-none" style={{ color: accent }} />
              <p className="mt-4 text-white/60">{t.capture.preparing}</p>
            </>
          ) : invalid || hasTransientError || !enrollment.context ? (
            <>
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/[0.06]">
                <AlertCircle className="h-10 w-10 text-white/65" />
              </div>
              <h1 className="mt-6 text-2xl font-semibold sm:text-3xl">{invalid ? t.invalidTitle : t.unavailableTitle}</h1>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-white/55 sm:text-base">
                {invalid ? t.invalidDescription : t.unavailableDescription}
              </p>
              {!invalid && <Button type="button" size="lg" className="mt-7" onClick={retry}>{t.retry}</Button>}
            </>
          ) : stage === 'saving' ? (
            <>
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/[0.06]">
                <Loader2 className="h-11 w-11 animate-spin motion-reduce:animate-none" style={{ color: accent }} />
              </div>
              <h1 className="mt-6 text-2xl font-semibold">{t.saving}</h1>
              <p className="mt-3 text-sm text-white/50">{t.capture.privacy}</p>
            </>
          ) : stage === 'success' ? (
            <>
              <div className="flex h-28 w-28 items-center justify-center rounded-full" style={{ backgroundColor: accent }}>
                <Check className="h-14 w-14 text-white" strokeWidth={3} />
              </div>
              <h1 className="mt-7 text-3xl font-semibold">{t.successTitle}</h1>
              <p className="mt-3 max-w-md text-base leading-relaxed text-white/65">{t.successDescription}</p>
              <p className="mt-7 text-sm text-white/40">{t.successHint}</p>
              <Button type="button" size="lg" className="mt-5 h-12 w-full max-w-sm rounded-xl text-base font-semibold" style={{ backgroundColor: accent }} onClick={goToPoint}>
                {t.goToPoint} <ArrowRight className="h-5 w-5" />
              </Button>
            </>
          ) : (
            <>
              {logo && <img src={logo} alt={enrollment.context.company_name} referrerPolicy="no-referrer" className="mb-10 h-10 max-w-[12rem] object-contain" />}
              <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-white/[0.055] ring-1 ring-white/10">
                <Camera className="h-12 w-12" style={{ color: accent }} />
                <Sparkles className="absolute -right-1 top-1 h-7 w-7" style={{ color: accent }} />
              </div>
              <p className="mt-7 text-xs font-semibold uppercase tracking-[0.24em] text-white/45">{t.eyebrow}</p>
              <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{t.title.replace('{name}', enrollment.context.employee_first_name)}</h1>
              <p className="mt-4 max-w-md text-base leading-relaxed text-white/65">{t.description}</p>
              <div className="mt-7 w-full rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-left backdrop-blur-sm">
                <div className="flex gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} />
                  <div>
                    <p className="text-sm leading-relaxed text-white/75">{t.privacy}</p>
                    <p className="mt-2 text-xs leading-relaxed text-white/40">{t.requirement}</p>
                  </div>
                </div>
              </div>
              <Button type="button" size="lg" className="mt-7 h-12 w-full rounded-xl text-base font-semibold" style={{ backgroundColor: accent }} onClick={() => setStage('scanning')}>
                <Camera className="h-5 w-5" /> {t.start}
              </Button>
              <Button type="button" variant="ghost" className="mt-3 h-11 w-full text-white/60 hover:bg-white/[0.06] hover:text-white" onClick={goToPoint}>
                {t.continueWithoutFace} <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </main>
      </div>
    </PublicAppLocaleProvider>
  );
}
