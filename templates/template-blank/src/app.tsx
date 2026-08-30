import { element } from 'nexil'
import { state } from 'nexil'

export function App() {
  const count = state(0)
  return element(
    'div',
    { class: 'container' },
    element('h1', {}, 'Welcome to Nexil'),
    element('p', {}, 'Ultra-fast, zero-VDOM, fine-grained reactive framework.'),
    element(
      'button',
      {
        onClick$: () => {
          count.set(count() + 1)
        },
      },
      `Count: ${count()}`,
    ),
  )
}
