export { Fragment, jsx, jsxs } from './index.js'

export namespace JSX {
  export type Element = import('@nexis/core').Child
  export interface IntrinsicElements {
    [elementName: string]: Record<string, unknown>
  }
}
