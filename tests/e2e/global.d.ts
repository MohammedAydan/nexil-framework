declare global {
  interface Window {
    __nexilHandlerRuns: number
    __nexilCounterHandlerRuns?: number
    __nexilCounterSetupRuns?: number
  }
}

export {}
