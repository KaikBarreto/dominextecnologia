import { Node, mergeAttributes } from '@tiptap/core'

export const InfographicNode = Node.create({
  name: 'infographic',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      html: { default: '' },
      caption: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-infographic]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const dom = document.createElement('div')
    Object.entries(mergeAttributes(HTMLAttributes, { 'data-infographic': '' })).forEach(([k, v]) => {
      if (v !== undefined && v !== null) dom.setAttribute(k, String(v))
    })
    dom.innerHTML = node.attrs.html || ''
    return { dom }
  },

  addNodeView() {
    return ({ node }) => {
      const wrapper = document.createElement('div')
      wrapper.className = 'infographic-block'
      wrapper.setAttribute('data-infographic', '')
      wrapper.innerHTML = node.attrs.html

      if (node.attrs.caption) {
        const cap = document.createElement('p')
        cap.className = 'infographic-caption text-sm text-center text-muted-foreground mt-2 italic'
        cap.textContent = node.attrs.caption
        wrapper.appendChild(cap)
      }

      return { dom: wrapper }
    }
  },
})
