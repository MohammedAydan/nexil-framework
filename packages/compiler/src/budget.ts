export const DEFAULT_BUDGET = {
  staticClientJsBytes: 0,
  interactiveClientJsGzipBytes: 15 * 1024,
  bootstrapGzipBytes: 1024,
} as const

export interface RouteBudgetInput {
  readonly route: string
  readonly interactive: boolean
  readonly clientJsGzipBytes: number
  readonly bootstrapGzipBytes: number
  readonly overrideReason?: string
}

export interface BudgetViolation {
  readonly route: string
  readonly metric: 'client-js' | 'bootstrap'
  readonly actualBytes: number
  readonly limitBytes: number
  readonly message: string
}

export interface BudgetReport {
  readonly passed: boolean
  readonly violations: readonly BudgetViolation[]
}

export function checkBudget(
  input: RouteBudgetInput,
  budget = DEFAULT_BUDGET,
): BudgetReport {
  const violations: BudgetViolation[] = []
  const clientLimit = input.interactive
    ? budget.interactiveClientJsGzipBytes
    : budget.staticClientJsBytes

  if (input.clientJsGzipBytes > clientLimit) {
    violations.push({
      route: input.route,
      metric: 'client-js',
      actualBytes: input.clientJsGzipBytes,
      limitBytes: clientLimit,
      message: `Client JS for ${input.route} is ${input.clientJsGzipBytes} bytes; limit is ${clientLimit}.`,
    })
  }

  if (input.bootstrapGzipBytes > budget.bootstrapGzipBytes) {
    violations.push({
      route: input.route,
      metric: 'bootstrap',
      actualBytes: input.bootstrapGzipBytes,
      limitBytes: budget.bootstrapGzipBytes,
      message: `Bootstrap is ${input.bootstrapGzipBytes} bytes; limit is ${budget.bootstrapGzipBytes}.`,
    })
  }

  if (violations.length > 0 && input.overrideReason?.trim()) {
    return { passed: true, violations: [] }
  }
  return { passed: violations.length === 0, violations }
}

export function assertBudget(input: RouteBudgetInput, budget = DEFAULT_BUDGET): void {
  const report = checkBudget(input, budget)
  if (!report.passed) {
    throw new Error(
      `${report.violations.map((violation) => violation.message).join(' ')} ` +
        'Add a documented budget override only when the trade-off is reviewed.',
    )
  }
}
