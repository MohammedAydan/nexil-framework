import { action } from '@nexil/core/server'

export const newsletter = action({
  validate: (input: unknown) => {
    const data = input as Record<string, unknown>
    const email = String(data.email ?? '').trim()
    if (!email || !email.includes('@')) throw new Error('Valid email required')
    return { email }
  },
  async handle(_event, input: { email: string }) {
    await new Promise((r) => setTimeout(r, 200))
    return { ok: true as const, email: input.email }
  },
})
