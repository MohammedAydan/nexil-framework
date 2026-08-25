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

export interface ActionResponseSuccess<Output> {
  readonly ok: true
  readonly data: Output
}

export interface ActionResponseError {
  readonly ok: false
  readonly errors: readonly string[]
}

export type ActionResponse<Output> = ActionResponseSuccess<Output> | ActionResponseError

export interface ActionEndpointOptions {
  readonly allowedOrigins?: readonly string[]
  readonly idempotency?: IdempotencyStore
  readonly data?: DataContext
}

export function createMemoryIdempotencyStore(): IdempotencyStore {
  const keys = new Set<string>()
  return {
    has: async (key) => keys.has(key),
    put: async (key) => {
      keys.add(key)
    },
  }
}

async function readActionInput(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const form = await request.formData()
    return Object.fromEntries(form.entries())
  }
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    return Object.fromEntries(form.entries())
  }
  try {
    return await request.json()
  } catch {
    return undefined
  }
}

export async function handleActionRequest<Input, Output>(
  request: Request,
  serverAction: ServerAction<Input, Output>,
  options: ActionEndpointOptions = {},
): Promise<Response> {
  if (request.method !== 'POST')
    return Response.json(
      { ok: false, errors: ['Method Not Allowed'] },
      { status: 405, headers: { Allow: 'POST' } },
    )
  try {
    assertTrustedOrigin(request, options.allowedOrigins ?? [])
    const input = await readActionInput(request)
    const idempotencyKey = request.headers.get('idempotency-key')
    if (idempotencyKey)
      await assertIdempotent(options.idempotency ?? createMemoryIdempotencyStore(), idempotencyKey)
    const data = await serverAction.execute(
      {
        request,
        data: options.data ?? (await import('@mohammedaydan/server')).createDataContext(request),
      },
      input,
    )
    return Response.json({ ok: true, data }, { status: 200 })
  } catch (error) {
    if (error instanceof Response) {
      let message = 'Action request rejected.'
      try {
        message = await error.text()
      } catch {
        // Keep the safe generic message.
      }
      return Response.json({ ok: false, errors: [message] }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Action validation failed.'
    return Response.json({ ok: false, errors: [message] }, { status: 400 })
  }
}
