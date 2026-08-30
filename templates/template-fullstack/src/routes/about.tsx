import { element } from '@nexil/core'

export default function AboutPage() {
  return element(
    'div',
    { class: 'space-y-4' },
    element('h1', { class: 'text-3xl font-bold' }, 'About Nexil'),
    element(
      'p',
      { class: 'text-slate-300' },
      'Nexil is designed for ultra-fast, zero-overhead web applications with full SSR streaming and resumability.',
    ),
  )
}
