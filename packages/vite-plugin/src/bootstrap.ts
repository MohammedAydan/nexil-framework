// Stable, dependency-free runtime for resumable event boundaries.
// The compiler emits data-nx-on="event:chunk#export" and keeps the
// event-specific attribute for compatibility with older integrations.
export const RESUMABILITY_BOOTSTRAP = `const elements = document.querySelectorAll('[data-nx-on], [data-nx-on-click]');
for (const element of elements) {
  const unified = element.getAttribute('data-nx-on');
  const legacy = element.getAttribute('data-nx-on-click');
  const separator = unified ? unified.indexOf(':') : -1;
  const eventName = separator > 0 ? unified.slice(0, separator) : 'click';
  const reference = separator > 0 ? unified.slice(separator + 1) : legacy;
  if (!reference) continue;
  const hash = reference.indexOf('#');
  if (hash < 1) continue;
  const chunk = reference.slice(0, hash);
  const exportName = reference.slice(hash + 1);
  element.addEventListener(eventName, async (event) => {
    const module = await import('/nexis-chunks/' + chunk);
    const handler = module[exportName];
    if (typeof handler !== 'function') throw new TypeError('Missing resumable handler export: ' + exportName);
    await handler({ element, event });
  });
}
`
