// Adds/refreshes per-package `clean` scripts that remove both dist and
// tsconfig.tsbuildinfo (composite tsc skips emit when tsbuildinfo is stale).
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const CLEAN =
  "node -e \"const fs=require('fs');for(const f of ['dist','tsconfig.tsbuildinfo']){try{fs.rmSync(f,{recursive:true,force:true})}catch(e){}}\""

for (const group of ['packages', 'examples']) {
  let entries = []
  try {
    entries = await readdir(group)
  } catch {
    continue
  }
  for (const dir of entries) {
    const pkgPath = join(group, dir, 'package.json')
    try {
      const json = JSON.parse(await readFile(pkgPath, 'utf8'))
      if (!json.scripts) json.scripts = {}
      if (json.scripts.clean !== CLEAN && json.scripts.clean !== undefined) {
        // Normalize previously added variants to the shared definition.
        json.scripts.clean = CLEAN
        await writeFile(pkgPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8')
        console.log(`updated clean in ${group}/${dir}`)
      } else if (json.scripts.clean === undefined) {
        json.scripts.clean = CLEAN
        await writeFile(pkgPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8')
        console.log(`added clean to ${group}/${dir}`)
      }
    } catch {}
  }
}
