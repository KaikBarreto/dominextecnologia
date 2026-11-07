const PERSISTENT_CONTROL_TYPES = new Set([
  'boolean',
  'conformidade',
  'select',
  'photo',
  'video',
  'signature',
]);

/**
 * Controles de toque permanecem visíveis depois da resposta. Esconder opções,
 * mídia ou assinatura atrás de um lápis adiciona uma etapa sem proteger dado
 * algum e dificulta corrigir um toque acidental em campo.
 */
export function keepsAnswerControlsVisible(question: {
  question_type: string;
  answer_types?: string[] | null;
}): boolean {
  const effectiveTypes = question.answer_types?.length
    ? question.answer_types
    : [question.question_type];
  return effectiveTypes.some((type) => PERSISTENT_CONTROL_TYPES.has(type));
}
