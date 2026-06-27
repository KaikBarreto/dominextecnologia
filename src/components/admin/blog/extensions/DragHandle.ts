import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state'

export const DragHandle = Extension.create({
  name: 'dragHandle',

  addProseMirrorPlugins() {
    let dragHandleEl: HTMLDivElement | null = null
    let draggingNode: { pos: number; node: any } | null = null

    return [
      new Plugin({
        key: new PluginKey('dragHandle'),
        view(editorView) {
          dragHandleEl = document.createElement('div')
          dragHandleEl.className = 'editor-drag-handle'
          dragHandleEl.draggable = true
          dragHandleEl.innerHTML = '⠿'
          dragHandleEl.style.cssText = `
            position: absolute;
            left: 0.25rem;
            font-size: 1.1rem;
            line-height: 1;
            color: hsl(142 10% 45% / 0.4);
            cursor: grab;
            user-select: none;
            z-index: 50;
            display: none;
            padding: 2px 4px;
            border-radius: 3px;
            transition: background 0.15s, color 0.15s;
          `

          dragHandleEl.addEventListener('mouseenter', () => {
            if (dragHandleEl) {
              dragHandleEl.style.color = 'hsl(142 10% 45% / 0.7)'
              dragHandleEl.style.background = 'hsl(142 20% 96%)'
            }
          })
          dragHandleEl.addEventListener('mouseleave', () => {
            if (dragHandleEl) {
              dragHandleEl.style.color = 'hsl(142 10% 45% / 0.4)'
              dragHandleEl.style.background = 'transparent'
            }
          })

          dragHandleEl.addEventListener('dragstart', (e) => {
            if (!draggingNode || !e.dataTransfer) return
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', '')

            const { pos } = draggingNode
            const resolvedPos = editorView.state.doc.resolve(pos)
            const sel = NodeSelection.create(editorView.state.doc, resolvedPos.pos)
            editorView.dispatch(editorView.state.tr.setSelection(sel))

            const domNode = editorView.nodeDOM(pos) as HTMLElement
            if (domNode) domNode.classList.add('is-dragging')
          })

          dragHandleEl.addEventListener('dragend', () => {
            editorView.dom.querySelectorAll('.is-dragging').forEach(el => {
              el.classList.remove('is-dragging')
            })
          })

          editorView.dom.parentElement?.appendChild(dragHandleEl)
          editorView.dom.parentElement!.style.position = 'relative'

          return {
            update() {},
            destroy() {
              dragHandleEl?.remove()
              dragHandleEl = null
            },
          }
        },
        props: {
          handleDOMEvents: {
            mousemove(view, event) {
              if (!dragHandleEl) return false

              const editorRect = view.dom.getBoundingClientRect()
              const mouseY = event.clientY

              const pos = view.posAtCoords({ left: editorRect.left + 20, top: mouseY })
              if (!pos) {
                dragHandleEl.style.display = 'none'
                return false
              }

              try {
                const resolved = view.state.doc.resolve(pos.pos)
                const depth = resolved.depth
                if (depth < 1) {
                  dragHandleEl.style.display = 'none'
                  return false
                }
                const topLevelPos = resolved.before(1)
                const topLevelNode = view.state.doc.nodeAt(topLevelPos)

                if (!topLevelNode) {
                  dragHandleEl.style.display = 'none'
                  return false
                }

                const domNode = view.nodeDOM(topLevelPos) as HTMLElement
                if (!domNode || !(domNode instanceof HTMLElement)) {
                  dragHandleEl.style.display = 'none'
                  return false
                }

                const nodeRect = domNode.getBoundingClientRect()
                const parentRect = view.dom.parentElement!.getBoundingClientRect()

                dragHandleEl.style.display = 'block'
                dragHandleEl.style.top = `${nodeRect.top - parentRect.top + (nodeRect.height / 2) - 8}px`

                draggingNode = { pos: topLevelPos, node: topLevelNode }
              } catch {
                dragHandleEl.style.display = 'none'
              }
              return false
            },
            mouseleave() {
              if (dragHandleEl) {
                dragHandleEl.style.display = 'none'
              }
              return false
            },
            drop(view, event) {
              if (!draggingNode) return false

              const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY })
              if (!dropPos) return false

              try {
                const { pos: fromPos, node } = draggingNode
                const resolved = view.state.doc.resolve(dropPos.pos)
                let toPos = resolved.before(1)

                if (toPos === fromPos) return false

                const tr = view.state.tr
                const nodeSize = node.nodeSize
                tr.delete(fromPos, fromPos + nodeSize)

                if (toPos > fromPos) {
                  toPos -= nodeSize
                }

                tr.insert(toPos, node)
                view.dispatch(tr)

                draggingNode = null
                event.preventDefault()
                return true
              } catch {
                return false
              }
            },
          },
        },
      }),
    ]
  },
})
