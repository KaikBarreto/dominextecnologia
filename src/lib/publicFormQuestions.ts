/**
 * Régua única das PERGUNTAS personalizadas do formulário público
 * (`public_form_questions`), compartilhada por:
 *   - o construtor na área logada (tenant monta o formulário);
 *   - a página pública `/cadastro/:code`;
 *   - a seção "Formulários" do Portal do Cliente.
 *
 * O servidor valida de novo, sempre (`public.validate_public_form_answers`): o
 * que está aqui é UX, não segurança. Mas as duas réguas precisam dizer a MESMA
 * coisa, senão o visitante preenche, envia e leva um erro genérico do banco sem
 * saber qual campo consertar. Por isso os tetos abaixo são cópia fiel dos que a
 * migration 20261109210000 aplica.
 */

import {
  Type, AlignLeft, Hash, CheckSquare, ListChecks, List, Calendar, Camera,
  PenLine, Star, type LucideIcon,
} from 'lucide-react';

export const PUBLIC_FORM_QUESTION_TYPES_VALUES = [
  'text', 'textarea', 'number', 'boolean', 'select',
  'multiselect', 'date', 'photo', 'signature', 'rating',
] as const;

export type PublicFormQuestionType = typeof PUBLIC_FORM_QUESTION_TYPES_VALUES[number];

export interface PublicFormQuestionTypeMeta {
  value: PublicFormQuestionType;
  /** Rótulo do construtor (área logada). Segue o padrão de `QUESTION_TYPES` do checklist. */
  label: string;
  icon: LucideIcon;
  /** Tipos que exigem a lista de alternativas preenchida. */
  hasOptions: boolean;
  /** Tipos cuja resposta é uma URL de arquivo no nosso Storage. */
  isUpload: boolean;
}

export const PUBLIC_FORM_QUESTION_TYPES: PublicFormQuestionTypeMeta[] = [
  { value: 'text', label: 'Texto curto', icon: Type, hasOptions: false, isUpload: false },
  { value: 'textarea', label: 'Texto longo', icon: AlignLeft, hasOptions: false, isUpload: false },
  { value: 'number', label: 'Número', icon: Hash, hasOptions: false, isUpload: false },
  { value: 'boolean', label: 'Sim/Não', icon: CheckSquare, hasOptions: false, isUpload: false },
  { value: 'select', label: 'Escolha única', icon: List, hasOptions: true, isUpload: false },
  { value: 'multiselect', label: 'Múltipla escolha', icon: ListChecks, hasOptions: true, isUpload: false },
  { value: 'date', label: 'Data', icon: Calendar, hasOptions: false, isUpload: false },
  { value: 'photo', label: 'Foto', icon: Camera, hasOptions: false, isUpload: true },
  { value: 'signature', label: 'Assinatura', icon: PenLine, hasOptions: false, isUpload: true },
  { value: 'rating', label: 'Nota (0 a 10)', icon: Star, hasOptions: false, isUpload: false },
];

export function getQuestionTypeMeta(type: string): PublicFormQuestionTypeMeta | undefined {
  return PUBLIC_FORM_QUESTION_TYPES.find((meta) => meta.value === type);
}

/** Shape que as RPCs públicas devolvem dentro de `form.questions`. */
export interface PublicFormQuestion {
  id: string;
  question: string;
  description: string | null;
  question_type: PublicFormQuestionType;
  options: string[];
  is_required: boolean;
  position: number;
}

/** Valor bruto que o formulário guarda em memória, por `question.id`. */
export type PublicFormAnswerValue = string | number | boolean | string[] | null | undefined;
export type PublicFormAnswers = Record<string, PublicFormAnswerValue>;

// ── Tetos — cópia fiel de `validate_public_form_answers` ─────────────────────
export const MAX_ANSWER_TEXT_LENGTH = 4000;
export const MAX_ANSWERS_PER_SUBMISSION = 100;
export const MAX_RATING = 10;
export const MIN_RATING = 0;
export const MAX_UPLOAD_URL_LENGTH = 600;
/** Prefixo público do nosso Storage. Foto e assinatura só aceitam URL daqui. */
export const STORAGE_PUBLIC_URL_PREFIX =
  'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/';

/**
 * Foto e assinatura são renderizadas depois no painel do tenant e em PDF, então
 * URL externa ou `data:` viraria phishing/XSS armazenado. O arquivo sobe antes
 * pela edge `lead-capture-upload-photo`, que devolve a `publicUrl` já no nosso
 * bucket; é essa URL, e só ela, que o envio aceita.
 */
export function isAllowedUploadUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > MAX_UPLOAD_URL_LENGTH) return false;
  if (value.includes('..')) return false;
  return value.startsWith(STORAGE_PUBLIC_URL_PREFIX);
}

export function isAnswerEmpty(value: PublicFormAnswerValue): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export interface AnswerValidationResult {
  ok: boolean;
  /** Mensagem PT-BR pronta pro usuário final. Vazia quando `ok`. */
  message: string;
  /** `question.id` do primeiro problema, pra destacar o campo na tela. */
  questionId: string | null;
}

const OK: AnswerValidationResult = { ok: true, message: '', questionId: null };

function fail(questionId: string, message: string): AnswerValidationResult {
  return { ok: false, message, questionId };
}

/**
 * Mesma ordem de verificação do servidor: obrigatório primeiro, depois formato.
 * Devolve só o PRIMEIRO problema: a tela destaca um campo por vez em vez de
 * despejar uma lista de erros em cima de quem está preenchendo no celular.
 */
export function validatePublicFormAnswers(
  questions: PublicFormQuestion[],
  answers: PublicFormAnswers,
): AnswerValidationResult {
  if (Object.keys(answers).length > MAX_ANSWERS_PER_SUBMISSION) {
    return { ok: false, message: 'Respostas inválidas.', questionId: null };
  }

  for (const question of questions) {
    const value = answers[question.id];
    const label = question.question;

    if (isAnswerEmpty(value)) {
      if (question.is_required) {
        return fail(question.id, `Responda: ${label}`);
      }
      continue;
    }

    switch (question.question_type) {
      case 'text':
      case 'textarea': {
        if (typeof value !== 'string') return fail(question.id, `Resposta inválida em: ${label}`);
        if (value.trim().length > MAX_ANSWER_TEXT_LENGTH) {
          return fail(question.id, `Resposta muito longa em: ${label}`);
        }
        break;
      }
      case 'number':
      case 'rating': {
        const parsed = typeof value === 'number'
          ? value
          // Vírgula decimal é o padrão de quem digita em PT-BR; o servidor
          // normaliza igual. Ver régua de vírgula em campo numérico.
          : Number(String(value).trim().replace(',', '.'));
        if (!Number.isFinite(parsed)) return fail(question.id, `Resposta inválida em: ${label}`);
        if (question.question_type === 'rating') {
          if (!Number.isInteger(parsed) || parsed < MIN_RATING || parsed > MAX_RATING) {
            return fail(question.id, `Dê uma nota de ${MIN_RATING} a ${MAX_RATING} em: ${label}`);
          }
        }
        break;
      }
      case 'boolean': {
        if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
          return fail(question.id, `Resposta inválida em: ${label}`);
        }
        break;
      }
      case 'date': {
        if (typeof value !== 'string') return fail(question.id, `Resposta inválida em: ${label}`);
        const iso = /^\d{4}-\d{2}-\d{2}/.test(value);
        const br = /^\d{2}\/\d{2}\/\d{4}$/.test(value);
        if (!iso && !br) return fail(question.id, `Data inválida em: ${label}`);
        break;
      }
      case 'select': {
        if (typeof value !== 'string' || !question.options.includes(value)) {
          return fail(question.id, `Escolha uma opção em: ${label}`);
        }
        break;
      }
      case 'multiselect': {
        if (!Array.isArray(value)) return fail(question.id, `Resposta inválida em: ${label}`);
        if (value.some((item) => !question.options.includes(item))) {
          return fail(question.id, `Escolha uma opção em: ${label}`);
        }
        break;
      }
      case 'photo':
      case 'signature': {
        if (!isAllowedUploadUrl(value)) {
          return fail(question.id, `Reenvie o arquivo em: ${label}`);
        }
        break;
      }
    }
  }

  return OK;
}

/**
 * Enxuga o que vai no `answers` do envio: tira pergunta não respondida (o
 * servidor rejeita chave desconhecida, mas chave vazia só suja o jsonb) e
 * normaliza número com vírgula.
 */
export function buildAnswersPayload(
  questions: PublicFormQuestion[],
  answers: PublicFormAnswers,
): Record<string, string | number | boolean | string[]> {
  const payload: Record<string, string | number | boolean | string[]> = {};
  for (const question of questions) {
    const value = answers[question.id];
    if (isAnswerEmpty(value)) continue;

    if (question.question_type === 'number' || question.question_type === 'rating') {
      payload[question.id] = typeof value === 'number'
        ? value
        : Number(String(value).trim().replace(',', '.'));
      continue;
    }
    if (question.question_type === 'boolean') {
      payload[question.id] = typeof value === 'boolean' ? value : value === 'true';
      continue;
    }
    if (question.question_type === 'multiselect') {
      payload[question.id] = Array.isArray(value) ? value : [];
      continue;
    }
    if (typeof value === 'string') {
      payload[question.id] = value.trim();
      continue;
    }
    // Sobra texto/data/escolha/arquivo, que o formulário sempre guarda como
    // string. Se vier outra coisa, a régua acima já reprovou antes de chegar aqui.
    payload[question.id] = value as string | number | boolean | string[];
  }
  return payload;
}

/** Normaliza o array cru da RPC, descartando pergunta de tipo desconhecido. */
export function parsePublicFormQuestions(raw: unknown): PublicFormQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const q = item as Record<string, unknown>;
      const type = typeof q.question_type === 'string' ? q.question_type : '';
      if (!getQuestionTypeMeta(type)) return null;
      return {
        id: String(q.id ?? ''),
        question: String(q.question ?? ''),
        description: typeof q.description === 'string' ? q.description : null,
        question_type: type as PublicFormQuestionType,
        options: Array.isArray(q.options) ? q.options.filter((o): o is string => typeof o === 'string') : [],
        is_required: q.is_required === true,
        position: Number(q.position ?? 0),
      } satisfies PublicFormQuestion;
    })
    .filter((q): q is PublicFormQuestion => !!q && q.id !== '')
    .sort((a, b) => a.position - b.position);
}
