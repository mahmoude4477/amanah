import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {existsSync,readFileSync,realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';

// Local-run configuration (README «التشغيل المحلي»). Found in the local end-to-end run of 3 October 2026: `pnpm dev` refused to start
// because wrangler.jsonc asks for a newer compatibility date than the installed Workers runtime (now overridden for local runs only), and once started, every auth call
// failed in dev because Vite handed better-auth (zod 4) the app's zod 3. No network and no dev server: the config files, the installed
// packages, and the installed Workers runtime started on the local loopback with a one-line Worker.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// Where Node would load `name` from the app root, or from inside the package installed at `owner` (pnpm keeps a package's own
// dependencies beside it, in the node_modules folder that contains it).
const nodeModulesOf=(dir,name)=>path.resolve(dir,...name.split('/').map(()=>'..'));
const packageDir=(name,owner)=>{
 const dir=path.join(owner?nodeModulesOf(owner.dir,owner.name):path.join(root,'node_modules'),name);
 assert.ok(existsSync(path.join(dir,'package.json')),`cannot find ${name}${owner?` beside ${owner.name}`:''}`);
 return {name,dir:realpathSync(dir)};
};
const version=pkg=>JSON.parse(readFileSync(path.join(pkg.dir,'package.json'),'utf8')).version;
const compatibilityDate=()=>{
 const match=readFileSync(path.join(root,'wrangler.jsonc'),'utf8').match(/^\s*"compatibility_date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/m);
 assert.ok(match,'wrangler.jsonc sets compatibility_date');
 return match[1];
};
// The date `pnpm start` passes to wrangler dev (package.json), which must equal vite.config.ts's LOCAL_COMPATIBILITY_DATE.
const startScriptDate=()=>{
 const match=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).scripts.start.match(/--compatibility-date (\d{4}-\d{2}-\d{2})/);
 assert.ok(match,'pnpm start passes --compatibility-date to wrangler dev');
 return match[1];
};
// The Workers runtime that `pnpm dev` (through @cloudflare/vite-plugin) and `pnpm start` (wrangler dev) run: Miniflare and its workerd.
const runtimes=()=>{
 const seen=new Map();
 for(const owner of ['@cloudflare/vite-plugin','wrangler']){const miniflare=packageDir('miniflare',packageDir(owner));if(!seen.has(miniflare.dir))seen.set(miniflare.dir,{owner,miniflare,workerd:packageDir('workerd',miniflare)});}
 return [...seen.values()];
};
// Starts that runtime with a one-line Worker at `date` (local loopback only), as `pnpm dev` does before loading the app.
async function startsWith(runtime,date){
 const {Miniflare}=createRequire(path.join(runtime.miniflare.dir,'package.json'))(runtime.miniflare.dir);
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:date,compatibilityFlags:['nodejs_compat']});
 try{return await (await mf.dispatchFetch('http://localhost/')).text();}finally{await mf.dispose().catch(()=>{});}
}

test('local runs use a compatibility date the installed Workers runtime accepts; the deploy keeps wrangler.jsonc',async()=>{
 const {cloudflare,module}=await viteConfig();
 const local=module.LOCAL_COMPATIBILITY_DATE;
 assert.match(local,/^\d{4}-\d{2}-\d{2}$/);
 assert.deepEqual(cloudflare.config,{compatibility_date:local},'pnpm dev overrides the date');
 assert.equal(startScriptDate(),local,'pnpm start and pnpm dev use the same local date');
 assert.equal((await viteConfig({},'build')).cloudflare.config,undefined,'the build (and so the deploy) keeps wrangler.jsonc');
 assert.ok(compatibilityDate()>=local,'the production date is not older than the local one');
 for(const runtime of runtimes()){
  const name=`${runtime.owner}: miniflare ${version(runtime.miniflare)}, workerd ${version(runtime.workerd)}`;
  const answer=await startsWith(runtime,local).catch(error=>error);
  assert.equal(answer,'ok',`${name} refuses the local compatibility date ${local} (${answer?.message}); lower LOCAL_COMPATIBILITY_DATE or upgrade wrangler and @cloudflare/vite-plugin`);
  // A date past any release is refused the same way (as 2026-09-25 was on 3 October 2026), so the check above is not vacuous.
  await assert.rejects(()=>startsWith(runtime,'2099-01-01'),/compatibility date|newest date supported|failed to start/i,name);
 }
 // nodejs_compat stays explicit: before 2026-08-04 the date alone does not enable it.
 assert.match(readFileSync(path.join(root,'wrangler.jsonc'),'utf8'),/"compatibility_flags":\s*\["nodejs_compat"\]/);
});

// vite.config.ts evaluated with its plugins stubbed: what the Worker environments and the Cloudflare plugin actually receive.
async function viteConfig(env={},command='serve'){
 const code=ts.transpileModule(readFileSync(path.join(root,'vite.config.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const calls={cloudflare:[]};
 const mocks={
  vinext:()=>({name:'vinext'}),
  vite:{defineConfig:value=>value},
  './scripts/execution-profile.mjs':{readExecutionProfile:()=>'local'},
  './build/sites-vite-plugin':{sites:()=>({name:'sites'})},
  '@cloudflare/vite-plugin':{cloudflare:options=>{calls.cloudflare.push(options);return {name:'cloudflare'};}},
 };
 const loaded={exports:{}};
 new Function('require','module','exports',code)(id=>{if(id in mocks)return mocks[id];throw new Error(`unexpected import ${id}`);},loaded,loaded.exports);
 const saved={...process.env};
 try{
  for(const [key,value] of Object.entries(env)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  const config=await loaded.exports.default({command,mode:command==='serve'?'development':'production'});
  return {config,cloudflare:calls.cloudflare[0],module:loaded.exports};
 }finally{for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
}

test('dev: zod is not pre-bundled in the Worker environments while the app and better-auth use different zod majors',async()=>{
 const appZod=version(packageDir('zod'));
 const authZod=version(packageDir('zod',packageDir('better-auth')));
 const {config}=await viteConfig();
 const excluded=name=>config.environments?.[name]?.optimizeDeps?.exclude??[];
 if(appZod.split('.')[0]!==authZod.split('.')[0]){
  for(const name of ['rsc','ssr'])assert.ok(excluded(name).includes('zod'),`${name}: zod ${appZod} (app) and ${authZod} (better-auth) must not share one pre-bundled copy`);
 }
 assert.equal(config.optimizeDeps?.exclude?.includes('zod')??false,false,'the client environment is not touched');
 assert.equal(excluded('client').length,0);
});

test('dev: Workers AI goes through the remote binding by default; AMANAH_DEV_LOCAL_ONLY=1 starts without any remote connection',async()=>{
 const byDefault=await viteConfig({AMANAH_DEV_LOCAL_ONLY:undefined});
 assert.equal(byDefault.cloudflare.remoteBindings,true);
 assert.deepEqual(byDefault.cloudflare.viteEnvironment,{name:'rsc',childEnvironments:['ssr']});
 assert.equal((await viteConfig({AMANAH_DEV_LOCAL_ONLY:'1'})).cloudflare.remoteBindings,false);
 assert.equal((await viteConfig({AMANAH_DEV_LOCAL_ONLY:'0'})).cloudflare.remoteBindings,true);
});
