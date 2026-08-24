import type { NexisHandler } from '@nexis/adapters'

export interface DevServer {
  readonly handle: NexisHandler
  readonly revision: () => number
  readonly invalidate: () => number
}

export function createDevServer(handler: NexisHandler): DevServer {
  let currentRevision = 0
  return {
    handle: handler,
    revision: () => currentRevision,
    invalidate: () => {
      currentRevision += 1
      return currentRevision
    },
  }
}
