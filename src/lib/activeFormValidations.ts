/**
 * Mantém apenas as validações dos formulários que pertencem à composição atual
 * da tela. Checklists podem mudar de chave após recarga/reordenação; o estado do
 * pai é acumulativo para preservar respostas durante o render, então entradas
 * antigas não podem participar do gate de finalização da OS.
 */
export function selectActiveFormValidations<T>(
  validations: Record<string, T>,
  activeKeys: ReadonlySet<string>,
): T[] {
  return Array.from(activeKeys).flatMap((key) => {
    const validation = validations[key];
    return validation === undefined ? [] : [validation];
  });
}
