import { action } from 'nexil/server'

export const saveMessage = action(
  (input: unknown) => {
    if (!input || typeof input !== 'object' || !('message' in input)) {
      throw new TypeError('message is required')
    }
    return input as { message: string }
  },
  async (_context, input) => ({ saved: input.message }),
)
