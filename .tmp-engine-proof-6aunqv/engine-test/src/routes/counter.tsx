import { component, state } from 'nexil'

export const seo = { title: 'Counter — engine-test', description: 'A focused resumable Nexil state boundary.' }

const count = state(0)

export default component(() => <main className="shell"><p className="eyebrow">NEXIL · COUNTER</p><section className="panel"><p><button className="button" onClick$={({ element }) => { const next = count() + 1; count.set(next); element.textContent = 'Count: ' + String(next) }}>Count: 0</button></p></section></main>)
