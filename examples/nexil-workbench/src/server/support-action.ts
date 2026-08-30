import {
  action,
  assertTrustedOrigin,
  createMemoryIdempotencyStore,
  handleActionRequest,
} from 'nexil/server'

const idempotency = createMemoryIdempotencyStore()

async function saveSupportRequest(input: { readonly message: string }) {
  // Replace with durable, application-owned persistence before multi-instance production.
  return { id: `support_${input.message.length}` }
}

const supportAction = action({
  endpoint: '/api/support',
  validate(input) {
    const message =
      typeof input === 'object' && input
        ? String((input as { readonly message?: unknown }).message ?? '')
        : ''
    if (message.trim().length < 20)
      throw new Response('Message must contain at least 20 characters.', { status: 400 })
    return { message: message.trim() }
  },
  async authorize({ request }) {
    assertTrustedOrigin(request, ['https://workbench.example'])
  },
  async handle(_context, input) {
    await saveSupportRequest(input)
    return { accepted: true }
  },
})

export function postSupport(request: Request) {
  return handleActionRequest(request, supportAction, {
    allowedOrigins: ['https://workbench.example'],
    idempotency,
  })
}
