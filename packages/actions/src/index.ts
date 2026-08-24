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

export function action<Input, Output>(
  options: ActionOptions<Input, Output>,
): ServerAction<Input, Output> {
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
