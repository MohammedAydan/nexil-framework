import { describe, expect, it } from 'vitest'
import {
  createContext,
  createContextScope,
  element,
  provideContext,
  text,
} from '../../packages/nexil/src/index.js'
import { renderToString } from '../../packages/nexil/src/server/index.js'

describe('Context provider semantics (§3, §4)', () => {
  it('3.1 missing Provider => defaultValue', () => {
    const Ctx = createContext<string>('default')
    expect(Ctx.use()).toBe('default')
    expect(Ctx.Provider({ value: 'x', children: () => text(Ctx.use()) })).toEqual(text('x'))
    expect(Ctx.use()).toBe('default')
  })
  it('3.3 nearest wins', () => {
    const Ctx = createContext<string>('root')
    const out = renderToString(
      Ctx.Provider({
        value: 'root',
        children: () =>
          element('div', {}, [
            text(Ctx.use()),
            Ctx.Provider({ value: 'layout', children: () => element('span', {}, text(Ctx.use())) }),
            text(Ctx.use()),
          ]),
      }),
    )
    expect(out).toBe('<div>root<span>layout</span>root</div>')
  })
  it('3.4 explicit undefined', () => {
    const Ctx = createContext<string | undefined>('default')
    expect(Ctx.Provider({ value: undefined, children: () => Ctx.use() })).toBeUndefined()
  })
  it('3.5 explicit null', () => {
    const Ctx = createContext<string | null>('default')
    expect(Ctx.Provider({ value: null, children: () => Ctx.use() })).toBeNull()
  })
  it('two distinct Contexts independent', () => {
    const A = createContext<string>('a-default')
    const B = createContext<string>('b-default')
    const html = renderToString(
      A.Provider({
        value: 'a1',
        children: () =>
          B.Provider({
            value: 'b1',
            children: () => element('div', {}, [text(A.use()), text(B.use())]),
          }),
      }),
    )
    expect(html).toBe('<div>a1b1</div>')
  })
})
