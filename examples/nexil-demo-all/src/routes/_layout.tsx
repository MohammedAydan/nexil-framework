import { element } from '@nexil/core'
import { Link, Slot } from '@nexil/core/router'

export default function Layout() {
  return element(
    'div',
    { class: 'min-h-screen flex flex-col bg-slate-950 text-slate-100' },
    element(
      'header',
      { class: 'sticky top-0 z-50 border-b border-slate-800 bg-slate-950/80 backdrop-blur' },
      element(
        'div',
        { class: 'mx-auto flex max-w-6xl items-center gap-6 px-6 py-4' },
        element('span', { class: 'text-xl font-black tracking-tight text-white' }, 'NEXIL', element('span', { class: 'text-cyan-400' }, '·DEMO')),
        element(
          'nav',
          { class: 'hidden gap-1 text-sm md:flex' },
          Link({ href: '/', children: 'Home', class: 'rounded-lg px-3 py-1.5 hover:bg-slate-800 hover:text-white' }),
          Link({ href: '/stores', children: 'Stores', class: 'rounded-lg px-3 py-1.5 hover:bg-slate-800 hover:text-white' }),
          Link({ href: '/context', children: 'Context', class: 'rounded-lg px-3 py-1.5 hover:bg-slate-800 hover:text-white' }),
          Link({ href: '/shop', children: 'Shop', class: 'rounded-lg px-3 py-1.5 hover:bg-slate-800 hover:text-white' }),
          Link({ href: '/cart', children: 'Cart', class: 'rounded-lg px-3 py-1.5 hover:bg-slate-800 hover:text-white' }),
          Link({ href: '/forms', children: 'Forms', class: 'rounded-lg px-3 py-1.5 hover:bg-slate-800 hover:text-white' }),
          Link({ href: '/media', children: 'Media', class: 'rounded-lg px-3 py-1.5 hover:bg-slate-800 hover:text-white' }),
          Link({ href: '/labs', children: 'Labs', class: 'rounded-lg px-3 py-1.5 hover:bg-slate-800 hover:text-white' }),
        ),
        element('div', { class: 'ml-auto flex items-center gap-3' },
          Link({ href: '/about', children: 'About', class: 'text-sm text-slate-400 hover:text-white' }),
          element('span', { class: 'rounded-full bg-cyan-500 px-2.5 py-1 text-xs font-bold text-slate-950' }, '0.2.4'),
        ),
      ),
      element(
        'div',
        { class: 'flex gap-2 overflow-x-auto border-t border-slate-800 px-6 py-2 text-xs md:hidden' },
        Link({ href: '/stores', children: 'Stores', class: 'whitespace-nowrap rounded bg-slate-800 px-2 py-1' }),
        Link({ href: '/shop', children: 'Shop', class: 'whitespace-nowrap rounded bg-slate-800 px-2 py-1' }),
        Link({ href: '/cart', children: 'Cart', class: 'whitespace-nowrap rounded bg-slate-800 px-2 py-1' }),
        Link({ href: '/forms', children: 'Forms', class: 'whitespace-nowrap rounded bg-slate-800 px-2 py-1' }),
      ),
    ),
    element('main', { class: 'mx-auto w-full max-w-6xl flex-1 px-6 py-8' }, Slot()),
    element(
      'footer',
      { class: 'border-t border-slate-800 bg-slate-900/50' },
      element(
        'div',
        { class: 'mx-auto max-w-6xl px-6 py-8 text-center' },
        element('p', { class: 'text-sm text-slate-400' }, 'Built with Nexil — HTML-first, resumable, zero-hydration.'),
        element(
          'div',
          { class: 'mt-3 flex justify-center gap-4 text-xs text-slate-500' },
          element('span', {}, 'Signals'),
          element('span', {}, '•'),
          element('span', {}, 'Stores'),
          element('span', {}, '•'),
          element('span', {}, 'Context'),
          element('span', {}, '•'),
          element('span', {}, 'Resumability'),
        ),
      ),
    ),
  )
}
