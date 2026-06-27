import { Node, mergeAttributes } from '@tiptap/core'

export const ColumnLayout = Node.create({
  name: 'columnLayout',
  group: 'block',
  content: 'column+',
  defining: true,

  addAttributes() {
    return {
      columns: { default: 2 },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-column-layout]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const cols = node.attrs.columns || 2
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-column-layout': '',
        style: `display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 1.5rem;`,
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setColumnLayout:
        (columns: number = 2) =>
        ({ commands }: any) => {
          const content: any[] = []
          for (let i = 0; i < columns; i++) {
            content.push({ type: 'column', content: [{ type: 'paragraph' }] })
          }
          return commands.insertContent({
            type: 'columnLayout',
            attrs: { columns },
            content,
          })
        },
    } as any
  },
})

export const Column = Node.create({
  name: 'column',
  group: '',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-column]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-column': '',
        style: 'min-width: 0;',
      }),
      0,
    ]
  },
})
