// Event handlers are emitted as data-nx-on-{event}="chunk_hash.js#handler".
// Delegation keeps startup O(1) and also supports elements inserted after boot.
export const RESUMABILITY_BOOTSTRAP = `(() => {
  const script = document.currentScript;
  const baseUrl = script && script.src
    ? new URL('../nexis-chunks/', script.src).href
    : new URL('/nexis-chunks/', document.baseURI).href;
  const chunkPattern = /^chunk_[a-f0-9]{12}\\.js$/;
  const exportPattern = /^[A-Za-z_$][\\w$]*$/;
  const eventNames = [
    'click', 'input', 'change', 'keydown', 'keyup', 'keypress', 'submit',
    'focusin', 'focusout', 'pointerdown', 'pointerup', 'pointermove',
    'mouseenter', 'mouseleave', 'touchstart', 'touchend'
  ];

  function readScope(element) {
    const raw = element.getAttribute('data-nx-state');
    if (!raw) return {};
    try {
      const value = JSON.parse(raw);
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  function dispatch(event) {
    let element = event.target;
    while (element && element !== document) {
      if (element.getAttribute) {
        for (const attribute of element.attributes) {
          if (!attribute.name.startsWith('data-nx-on-')) continue;
          const eventName = attribute.name.slice('data-nx-on-'.length);
          if (eventName !== event.type) continue;
          for (const reference of attribute.value.split(';')) {
            const separator = reference.indexOf('#');
            if (separator < 1) continue;
            const chunk = reference.slice(0, separator);
            const exportName = reference.slice(separator + 1);
            if (!chunkPattern.test(chunk) || !exportPattern.test(exportName)) continue;
            import(baseUrl + chunk).then((module) => {
              const handler = module[exportName];
              if (typeof handler === 'function') {
                return handler({ element, event, scope: readScope(element) });
              }
              return undefined;
            });
          }
        }
        const legacy = element.getAttribute('data-nx-on');
        if (legacy) {
          for (const spec of legacy.split(';')) {
            const separator = spec.indexOf(':');
            if (separator < 1 || spec.slice(0, separator) !== event.type) continue;
            const reference = spec.slice(separator + 1);
            const hash = reference.indexOf('#');
            if (hash < 1) continue;
            const chunk = reference.slice(0, hash);
            const exportName = reference.slice(hash + 1);
            if (!chunkPattern.test(chunk) || !exportPattern.test(exportName)) continue;
            import(baseUrl + chunk).then((module) => {
              const handler = module[exportName];
              if (typeof handler === 'function') {
                return handler({ element, event, scope: readScope(element) });
              }
              return undefined;
            });
          }
        }
      }
      element = element.parentElement;
    }
  }

  for (const eventName of eventNames) document.addEventListener(eventName, dispatch);
})();
`
