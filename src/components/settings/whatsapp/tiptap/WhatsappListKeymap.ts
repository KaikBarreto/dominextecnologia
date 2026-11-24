import { Extension } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';

/**
 * Lista com marcadores do WhatsApp: é só uma linha que começa com `- `.
 * Não existe nó de lista no editor (linha = parágrafo), então as ações aqui
 * mexem no texto do começo do parágrafo.
 */
export const WHATSAPP_LIST_PREFIX = '- ';

export function paragraphStartsWithListPrefix(node: PmNode): boolean {
  const first = node.firstChild;
  return Boolean(first?.isText && first.text?.startsWith(WHATSAPP_LIST_PREFIX));
}

/** O parágrafo do cursor é um item de lista? (usado no estado ativo do botão) */
export function isCursorInWhatsappList(state: EditorState): boolean {
  const { $from } = state.selection;
  return $from.parent.type.name === 'paragraph' && paragraphStartsWithListPrefix($from.parent);
}

/**
 * Liga ou desliga o marcador nos parágrafos da seleção. Se todos os parágrafos
 * com texto já têm `- `, remove; senão acrescenta onde falta. Numa linha vazia
 * sozinha, acrescenta o marcador para o botão funcionar antes de digitar.
 */
export function toggleWhatsappList(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const { from, to } = state.selection;
  const paragraphs: Array<{ pos: number; node: PmNode }> = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'paragraph') paragraphs.push({ pos, node });
    return false;
  });
  if (paragraphs.length === 0) return false;

  const withText = paragraphs.filter(({ node }) => node.content.size > 0);
  const targets = withText.length > 0 ? withText : paragraphs;
  const allHave = targets.every(({ node }) => paragraphStartsWithListPrefix(node));

  if (dispatch) {
    const tr = state.tr;
    // De trás para frente: mexer num parágrafo não desloca os anteriores.
    for (const { pos, node } of [...targets].reverse()) {
      const has = paragraphStartsWithListPrefix(node);
      if (allHave) {
        tr.delete(pos + 1, pos + 1 + WHATSAPP_LIST_PREFIX.length);
      } else if (!has) {
        // Texto sem marcas: o marcador não pode herdar o negrito da linha.
        tr.insert(pos + 1, state.schema.text(WHATSAPP_LIST_PREFIX));
      }
    }
    dispatch(tr.scrollIntoView());
  }
  return true;
}

/**
 * Enter no fim de um item cria o próximo já com `- `. Enter num item vazio tira
 * o marcador e sai da lista. Em qualquer outro lugar, o Enter é o de sempre.
 */
export const WhatsappListKeymap = Extension.create({
  name: 'whatsappListKeymap',
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { state, view } = editor;
        const { selection } = state;
        if (!selection.empty) return false;
        const { $from } = selection;
        const paragraph = $from.parent;
        if (paragraph.type.name !== 'paragraph' || !paragraphStartsWithListPrefix(paragraph)) return false;
        if ($from.parentOffset !== paragraph.content.size) return false;

        const tr = state.tr;
        if (paragraph.textContent === WHATSAPP_LIST_PREFIX && paragraph.childCount === 1) {
          const start = $from.start();
          tr.delete(start, start + WHATSAPP_LIST_PREFIX.length);
        } else {
          tr.split($from.pos);
          tr.insert(tr.selection.from, state.schema.text(WHATSAPP_LIST_PREFIX));
        }
        view.dispatch(tr.scrollIntoView());
        return true;
      },
    };
  },
});
