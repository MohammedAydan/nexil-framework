import { action, assertTrustedOrigin } from '@mohammedaydan/actions'
import { adapterCapabilities } from '@mohammedaydan/adapters'
import {
  createHandlerReference,
  createResumeAttribute,
  deserializeResumeState,
  serializeResumeState,
} from '@mohammedaydan/client'
import { component, computed, state } from '@mohammedaydan/core'
import { batch } from '@mohammedaydan/reactivity'
import { createSecurityHeaders, serializeCookie } from '@mohammedaydan/server'
import { createStateRegistry } from '@mohammedaydan/state'

export const seo = {
  title: 'Nexis Labs — Runtime evaluation surface',
  description:
    'Interactive runtime, serialization, server action, and platform adapter tests for Nexis.',
  canonical: 'https://nexis-showcase.example/showcase/labs',
  type: 'website' as const,
  jsonLd: { '@context': 'https://schema.org', '@type': 'TechArticle', name: 'Nexis Labs' },
}

const registry = createStateRegistry()
const labStore = registry.getOrCreate('route', 'lab-counter', { clicks: 0, mode: 'resumable' })
const localSignal = state(3)
const computedSignal = computed(() => localSignal() * 3)
batch(() => {
  localSignal.set(4)
  localSignal.set(5)
})
const payload = serializeResumeState({ clicks: 0, mode: 'resumable' })
const payloadRoundTrip = deserializeResumeState(payload)
const resumeReference = createHandlerReference('chunk_labs.js', 'runLab')
const resumeAttribute = createResumeAttribute('labs', resumeReference)
const headers = createSecurityHeaders()
const cookie = serializeCookie('lab_session', 'evaluation', { maxAge: 900 })
const evaluationAction = action({
  validate: (input: unknown) => {
    if (!input || typeof input !== 'object' || !('name' in input))
      throw new TypeError('Name required')
    return input as { name: string }
  },
  authorize: async (context) => {
    assertTrustedOrigin(context.request, ['https://nexis-showcase.example'])
  },
  handle: (_context, input) => `queued:${input.name}`,
})

export const actions = { submit: evaluationAction }

export default component(() => {
  void evaluationAction
  void payloadRoundTrip
  return (
    <>
      <header className="shell site-header">
        <a className="wordmark" href="/">
          <span className="mark">N</span>
          <span>Nexis / field guide</span>
        </a>
        <nav className="nav" aria-label="Primary navigation">
          <a href="/">Home</a>
          <a href="/features">Features</a>
          <a href="/docs/architecture">Docs</a>
        </nav>
      </header>
      <main>
        <section className="shell hero">
          <div>
            <p className="eyebrow">Evaluation lab / live boundaries</p>
            <h1>
              Push the runtime. <em>Read the trace.</em>
            </h1>
            <p className="lede">
              This page turns the framework’s contracts into visible experiments: a state store, a
              computed signal, a serialized resume payload, and server-side safety primitives.
            </p>
            <div className="button-row">
              <button
                className="button"
                data-nx-state="0"
                onClick$={({ element }) => {
                  const next = Number(element.dataset.nxState || '0') + 1
                  element.dataset.nxState = String(next)
                  element.textContent = `Batch flushed / ${next}`
                }}
              >
                Run a batched update
              </button>
              <a className="button secondary" href="/docs/architecture">
                Read the model
              </a>
            </div>
            <form
              id="action-form"
              className="button-row"
              action="/__nexis/actions/labs/submit"
              method="post"
              onSubmit$={({ element, event }) => {
                event.preventDefault()
                const form = new FormData(element as HTMLFormElement)
                fetch(element.action, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': `lab-${Date.now()}`,
                  },
                  body: JSON.stringify({ name: form.get('name') }),
                })
                  .then((response) => response.json())
                  .then((result) => {
                    const output = document.querySelector('#action-output')
                    if (output)
                      output.textContent = result.ok
                        ? `Action result: ${result.data}`
                        : result.errors.join(', ')
                  })
              }}
            >
              <label className="small" htmlFor="action-name">
                Action name
              </label>
              <input id="action-name" name="name" defaultValue="Ada" />
              <button className="button secondary" type="submit">
                Call the action
              </button>
            </form>
            <p id="action-output" className="small" aria-live="polite">
              No action call yet.
            </p>
          </div>
          <aside className="hero-aside">
            <p className="aside-label">Live lab values</p>
            <div className="metric">
              <span>store scope</span>
              <strong>{labStore.scope}</strong>
            </div>
            <div className="metric">
              <span>computed</span>
              <strong>{computedSignal()}</strong>
            </div>
            <div className="metric">
              <span>resume bytes</span>
              <strong>{payload.length}</strong>
            </div>
            <div className="metric">
              <span>adapter</span>
              <strong>{adapterCapabilities.node.streaming ? 'streaming' : 'basic'}</strong>
            </div>
          </aside>
        </section>
        <section className="shell section" aria-labelledby="lab-output">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Generated contracts</p>
              <h2 id="lab-output">
                Inputs become <em>evidence.</em>
              </h2>
            </div>
            <p>
              These values are computed on the server and inserted into HTML. The interaction
              boundary adds no hydration runtime.
            </p>
          </div>
          <div className="grid-2">
            <article className="card">
              <span className="tag">client / resume state</span>
              <p className="small">Attribute</p>
              <pre className="console">{resumeAttribute}</pre>
              <p className="small">Payload</p>
              <pre className="console">{payload}</pre>
            </article>
            <article className="card">
              <span className="tag">server / policy surface</span>
              <ul className="data-list">
                <li>
                  <span>CSP</span>
                  <strong>{headers.get('Content-Security-Policy')?.slice(0, 28)}…</strong>
                </li>
                <li>
                  <span>cookie</span>
                  <strong>{cookie.slice(0, 30)}…</strong>
                </li>
                <li>
                  <span>state snapshot</span>
                  <strong>{JSON.stringify(labStore.snapshot())}</strong>
                </li>
                <li>
                  <span>action</span>
                  <strong>validated + authorized</strong>
                </li>
              </ul>
            </article>
          </div>
        </section>
        <section className="shell section split">
          <div>
            <p className="eyebrow">What this catches</p>
            <h2>Small contracts. Large failure surface.</h2>
            <p className="small">
              The benchmark runner probes serialization limits, route discovery, generated chunk
              size, response status, head tags, and the presence of dangerous URL or CSS output.
            </p>
          </div>
          <div className="console">
            <div className="good">PASS / state registry scope isolation</div>
            <div className="good">PASS / idempotent action guard configured</div>
            <div className="good">PASS / secure cookie attributes emitted</div>
            <div className="good">PASS / adapter capability matrix present</div>
            <div className="warn">NEXT / streaming parity across edges</div>
          </div>
        </section>
      </main>
      <footer className="shell site-footer">
        <span>Labs / evidence surface</span>
        <span>
          <a href="/">Return home</a>
        </span>
      </footer>
    </>
  )
})
