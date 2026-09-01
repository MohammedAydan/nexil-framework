import type { Child, ReadableSignal, Signal } from '../core/index.js'
import type { Store } from '../core/state.js'

/**
 * Wraps a value type T to allow raw values, readable signals, writable signals,
 * or reactive getter functions (() => T).
 */
export type MaybeSignal<T> = T | ReadableSignal<T> | Signal<T> | (() => T)

/**
 * Class list descriptor supporting strings, numbers, arrays, and conditional boolean maps.
 */
export type ClassValue =
  | string
  | number
  | boolean
  | undefined
  | null
  | { readonly [key: string]: boolean | number | string | undefined | null }
  | readonly ClassValue[]

/**
 * CSS style descriptor supporting inline style strings or CSS property maps.
 */
export type StyleValue =
  | string
  | Partial<CSSStyleDeclaration>
  | { readonly [key: string]: string | number | boolean | undefined | null }

/**
 * Resumable and standard event handler descriptor.
 * Supports standard event callbacks, { element, event } resumable context callbacks,
 * and string chunk/action identifier references.
 */
export type NexilEventHandler<E = Event, Target = HTMLElement> =
  | ((
      event: E & {
        readonly currentTarget: Target
        readonly target: Target
        readonly element: Target
      },
    ) => any)
  | ((context: {
      readonly element: Target
      readonly event?: E
      readonly [key: string]: unknown
    }) => any)
  | ((event: any) => any)
  | string

/**
 * Full DOM event mapping for both standard handlers and resumable $ suffixes.
 */
export interface NexilDOMEvents<T extends EventTarget = HTMLElement> {
  // Clipboard Events
  onCopy?: NexilEventHandler<ClipboardEvent, T>
  onCopy$?: NexilEventHandler<ClipboardEvent, T>
  onCut?: NexilEventHandler<ClipboardEvent, T>
  onCut$?: NexilEventHandler<ClipboardEvent, T>
  onPaste?: NexilEventHandler<ClipboardEvent, T>
  onPaste$?: NexilEventHandler<ClipboardEvent, T>

  // Composition Events
  onCompositionEnd?: NexilEventHandler<CompositionEvent, T>
  onCompositionEnd$?: NexilEventHandler<CompositionEvent, T>
  onCompositionStart?: NexilEventHandler<CompositionEvent, T>
  onCompositionStart$?: NexilEventHandler<CompositionEvent, T>
  onCompositionUpdate?: NexilEventHandler<CompositionEvent, T>
  onCompositionUpdate$?: NexilEventHandler<CompositionEvent, T>

  // Focus Events
  onFocus?: NexilEventHandler<FocusEvent, T>
  onFocus$?: NexilEventHandler<FocusEvent, T>
  onBlur?: NexilEventHandler<FocusEvent, T>
  onBlur$?: NexilEventHandler<FocusEvent, T>
  onFocusIn?: NexilEventHandler<FocusEvent, T>
  onFocusIn$?: NexilEventHandler<FocusEvent, T>
  onFocusOut?: NexilEventHandler<FocusEvent, T>
  onFocusOut$?: NexilEventHandler<FocusEvent, T>

  // Form Events
  onChange?: NexilEventHandler<Event, T>
  onChange$?: NexilEventHandler<Event, T>
  onInput?: NexilEventHandler<InputEvent, T>
  onInput$?: NexilEventHandler<InputEvent, T>
  onBeforeInput?: NexilEventHandler<InputEvent, T>
  onBeforeInput$?: NexilEventHandler<InputEvent, T>
  onReset?: NexilEventHandler<Event, T>
  onReset$?: NexilEventHandler<Event, T>
  onSubmit?: NexilEventHandler<SubmitEvent, T>
  onSubmit$?: NexilEventHandler<SubmitEvent, T>
  onInvalid?: NexilEventHandler<Event, T>
  onInvalid$?: NexilEventHandler<Event, T>

  // Media & Resource Events
  onLoad?: NexilEventHandler<Event, T>
  onLoad$?: NexilEventHandler<Event, T>
  onError?: NexilEventHandler<Event, T>
  onError$?: NexilEventHandler<Event, T>

  // Keyboard Events
  onKeyDown?: NexilEventHandler<KeyboardEvent, T>
  onKeyDown$?: NexilEventHandler<KeyboardEvent, T>
  onKeyPress?: NexilEventHandler<KeyboardEvent, T>
  onKeyPress$?: NexilEventHandler<KeyboardEvent, T>
  onKeyUp?: NexilEventHandler<KeyboardEvent, T>
  onKeyUp$?: NexilEventHandler<KeyboardEvent, T>

  // Mouse Events
  onClick?: NexilEventHandler<MouseEvent, T>
  onClick$?: NexilEventHandler<MouseEvent, T>
  onContextMenu?: NexilEventHandler<MouseEvent, T>
  onContextMenu$?: NexilEventHandler<MouseEvent, T>
  onDblClick?: NexilEventHandler<MouseEvent, T>
  onDblClick$?: NexilEventHandler<MouseEvent, T>
  onDoubleClick?: NexilEventHandler<MouseEvent, T>
  onDoubleClick$?: NexilEventHandler<MouseEvent, T>
  onDrag?: NexilEventHandler<DragEvent, T>
  onDrag$?: NexilEventHandler<DragEvent, T>
  onDragEnd?: NexilEventHandler<DragEvent, T>
  onDragEnd$?: NexilEventHandler<DragEvent, T>
  onDragEnter?: NexilEventHandler<DragEvent, T>
  onDragEnter$?: NexilEventHandler<DragEvent, T>
  onDragExit?: NexilEventHandler<DragEvent, T>
  onDragExit$?: NexilEventHandler<DragEvent, T>
  onDragLeave?: NexilEventHandler<DragEvent, T>
  onDragLeave$?: NexilEventHandler<DragEvent, T>
  onDragOver?: NexilEventHandler<DragEvent, T>
  onDragOver$?: NexilEventHandler<DragEvent, T>
  onDragStart?: NexilEventHandler<DragEvent, T>
  onDragStart$?: NexilEventHandler<DragEvent, T>
  onDrop?: NexilEventHandler<DragEvent, T>
  onDrop$?: NexilEventHandler<DragEvent, T>
  onMouseDown?: NexilEventHandler<MouseEvent, T>
  onMouseDown$?: NexilEventHandler<MouseEvent, T>
  onMouseEnter?: NexilEventHandler<MouseEvent, T>
  onMouseEnter$?: NexilEventHandler<MouseEvent, T>
  onMouseLeave?: NexilEventHandler<MouseEvent, T>
  onMouseLeave$?: NexilEventHandler<MouseEvent, T>
  onMouseMove?: NexilEventHandler<MouseEvent, T>
  onMouseMove$?: NexilEventHandler<MouseEvent, T>
  onMouseOut?: NexilEventHandler<MouseEvent, T>
  onMouseOut$?: NexilEventHandler<MouseEvent, T>
  onMouseOver?: NexilEventHandler<MouseEvent, T>
  onMouseOver$?: NexilEventHandler<MouseEvent, T>
  onMouseUp?: NexilEventHandler<MouseEvent, T>
  onMouseUp$?: NexilEventHandler<MouseEvent, T>

  // Pointer Events
  onPointerDown?: NexilEventHandler<PointerEvent, T>
  onPointerDown$?: NexilEventHandler<PointerEvent, T>
  onPointerMove?: NexilEventHandler<PointerEvent, T>
  onPointerMove$?: NexilEventHandler<PointerEvent, T>
  onPointerUp?: NexilEventHandler<PointerEvent, T>
  onPointerUp$?: NexilEventHandler<PointerEvent, T>
  onPointerCancel?: NexilEventHandler<PointerEvent, T>
  onPointerCancel$?: NexilEventHandler<PointerEvent, T>
  onPointerEnter?: NexilEventHandler<PointerEvent, T>
  onPointerEnter$?: NexilEventHandler<PointerEvent, T>
  onPointerLeave?: NexilEventHandler<PointerEvent, T>
  onPointerLeave$?: NexilEventHandler<PointerEvent, T>
  onPointerOver?: NexilEventHandler<PointerEvent, T>
  onPointerOver$?: NexilEventHandler<PointerEvent, T>
  onPointerOut?: NexilEventHandler<PointerEvent, T>
  onPointerOut$?: NexilEventHandler<PointerEvent, T>
  onGotPointerCapture?: NexilEventHandler<PointerEvent, T>
  onGotPointerCapture$?: NexilEventHandler<PointerEvent, T>
  onLostPointerCapture?: NexilEventHandler<PointerEvent, T>
  onLostPointerCapture$?: NexilEventHandler<PointerEvent, T>

  // Touch Events
  onTouchCancel?: NexilEventHandler<TouchEvent, T>
  onTouchCancel$?: NexilEventHandler<TouchEvent, T>
  onTouchEnd?: NexilEventHandler<TouchEvent, T>
  onTouchEnd$?: NexilEventHandler<TouchEvent, T>
  onTouchMove?: NexilEventHandler<TouchEvent, T>
  onTouchMove$?: NexilEventHandler<TouchEvent, T>
  onTouchStart?: NexilEventHandler<TouchEvent, T>
  onTouchStart$?: NexilEventHandler<TouchEvent, T>

  // Scroll & Wheel Events
  onScroll?: NexilEventHandler<UIEvent, T>
  onScroll$?: NexilEventHandler<UIEvent, T>
  onScrollEnd?: NexilEventHandler<UIEvent, T>
  onScrollEnd$?: NexilEventHandler<UIEvent, T>
  onWheel?: NexilEventHandler<WheelEvent, T>
  onWheel$?: NexilEventHandler<WheelEvent, T>

  // Animation & Transition Events
  onAnimationStart?: NexilEventHandler<AnimationEvent, T>
  onAnimationStart$?: NexilEventHandler<AnimationEvent, T>
  onAnimationEnd?: NexilEventHandler<AnimationEvent, T>
  onAnimationEnd$?: NexilEventHandler<AnimationEvent, T>
  onAnimationIteration?: NexilEventHandler<AnimationEvent, T>
  onAnimationIteration$?: NexilEventHandler<AnimationEvent, T>
  onTransitionEnd?: NexilEventHandler<TransitionEvent, T>
  onTransitionEnd$?: NexilEventHandler<TransitionEvent, T>

  // Toggle & Dialog Events
  onToggle?: NexilEventHandler<Event, T>
  onToggle$?: NexilEventHandler<Event, T>
  onClose?: NexilEventHandler<Event, T>
  onClose$?: NexilEventHandler<Event, T>
  onCancel?: NexilEventHandler<Event, T>
  onCancel$?: NexilEventHandler<Event, T>
}

/**
 * Standard WAI-ARIA Attributes with reactive signal support.
 */
export interface AriaAttributes {
  'aria-activedescendant'?: MaybeSignal<string>
  'aria-atomic'?: MaybeSignal<boolean | 'true' | 'false'>
  'aria-autocomplete'?: MaybeSignal<'none' | 'inline' | 'list' | 'both'>
  'aria-busy'?: MaybeSignal<boolean | 'true' | 'false'>
  'aria-checked'?: MaybeSignal<boolean | 'false' | 'mixed' | 'true'>
  'aria-colcount'?: MaybeSignal<number>
  'aria-colindex'?: MaybeSignal<number>
  'aria-colspan'?: MaybeSignal<number>
  'aria-controls'?: MaybeSignal<string>
  'aria-current'?: MaybeSignal<
    boolean | 'false' | 'true' | 'page' | 'step' | 'location' | 'date' | 'time'
  >
  'aria-describedby'?: MaybeSignal<string>
  'aria-details'?: MaybeSignal<string>
  'aria-disabled'?: MaybeSignal<boolean | 'true' | 'false'>
  'aria-dropeffect'?: MaybeSignal<'none' | 'copy' | 'execute' | 'link' | 'move' | 'popup'>
  'aria-errormessage'?: MaybeSignal<string>
  'aria-expanded'?: MaybeSignal<boolean | 'true' | 'false'>
  'aria-flowto'?: MaybeSignal<string>
  'aria-grabbed'?: MaybeSignal<boolean | 'true' | 'false'>
  'aria-haspopup'?: MaybeSignal<
    boolean | 'false' | 'true' | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog'
  >
  'aria-hidden'?: MaybeSignal<boolean | 'true' | 'false'>
  'aria-invalid'?: MaybeSignal<boolean | 'false' | 'true' | 'grammar' | 'spelling'>
  'aria-keyshortcuts'?: MaybeSignal<string>
  'aria-label'?: MaybeSignal<string>
  'aria-labelledby'?: MaybeSignal<string>
  'aria-level'?: MaybeSignal<number>
  'aria-live'?: MaybeSignal<'off' | 'assertive' | 'polite'>
  'aria-modal'?: MaybeSignal<boolean | 'true' | 'false'>
  'aria-multiline'?: MaybeSignal<boolean | 'true' | 'false'>
  'aria-multiselectable'?: MaybeSignal<boolean | 'true' | 'false'>
  'aria-orientation'?: MaybeSignal<'horizontal' | 'vertical'>
  'aria-owns'?: MaybeSignal<string>
  'aria-placeholder'?: MaybeSignal<string>
  'aria-posinset'?: MaybeSignal<number>
  'aria-pressed'?: MaybeSignal<boolean | 'false' | 'mixed' | 'true'>
  'aria-readonly'?: MaybeSignal<boolean | 'true' | 'false'>
  'aria-relevant'?: MaybeSignal<
    'additions' | 'additions removals' | 'additions text' | 'all' | 'removals' | 'text'
  >
  'aria-required'?: MaybeSignal<boolean | 'true' | 'false'>
  'aria-roledescription'?: MaybeSignal<string>
  'aria-rowcount'?: MaybeSignal<number>
  'aria-rowindex'?: MaybeSignal<number>
  'aria-rowspan'?: MaybeSignal<number>
  'aria-selected'?: MaybeSignal<boolean | 'true' | 'false'>
  'aria-setsize'?: MaybeSignal<number>
  'aria-sort'?: MaybeSignal<'none' | 'ascending' | 'descending' | 'other'>
  'aria-valuemax'?: MaybeSignal<number>
  'aria-valuemin'?: MaybeSignal<number>
  'aria-valuenow'?: MaybeSignal<number>
  'aria-valuetext'?: MaybeSignal<string>
  [key: `aria-${string}`]: unknown
}

/**
 * Base HTML attributes supported on all standard HTML elements.
 */
export interface NexilHTMLAttributes<T extends HTMLElement = HTMLElement>
  extends AriaAttributes, NexilDOMEvents<T> {
  id?: MaybeSignal<string>
  class?: MaybeSignal<ClassValue>
  className?: MaybeSignal<ClassValue>
  style?: MaybeSignal<StyleValue>
  title?: MaybeSignal<string>
  lang?: MaybeSignal<string>
  dir?: MaybeSignal<'ltr' | 'rtl' | 'auto'>
  hidden?: MaybeSignal<boolean | 'hidden' | 'until-found'>
  tabIndex?: MaybeSignal<number>
  tabindex?: MaybeSignal<number>
  role?: MaybeSignal<string>
  accessKey?: MaybeSignal<string>
  accesskey?: MaybeSignal<string>
  contentEditable?: MaybeSignal<boolean | 'true' | 'false' | 'inherit' | 'plaintext-only'>
  contenteditable?: MaybeSignal<boolean | 'true' | 'false' | 'inherit' | 'plaintext-only'>
  contextMenu?: MaybeSignal<string>
  contextmenu?: MaybeSignal<string>
  draggable?: MaybeSignal<boolean | 'true' | 'false'>
  spellCheck?: MaybeSignal<boolean | 'true' | 'false'>
  spellcheck?: MaybeSignal<boolean | 'true' | 'false'>
  autoCapitalize?: MaybeSignal<
    'off' | 'none' | 'on' | 'sentences' | 'words' | 'characters' | string
  >
  autocapitalize?: MaybeSignal<
    'off' | 'none' | 'on' | 'sentences' | 'words' | 'characters' | string
  >
  slot?: MaybeSignal<string>
  translate?: MaybeSignal<'yes' | 'no'>
  inputMode?: MaybeSignal<
    'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url'
  >
  inputmode?: MaybeSignal<
    'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url'
  >
  enterKeyHint?: MaybeSignal<'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send'>
  enterkeyhint?: MaybeSignal<'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send'>
  is?: MaybeSignal<string>
  part?: MaybeSignal<string>
  nonce?: MaybeSignal<string>
  popover?: MaybeSignal<'auto' | 'manual' | boolean>

  // Nexil Framework Directives & Resumability Attributes
  'data-nx-bind'?: MaybeSignal<string>
  'data-nx-scope'?: MaybeSignal<string>
  'data-nx-form'?: MaybeSignal<string>
  'data-nx-csrf'?: MaybeSignal<string>
  'data-nx-submit-button'?: MaybeSignal<string>
  'data-nx-loading-text'?: MaybeSignal<string>
  // Nexil Fine-Grained Directives (resumable bindings)
  bindText$?: Signal<any> | ReadableSignal<any> | Store<any> | MaybeSignal<string | number>
  bindValue$?: Signal<string> | ReadableSignal<string> | Store<string> | MaybeSignal<string | number>
  bindChecked$?: Signal<boolean> | ReadableSignal<boolean> | Store<boolean> | MaybeSignal<boolean>
  bindDisabled$?: Signal<boolean> | ReadableSignal<boolean> | Store<boolean> | MaybeSignal<boolean>
  bindHidden$?: Signal<boolean> | ReadableSignal<boolean> | Store<boolean> | MaybeSignal<boolean>
  bindClass$?: Signal<ClassValue> | ReadableSignal<ClassValue> | Store<ClassValue> | MaybeSignal<ClassValue>
  bindStyle$?: Signal<StyleValue> | ReadableSignal<StyleValue> | Store<StyleValue> | MaybeSignal<StyleValue>
  bindHref$?: Signal<string> | ReadableSignal<string> | Store<string> | MaybeSignal<string>
  bindSrc$?: Signal<string> | ReadableSignal<string> | Store<string> | MaybeSignal<string>
  bindAriaLabel$?: Signal<string> | ReadableSignal<string> | Store<string> | MaybeSignal<string>
  'data-nx-state'?: MaybeSignal<string | number>
  [key: `data-${string}`]: unknown

  // JSX Child elements & Key
  children?: Child
  key?: string | number | null
}

// Concrete HTML Element Attribute Specifications

export interface NexilAnchorAttributes extends NexilHTMLAttributes<HTMLAnchorElement> {
  href?: MaybeSignal<string>
  target?: MaybeSignal<'_blank' | '_self' | '_parent' | '_top' | string>
  download?: MaybeSignal<string | boolean>
  rel?: MaybeSignal<string>
  ping?: MaybeSignal<string>
  referrerPolicy?: MaybeSignal<HTMLAttributeReferrerPolicy>
  referrerpolicy?: MaybeSignal<HTMLAttributeReferrerPolicy>
  type?: MaybeSignal<string>
  hreflang?: MaybeSignal<string>
  media?: MaybeSignal<string>
}

export interface NexilAreaAttributes extends NexilHTMLAttributes<HTMLAreaElement> {
  alt?: MaybeSignal<string>
  coords?: MaybeSignal<string>
  download?: MaybeSignal<string | boolean>
  href?: MaybeSignal<string>
  hreflang?: MaybeSignal<string>
  media?: MaybeSignal<string>
  ping?: MaybeSignal<string>
  referrerPolicy?: MaybeSignal<HTMLAttributeReferrerPolicy>
  referrerpolicy?: MaybeSignal<HTMLAttributeReferrerPolicy>
  rel?: MaybeSignal<string>
  shape?: MaybeSignal<'default' | 'rect' | 'circle' | 'poly'>
  target?: MaybeSignal<string>
}

export interface NexilAudioAttributes extends NexilHTMLAttributes<HTMLAudioElement> {
  src?: MaybeSignal<string>
  preload?: MaybeSignal<'none' | 'metadata' | 'auto' | ''>
  autoPlay?: MaybeSignal<boolean>
  autoplay?: MaybeSignal<boolean>
  loop?: MaybeSignal<boolean>
  muted?: MaybeSignal<boolean>
  controls?: MaybeSignal<boolean>
  crossOrigin?: MaybeSignal<'anonymous' | 'use-credentials' | ''>
  crossorigin?: MaybeSignal<'anonymous' | 'use-credentials' | ''>
}

export interface NexilBaseAttributes extends NexilHTMLAttributes<HTMLBaseElement> {
  href?: MaybeSignal<string>
  target?: MaybeSignal<string>
}

export interface NexilBlockquoteAttributes extends NexilHTMLAttributes<HTMLQuoteElement> {
  cite?: MaybeSignal<string>
}

export interface NexilButtonAttributes extends NexilHTMLAttributes<HTMLButtonElement> {
  type?: MaybeSignal<'button' | 'submit' | 'reset'>
  disabled?: MaybeSignal<boolean>
  form?: MaybeSignal<string>
  formAction?: MaybeSignal<string>
  formaction?: MaybeSignal<string>
  formEncType?: MaybeSignal<string>
  formenctype?: MaybeSignal<string>
  formMethod?: MaybeSignal<string>
  formmethod?: MaybeSignal<string>
  formNoValidate?: MaybeSignal<boolean>
  formnovalidate?: MaybeSignal<boolean>
  formTarget?: MaybeSignal<string>
  formtarget?: MaybeSignal<string>
  name?: MaybeSignal<string>
  value?: MaybeSignal<string | number>
  popoverTarget?: MaybeSignal<string>
  popovertarget?: MaybeSignal<string>
  popoverTargetAction?: MaybeSignal<'toggle' | 'show' | 'hide'>
  popovertargetaction?: MaybeSignal<'toggle' | 'show' | 'hide'>
}

export interface NexilCanvasAttributes extends NexilHTMLAttributes<HTMLCanvasElement> {
  width?: MaybeSignal<number | string>
  height?: MaybeSignal<number | string>
}

export interface NexilColAttributes extends NexilHTMLAttributes<HTMLTableColElement> {
  span?: MaybeSignal<number>
}

export interface NexilColGroupAttributes extends NexilHTMLAttributes<HTMLTableColElement> {
  span?: MaybeSignal<number>
}

export interface NexilDataAttributes extends NexilHTMLAttributes<HTMLDataElement> {
  value?: MaybeSignal<string | number>
}

export interface NexilDetailsAttributes extends NexilHTMLAttributes<HTMLDetailsElement> {
  open?: MaybeSignal<boolean>
  name?: MaybeSignal<string>
}

export interface NexilDialogAttributes extends NexilHTMLAttributes<HTMLDialogElement> {
  open?: MaybeSignal<boolean>
}

export interface NexilEmbedAttributes extends NexilHTMLAttributes<HTMLEmbedElement> {
  src?: MaybeSignal<string>
  type?: MaybeSignal<string>
  width?: MaybeSignal<number | string>
  height?: MaybeSignal<number | string>
}

export interface NexilFieldsetAttributes extends NexilHTMLAttributes<HTMLFieldSetElement> {
  disabled?: MaybeSignal<boolean>
  form?: MaybeSignal<string>
  name?: MaybeSignal<string>
}

export interface NexilFormAttributes extends NexilHTMLAttributes<HTMLFormElement> {
  action?: MaybeSignal<string | { readonly endpoint?: string }>
  method?: MaybeSignal<'get' | 'post' | 'dialog'>
  encType?: MaybeSignal<
    'application/x-www-form-urlencoded' | 'multipart/form-data' | 'text/plain' | string
  >
  enctype?: MaybeSignal<
    'application/x-www-form-urlencoded' | 'multipart/form-data' | 'text/plain' | string
  >
  target?: MaybeSignal<string>
  noValidate?: MaybeSignal<boolean>
  novalidate?: MaybeSignal<boolean>
  autoComplete?: MaybeSignal<string>
  autocomplete?: MaybeSignal<string>
  name?: MaybeSignal<string>
  rel?: MaybeSignal<string>
  acceptCharset?: MaybeSignal<string>
  acceptcharset?: MaybeSignal<string>
  csrfToken?: MaybeSignal<string>
}

export interface NexilHtmlAttributes extends NexilHTMLAttributes<HTMLHtmlElement> {
  manifest?: MaybeSignal<string>
}

export interface NexilIframeAttributes extends NexilHTMLAttributes<HTMLIFrameElement> {
  src?: MaybeSignal<string>
  srcDoc?: MaybeSignal<string>
  srcdoc?: MaybeSignal<string>
  name?: MaybeSignal<string>
  sandbox?: MaybeSignal<string>
  allow?: MaybeSignal<string>
  allowFullScreen?: MaybeSignal<boolean>
  allowfullscreen?: MaybeSignal<boolean>
  width?: MaybeSignal<number | string>
  height?: MaybeSignal<number | string>
  loading?: MaybeSignal<'lazy' | 'eager'>
  referrerPolicy?: MaybeSignal<HTMLAttributeReferrerPolicy>
  referrerpolicy?: MaybeSignal<HTMLAttributeReferrerPolicy>
}

export interface NexilImgAttributes extends NexilHTMLAttributes<HTMLImageElement> {
  src?: MaybeSignal<string>
  alt?: MaybeSignal<string>
  width?: MaybeSignal<number | string>
  height?: MaybeSignal<number | string>
  loading?: MaybeSignal<'lazy' | 'eager'>
  decoding?: MaybeSignal<'async' | 'auto' | 'sync'>
  srcSet?: MaybeSignal<string>
  srcset?: MaybeSignal<string>
  sizes?: MaybeSignal<string>
  crossOrigin?: MaybeSignal<'anonymous' | 'use-credentials' | ''>
  crossorigin?: MaybeSignal<'anonymous' | 'use-credentials' | ''>
  referrerPolicy?: MaybeSignal<HTMLAttributeReferrerPolicy>
  referrerpolicy?: MaybeSignal<HTMLAttributeReferrerPolicy>
  useMap?: MaybeSignal<string>
  usemap?: MaybeSignal<string>
  isMap?: MaybeSignal<boolean>
  ismap?: MaybeSignal<boolean>
  fetchPriority?: MaybeSignal<'high' | 'low' | 'auto'>
  fetchpriority?: MaybeSignal<'high' | 'low' | 'auto'>
}

export interface NexilInputAttributes extends NexilHTMLAttributes<HTMLInputElement> {
  type?: MaybeSignal<
    | 'text'
    | 'password'
    | 'checkbox'
    | 'radio'
    | 'submit'
    | 'button'
    | 'reset'
    | 'file'
    | 'hidden'
    | 'image'
    | 'datetime-local'
    | 'date'
    | 'month'
    | 'time'
    | 'week'
    | 'number'
    | 'range'
    | 'email'
    | 'url'
    | 'search'
    | 'tel'
    | 'color'
    | string
  >
  value?: MaybeSignal<string | number | readonly string[]>
  checked?: MaybeSignal<boolean>
  defaultChecked?: MaybeSignal<boolean>
  defaultValue?: MaybeSignal<string | number>
  disabled?: MaybeSignal<boolean>
  placeholder?: MaybeSignal<string>
  name?: MaybeSignal<string>
  readOnly?: MaybeSignal<boolean>
  readonly?: MaybeSignal<boolean>
  required?: MaybeSignal<boolean>
  autoFocus?: MaybeSignal<boolean>
  autofocus?: MaybeSignal<boolean>
  autoComplete?: MaybeSignal<string>
  autocomplete?: MaybeSignal<string>
  min?: MaybeSignal<number | string>
  max?: MaybeSignal<number | string>
  step?: MaybeSignal<number | string>
  pattern?: MaybeSignal<string>
  accept?: MaybeSignal<string>
  multiple?: MaybeSignal<boolean>
  maxLength?: MaybeSignal<number>
  maxlength?: MaybeSignal<number>
  minLength?: MaybeSignal<number>
  minlength?: MaybeSignal<number>
  size?: MaybeSignal<number>
  src?: MaybeSignal<string>
  alt?: MaybeSignal<string>
  width?: MaybeSignal<number | string>
  height?: MaybeSignal<number | string>
  list?: MaybeSignal<string>
  form?: MaybeSignal<string>
  formAction?: MaybeSignal<string>
  formaction?: MaybeSignal<string>
  formEncType?: MaybeSignal<string>
  formenctype?: MaybeSignal<string>
  formMethod?: MaybeSignal<string>
  formmethod?: MaybeSignal<string>
  formNoValidate?: MaybeSignal<boolean>
  formnovalidate?: MaybeSignal<boolean>
  formTarget?: MaybeSignal<string>
  formtarget?: MaybeSignal<string>
  capture?: MaybeSignal<boolean | 'user' | 'environment'>
  // Override to ensure bindValue$ is correctly typed for inputs (audit requirement)
  bindValue$?: Signal<string> | ReadableSignal<string> | Store<string> | MaybeSignal<string>
}

export interface NexilInsAttributes extends NexilHTMLAttributes<HTMLModElement> {
  cite?: MaybeSignal<string>
  dateTime?: MaybeSignal<string>
  datetime?: MaybeSignal<string>
}

export interface NexilDelAttributes extends NexilHTMLAttributes<HTMLModElement> {
  cite?: MaybeSignal<string>
  dateTime?: MaybeSignal<string>
  datetime?: MaybeSignal<string>
}

export interface NexilLabelAttributes extends NexilHTMLAttributes<HTMLLabelElement> {
  htmlFor?: MaybeSignal<string>
  for?: MaybeSignal<string>
  form?: MaybeSignal<string>
}

export interface NexilLiAttributes extends NexilHTMLAttributes<HTMLLIElement> {
  value?: MaybeSignal<number | string>
}

export interface NexilLinkAttributes extends NexilHTMLAttributes<HTMLLinkElement> {
  href?: MaybeSignal<string>
  rel?: MaybeSignal<string>
  as?: MaybeSignal<string>
  type?: MaybeSignal<string>
  crossOrigin?: MaybeSignal<'anonymous' | 'use-credentials' | ''>
  crossorigin?: MaybeSignal<'anonymous' | 'use-credentials' | ''>
  media?: MaybeSignal<string>
  sizes?: MaybeSignal<string>
  hreflang?: MaybeSignal<string>
  integrity?: MaybeSignal<string>
  referrerPolicy?: MaybeSignal<HTMLAttributeReferrerPolicy>
  referrerpolicy?: MaybeSignal<HTMLAttributeReferrerPolicy>
  fetchPriority?: MaybeSignal<'high' | 'low' | 'auto'>
  fetchpriority?: MaybeSignal<'high' | 'low' | 'auto'>
  title?: MaybeSignal<string>
  disabled?: MaybeSignal<boolean>
}

export interface NexilMapAttributes extends NexilHTMLAttributes<HTMLMapElement> {
  name?: MaybeSignal<string>
}

export interface NexilMetaAttributes extends NexilHTMLAttributes<HTMLMetaElement> {
  name?: MaybeSignal<string>
  content?: MaybeSignal<string>
  httpEquiv?: MaybeSignal<string>
  httpequiv?: MaybeSignal<string>
  charset?: MaybeSignal<string>
  property?: MaybeSignal<string>
  media?: MaybeSignal<string>
}

export interface NexilMeterAttributes extends NexilHTMLAttributes<HTMLMeterElement> {
  value?: MaybeSignal<number>
  min?: MaybeSignal<number>
  max?: MaybeSignal<number>
  low?: MaybeSignal<number>
  high?: MaybeSignal<number>
  optimum?: MaybeSignal<number>
  form?: MaybeSignal<string>
}

export interface NexilObjectAttributes extends NexilHTMLAttributes<HTMLObjectElement> {
  data?: MaybeSignal<string>
  type?: MaybeSignal<string>
  name?: MaybeSignal<string>
  form?: MaybeSignal<string>
  width?: MaybeSignal<number | string>
  height?: MaybeSignal<number | string>
  useMap?: MaybeSignal<string>
  usemap?: MaybeSignal<string>
}

export interface NexilOlAttributes extends NexilHTMLAttributes<HTMLOListElement> {
  reversed?: MaybeSignal<boolean>
  start?: MaybeSignal<number>
  type?: MaybeSignal<'1' | 'a' | 'A' | 'i' | 'I'>
}

export interface NexilOptgroupAttributes extends NexilHTMLAttributes<HTMLOptGroupElement> {
  disabled?: MaybeSignal<boolean>
  label?: MaybeSignal<string>
}

export interface NexilOptionAttributes extends NexilHTMLAttributes<HTMLOptionElement> {
  value?: MaybeSignal<string | number>
  disabled?: MaybeSignal<boolean>
  selected?: MaybeSignal<boolean>
  label?: MaybeSignal<string>
}

export interface NexilOutputAttributes extends NexilHTMLAttributes<HTMLOutputElement> {
  htmlFor?: MaybeSignal<string>
  for?: MaybeSignal<string>
  form?: MaybeSignal<string>
  name?: MaybeSignal<string>
}

export interface NexilParamAttributes extends NexilHTMLAttributes<HTMLParamElement> {
  name?: MaybeSignal<string>
  value?: MaybeSignal<string | number>
}

export interface NexilProgressAttributes extends NexilHTMLAttributes<HTMLProgressElement> {
  value?: MaybeSignal<number | string>
  max?: MaybeSignal<number | string>
}

export interface NexilQAttributes extends NexilHTMLAttributes<HTMLQuoteElement> {
  cite?: MaybeSignal<string>
}

export interface NexilScriptAttributes extends NexilHTMLAttributes<HTMLScriptElement> {
  src?: MaybeSignal<string>
  type?: MaybeSignal<string>
  async?: MaybeSignal<boolean>
  defer?: MaybeSignal<boolean>
  crossOrigin?: MaybeSignal<'anonymous' | 'use-credentials' | ''>
  crossorigin?: MaybeSignal<'anonymous' | 'use-credentials' | ''>
  integrity?: MaybeSignal<string>
  noModule?: MaybeSignal<boolean>
  nomodule?: MaybeSignal<boolean>
  referrerPolicy?: MaybeSignal<HTMLAttributeReferrerPolicy>
  referrerpolicy?: MaybeSignal<HTMLAttributeReferrerPolicy>
  fetchPriority?: MaybeSignal<'high' | 'low' | 'auto'>
  fetchpriority?: MaybeSignal<'high' | 'low' | 'auto'>
}

export interface NexilSelectAttributes extends NexilHTMLAttributes<HTMLSelectElement> {
  value?: MaybeSignal<string | number | readonly string[]>
  defaultValue?: MaybeSignal<string | number | readonly string[]>
  disabled?: MaybeSignal<boolean>
  multiple?: MaybeSignal<boolean>
  name?: MaybeSignal<string>
  required?: MaybeSignal<boolean>
  size?: MaybeSignal<number>
  autoFocus?: MaybeSignal<boolean>
  autofocus?: MaybeSignal<boolean>
  autoComplete?: MaybeSignal<string>
  autocomplete?: MaybeSignal<string>
  form?: MaybeSignal<string>
}

export interface NexilSlotAttributes extends NexilHTMLAttributes<HTMLSlotElement> {
  name?: MaybeSignal<string>
}

export interface NexilSourceAttributes extends NexilHTMLAttributes<HTMLSourceElement> {
  src?: MaybeSignal<string>
  srcSet?: MaybeSignal<string>
  srcset?: MaybeSignal<string>
  type?: MaybeSignal<string>
  media?: MaybeSignal<string>
  sizes?: MaybeSignal<string>
  width?: MaybeSignal<number | string>
  height?: MaybeSignal<number | string>
}

export interface NexilStyleAttributes extends NexilHTMLAttributes<HTMLStyleElement> {
  media?: MaybeSignal<string>
  nonce?: MaybeSignal<string>
  title?: MaybeSignal<string>
  blocking?: MaybeSignal<string>
}

export interface NexilTdAttributes extends NexilHTMLAttributes<HTMLTableCellElement> {
  colSpan?: MaybeSignal<number>
  colspan?: MaybeSignal<number>
  rowSpan?: MaybeSignal<number>
  rowspan?: MaybeSignal<number>
  headers?: MaybeSignal<string>
}

export interface NexilThAttributes extends NexilHTMLAttributes<HTMLTableCellElement> {
  colSpan?: MaybeSignal<number>
  colspan?: MaybeSignal<number>
  rowSpan?: MaybeSignal<number>
  rowspan?: MaybeSignal<number>
  headers?: MaybeSignal<string>
  scope?: MaybeSignal<'col' | 'row' | 'colgroup' | 'rowgroup' | string>
  abbr?: MaybeSignal<string>
}

export interface NexilTextareaAttributes extends NexilHTMLAttributes<HTMLTextAreaElement> {
  rows?: MaybeSignal<number>
  cols?: MaybeSignal<number>
  value?: MaybeSignal<string | number>
  defaultValue?: MaybeSignal<string | number>
  placeholder?: MaybeSignal<string>
  disabled?: MaybeSignal<boolean>
  readOnly?: MaybeSignal<boolean>
  readonly?: MaybeSignal<boolean>
  required?: MaybeSignal<boolean>
  name?: MaybeSignal<string>
  maxLength?: MaybeSignal<number>
  maxlength?: MaybeSignal<number>
  minLength?: MaybeSignal<number>
  minlength?: MaybeSignal<number>
  wrap?: MaybeSignal<'soft' | 'hard'>
  autoFocus?: MaybeSignal<boolean>
  autofocus?: MaybeSignal<boolean>
  autoComplete?: MaybeSignal<string>
  autocomplete?: MaybeSignal<string>
  form?: MaybeSignal<string>
}

export interface NexilTimeAttributes extends NexilHTMLAttributes<HTMLTimeElement> {
  dateTime?: MaybeSignal<string>
  datetime?: MaybeSignal<string>
}

export interface NexilTrackAttributes extends NexilHTMLAttributes<HTMLTrackElement> {
  kind?: MaybeSignal<'subtitles' | 'captions' | 'descriptions' | 'chapters' | 'metadata'>
  src?: MaybeSignal<string>
  srclang?: MaybeSignal<string>
  label?: MaybeSignal<string>
  default?: MaybeSignal<boolean>
}

export interface NexilVideoAttributes extends NexilHTMLAttributes<HTMLVideoElement> {
  src?: MaybeSignal<string>
  preload?: MaybeSignal<'none' | 'metadata' | 'auto' | ''>
  autoPlay?: MaybeSignal<boolean>
  autoplay?: MaybeSignal<boolean>
  loop?: MaybeSignal<boolean>
  muted?: MaybeSignal<boolean>
  controls?: MaybeSignal<boolean>
  crossOrigin?: MaybeSignal<'anonymous' | 'use-credentials' | ''>
  crossorigin?: MaybeSignal<'anonymous' | 'use-credentials' | ''>
  width?: MaybeSignal<number | string>
  height?: MaybeSignal<number | string>
  poster?: MaybeSignal<string>
  playsInline?: MaybeSignal<boolean>
  playsinline?: MaybeSignal<boolean>
  disablePictureInPicture?: MaybeSignal<boolean>
  disablepictureinpicture?: MaybeSignal<boolean>
  disableRemotePlayback?: MaybeSignal<boolean>
  disableremoteplayback?: MaybeSignal<boolean>
}

// SVG Element Attribute Specifications

/**
 * Base SVG presentation and structural attributes supporting dual camelCase and kebab-case.
 */
export interface NexilSVGAttributes<T extends SVGElement = SVGElement>
  extends AriaAttributes, NexilDOMEvents<T> {
  id?: MaybeSignal<string>
  class?: MaybeSignal<ClassValue>
  className?: MaybeSignal<ClassValue>
  style?: MaybeSignal<StyleValue>
  title?: MaybeSignal<string>
  lang?: MaybeSignal<string>
  tabIndex?: MaybeSignal<number>
  tabindex?: MaybeSignal<number>
  role?: MaybeSignal<string>

  // SVG Geometry & Presentation Attributes (Dual camelCase & kebab-case)
  x?: MaybeSignal<number | string>
  y?: MaybeSignal<number | string>
  cx?: MaybeSignal<number | string>
  cy?: MaybeSignal<number | string>
  r?: MaybeSignal<number | string>
  rx?: MaybeSignal<number | string>
  ry?: MaybeSignal<number | string>
  x1?: MaybeSignal<number | string>
  y1?: MaybeSignal<number | string>
  x2?: MaybeSignal<number | string>
  y2?: MaybeSignal<number | string>
  dx?: MaybeSignal<number | string>
  dy?: MaybeSignal<number | string>
  d?: MaybeSignal<string>
  points?: MaybeSignal<string>
  pathLength?: MaybeSignal<number | string>
  pathlength?: MaybeSignal<number | string>

  width?: MaybeSignal<number | string>
  height?: MaybeSignal<number | string>
  viewBox?: MaybeSignal<string>
  viewbox?: MaybeSignal<string>
  preserveAspectRatio?: MaybeSignal<string>
  preserveaspectratio?: MaybeSignal<string>

  fill?: MaybeSignal<string>
  fillOpacity?: MaybeSignal<number | string>
  'fill-opacity'?: MaybeSignal<number | string>
  fillRule?: MaybeSignal<'nonzero' | 'evenodd' | 'inherit'>
  'fill-rule'?: MaybeSignal<'nonzero' | 'evenodd' | 'inherit'>

  stroke?: MaybeSignal<string>
  strokeWidth?: MaybeSignal<number | string>
  'stroke-width'?: MaybeSignal<number | string>
  strokeLinecap?: MaybeSignal<'butt' | 'round' | 'square' | 'inherit'>
  'stroke-linecap'?: MaybeSignal<'butt' | 'round' | 'square' | 'inherit'>
  strokeLinejoin?: MaybeSignal<'miter' | 'round' | 'bevel' | 'inherit'>
  'stroke-linejoin'?: MaybeSignal<'miter' | 'round' | 'bevel' | 'inherit'>
  strokeMiterlimit?: MaybeSignal<number | string>
  'stroke-miterlimit'?: MaybeSignal<number | string>
  strokeDasharray?: MaybeSignal<string | number>
  'stroke-dasharray'?: MaybeSignal<string | number>
  strokeDashoffset?: MaybeSignal<string | number>
  'stroke-dashoffset'?: MaybeSignal<string | number>
  strokeOpacity?: MaybeSignal<number | string>
  'stroke-opacity'?: MaybeSignal<number | string>

  clipPath?: MaybeSignal<string>
  'clip-path'?: MaybeSignal<string>
  clipRule?: MaybeSignal<'nonzero' | 'evenodd' | 'inherit'>
  'clip-rule'?: MaybeSignal<'nonzero' | 'evenodd' | 'inherit'>

  mask?: MaybeSignal<string>
  filter?: MaybeSignal<string>
  transform?: MaybeSignal<string>
  transformOrigin?: MaybeSignal<string>
  'transform-origin'?: MaybeSignal<string>

  opacity?: MaybeSignal<number | string>
  color?: MaybeSignal<string>
  visibility?: MaybeSignal<'visible' | 'hidden' | 'collapse' | 'inherit'>
  overflow?: MaybeSignal<'visible' | 'hidden' | 'scroll' | 'auto' | 'inherit'>
  display?: MaybeSignal<string>

  xmlns?: MaybeSignal<string>
  xmlnsXlink?: MaybeSignal<string>
  'xmlns:xlink'?: MaybeSignal<string>
  href?: MaybeSignal<string>
  xlinkHref?: MaybeSignal<string>
  'xlink:href'?: MaybeSignal<string>

  gradientTransform?: MaybeSignal<string>
  gradienttransform?: MaybeSignal<string>
  gradientUnits?: MaybeSignal<'userSpaceOnUse' | 'objectBoundingBox'>
  gradientunits?: MaybeSignal<'userSpaceOnUse' | 'objectBoundingBox'>
  spreadMethod?: MaybeSignal<'pad' | 'reflect' | 'repeat'>
  spreadmethod?: MaybeSignal<'pad' | 'reflect' | 'repeat'>

  stopColor?: MaybeSignal<string>
  'stop-color'?: MaybeSignal<string>
  stopOpacity?: MaybeSignal<number | string>
  'stop-opacity'?: MaybeSignal<number | string>
  offset?: MaybeSignal<number | string>

  patternTransform?: MaybeSignal<string>
  patterntransform?: MaybeSignal<string>
  patternUnits?: MaybeSignal<'userSpaceOnUse' | 'objectBoundingBox'>
  patternunits?: MaybeSignal<'userSpaceOnUse' | 'objectBoundingBox'>
  patternContentUnits?: MaybeSignal<'userSpaceOnUse' | 'objectBoundingBox'>
  patterncontentunits?: MaybeSignal<'userSpaceOnUse' | 'objectBoundingBox'>

  markerWidth?: MaybeSignal<number | string>
  markerwidth?: MaybeSignal<number | string>
  markerHeight?: MaybeSignal<number | string>
  markerheight?: MaybeSignal<number | string>
  markerUnits?: MaybeSignal<'userSpaceOnUse' | 'strokeWidth'>
  markerunits?: MaybeSignal<'userSpaceOnUse' | 'strokeWidth'>
  orient?: MaybeSignal<string>
  refX?: MaybeSignal<number | string>
  refx?: MaybeSignal<number | string>
  refY?: MaybeSignal<number | string>
  refy?: MaybeSignal<number | string>

  textAnchor?: MaybeSignal<'start' | 'middle' | 'end' | 'inherit'>
  'text-anchor'?: MaybeSignal<'start' | 'middle' | 'end' | 'inherit'>
  fontSize?: MaybeSignal<number | string>
  'font-size'?: MaybeSignal<number | string>
  fontFamily?: MaybeSignal<string>
  'font-family'?: MaybeSignal<string>
  fontWeight?: MaybeSignal<number | string>
  'font-weight'?: MaybeSignal<number | string>
  letterSpacing?: MaybeSignal<number | string>
  'letter-spacing'?: MaybeSignal<number | string>
  dominantBaseline?: MaybeSignal<
    | 'auto'
    | 'text-bottom'
    | 'alphabetic'
    | 'ideographic'
    | 'middle'
    | 'central'
    | 'mathematical'
    | 'hanging'
    | 'text-top'
  >
  'dominant-baseline'?: MaybeSignal<
    | 'auto'
    | 'text-bottom'
    | 'alphabetic'
    | 'ideographic'
    | 'middle'
    | 'central'
    | 'mathematical'
    | 'hanging'
    | 'text-top'
  >

  // Nexil Framework Directives
  'data-nx-bind'?: MaybeSignal<string>
  'data-nx-scope'?: MaybeSignal<string>
  [key: `data-${string}`]: unknown

  // JSX Child elements & Key
  children?: Child
  key?: string | number | null
}

export type HTMLAttributeReferrerPolicy =
  | ''
  | 'no-referrer'
  | 'no-referrer-when-downgrade'
  | 'origin'
  | 'origin-when-cross-origin'
  | 'same-origin'
  | 'strict-origin'
  | 'strict-origin-when-cross-origin'
  | 'unsafe-url'

/**
 * Strict JSX Namespace specification without loose catch-all index signatures.
 */
export interface NexilIntrinsicElements {
  // Standard HTML5 Elements
  a: NexilAnchorAttributes
  abbr: NexilHTMLAttributes<HTMLElement>
  address: NexilHTMLAttributes<HTMLElement>
  area: NexilAreaAttributes
  article: NexilHTMLAttributes<HTMLElement>
  aside: NexilHTMLAttributes<HTMLElement>
  audio: NexilAudioAttributes
  b: NexilHTMLAttributes<HTMLElement>
  base: NexilBaseAttributes
  bdi: NexilHTMLAttributes<HTMLElement>
  bdo: NexilHTMLAttributes<HTMLElement>
  blockquote: NexilBlockquoteAttributes
  body: NexilHTMLAttributes<HTMLBodyElement>
  br: NexilHTMLAttributes<HTMLBRElement>
  button: NexilButtonAttributes
  canvas: NexilCanvasAttributes
  caption: NexilHTMLAttributes<HTMLTableCaptionElement>
  cite: NexilHTMLAttributes<HTMLElement>
  code: NexilHTMLAttributes<HTMLElement>
  col: NexilColAttributes
  colgroup: NexilColGroupAttributes
  data: NexilDataAttributes
  datalist: NexilHTMLAttributes<HTMLDataListElement>
  dd: NexilHTMLAttributes<HTMLElement>
  del: NexilDelAttributes
  details: NexilDetailsAttributes
  dfn: NexilHTMLAttributes<HTMLElement>
  dialog: NexilDialogAttributes
  div: NexilHTMLAttributes<HTMLDivElement>
  dl: NexilHTMLAttributes<HTMLDListElement>
  dt: NexilHTMLAttributes<HTMLElement>
  em: NexilHTMLAttributes<HTMLElement>
  embed: NexilEmbedAttributes
  fieldset: NexilFieldsetAttributes
  figcaption: NexilHTMLAttributes<HTMLElement>
  figure: NexilHTMLAttributes<HTMLElement>
  footer: NexilHTMLAttributes<HTMLElement>
  form: NexilFormAttributes
  h1: NexilHTMLAttributes<HTMLHeadingElement>
  h2: NexilHTMLAttributes<HTMLHeadingElement>
  h3: NexilHTMLAttributes<HTMLHeadingElement>
  h4: NexilHTMLAttributes<HTMLHeadingElement>
  h5: NexilHTMLAttributes<HTMLHeadingElement>
  h6: NexilHTMLAttributes<HTMLHeadingElement>
  head: NexilHTMLAttributes<HTMLHeadElement>
  header: NexilHTMLAttributes<HTMLElement>
  hgroup: NexilHTMLAttributes<HTMLElement>
  hr: NexilHTMLAttributes<HTMLHRElement>
  html: NexilHtmlAttributes
  i: NexilHTMLAttributes<HTMLElement>
  iframe: NexilIframeAttributes
  img: NexilImgAttributes
  input: NexilInputAttributes
  ins: NexilInsAttributes
  kbd: NexilHTMLAttributes<HTMLElement>
  label: NexilLabelAttributes
  legend: NexilHTMLAttributes<HTMLLegendElement>
  li: NexilLiAttributes
  link: NexilLinkAttributes
  main: NexilHTMLAttributes<HTMLElement>
  map: NexilMapAttributes
  mark: NexilHTMLAttributes<HTMLElement>
  menu: NexilHTMLAttributes<HTMLMenuElement>
  meta: NexilMetaAttributes
  meter: NexilMeterAttributes
  nav: NexilHTMLAttributes<HTMLElement>
  noscript: NexilHTMLAttributes<HTMLElement>
  object: NexilObjectAttributes
  ol: NexilOlAttributes
  optgroup: NexilOptgroupAttributes
  option: NexilOptionAttributes
  output: NexilOutputAttributes
  p: NexilHTMLAttributes<HTMLParagraphElement>
  picture: NexilHTMLAttributes<HTMLPictureElement>
  pre: NexilHTMLAttributes<HTMLPreElement>
  progress: NexilProgressAttributes
  q: NexilQAttributes
  rp: NexilHTMLAttributes<HTMLElement>
  rt: NexilHTMLAttributes<HTMLElement>
  ruby: NexilHTMLAttributes<HTMLElement>
  s: NexilHTMLAttributes<HTMLElement>
  samp: NexilHTMLAttributes<HTMLElement>
  script: NexilScriptAttributes
  search: NexilHTMLAttributes<HTMLElement>
  section: NexilHTMLAttributes<HTMLElement>
  select: NexilSelectAttributes
  slot: NexilSlotAttributes
  small: NexilHTMLAttributes<HTMLElement>
  source: NexilSourceAttributes
  span: NexilHTMLAttributes<HTMLSpanElement>
  strong: NexilHTMLAttributes<HTMLElement>
  style: NexilStyleAttributes
  sub: NexilHTMLAttributes<HTMLElement>
  summary: NexilHTMLAttributes<HTMLElement>
  sup: NexilHTMLAttributes<HTMLElement>
  table: NexilHTMLAttributes<HTMLTableElement>
  tbody: NexilHTMLAttributes<HTMLTableSectionElement>
  td: NexilTdAttributes
  template: NexilHTMLAttributes<HTMLTemplateElement>
  textarea: NexilTextareaAttributes
  tfoot: NexilHTMLAttributes<HTMLTableSectionElement>
  th: NexilThAttributes
  thead: NexilHTMLAttributes<HTMLTableSectionElement>
  time: NexilTimeAttributes
  title: NexilHTMLAttributes<HTMLTitleElement>
  tr: NexilHTMLAttributes<HTMLTableRowElement>
  track: NexilTrackAttributes
  u: NexilHTMLAttributes<HTMLElement>
  ul: NexilHTMLAttributes<HTMLUListElement>
  var: NexilHTMLAttributes<HTMLElement>
  video: NexilVideoAttributes
  wbr: NexilHTMLAttributes<HTMLElement>

  // SVG Elements
  svg: NexilSVGAttributes<SVGSVGElement>
  animate: NexilSVGAttributes<SVGAnimateElement>
  animateMotion: NexilSVGAttributes<SVGElement>
  animateTransform: NexilSVGAttributes<SVGAnimateTransformElement>
  circle: NexilSVGAttributes<SVGCircleElement>
  clipPath: NexilSVGAttributes<SVGClipPathElement>
  defs: NexilSVGAttributes<SVGDefsElement>
  desc: NexilSVGAttributes<SVGDescElement>
  ellipse: NexilSVGAttributes<SVGEllipseElement>
  feBlend: NexilSVGAttributes<SVGFEBlendElement>
  feColorMatrix: NexilSVGAttributes<SVGFEColorMatrixElement>
  feComponentTransfer: NexilSVGAttributes<SVGFEComponentTransferElement>
  feComposite: NexilSVGAttributes<SVGFECompositeElement>
  feConvolveMatrix: NexilSVGAttributes<SVGFEConvolveMatrixElement>
  feDiffuseLighting: NexilSVGAttributes<SVGFEDiffuseLightingElement>
  feDisplacementMap: NexilSVGAttributes<SVGFEDisplacementMapElement>
  feDistantLight: NexilSVGAttributes<SVGFEDistantLightElement>
  feDropShadow: NexilSVGAttributes<SVGFEDropShadowElement>
  feFlood: NexilSVGAttributes<SVGFEFloodElement>
  feFuncA: NexilSVGAttributes<SVGFEFuncAElement>
  feFuncB: NexilSVGAttributes<SVGFEFuncBElement>
  feFuncG: NexilSVGAttributes<SVGFEFuncGElement>
  feFuncR: NexilSVGAttributes<SVGFEFuncRElement>
  feGaussianBlur: NexilSVGAttributes<SVGFEGaussianBlurElement>
  feImage: NexilSVGAttributes<SVGFEImageElement>
  feMerge: NexilSVGAttributes<SVGFEMergeElement>
  feMergeNode: NexilSVGAttributes<SVGFEMergeNodeElement>
  feMorphology: NexilSVGAttributes<SVGFEMorphologyElement>
  feOffset: NexilSVGAttributes<SVGFEOffsetElement>
  fePointLight: NexilSVGAttributes<SVGFEPointLightElement>
  feSpecularLighting: NexilSVGAttributes<SVGFESpecularLightingElement>
  feSpotLight: NexilSVGAttributes<SVGFESpotLightElement>
  feTile: NexilSVGAttributes<SVGFETileElement>
  feTurbulence: NexilSVGAttributes<SVGFETurbulenceElement>
  filter: NexilSVGAttributes<SVGFilterElement>
  foreignObject: NexilSVGAttributes<SVGForeignObjectElement>
  g: NexilSVGAttributes<SVGGElement>
  image: NexilSVGAttributes<SVGImageElement>
  line: NexilSVGAttributes<SVGLineElement>
  linearGradient: NexilSVGAttributes<SVGLinearGradientElement>
  marker: NexilSVGAttributes<SVGMarkerElement>
  mask: NexilSVGAttributes<SVGMaskElement>
  metadata: NexilSVGAttributes<SVGMetadataElement>
  mpath: NexilSVGAttributes<SVGElement>
  path: NexilSVGAttributes<SVGPathElement>
  pattern: NexilSVGAttributes<SVGPatternElement>
  polygon: NexilSVGAttributes<SVGPolygonElement>
  polyline: NexilSVGAttributes<SVGPolylineElement>
  radialGradient: NexilSVGAttributes<SVGRadialGradientElement>
  rect: NexilSVGAttributes<SVGRectElement>
  set: NexilSVGAttributes<SVGSetElement>
  stop: NexilSVGAttributes<SVGStopElement>
  switch: NexilSVGAttributes<SVGSwitchElement>
  symbol: NexilSVGAttributes<SVGSymbolElement>
  text: NexilSVGAttributes<SVGTextElement>
  textPath: NexilSVGAttributes<SVGTextPathElement>
  tspan: NexilSVGAttributes<SVGTSpanElement>
  use: NexilSVGAttributes<SVGUseElement>
  view: NexilSVGAttributes<SVGViewElement>
}

/**
 * Strict JSX Namespace specification without loose catch-all index signatures.
 */
export namespace JSX {
  export type Element = Child
  export interface ElementChildrenAttribute {
    children: {}
  }
  export interface IntrinsicElements extends NexilIntrinsicElements {}
}

declare global {
  namespace JSX {
    type Element = import('../core/index.js').Child
    interface ElementChildrenAttribute {
      children: {}
    }
    interface IntrinsicElements extends NexilIntrinsicElements {}
  }
}
