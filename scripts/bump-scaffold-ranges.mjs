// Bump scaffold dependency ranges after a version-line change.
import { readFile, writeFile } from 'node:fs/promises'

const OLD = "'^0.1.0'"
const NEW = "'^1.0.0'"
const files = [
  'packages/create-nexil/src/scaffold.ts',
  'packages/cli/src/scaffold.ts',
  'packages/create-nexil-app/src/scaffold.ts',
]
for (const file of files) {
  const source = await readFile(file, 'utf8')
  if (!source.includes(OLD)) {
    console.log(`no ^0.1.0 ranges in ${file}`)
    continue
  }
  await writeFile(file, source.split(OLD).join(NEW), 'utf8')
  console.log(`updated ${file}`)
}
