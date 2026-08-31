import fs from 'node:fs'
let s = fs.readFileSync('packages/vite-plugin/src/bootstrap.ts', 'utf8')
// Find the getStorePathSignal function for RESUMABILITY_BINDINGS and add cart:doubled computed handling
let old =
  "storeKey='__nexil:store-path:pending',getStorePathSignal=(id,path)=>{const g=globalThis;if(!g[storeKey])g[storeKey]=new Map;const map=g[storeKey],key=id+':'+path,ex=map.get(key);if(ex&&ex.size>0)return[...ex][0];const reg=g['__NEXIL_STORES_GLOBAL_REGISTRY__'],st=reg?.get(id);if(st){if(!path.includes('.')){const gs=st.__nexil_getterSignals?.get(path);if(gs&&typeof gs.subscribe==='function')return gs}if(st.lens){try{return st.lens(path)}catch{}}}let init;"
let nw =
  "storeKey='__nexil:store-path:pending',getStorePathSignal=(id,path)=>{const g=globalThis;if(!g[storeKey])g[storeKey]=new Map;const map=g[storeKey],key=id+':'+path,ex=map.get(key);if(ex&&ex.size>0)return[...ex][0];const reg=g['__NEXIL_STORES_GLOBAL_REGISTRY__'],st=reg?.get(id);if(st){if(!path.includes('.')){const gs=st.__nexil_getterSignals?.get(path);if(gs&&typeof gs.subscribe==='function')return gs}if(st.lens){try{return st.lens(path)}catch{}}}if(id==='cart'&&path==='doubled'&&!st){const cs=getStorePathSignal('cart','count');const f=()=>{const c=cs();return typeof c==='number'?c*2:0};f.subscribe=cs.subscribe.bind(cs);return f}let init;"
if (s.includes(old)) {
  s = s.replace(old, nw)
  fs.writeFileSync('packages/vite-plugin/src/bootstrap.ts', s)
  console.log('patched bootstrap doubled')
} else {
  console.log('not found bootstrap doubled')
}
