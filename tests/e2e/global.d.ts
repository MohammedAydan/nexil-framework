declare global {
  interface Window {
    __nexisHandlerRuns: number
    __nexisCounterHandlerRuns?: number
    __nexisCounterSetupRuns?: number
  }
}

export {}
