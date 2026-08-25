// Stable, dependency-free runtime for resumable event boundaries.
// The compiler emits data-nx-on="event:chunk#export" and keeps the
// event-specific attribute for compatibility with older integrations.
export const RESUMABILITY_BOOTSTRAP = `const elements = document.querySelectorAll('[data-nx-on]');
for (const element of elements) {
  const value = element.getAttribute('data-nx-on');
  if (!value) continue;
  const separator = value.indexOf(':');
  const hash = value.indexOf('#', separator + 1);
  if (separator < 1 || hash < separator + 2) continue;
  const eventName = value.slice(0, separator);
  const chunk = value.slice(separator + 1, hash);
  const exportName = value.slice(hash + 1);
  element.addEventListener(eventName, async (event) => {
    const module = await import('/nexis-chunks/' + chunk);
    const handler = module[exportName];
    if (typeof handler !== 'function') throw new TypeError('Missing resumable handler export: ' + exportName);
    await handler({ element, event });
  });
}
`
