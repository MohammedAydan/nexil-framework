import type { DataContext } from '@mohammedaydan/server'

export interface ActionContext {
  readonly request: Request
  readonly data: DataContext
}

export interface ActionOptions<Input, Output> {
  readonly validate: (input: unknown) => Input | Promise<Input>
  readonly authorize?: (context: ActionContext, input: Input) => void | Promise<void>
  readonly handle: (context: ActionContext, input: Input) => Output | Promise<Output>
}

export interface ServerAction<Input, Output> {
  execute(context: ActionContext, input: unknown): Promise<Output>
}

type Validator<Input> = (input: unknown) => Input | Promise<Input>
type ActionHandler<Input, Output> = (
  context: ActionContext,
  input: Input,
) => Output | Promise<Output>

export function action<Input, Output>(
  options: ActionOptions<Input, Output>,
): ServerAction<Input, Output>
export function action<Input, Output>(
  validate: Validator<Input>,
  handle: ActionHandler<Input, Output>,
  authorize?: ActionOptions<Input, Output>['authorize'],
): ServerAction<Input, Output>
export function action<Input, Output>(
  optionsOrValidate: ActionOptions<Input, Output> | Validator<Input>,
  shortHandle?: ActionHandler<Input, Output>,
  shortAuthorize?: ActionOptions<Input, Output>['authorize'],
): ServerAction<Input, Output> {
  const options: ActionOptions<Input, Output> =
    typeof optionsOrValidate === 'function'
      ? {
          validate: optionsOrValidate,
          handle: shortHandle as ActionHandler<Input, Output>,
          ...(shortAuthorize ? { authorize: shortAuthorize } : {}),
        }
      : optionsOrValidate
  if (typeof options.handle !== 'function')
    throw new TypeError('A server action requires a handle function.')

  return {
    async execute(context, input) {
      const validated = await options.validate(input)
      if (options.authorize) await options.authorize(context, validated)
      return options.handle(context, validated)
    },
  }
}

export function assertTrustedOrigin(
  request: Request,
  allowedOrigins: readonly string[] = [],
): void {
  const origin = request.headers.get('origin')
  if (!origin) return
  let normalized: string
  try {
    normalized = new URL(origin).origin
  } catch {
    throw new Response('Bad origin', { status: 403 })
  }
  const requestOrigin = new URL(request.url).origin
  const allowed = new Set([requestOrigin, ...allowedOrigins.map((value) => new URL(value).origin)])
  if (!allowed.has(normalized)) throw new Response('Forbidden origin', { status: 403 })
}

export interface IdempotencyStore {
  has(key: string): Promise<boolean>
  put(key: string): Promise<void>
}

export async function assertIdempotent(store: IdempotencyStore, key: string): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key)) throw new TypeError('Invalid idempotency key.')
  if (await store.has(key)) throw new Response('Duplicate action', { status: 409 })
  await store.put(key)
}
