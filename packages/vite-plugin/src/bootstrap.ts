// Single source of truth for the resumability runtime. Chunks are imported from
// stable absolute URLs so development (served by middleware) and production
// (static files) behave identically.
//
// This module intentionally has ZERO dependencies: edge runtimes (Deno, workerd)
// must be able to import the bootstrap contract without pulling in Vite or any
// Node-oriented toolchain.
export const RESUMABILITY_BOOTSTRAP = `const elements = document.querySelectorAll('[data-nx-on-click]');
for (const element of elements) {
  const reference = element.dataset.nxOnClick;
  if (!reference) continue;
  const separator = reference.indexOf('#');
  if (separator < 1) continue;
  const chunk = reference.slice(0, separator);
  const exportName = reference.slice(separator + 1);
  element.addEventListener('click', async () => {
    const module = await import('/nexis-chunks/' + chunk);
    const handler = module[exportName];
    if (typeof handler !== 'function') throw new TypeError('Missing resumable handler export: ' + exportName);
    await handler({ element });
  });
}
`
