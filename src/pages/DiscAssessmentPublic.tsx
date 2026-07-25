// ─────────────────────────────────────────────────────────────────────────────
// DiscAssessmentPublic — tela pública (typeform) do Perfil Comportamental (DISC).
//
// Rota /avaliacao/:token — funciona TOTALMENTE deslogada. Extrai o short_code do
// link amigável (slug-do-nome-<code>) e carrega tudo via get_disc_public (anon,
// SECURITY DEFINER). O envio passa por submit_disc_assessment. Nenhuma leitura/
// escrita direta de tabela do tenant.
//
// LOCALE (decisão): links públicos NUNCA têm seletor de idioma (régua CEO).
// O idioma vem do payload da RPC: `company_locale` retornado por get_disc_public,
// que reflete o idioma configurado na empresa/tenant. Fallback defensivo: pt-br.
// O DiscReport aceita locale por prop.
//
// Casca: PublicPortalShell (tema claro forçado, cor da marca do payload) — igual
// aos outros portais públicos. Respostas sobrevivem a refresh via usePersistedState.
//
// HEADER: mostra foto + nome do FUNCIONÁRIO (não logo + nome da empresa).
// Foto via edge pública disc-photo?code=<code> (bucket privado, sem headers).
// Fallback se foto falhar: SVG data-uri com iniciais do funcionário.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Link2Off, Check, ArrowLeft, ArrowRight, CheckCircle2, Brain, MousePointerClick, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { PublicPortalShell } from '@/components/portal/PublicPortalShell';
import { DiscReport } from '@/components/employees/disc/DiscReport';
import { DiscScaleSlider } from '@/components/employees/disc/DiscScaleSlider';
import { extractShortCode } from '@/utils/prettyLinks';
import { usePersistedState } from '@/hooks/usePersistedState';
import { scoreAndClassify, type DiscScores } from '@/lib/disc/scoring';
import { selectFormItems } from '@/lib/disc/formSelection';
import { MESSAGES } from '@/lib/i18n/messages';
import { type LocaleCode } from '@/lib/i18n/locales';

// SUPABASE_URL da mesma config do client — usado para montar a URL da edge pública.
const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL as string;

// Formato do payload de get_disc_public (allowlist do RPC).
interface DiscPublicPayload {
  company_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  employee_first_name: string | null;
  /** Nome completo do funcionário — exibido no header em vez do nome da empresa. */
  employee_name?: string | null;
  status: 'pending' | 'completed';
  show_result_to_employee: boolean;
  scores?: DiscScores | null;
  profile_code?: string | null;
  primary_type?: string | null;
  secondary_type?: string | null;
  completed_at?: string | null;
  locale?: string | null;
  /** Idioma configurado na empresa do tenant. Usado como locale da tela. */
  company_locale?: string | null;
}

/**
 * Gera um SVG data-URI com as iniciais do nome como avatar circular.
 * Usado como fallback quando a foto do funcionário não carrega.
 * A cor de fundo é semi-transparente branca (funciona sobre o header gradiente).
 */
function makeInitialsSvgDataUri(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : (parts[0]?.[0] ?? '?').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" width="56" height="56">
  <circle cx="28" cy="28" r="28" fill="rgba(255,255,255,0.20)"/>
  <text x="28" y="28" dominant-baseline="central" text-anchor="middle" font-size="20" font-weight="700" font-family="system-ui,sans-serif" fill="#ffffff">${initials}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Retorno de submit_disc_assessment.
interface DiscSubmitResult {
  already?: boolean;
  show_result_to_employee: boolean;
  scores: DiscScores;
  profile_code: string;
  primary_type: string;
  secondary_type: string;
}

const isLocale = (v: unknown): v is LocaleCode =>
  v === 'pt-br' || v === 'en' || v === 'es' || v === 'fr';

type Phase = 'loading' | 'error' | 'intro' | 'questions' | 'thanks' | 'result' | 'alreadyHidden';

export default function DiscAssessmentPublic() {
  const { token } = useParams<{ token: string }>();
  const code = useMemo(() => extractShortCode(token), [token]);

  // Locale: pt-br enquanto o payload não chega; depois aplica company_locale.
  const [locale, setLocale] = useState<LocaleCode>('pt-br');
  const tr = MESSAGES[locale].app.discProfile;

  const [payload, setPayload] = useState<DiscPublicPayload | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  // Fallback de iniciais quando a edge de foto retorna erro (404 ou outro).
  const [photoError, setPhotoError] = useState(false);

  // Respostas sobrevivem a refresh (chave por code). { itemId: 1..5 }
  const [answers, setAnswers] = usePersistedState<Record<string, number>>(
    `disc:answers:${code ?? 'none'}`,
    {},
  );
  const [step, setStep] = useState(0); // índice da afirmação atual
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DiscSubmitResult | null>(null);

  // Subconjunto determinístico de 28 itens para este formulário.
  // Seed = code do link → mesmo link sempre gera as mesmas perguntas (refresh seguro).
  // Links diferentes → perguntas diferentes (sorteio distinto por seed).
  const formItems = useMemo(() => selectFormItems(code ?? 'default'), [code]);
  const total = formItems.length;

  // ── Carrega o payload público ──────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!code) {
        setPhase('error');
        return;
      }
      setPhase('loading');
      try {
        const { data, error } = await supabase.rpc('get_disc_public', { p_code: code });
        if (!alive) return;
        if (error || !data) {
          setPhase('error');
          return;
        }
        const p = data as unknown as DiscPublicPayload;
        setPayload(p);

        // Aplica o idioma da empresa como locale da tela.
        const resolved: LocaleCode = isLocale(p.company_locale) ? p.company_locale : 'pt-br';
        setLocale(resolved);

        if (p.status === 'completed') {
          if (p.show_result_to_employee && p.scores && p.profile_code) {
            setPhase('result');
          } else {
            setPhase('alreadyHidden');
          }
        } else {
          setPhase('intro');
        }
      } catch {
        if (alive) setPhase('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [code]);

  const brandColor = payload?.primary_color ?? null;
  const companyName = payload?.company_name ?? 'Dominex';
  const employeeName = payload?.employee_first_name ?? '';

  // Nome completo para o header (fallback para o first_name se employee_name não vier).
  const employeeFullName =
    payload?.employee_name ?? (employeeName ? employeeName : null);

  // URL da foto do funcionário via edge pública (bucket privado, sem headers necessários).
  // Monta apenas quando o code está disponível.
  const photoUrl = code
    ? `${SUPABASE_URL}/functions/v1/disc-photo?code=${code}`
    : null;

  // Logo a passar para o PublicPortalShell:
  // - Antes de qualquer erro: URL da foto (edge pública).
  // - Após erro de carregamento: SVG data-URI com iniciais (fallback visual).
  // - Sem funcionário: null (shell exibe placeholder padrão).
  const headerLogoUrl: string | null = !photoUrl
    ? null
    : photoError && employeeFullName
    ? makeInitialsSvgDataUri(employeeFullName)
    : photoError
    ? null
    : photoUrl;

  // ── Envio ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!code || submitting) return;
    setSubmitting(true);
    const { scores, classification } = scoreAndClassify(answers);
    try {
      const { data, error } = await supabase.rpc('submit_disc_assessment', {
        p_code: code,
        p_answers: answers,
        p_scores: scores,
        p_profile: {
          primary: classification.primary,
          secondary: classification.secondary,
          profile_code: classification.profileCode,
        },
        p_locale: locale,
      });
      if (error || !data) {
        setSubmitting(false);
        return;
      }
      const res = data as unknown as DiscSubmitResult;
      setResult(res);
      setAnswers({}); // limpa o rascunho persistido
      if (res.show_result_to_employee && res.scores && res.profile_code) {
        setPhase('result');
      } else {
        setPhase('thanks');
      }
    } catch {
      // silencioso: mantém o botão ativo pra tentar de novo
      setSubmitting(false);
    }
  };

  // Registra a resposta do item atual (1..5). NÃO avança automaticamente:
  // com a barra arrastável o usuário ajusta o nível e depois toca em "Avançar".
  const selectAnswer = (value: number) => {
    const item = formItems[step];
    setAnswers({ ...answers, [item.id]: value });
  };

  // Ajuste 2: ao exibir uma pergunta sem resposta salva, grava Neutro (3) como
  // padrão. Roda apenas para a pergunta ATUAL (não pré-preenche em massa).
  // Só ativa na fase 'questions' para não disparar em outras fases.
  const currentItemId = phase === 'questions' ? formItems[step]?.id : undefined;
  useEffect(() => {
    if (currentItemId === undefined) return;
    if (answers[currentItemId] === undefined) {
      setAnswers((prev) => ({ ...prev, [currentItemId]: 3 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItemId]);

  // ── Render por fase ──────────────────────────────────────────────────────────
  let body: React.ReactNode = null;

  if (phase === 'loading') {
    body = (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  } else if (phase === 'error') {
    body = (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <Link2Off className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground max-w-xs">{tr.ui.loadError}</p>
      </div>
    );
  } else if (phase === 'alreadyHidden') {
    body = (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-500" />
        <h2 className="text-lg font-bold text-foreground">{tr.ui.alreadyDoneTitle}</h2>
        <p className="text-sm text-muted-foreground max-w-xs">{tr.ui.alreadyDoneLead}</p>
      </div>
    );
  } else if (phase === 'thanks') {
    body = (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-500" />
        <h2 className="text-lg font-bold text-foreground">{tr.ui.thanksTitle}</h2>
        <p className="text-sm text-muted-foreground max-w-xs">{tr.ui.thanksLead}</p>
      </div>
    );
  } else if (phase === 'result') {
    // Usa o resultado do submit (recém-respondido) ou o do payload (já respondido).
    const scores = (result?.scores ?? payload?.scores) as DiscScores | undefined;
    const profileCode = result?.profile_code ?? payload?.profile_code ?? undefined;
    body = scores && profileCode ? (
      <div className="py-2">
        <h2 className="mb-4 text-center text-lg font-bold text-foreground">{tr.ui.resultTitle}</h2>
        <DiscReport scores={scores} profileCode={profileCode} locale={locale} variant="full" />
      </div>
    ) : null;
  } else if (phase === 'intro') {
    body = (
      <div className="flex flex-col items-center justify-center gap-6 py-10 text-center px-2">
        {/* Emblema/ícone central — saturado, gradiente teal da marca, ícone branco */}
        <div
          className="flex h-20 w-20 items-center justify-center rounded-2xl shadow-lg ring-1 ring-white/40"
          style={{
            background: 'linear-gradient(135deg, #00C684 0%, #00C597 100%)',
            boxShadow: '0 10px 25px -5px rgba(0,198,132,0.45), 0 4px 10px -4px rgba(0,197,151,0.35)',
          }}
        >
          <Brain className="h-10 w-10 text-white" aria-hidden />
        </div>

        {/* Título grande e negrito */}
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight tracking-tight">
            {tr.ui.introTitle}
          </h2>
          {/* Linha accent curta sob o título */}
          <span
            className="h-1 w-12 rounded-full"
            style={{ background: brandColor ?? '#00C684' }}
          />
        </div>

        {/* Saudação com destaque */}
        {employeeName && (
          <p className="text-base font-semibold text-foreground">
            {tr.ui.greeting.replace('{name}', employeeName)}
          </p>
        )}

        {/* Bloco "Como funciona" — instruções curtas com ícones */}
        <div className="w-full max-w-sm rounded-2xl border border-border bg-muted/40 p-4 text-left">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
            <Sparkles className="h-4 w-4 shrink-0" style={{ color: brandColor ?? '#00C684' }} aria-hidden />
            {tr.ui.instructionsTitle}
          </p>
          <ul className="flex flex-col gap-2.5">
            <li className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
              <Brain className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <span>{tr.ui.instructionsHowto}</span>
            </li>
            <li className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
              <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <span>{tr.ui.instructionsDrag}</span>
            </li>
            <li className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <span>{tr.ui.instructionsHonest}</span>
            </li>
          </ul>
        </div>

        {/* Botão proeminente */}
        <Button
          type="button"
          size="lg"
          className="mt-1 h-14 px-10 text-base font-bold"
          style={brandColor ? { backgroundColor: brandColor, color: '#fff' } : undefined}
          onClick={() => setPhase('questions')}
        >
          {tr.ui.introStart}
        </Button>
      </div>
    );
  } else if (phase === 'questions') {
    const item = formItems[step];
    const itemText = tr.items[item.id as keyof typeof tr.items];
    const current = answers[item.id];
    const isLast = step === total - 1;
    const progressPct = Math.round(((step + 1) / total) * 100);

    body = (
      <div className="flex flex-col gap-5 py-4">
        {/* Barra de progresso */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{tr.ui.progress.replace('{current}', String(step + 1)).replace('{total}', String(total))}</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progressPct}%`, backgroundColor: brandColor || '#00C684' }}
            />
          </div>
        </div>

        {/* Afirmação */}
        <p className="min-h-[3.5rem] text-center text-lg font-semibold text-foreground">{itemText}</p>

        {/* Barra arrastável Likert 1–5 */}
        <DiscScaleSlider
          key={item.id}
          value={current}
          onChange={selectAnswer}
          labels={tr.scale}
          ariaLabel={itemText}
        />

        {/* Navegação */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            <ArrowLeft className="h-4 w-4" /> {tr.ui.back}
          </Button>
          {isLast ? (
            <Button
              type="button"
              className="gap-1.5"
              disabled={submitting}
              style={brandColor ? { backgroundColor: brandColor, color: '#fff' } : undefined}
              onClick={handleSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> {tr.ui.submitting}
                </>
              ) : (
                <>
                  {tr.ui.submit} <Check className="h-4 w-4" />
                </>
              )}
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
            >
              {tr.ui.next} <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <PublicPortalShell
      brandColor={brandColor}
      logoUrl={headerLogoUrl}
      title={employeeFullName ?? companyName}
      subtitle={tr.ui.introTitle}
    >
      {/*
        Imagem oculta usada apenas para detectar falha de carregamento da foto.
        O PublicPortalShell renderiza logoUrl como <img> sem onError — esta img
        espelha a mesma URL e dispara setPhotoError(true) quando 404 ou falha de rede,
        fazendo o shell trocar para o SVG de iniciais na próxima renderização.
      */}
      {photoUrl && !photoError && (
        <img
          key={photoUrl}
          src={photoUrl}
          alt=""
          aria-hidden
          className="sr-only"
          onError={() => setPhotoError(true)}
        />
      )}
      {body}
    </PublicPortalShell>
  );
}
