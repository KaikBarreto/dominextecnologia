import { useEffect } from 'react';

/**
 * Trava global contra "soltar fora do alvo" no drag-and-drop.
 *
 * O problema que isso resolve: no HTML5 drag-and-drop nativo, quando o usuário
 * solta um card FORA de uma zona de drop (o vão entre colunas do kanban, o
 * cabeçalho da página, a sidebar), o browser aplica a ação PADRÃO dele — e a
 * ação padrão pra um arrasto que carrega `text/uri-list`/`Files` é NAVEGAR a
 * aba pra aquela URL. O app sai do ar, o usuário vê "a página atualizou" e o
 * card não mudou de coluna.
 *
 * E por que um card de lead carregaria uma URL? Porque `<img>` é arrastável por
 * padrão: se o arrasto começa em cima da foto do responsável, o Chrome enche o
 * dataTransfer com a URL da foto (provado no QA de 2026-09-24: o drop chegou
 * com `types=[text/uri-list, text/html, Files]`). O `draggable={false}` no
 * AvatarImage corta a origem; esta trava é a segunda camada — vale pra qualquer
 * arrasto de qualquer tela (kanban do CRM, agenda, cronograma PMOC, listas
 * reordenáveis), inclusive um arquivo arrastado de fora do navegador.
 *
 * Como funciona: se nenhum handler de dentro do app aceitou o drop
 * (`defaultPrevented === false`), marcamos `dropEffect = 'none'` (cursor de
 * "não pode soltar") e cancelamos o evento — o browser não navega e o `drop`
 * nem chega a disparar. Handler de coluna que já deu `preventDefault()` passa
 * intacto.
 *
 * Campo editável fica de fora: arrastar texto pra dentro de um input/textarea é
 * comportamento nativo legítimo e continua funcionando.
 *
 * Seguro de ser global porque o app não tem nenhum uploader por arrastar
 * arquivo (nada lê `dataTransfer.files`) — toda importação de arquivo passa por
 * `<input type="file">`.
 */
const EDITABLE_SELECTOR = 'input, textarea, [contenteditable=""], [contenteditable="true"]';

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(EDITABLE_SELECTOR);
}

export function StrayDropGuard() {
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      if (e.defaultPrevented || isEditableTarget(e.target)) return;
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      if (e.defaultPrevented || isEditableTarget(e.target)) return;
      e.preventDefault();
    };

    // Fase de bolha: os handlers do React (montados no container raiz) rodam
    // antes, então `defaultPrevented` já reflete quem aceitou o drop.
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  return null;
}
