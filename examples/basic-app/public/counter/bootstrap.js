window.__nexilCounterSetupRuns = 0

const button = document.querySelector('#counter')
button.addEventListener('click', async () => {
  const reference = button.dataset.nxOnClick
  const [chunk, exportName] = reference.split('#')
  const module = await import(chunk)
  await module[exportName](button)
})
