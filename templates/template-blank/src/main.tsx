import { App } from './app.js'

const root = document.getElementById('app')
if (root) {
  root.innerHTML = ''
  // In pure client mode, render directly
  const rendered = App()
  if (typeof rendered === 'object' && rendered !== null && 'tag' in rendered) {
    const el = document.createElement((rendered as { tag: string }).tag)
    el.textContent = 'Hello Nexil!'
    root.appendChild(el)
  }
}
