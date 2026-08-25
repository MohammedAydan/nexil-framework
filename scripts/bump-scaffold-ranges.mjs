// Bump scaffold dependency ranges after a version-line change.
import { readFile, writeFile } from 'node:fs/promises'

const OLD = "'^2.0.0'"
const NEW = "'^2.1.0'"
const files = [
  'packages/create-nexis/src/scaffold.ts',
  'packages/cli/src/scaffold.ts',
  'packages/create-nexis-app/src/scaffold.ts',
]
for (const file of files) {
  const source = await readFile(file, 'utf8')
  if (!source.includes(OLD)) {
    console.log(`no ^2.0.0 ranges in ${file}`)
    continue
  }
  await writeFile(file, source.split(OLD).join(NEW), 'utf8')
  console.log(`updated ${file}`)
}
