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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Link2Off, Check, ArrowLeft, ArrowRight, CheckCircle2, Brain, MousePointerClick, Sparkles, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { PublicPortalShell } from '@/components/portal/PublicPortalShell';
import { StepTransition } from '@/components/ui/step-transition';
import { DiscReport } from '@/components/employees/disc/DiscReport';
import { DiscScaleSlider } from '@/components/employees/disc/DiscScaleSlider';
import { DiscChoiceSelect } from '@/components/employees/disc/DiscChoiceSelect';
import { extractShortCode } from '@/utils/prettyLinks';
import { usePersistedState } from '@/hooks/usePersistedState';
import { scoreAndClassify, type DiscScores } from '@/lib/disc/scoring';
import { selectFormItems } from '@/lib/disc/formSelection';
import { isChoiceItem, type DiscFactor } from '@/lib/disc/questions';
import { MESSAGES } from '@/lib/i18n/messages';
import { type LocaleCode } from '@/lib/i18n/locales';
import { generateDiscDossierPdf } from '@/utils/discDossierPdf';
import { openPdfInTab, openPendingPdfTab } from '@/utils/openPdfInTab';

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
  /** Se a empresa tem white-label. Gate do rodapé Dominex no PDF público. */
  white_label_enabled?: boolean | null;
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

  // Respostas sobrevivem a refresh (chave por code).
  // Escala (Likert) = número 1..5; alternativa (forced-choice) = LETRA do fator ('D'|'I'|'S'|'C').
  const [answers, setAnswers] = usePersistedState<Record<string, number | DiscFactor>>(
    `disc:answers:${code ?? 'none'}`,
    {},
  );
  const [step, setStep] = useState(0); // índice da afirmação atual
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DiscSubmitResult | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

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

  // ── Baixar o dossiê PDF (fase result) ────────────────────────────────────────
  // Idioma = locale já resolvido do payload (company_locale). Branding vem do
  // payload; numa tela pública de tenant não há marca Dominex, então tratamos
  // como white-label (marca do tenant). Abre a aba no gesto de clique.
  const handleDownloadPdf = async () => {
    const scores = (result?.scores ?? payload?.scores) as DiscScores | undefined;
    const profileCode = result?.profile_code ?? payload?.profile_code ?? undefined;
    if (!scores || !profileCode || !employeeFullName) return;

    const w = openPendingPdfTab((tr as any).dossier?.generating);
    setDownloadingPdf(true);
    try {
      const generatedAtLabel = new Intl.DateTimeFormat(
        locale === 'pt-br' ? 'pt-BR' : locale,
        { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' },
      ).format(new Date());
      const blob = await generateDiscDossierPdf({
        scores,
        profileCode,
        employeeName: employeeFullName,
        employeePosition: null,
        branding: {
          companyName: payload?.company_name ?? companyName,
          logoUrl: payload?.logo_url ?? null,
          // Segue o white-label real da empresa: se NÃO for white-label, o rodapé
          // Dominex aparece (mesma régua do PDF gerado pelo RH). Só some no white-label.
          isWhiteLabel: !!payload?.white_label_enabled,
        },
        locale,
        generatedAtLabel,
      });
      const slug =
        employeeFullName
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'funcionario';
      openPdfInTab(blob, `perfil-comportamental-${slug}`, w);
    } catch (err) {
      if (w && !w.closed) w.close();
      console.error('[DiscDossierPdf] falha ao gerar o dossiê (público):', err);
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Handler de Enter global (window) durante o passo de perguntas.
  // Avança pra próxima pergunta (ou envia na última). Ignora Enter se submitting.
  // O DiscScaleSlider não usa Enter (usa ←/→/Home/End/1-5), então não há conflito.
  const handleQuestionEnter = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      if (phase !== 'questions') return;
      if (submitting) return;
      const item = formItems[step];
      // Só avança se houver resposta registrada. Para escala, o Neutro (3) já foi
      // gravado ao entrar; para alternativa, exige uma opção escolhida (letra).
      if (answers[item.id] == null) return;
      e.preventDefault();
      const isLast = step === total - 1;
      if (isLast) {
        void handleSubmit();
      } else {
        setStep((s) => Math.min(total - 1, s + 1));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, submitting, step, total, formItems, answers],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleQuestionEnter);
    return () => window.removeEventListener('keydown', handleQuestionEnter);
  }, [handleQuestionEnter]);

  // Registra a resposta do item atual (escala 1..5 ou letra de fator). NÃO avança
  // automaticamente: o usuário ajusta e depois toca em "Avançar".
  const selectAnswer = (value: number) => {
    const item = formItems[step];
    setAnswers({ ...answers, [item.id]: value });
  };

  // Ajuste 2: ao exibir uma pergunta de ESCALA sem resposta salva, grava Neutro (3)
  // como padrão. Perguntas de ALTERNATIVA NÃO recebem default — exigem escolha
  // ativa. Roda apenas para a pergunta ATUAL (não pré-preenche em massa) e só na
  // fase 'questions'.
  const currentItem = phase === 'questions' ? formItems[step] : undefined;
  const currentItemId = currentItem?.id;
  const currentIsChoice = currentItem ? isChoiceItem(currentItem) : false;
  useEffect(() => {
    if (currentItemId === undefined) return;
    if (currentIsChoice) return; // alternativa não tem valor neutro
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
    const dossierUi = (tr as any).dossier;
    body = scores && profileCode ? (
      <div>
        {/* Cabeçalho plano STICKY (sem barra verde): fica fixo no topo enquanto o
            relatório rola. No desktop, o "Ver PDF" fica inline aqui; no mobile,
            vira o FAB flutuante abaixo. */}
        <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-4 flex flex-col items-center gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:mx-0 lg:mt-0 lg:px-0">
          <h2 className="text-center text-lg font-bold text-foreground">{tr.ui.resultTitle}</h2>
          <Button
            type="button"
            variant="outline"
            className="hidden gap-2 lg:inline-flex"
            disabled={downloadingPdf}
            onClick={handleDownloadPdf}
          >
            {downloadingPdf ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            {downloadingPdf ? dossierUi?.generating : dossierUi?.downloadPdf}
          </Button>
        </div>
        <DiscReport scores={scores} profileCode={profileCode} locale={locale} variant="full" />

        {/* FAB "Ver PDF" — mobile, flutuante no canto inferior direito, acima do rodapé */}
        <button
          type="button"
          aria-label={dossierUi?.downloadPdf}
          disabled={downloadingPdf}
          onClick={handleDownloadPdf}
          className="lg:hidden fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-50 flex items-center gap-2 rounded-2xl px-4 py-3 shadow-lg transition-all active:scale-95 disabled:opacity-60"
          style={{ backgroundColor: brandColor || '#00C684' }}
        >
          {downloadingPdf ? (
            <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden />
          ) : (
            <Eye className="h-5 w-5 text-white" aria-hidden />
          )}
          <span className="text-sm font-bold text-white">
            {downloadingPdf ? dossierUi?.generating : dossierUi?.downloadPdf}
          </span>
        </button>
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
              <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <span>{tr.ui.instructionsChoice}</span>
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
    const current = answers[item.id];
    const isLast = step === total - 1;
    const isChoice = isChoiceItem(item);
    // Item respondido? Escala tem número (Neutro-default garante); alternativa
    // exige letra escolhida. `!= null` cobre os dois tipos.
    const answered = current != null;
    const progressPct = Math.round(((step + 1) / total) * 100);

    body = (
      /*
       * Layout de perguntas:
       * 1. Barra de progresso: fixa no TOPO do conteúdo (não centralizada).
       * 2. Miolo (enunciado + controle de resposta): centralizado verticalmente
       *    no espaço restante.
       * 3. Navegação desktop: inline (hidden no mobile).
       * 4. FABs mobile: fixed nos cantos inferiores (lg:hidden), definidos
       *    abaixo como JSX separado e adicionados via fragment.
       *
       * Padding-bottom em mobile: pb-24 no miolo garante que nada fique
       * escondido atrás dos FABs fixos.
       */
      <>
        {/* ── Cabeçalho PADRÃO (sem a parte verde/colorida do topo) ── */}
        <div className="pt-4 pb-1 text-center">
          <h1 className="text-lg font-bold text-foreground leading-snug">{tr.ui.introTitle}</h1>
          <div
            className="mx-auto mt-2 h-1 w-10 rounded-full"
            style={{ backgroundColor: brandColor || '#00C684' }}
          />
        </div>

        {/* ── GRUPO CENTRALIZADO: progresso + pergunta + resposta juntos e
             centralizados verticalmente no espaço restante (mobile). O pb generoso
             garante que nada fique escondido atrás dos FABs + rodapé sticky. ── */}
        <div className="flex flex-col justify-center min-h-[calc(100dvh-170px)] lg:min-h-0 pb-24 lg:pb-0">
          {/* Progresso — colado à pergunta */}
          <div className="space-y-2 pb-4">
            <div className="flex items-center justify-between text-sm font-semibold text-muted-foreground">
              <span>{tr.ui.progress.replace('{current}', String(step + 1)).replace('{total}', String(total))}</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-3.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progressPct}%`, backgroundColor: brandColor || '#00C684' }}
              />
            </div>
          </div>

          <StepTransition
            stepKey={`q-${step}`}
            index={step}
            animateInitial
            className="flex flex-col gap-5"
          >
            {/* Pergunta: alternativa (forced-choice) OU escala (Likert) */}
            {isChoice ? (
              <DiscChoiceSelect
                key={item.id}
                prompt={tr.choiceItems[item.id as keyof typeof tr.choiceItems].prompt}
                options={tr.choiceItems[item.id as keyof typeof tr.choiceItems].options}
                value={current as DiscFactor | undefined}
                onChange={(f) => setAnswers((a) => ({ ...a, [item.id]: f }))}
                seed={`${code ?? 'default'}|${item.id}`}
              />
            ) : (
              <>
                {/* Afirmação — grande e extrabold (foco da tela) */}
                <p className="min-h-[3.5rem] text-center text-2xl sm:text-3xl font-extrabold leading-snug text-foreground px-1">
                  {tr.items[item.id as keyof typeof tr.items]}
                </p>
                {/* Barra arrastável Likert 1–5 */}
                <DiscScaleSlider
                  key={item.id}
                  value={typeof current === 'number' ? current : undefined}
                  onChange={selectAnswer}
                  labels={tr.scale}
                  ariaLabel={tr.items[item.id as keyof typeof tr.items]}
                />
              </>
            )}

            {/* Navegação DESKTOP — inline, oculta no mobile */}
            <div className="hidden lg:flex items-center justify-between gap-2 pt-1">
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
                  disabled={submitting || !answered}
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
                  disabled={!answered}
                  onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
                >
                  {tr.ui.next} <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </StepTransition>
        </div>

        {/* ── FABs MOBILE — fixed nos cantos inferiores, lg:hidden ── */}
        {/* Voltar: canto inferior esquerdo, vermelho (destructive) */}
        {step > 0 && (
          <button
            type="button"
            aria-label={tr.ui.back}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="lg:hidden fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-4 z-50 flex items-center gap-2 rounded-2xl bg-destructive px-4 py-3 shadow-lg active:scale-95 transition-transform"
          >
            <ArrowLeft className="h-5 w-5 text-white" aria-hidden />
            <span className="text-sm font-bold text-white">{tr.ui.back}</span>
          </button>
        )}
        {/* Avançar / Enviar: canto inferior direito, verde (emerald) */}
        {isLast ? (
          <button
            type="button"
            aria-label={submitting ? tr.ui.submitting : tr.ui.submit}
            disabled={submitting || !answered}
            onClick={handleSubmit}
            className="lg:hidden fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-50 flex items-center gap-2 rounded-2xl px-4 py-3 shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: answered && !submitting ? (brandColor || '#00C684') : undefined }}
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 text-white animate-spin" aria-hidden />
                <span className="text-sm font-bold text-white">{tr.ui.submitting}</span>
              </>
            ) : (
              <>
                <span className="text-sm font-bold text-white">{tr.ui.submit}</span>
                <Check className="h-5 w-5 text-white" aria-hidden />
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            aria-label={tr.ui.next}
            disabled={!answered}
            onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
            className="lg:hidden fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-50 flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 shadow-lg transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="text-sm font-bold text-white">{tr.ui.next}</span>
            <ArrowRight className="h-5 w-5 text-white" aria-hidden />
          </button>
        )}
      </>
    );
  }

  // ── Configuração do header por fase ──────────────────────────────────────────
  // intro (capa) E questions: SEM o header verde/branded do shell — a capa tem o
  //   hero próprio, e a fase de perguntas usa um cabeçalho plano (sem cor) no corpo.
  // demais fases (thanks/result): header padrão do shell.
  const isIntro = phase === 'intro';
  const hideBrandedHeader =
    isIntro ||
    phase === 'questions' ||
    phase === 'result' ||
    phase === 'thanks' ||
    phase === 'alreadyHidden';
  const shellTitle = employeeFullName ?? companyName;
  const shellSubtitle = tr.ui.introTitle;

  return (
    <PublicPortalShell
      brandColor={brandColor}
      logoUrl={headerLogoUrl}
      title={shellTitle}
      subtitle={shellSubtitle}
      hideHeader={hideBrandedHeader}
      alwaysShowFooter
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
