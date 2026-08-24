import { runCli } from './index.js'

runCli(process.argv.slice(2))
  .then((message) => {
    if (message) process.stdout.write(`${message}\n`)
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
