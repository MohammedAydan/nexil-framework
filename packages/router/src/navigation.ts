/**
 * Dependency-free client runtime for semantic Nexil Link anchors. It replaces
 * only the framework-owned #app outlet after successfully parsing a normal HTML
 * response; it neither mounts components nor diffs a virtual tree.
 */
export const NEXIS_NAVIGATION_RUNTIME = String.raw`
(() => {
  if (globalThis.__nexisNavigationInstalled) return
  globalThis.__nexisNavigationInstalled = true

	const cache = new Map()
	const prefetchedAnchors = new WeakSet()
	const cacheLimit = 12
  const headSelectors = [
    'meta[name="description"]',
    'meta[name="robots"]',
    'meta[property^="og:"]',
    'meta[name^="twitter:"]',
    'link[rel="canonical"]',
    'link[rel="alternate"]',
    'link[rel="stylesheet"][data-nx-route-style]',
  ]
  let controller
  let activeUrl = location.href

  const sameOrigin = (url) => url.origin === location.origin
  const emit = (type, detail) => dispatchEvent(new CustomEvent('nexis:navigation-' + type, { detail }))
  const storeScroll = () => {
    history.replaceState({ ...history.state, __nexisScroll: { x: scrollX, y: scrollY } }, '', location.href)
  }
  const canIntercept = (event, anchor) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
    if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download') || anchor.rel.split(/\s+/).includes('external')) return false
    const url = new URL(anchor.href, location.href)
    return sameOrigin(url) && !(url.pathname === location.pathname && url.search === location.search && url.hash)
  }
  const readDocument = async (url, signal, prefetch = false) => {
    const key = url.href
    const cached = cache.get(key)
    if (cached) return cached
    const response = await fetch(url, {
      signal,
      headers: { 'X-Nexil-Navigation': '1', Accept: 'text/html' },
    })
    const contentType = response.headers.get('content-type') || ''
    if (!response.ok || !contentType.includes('text/html')) {
      throw new Error('Nexil navigation response was not a successful HTML document.')
    }
    const html = await response.text()
    if (prefetch && !/private|no-store/i.test(response.headers.get('cache-control') || '')) {
      cache.set(key, html)
      if (cache.size > cacheLimit) cache.delete(cache.keys().next().value)
    }
    return html
  }
  const loadDestinationRuntime = async (next) => {
    const moduleSources = [...next.querySelectorAll('script[type="module"][src]')]
      .map((node) => new URL(node.getAttribute('src'), location.origin).href)
      .filter((src) => /\/nexis-(?:state|bootstrap|bindings|forms)\.js$/.test(new URL(src).pathname))
    for (const source of moduleSources) await import(source)
  }
  const syncHead = (next) => {
    document.title = next.title
    for (const selector of headSelectors) {
      for (const node of document.head.querySelectorAll(selector)) node.remove()
      for (const node of next.head.querySelectorAll(selector)) document.head.append(node.cloneNode(true))
    }
  }
  const swap = async (url, html, options) => {
    const next = new DOMParser().parseFromString(html, 'text/html')
    const incoming = next.querySelector('#app')
    const current = document.querySelector('#app')
    if (!incoming || !current) throw new Error('Nexil navigation document is missing #app.')
    await loadDestinationRuntime(next)
    const commit = () => {
      globalThis.__nexisDisposeBindings?.()
      syncHead(next)
      current.replaceChildren(...[...incoming.childNodes].map((node) => document.importNode(node, true)))
      globalThis.__nexisRefreshBindings?.()
      document.dispatchEvent(new CustomEvent('nexis:navigation-commit', { detail: { url } }))
    }
    const transition = options.transition !== false && document.startViewTransition?.(commit)
    if (transition) await transition.finished
    else commit()
    if (options.scroll) {
      if (url.hash) document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView()
      else scrollTo(0, 0)
    }
  }
  const visit = async (input, options = {}) => {
    const url = new URL(input, location.href)
    controller?.abort()
    controller = new AbortController()
    if (options.persistCurrent !== false) storeScroll()
    emit('start', { url })
    try {
      const html = await readDocument(url, controller.signal)
      if (options.history === 'push') history.pushState({}, '', url)
      else if (options.history === 'replace') history.replaceState({}, '', url)
      await swap(url, html, options)
      activeUrl = url.href
      emit('complete', { url })
    } catch (error) {
      if (error?.name === 'AbortError') return
      emit('error', { url, error })
      location.assign(url)
    }
  }
	const prefetch = (anchor) => {
		if (prefetchedAnchors.has(anchor)) return
		prefetchedAnchors.add(anchor)
		const url = new URL(anchor.href, location.href)
		if (!sameOrigin(url)) return
		readDocument(url, undefined, true).catch(() => prefetchedAnchors.delete(anchor))
	}
  const findLink = (event) => event.target instanceof Element ? event.target.closest('a[data-nx-link]') : null

  document.addEventListener('click', (event) => {
    const anchor = findLink(event)
    if (!anchor || !canIntercept(event, anchor)) return
    event.preventDefault()
    void visit(anchor.href, {
      history: anchor.getAttribute('data-nx-link') === 'replace' ? 'replace' : 'push',
      scroll: anchor.getAttribute('data-nx-scroll') !== 'false',
      transition: anchor.getAttribute('data-nx-transition') !== 'false',
    })
  })
  document.addEventListener('pointerenter', (event) => {
    const anchor = findLink(event)
    if (anchor?.getAttribute('data-nx-prefetch') === 'intent') prefetch(anchor)
  }, true)
  document.addEventListener('focusin', (event) => {
    const anchor = findLink(event)
    if (anchor?.getAttribute('data-nx-prefetch') === 'intent') prefetch(anchor)
  })
  addEventListener('popstate', (event) => {
    const previous = new URL(activeUrl, location.href)
    const next = new URL(location.href)
    if (previous.pathname === next.pathname && previous.search === next.search) {
      activeUrl = next.href
      return
    }
    void visit(location.href, { history: 'none', scroll: false, transition: false, persistCurrent: false }).then(() => {
      const point = event.state?.__nexisScroll
      if (point) scrollTo(point.x, point.y)
      else if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView()
      else scrollTo(0, 0)
    })
  })
  addEventListener('pageshow', (event) => {
    if (event.persisted) {
      controller?.abort()
      controller = undefined
    }
  })
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  if ('IntersectionObserver' in globalThis) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        observer.unobserve(entry.target)
        prefetch(entry.target)
      }
    }, { rootMargin: '240px' })
    for (const anchor of document.querySelectorAll('a[data-nx-link][data-nx-prefetch="viewport"]')) observer.observe(anchor)
  }
  globalThis.__nexisNavigate = (href, options) => visit(href, {
    history: options?.replace ? 'replace' : 'push',
    scroll: options?.scroll,
    transition: options?.transition,
  })
})()
`
