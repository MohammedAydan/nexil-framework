window.__nexisHandlerRuns = 0

const button = document.querySelector('[data-nx-on-click]')
button.addEventListener('click', async () => {
  const reference = button.dataset.nxOnClick
  const [chunk, exportName] = reference.split('#')
  const module = await import(`./${chunk}`)
  await module[exportName](button)
})
