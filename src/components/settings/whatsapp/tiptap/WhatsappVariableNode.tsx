import { Node, mergeAttributes } from '@tiptap/core';
import { WHATSAPP_VARIABLE_NODE_NAME } from '@/lib/whatsappTemplateEditor';

/**
 * Etiqueta de variável do aviso de WhatsApp (ex.: nome do cliente).
 *
 * Nó inline e atômico: o backspace apaga a etiqueta inteira e o cursor não
 * entra nela. No texto guardado vira `{{chave}}`. É desenhado com DOM puro (sem
 * React) porque é só um selo: assim não precisa remontar a árvore a cada digitação.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    whatsappVariable: {
      insertWhatsappVariable: (variableKey: string) => ReturnType;
    };
  }
}

export interface WhatsappVariableStorage {
  /** Rótulos traduzidos por chave de variável. */
  labels: Record<string, string>;
  /** Chaves que valem para o aviso aberto; as demais ficam vermelhas. */
  allowedKeys: string[];
  /** Chamado quando o selo é clicado (ou acionado pelo teclado). */
  onVariableClick: ((info: WhatsappVariableClick) => void) | null;
}

export interface WhatsappVariableClick {
  pos: number;
  key: string;
  anchor: HTMLElement;
}

const BADGE_BASE = 'mx-0.5 inline-flex select-none items-center whitespace-nowrap rounded px-1.5 py-0.5 align-middle text-xs font-medium';
const BADGE_OK = `${BADGE_BASE} bg-primary text-primary-foreground`;
const BADGE_INVALID = `${BADGE_BASE} bg-destructive text-destructive-foreground`;

export const WhatsappVariableNode = Node.create<Record<string, never>, WhatsappVariableStorage>({
  name: WHATSAPP_VARIABLE_NODE_NAME,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addStorage() {
    return { labels: {}, allowedKeys: [], onVariableClick: null };
  },

  addAttributes() {
    return {
      variableKey: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-whatsapp-var') ?? '',
        renderHTML: (attrs) => (attrs.variableKey ? { 'data-whatsapp-var': attrs.variableKey as string } : {}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-whatsapp-var]',
        getAttrs: (el) => {
          if (typeof el === 'string') return false;
          const key = el.getAttribute('data-whatsapp-var');
          return key ? { variableKey: key } : false;
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const key = node.attrs.variableKey as string;
    return ['span', mergeAttributes(HTMLAttributes, { 'data-whatsapp-var': key }), `{{${key}}}`];
  },

  // Copiar e colar fora do editor leva o texto no formato guardado.
  renderText({ node }) {
    return `{{${node.attrs.variableKey as string}}}`;
  },

  addNodeView() {
    const storage = this.storage;
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('span');
      dom.contentEditable = 'false';
      dom.tabIndex = editor.isEditable ? 0 : -1;
      dom.setAttribute('role', 'button');
      dom.setAttribute('aria-haspopup', 'dialog');
      const open = () => {
        const pos = getPos();
        if (typeof pos !== 'number') return;
        storage.onVariableClick?.({ pos, key: dom.getAttribute('data-whatsapp-var') ?? '', anchor: dom });
      };
      dom.addEventListener('click', open);
      dom.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });
      const paint = (key: string) => {
        const allowed = storage.allowedKeys.length === 0 || storage.allowedKeys.includes(key);
        dom.className = allowed ? BADGE_OK : BADGE_INVALID;
        dom.setAttribute('data-whatsapp-var', key);
        dom.textContent = storage.labels[key] ?? key;
        dom.setAttribute('aria-label', dom.textContent);
      };
      paint(node.attrs.variableKey as string);
      return {
        dom,
        // Enter e Espaço na etiqueta abrem as ações; o editor não deve tratá-los.
        stopEvent: (event: Event) => event.type === 'keydown',
        update: (updated) => {
          if (updated.type.name !== WHATSAPP_VARIABLE_NODE_NAME) return false;
          paint(updated.attrs.variableKey as string);
          return true;
        },
      };
    };
  },

  addCommands() {
    return {
      insertWhatsappVariable:
        (variableKey: string) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { variableKey } }),
    };
  },
});
