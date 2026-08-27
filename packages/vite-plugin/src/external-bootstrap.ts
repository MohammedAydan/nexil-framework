/**
 * Production-only resumability runtime for opaque data-nx-scope keys.
 * Its generated state asset exposes the browser-required payload through
 * globalThis.__nexisScopeSeeds; state stays public browser data, but does not
 * bloat or reveal named values in the HTML document itself.
 */
export const RESUMABILITY_BOOTSTRAP_EXTERNAL = `(()=>{
	const script=document.currentScript,chunkBase=script&&script.src?new URL('../nexis-chunks/',script.src).href:new URL('/nexis-chunks/',document.baseURI).href,chunk=/^chunk_[a-f0-9]{12}\\.js$/,exportName=/^[A-Za-z_$][\\w$]*$/,events='click input change keydown keyup submit focusin focusout'.split(' '),registry=globalThis.__nexisScopeRegistry||(globalThis.__nexisScopeRegistry=new Map);
	const signal=initial=>{const listeners=new Set,read=()=>initial;Object.defineProperty(read,'value',{enumerable:true,get:()=>initial});read.set=next=>{next=typeof next==='function'?next(initial):next;if(Object.is(initial,next))return;initial=next;for(const l of[...listeners])l()};read.subscribe=listener=>(listeners.add(listener),()=>listeners.delete(listener));return read};
	const owner=element=>{while(element&&element!==document&&!element.hasAttribute('data-nx-scope'))element=element.parentElement;return element};
	const payload=element=>{const root=owner(element),raw=root&&root.getAttribute('data-nx-scope');if(!raw)return{};try{return raw.startsWith('nx:scope:')?globalThis.__nexisScopeSeeds?.[raw]||{}:JSON.parse(raw)}catch{return{}}};
	const scope=element=>{const resolved={};for(const[name,ref]of Object.entries(payload(element))){if(ref.kind==='value')resolved[name]=ref.data;else if(ref.kind==='unsupported')console.warn('[nexis]',ref.reason);else{let live=registry.get(ref.id);if(!live){if(ref.kind==='signal')live=signal(ref.initial);else if(ref.kind==='store'){const value=signal(ref.initial);live={value,snapshot:()=>value(),set:next=>value.set(next),g:ref.lifetime==='global'}}else if(ref.kind==='action')live=input=>fetch(ref.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}).then(response=>response.json());if(live)registry.set(ref.id,live)}if(live)resolved[name]=live}}return resolved};
	const invoke=(element,event,reference)=>{const marker=reference.indexOf('#');if(marker<1)return;const file=reference.slice(0,marker),name=reference.slice(marker+1);if(!chunk.test(file)||!exportName.test(name))return;import(chunkBase+file).then(module=>module[name]?.({element,event,scope:scope(element)})).catch(error=>console.warn('[nexis] handler failed',error))};
	const dispatch=event=>{if(event.type==='submit')event.preventDefault();for(let element=event.target;element&&element!==document;element=element.parentElement){const refs=element.getAttribute('data-nx-on-'+event.type);if(refs)refs.split(';').forEach(reference=>invoke(element,event,reference))}};
	events.forEach(event=>document.addEventListener(event,dispatch));
	})();\n`
