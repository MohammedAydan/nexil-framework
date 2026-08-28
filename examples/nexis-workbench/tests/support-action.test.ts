import { describe, expect, it } from 'vitest'
import { postSupport } from '../src/server/support-action'

const acceptedOrigin = 'https://workbench.example'
const validBody = new URLSearchParams({
  message: 'This is a sufficiently detailed support request.',
})

function request(init: RequestInit = {}) {
  return new Request('https://workbench.example/api/support', {
    method: 'POST',
    headers: {
      Origin: acceptedOrigin,
      'content-type': 'application/x-www-form-urlencoded',
      ...init.headers,
    },
    body: validBody,
    ...init,
  })
}

describe('Workbench support Action', () => {
  it('accepts a valid same-origin support request', async () => {
    const response = await postSupport(request())
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true, data: { accepted: true } })
  })

  it('rejects a short message before persistence', async () => {
    const response = await postSupport(
      request({ body: new URLSearchParams({ message: 'too short' }) }),
    )
    expect(response.status).toBe(400)
  })

  it('rejects an untrusted Origin', async () => {
    const response = await postSupport(request({ headers: { Origin: 'https://attacker.example' } }))
    expect(response.status).toBe(403)
  })

  it('rejects a duplicate idempotency key', async () => {
    const headers = { 'idempotency-key': 'workbench_support_example_2026' }
    expect((await postSupport(request({ headers }))).status).toBe(200)
    expect((await postSupport(request({ headers }))).status).toBe(409)
  })
})
