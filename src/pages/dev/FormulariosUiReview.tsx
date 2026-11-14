/**
 * Review de UI dos Formulários personalizados (dev-only, `import.meta.env.DEV`).
 *
 * Mesma ideia das outras telas de `src/pages/dev/`: montar as superfícies reais
 * com dados de brinquedo, sem login e sem tocar no banco, pra conferir layout e
 * revisar no celular. Os componentes aqui são os MESMOS que rodam em produção,
 * não réplicas — se o visual divergir da tela real, é bug de dado, não de cópia.
 *
 * O que NÃO dá pra ver aqui: a aba Respostas (lê do banco pelo hook) e o envio
 * de verdade (RPC). Tudo o mais é fiel.
 */

import { useEffect, useState } from 'react';
import { ClipboardList, LayoutTemplate, Smartphone, UserRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { PublicFormQuestionField } from '@/components/forms/PublicFormQuestionField';
import { PublicFormQuestionsEditor } from '@/components/forms/PublicFormQuestionsEditor';
import { PortalFormsSection } from '@/components/portal/PortalFormsSection';
import { LeadCaptureFormDialog } from '@/components/customers/LeadCaptureFormDialog';
import type { PublicFormQuestionDraft } from '@/hooks/usePublicFormQuestions';
import type { PublicFormAnswers, PublicFormQuestion } from '@/lib/publicFormQuestions';
import type { CustomerPortalForm } from '@/utils/customerPortalApi';

// ── Dados de brinquedo ───────────────────────────────────────────────────────

const DEMO_QUESTIONS: PublicFormQuestion[] = [
  { id: 'q1', question: 'Qual o problema que você está enfrentando?', description: 'Descreva com suas palavras, sem pressa.', question_type: 'textarea', options: [], is_required: true, position: 1 },
  { id: 'q2', question: 'Em qual andar fica o equipamento?', description: null, question_type: 'number', options: [], is_required: false, position: 2 },
  { id: 'q3', question: 'O equipamento ainda liga?', description: null, question_type: 'boolean', options: [], is_required: true, position: 3 },
  { id: 'q4', question: 'Melhor turno para a visita', description: null, question_type: 'select', options: ['Manhã', 'Tarde', 'Noite'], is_required: true, position: 4 },
  { id: 'q5', question: 'Quais serviços você quer no orçamento?', description: 'Pode marcar mais de um.', question_type: 'multiselect', options: ['Limpeza', 'Recarga de gás', 'Instalação', 'Troca de peça'], is_required: false, position: 5 },
  { id: 'q6', question: 'Desde quando está assim?', description: null, question_type: 'date', options: [], is_required: false, position: 6 },
  { id: 'q7', question: 'Nome de quem vai receber o técnico', description: null, question_type: 'text', options: [], is_required: true, position: 7 },
  { id: 'q8', question: 'Foto do equipamento', description: 'Ajuda muito o técnico a se preparar.', question_type: 'photo', options: [], is_required: false, position: 8 },
  { id: 'q9', question: 'De 0 a 10, como foi o último atendimento?', description: null, question_type: 'rating', options: [], is_required: false, position: 9 },
  { id: 'q10', question: 'Assinatura do responsável', description: null, question_type: 'signature', options: [], is_required: false, position: 10 },
];

const DEMO_DRAFTS: PublicFormQuestionDraft[] = DEMO_QUESTIONS.slice(0, 6).map((q) => ({
  id: q.id,
  question: q.question,
  description: q.description,
  question_type: q.question_type,
  options: q.options,
  is_required: q.is_required,
}));

const DEMO_PORTAL_FORMS: CustomerPortalForm[] = [
  {
    id: 'f1',
    shortCode: 'abc123def456',
    title: 'Pesquisa de satisfação',
    description: 'Leva menos de um minuto e ajuda a gente a melhorar.',
    purpose: 'generic',
    successMessage: 'Obrigado! Sua opinião vai direto para a equipe.',
    questions: [DEMO_QUESTIONS[8], DEMO_QUESTIONS[0]],
  },
  {
    id: 'f2',
    shortCode: 'xyz789ghi012',
    title: 'Abertura de chamado detalhada',
    description: 'Conte o que está acontecendo para o técnico chegar preparado.',
    purpose: 'generic',
    successMessage: null,
    questions: DEMO_QUESTIONS.slice(0, 8),
  },
];

const PORTAL_TEXTS = {
  formsIntro: 'Formulários que a empresa disponibilizou para você.',
  formsFillCta: 'Preencher',
  formsBackToList: 'Voltar',
  formsSubmit: 'Enviar respostas',
  formsSubmitting: 'Enviando...',
  formsNoQuestions: 'Este formulário ainda não tem perguntas.',
  formsSuccessTitle: 'Respostas enviadas',
  formsSuccessDefault: 'Recebemos suas respostas. Obrigado!',
  formsErrorTitle: 'Não foi possível enviar',
  formsErrorUnavailable: 'Este formulário não está mais disponível.',
  formsErrorTooMany: 'Você já enviou este formulário há pouco. Tente novamente mais tarde.',
  formsErrorInvalid: 'Confira as respostas e tente de novo.',
  formsErrorGeneric: 'Tente novamente em instantes.',
  formsUploadWait: 'Aguarde o arquivo terminar de enviar.',
};

// ── Tela ─────────────────────────────────────────────────────────────────────

type Surface = 'builder' | 'editor' | 'publica' | 'portal';

function surfaceFromUrl(): Surface {
  const raw = new URLSearchParams(window.location.search).get('s');
  return raw === 'editor' || raw === 'publica' || raw === 'portal' ? raw : 'builder';
}

export default function FormulariosUiReview() {
  // A aba vem da URL (`?s=editor`) pra cada captura de tela ser uma navegação
  // limpa, sem depender de clique em cima de modal aberto.
  const [surface, setSurface] = useState<Surface>(surfaceFromUrl);
  const [answers, setAnswers] = useState<PublicFormAnswers>({});
  const [drafts, setDrafts] = useState<PublicFormQuestionDraft[]>(DEMO_DRAFTS);
  const [builderOpen, setBuilderOpen] = useState(() => surfaceFromUrl() === 'builder');

  // O acento preto do app logado vem do token `--primary` redefinido em
  // `[data-app]` (ligado pelo AppLayout). Esta tela roda FORA do shell, então
  // sem isso tudo sairia com o verde da marca, que é o sabor da landing, e o
  // review mentiria sobre a cor dos botões. Ver src/index.css, bloco [data-app].
  // Só a ÁREA LOGADA recebe o atributo. A página pública e o Portal do Cliente
  // rodam mesmo sem ele, com o verde da marca: ligar `data-app` nelas deixaria o
  // print bonito e mentiroso.
  const isAppSurface = surface === 'builder' || surface === 'editor';
  useEffect(() => {
    if (!isAppSurface) return;
    const root = document.documentElement;
    const had = root.hasAttribute('data-app');
    if (!had) root.setAttribute('data-app', '');
    return () => { if (!had) root.removeAttribute('data-app'); };
  }, [isAppSurface]);

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">Formulários personalizados, review de UI</h1>
          <p className="text-sm text-muted-foreground">
            Componentes reais com dados de brinquedo. Não toca no banco.
          </p>
        </header>

        <MobilePillTabs
          variant="underline"
          level="screen"
          tabs={[
            { value: 'builder', label: 'Construtor', icon: <LayoutTemplate className="h-4 w-4 shrink-0" /> },
            { value: 'editor', label: 'Editor de perguntas', icon: <ClipboardList className="h-4 w-4 shrink-0" /> },
            { value: 'publica', label: 'Link público', icon: <Smartphone className="h-4 w-4 shrink-0" /> },
            { value: 'portal', label: 'Portal do cliente', icon: <UserRound className="h-4 w-4 shrink-0" /> },
          ]}
          activeTab={surface}
          onTabChange={(value) => {
            setSurface(value as Surface);
            const url = new URL(window.location.href);
            url.searchParams.set('s', value);
            window.history.replaceState(null, '', url);
          }}
        />

        {surface === 'builder' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              O diálogo que abre em Clientes, em Formulários de captação. Três abas: campos de
              cadastro, perguntas e publicação.
            </p>
            {!builderOpen && (
              <Button onClick={() => setBuilderOpen(true)}>Abrir o construtor</Button>
            )}
            <LeadCaptureFormDialog
              open={builderOpen}
              onOpenChange={setBuilderOpen}
              form={null}
              isLoading={false}
              onSubmit={async () => {
                throw new Error('Review de UI: gravação desligada de propósito.');
              }}
            />
          </div>
        )}

        {surface === 'editor' && (
          <Card>
            <CardContent className="p-4">
              <PublicFormQuestionsEditor questions={drafts} onChange={setDrafts} />
            </CardContent>
          </Card>
        )}

        {surface === 'publica' && (
          <Card>
            <CardContent className="space-y-5 p-4 sm:p-6">
              <div>
                <h2 className="text-lg font-semibold">Abertura de chamado detalhada</h2>
                <p className="text-sm text-muted-foreground">
                  Os 10 tipos de pergunta, como o cliente final vê ao abrir o link.
                </p>
              </div>
              {DEMO_QUESTIONS.map((question) => (
                <PublicFormQuestionField
                  key={question.id}
                  question={question}
                  value={answers[question.id]}
                  onChange={(value) => setAnswers((prev) => ({ ...prev, [question.id]: value }))}
                  error={question.id === 'q7' ? 'Responda: Nome de quem vai receber o técnico' : null}
                />
              ))}
              <Button className="w-full">Enviar respostas</Button>
            </CardContent>
          </Card>
        )}

        {surface === 'portal' && (
          <Card>
            <CardContent className="p-4 sm:p-6">
              <PortalFormsSection
                token="review"
                sessionToken=""
                forms={DEMO_PORTAL_FORMS}
                lang="pt-br"
                t={PORTAL_TEXTS}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
