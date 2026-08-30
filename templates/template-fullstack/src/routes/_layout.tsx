import { element } from '@nexil/core'
import { Link, Slot } from 'nexil/router'

export default function Layout() {
  return element(
    'div',
    { class: 'min-h-screen flex flex-col' },
    element(
      'header',
      { class: 'p-4 border-b border-slate-700 flex gap-4 items-center' },
      element('span', { class: 'font-bold text-xl text-indigo-400' }, 'Nexil Fullstack'),
      Link({ href: '/', children: 'Home', class: 'hover:text-indigo-300' }),
      Link({ href: '/about', children: 'About', class: 'hover:text-indigo-300' }),
      Link({ href: '/items/42', children: 'Sample Item', class: 'hover:text-indigo-300' }),
    ),
    element('main', { class: 'flex-1 p-6 max-w-4xl mx-auto w-full' }, Slot()),
    element(
      'footer',
      { class: 'p-4 border-t border-slate-700 text-center text-sm text-slate-400' },
      'Built with Nexil',
    ),
  )
}
