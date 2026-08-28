export async function increment(button) {
  window.__nexilCounterHandlerRuns = (window.__nexilCounterHandlerRuns ?? 0) + 1
  const next = Number(button.textContent) + 1
  button.textContent = String(next)
  button.dataset.nxState = String(next)
}
