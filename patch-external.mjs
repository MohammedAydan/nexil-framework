import fs from 'node:fs'
let s = fs.readFileSync('packages/vite-plugin/src/external-bootstrap.ts', 'utf8')
let old =
  "const notify=()=>{const pm=globalThis['__nexil:store-path:pending'];if(!pm||!sid)return;const cs=qv();for(const[k,sigs]of pm.entries())if(k.startsWith(sid+':')){const p=k.slice(sid.length+1),val=getAtPath(cs,p.split('.'));if(val!==undefined)for(const sg of sigs)sg.set(val)}};"
let nw =
  "const notify=()=>{const pm=globalThis['__nexil:store-path:pending'];if(!pm||!sid)return;const cs=qv();for(const[k,sigs]of pm.entries())if(k.startsWith(sid+':')){const p=k.slice(sid.length+1),val=getAtPath(cs,p.split('.'));if(val!==undefined)for(const sg of sigs)sg.set(val)};if(sid==='cart'&&cs&&typeof cs.count==='number'){const ds=pm.get('cart:doubled');if(ds){const v=cs.count*2;for(const sg of ds)sg.set(v)}}} ;"
if (s.includes(old)) {
  s = s.replace(old, nw)
  fs.writeFileSync('packages/vite-plugin/src/external-bootstrap.ts', s)
  console.log('patched external')
} else {
  console.log('not found external')
}
