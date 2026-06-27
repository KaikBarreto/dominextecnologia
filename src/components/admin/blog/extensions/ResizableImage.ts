import { Node, mergeAttributes } from '@tiptap/core'

export interface ResizableImageOptions {
  inline: boolean
  allowBase64: boolean
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resizableImage: {
      setResizableImage: (options: { src: string; alt?: string; width?: number }) => ReturnType
    }
  }
}

export const ResizableImage = Node.create<ResizableImageOptions>({
  name: 'resizableImage',
  group: 'block',
  atom: true,
  draggable: true,

  addOptions() {
    return {
      inline: false,
      allowBase64: true,
    }
  },

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      width: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'img[src]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const { width, ...rest } = HTMLAttributes
    const style = width ? `width: ${width}px; max-width: 100%;` : 'max-width: 100%;'
    return ['img', mergeAttributes(rest, { style, draggable: 'false' })]
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const wrapper = document.createElement('div')
      wrapper.className = 'resizable-image-wrapper'
      wrapper.contentEditable = 'false'

      const img = document.createElement('img')
      img.src = node.attrs.src
      if (node.attrs.alt) img.alt = node.attrs.alt
      if (node.attrs.width) {
        img.style.width = `${node.attrs.width}px`
        img.style.maxWidth = '100%'
      } else {
        img.style.maxWidth = '100%'
      }
      img.draggable = false

      const handle = document.createElement('div')
      handle.className = 'resize-handle bottom-right'
      handle.style.display = 'none'

      wrapper.appendChild(img)
      wrapper.appendChild(handle)

      // Click to select
      wrapper.addEventListener('click', () => {
        wrapper.classList.toggle('selected', true)
        handle.style.display = 'block'

        const onClick = (e: MouseEvent) => {
          if (!wrapper.contains(e.target as HTMLElement)) {
            wrapper.classList.remove('selected')
            handle.style.display = 'none'
            document.removeEventListener('click', onClick)
          }
        }
        setTimeout(() => document.addEventListener('click', onClick), 0)
      })

      // Resize drag
      let startX = 0
      let startWidth = 0

      handle.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        startX = e.clientX
        startWidth = img.offsetWidth

        const onMouseMove = (ev: MouseEvent) => {
          const newWidth = Math.max(100, startWidth + (ev.clientX - startX))
          img.style.width = `${newWidth}px`
        }

        const onMouseUp = (ev: MouseEvent) => {
          document.removeEventListener('mousemove', onMouseMove)
          document.removeEventListener('mouseup', onMouseUp)
          const finalWidth = img.offsetWidth
          const pos = getPos()
          if (typeof pos === 'number') {
            editor.chain().focus().command(({ tr }) => {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                width: finalWidth,
              })
              return true
            }).run()
          }
        }

        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
      })

      return { dom: wrapper }
    }
  },

  addCommands() {
    return {
      setResizableImage: (options) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: options,
        })
      },
    }
  },
})
