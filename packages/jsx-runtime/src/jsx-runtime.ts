export { Fragment, jsx, jsxDEV, jsxs, jsxsDEV } from './index.js'

export namespace JSX {
  export type Element = import('@mohammedaydan/core').Child
  export interface IntrinsicElements {
    [elementName: string]: Record<string, unknown>
  }
}
