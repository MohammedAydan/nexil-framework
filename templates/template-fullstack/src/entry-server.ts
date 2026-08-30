import { createNexilHandler, createNodeHandler } from 'nexil/server'
import { routeFromFile } from '@nexil/router'

const routes = [
  routeFromFile('src/routes/index.tsx'),
  routeFromFile('src/routes/about.tsx'),
  routeFromFile('src/routes/items/[id].tsx'),
]

export const fetchHandler = createNexilHandler({
  routes,
  loadRoute: async (file) => import(/* @vite-ignore */ file),
})

export const nodeHandler = createNodeHandler(fetchHandler)
