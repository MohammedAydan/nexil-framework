const hydrationQueue = []
const hydrated = new WeakSet()

function readProps(element) {
  try {
    const raw = element.getAttribute('props') || '{}'
    const value = JSON.parse(raw)
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

function getRenderer(element) {
  return element.getAttribute('renderer-url') || element.getAttribute('component-url') || ''
}

function dispatchPending(element) {
  const events = hydrationQueue.filter((entry) => entry.element === element)
  for (const entry of events)
    entry.event.target?.dispatchEvent(new Event(entry.event.type, { bubbles: true }))
  for (const entry of events) hydrationQueue.splice(hydrationQueue.indexOf(entry), 1)
}

function installCounter(element) {
  const button = element.querySelector('#counter')
  if (!button || hydrated.has(element)) return
  const props = readProps(element)
  let count = Number(props.count || 0)
  const update = () => {
    button.textContent = `Count: ${count}`
    button.setAttribute('aria-label', `Counter value ${count}`)
  }
  button.addEventListener('click', () => {
    count += 1
    update()
  })
  hydrated.add(element)
  dispatchPending(element)
  update()
}

function hydrate(element) {
  if (!element || hydrated.has(element)) return
  const renderer = getRenderer(element)
  if (!renderer) return
  installCounter(element)
}

function hydrateVisible(elements) {
  if (!('IntersectionObserver' in window)) {
    elements.forEach(hydrate)
    return
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      hydrate(entry.target)
      observer.unobserve(entry.target)
    }
  })
  elements.forEach((element) => observer.observe(element))
}

function replayEvent(event) {
  const element = event.target?.closest?.('astro-island')
  if (!element || hydrated.has(element)) return
  hydrationQueue.push({ element, event })
  hydrate(element)
}

export function hydrateIsland(root = document) {
  const islands = [...root.querySelectorAll('astro-island')]
  hydrateVisible(islands)
  return islands.length
}

for (const type of ['click', 'input', 'change', 'submit']) {
  document.addEventListener(type, replayEvent, true)
}
hydrateIsland()
