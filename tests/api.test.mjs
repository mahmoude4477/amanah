import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {existsSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
function loadTs(relativePath,mocks){
 const source=readFileSync(path.join(root,relativePath),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const loadedModule={exports:{}};
 new Function('require','module','exports',code)((id)=>{if(id in mocks)return mocks[id];if(id.startsWith('@/')||id.startsWith('.')||id.includes(':'))throw new Error(`unmocked import ${id} in ${relativePath}`);return require(id);},loadedModule,loadedModule.exports);
 return loadedModule.exports;
}

// D1 stand-in over node:sqlite with the real drizzle migrations (0000..0003, including Better Auth's "user" table).
const sqlite=new DatabaseSync(':memory:');
for(const file of readdirSync(path.join(root,'drizzle')).filter(name=>/^\d{4}_.+\.sql$/.test(name)).sort())sqlite.exec(readFileSync(path.join(root,'drizzle',file),'utf8'));
const statement=(sql,params=[])=>({
 bind:(...values)=>statement(sql,values),
 all:async()=>({success:true,results:sqlite.prepare(sql).all(...params).map(row=>({...row})),meta:{}}),
 first:async(column)=>{const row=sqlite.prepare(sql).get(...params);if(!row)return null;return column?row[column]:{...row};},
 run:async()=>{const info=sqlite.prepare(sql).run(...params);return {success:true,meta:{changes:Number(info.changes)}};},
});
const d1={prepare:(sql)=>statement(sql),batch:async(statements)=>{const results=[];for(const item of statements)results.push(await item.run());return results;}};
const row=(id)=>{const value=sqlite.prepare('SELECT * FROM amanah_checks WHERE id = ?').get(id);return value?{...value}:null;};

delete process.env.AMANAH_REVIEWER_EMAILS;
const workerEnv={AMANAH_REVIEWER_EMAILS:''};
const cloudflare={env:workerEnv};
const users={
 owner:{id:'u-owner',name:'صاحب الفحص',email:'owner@example.com',role:'user'},
 admin:{id:'u-admin',name:'مراجع مشرف',email:'admin@example.com',role:'admin'},
 listed:{id:'u-listed',name:'مراجع بالبريد',email:'Reviewer@Example.com',role:'user'},
 outsider:{id:'u-out',name:'مستخدم آخر',email:'outsider@example.com',role:'user'},
};
const insertUser=sqlite.prepare('INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt, role) VALUES (?, ?, ?, 1, ?, ?, ?)');
for(const user of Object.values(users))insertUser.run(user.id,user.name,user.email,'2026-01-01','2026-01-01',user.role);
// x-test-impersonator stands for a Better Auth impersonation session: the target user plus session.impersonatedBy.
const fakeAuth={getAuth:()=>({api:{getSession:async({headers})=>{const user=Object.values(users).find(item=>item.id===headers.get('x-test-user'));const impersonatedBy=headers.get('x-test-impersonator');return user?{user:{...user},session:{id:`s-${user.id}`,...(impersonatedBy?{impersonatedBy}:{})}}:null;}}})};

const envModule=loadTs('lib/server/env.ts',{'cloudflare:workers':cloudflare});
const http=loadTs('lib/server/http.ts',{'./auth':fakeAuth,'./env':envModule});
const languages=loadTs('lib/languages.ts',{});
const contracts=loadTs('lib/contracts.ts',{'./languages':languages});
// The provider is stubbed so no network call is made.
// Run end to end against the live endpoint on 3 October 2026 (local dev): PASS, CRITICAL with an override, ABSTAIN; stored results parsed in the review route.
// TODO(after-ml): repeat with a REVIEW result and on the deployed Worker before the presentation.
let analyze=async()=>{throw new Error('analysis stub not set');};let analysisCalls=0;
const provider={runAmanahAnalysis:async(input)=>{analysisCalls++;return analyze(input);}};
const common={'@/lib/contracts':contracts,'@/lib/languages':languages,'@/lib/server/http':http,'@/db/workspace':{workspaceDb:()=>d1},'@/lib/server/amanah-provider':provider};
const checkRows=loadTs('app/api/amanah/checks/check-rows.ts',common);
const inputScope=loadTs('app/api/amanah/checks/input-scope.ts',common);
const checksRoute=loadTs('app/api/amanah/checks/route.ts',{...common,'./check-rows':checkRows,'./input-scope':inputScope});
const reviewRoute=loadTs('app/api/amanah/checks/[id]/review/route.ts',{...common,'../../check-rows':checkRows});
const checkRoute=loadTs('app/api/amanah/checks/[id]/route.ts',common);
const {LIMITS}=contracts;

async function call(handler,{method='GET',url='/api/amanah/checks',user,body,origin='http://localhost',id,impersonator}={}){
 const headers=new Headers();if(user)headers.set('x-test-user',user.id);if(impersonator)headers.set('x-test-impersonator',impersonator.id);if(origin)headers.set('origin',origin);if(body!==undefined)headers.set('content-type','application/json');
 const response=await handler(new Request(`http://localhost${url}`,{method,headers,body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)}),{params:Promise.resolve({id})});
 return {status:response.status,body:await response.json()};
}
const list=(user,scope)=>call(checksRoute.GET,{user,url:scope?`/api/amanah/checks?scope=${scope}`:'/api/amanah/checks'});
const review=(user,id,body)=>call(reviewRoute.PATCH,{method:'PATCH',url:`/api/amanah/checks/${id}/review`,user,id,body});
const remove=(user,id,origin)=>call(checkRoute.DELETE,{method:'DELETE',url:`/api/amanah/checks/${id}`,user,id,origin});

const evidence={id:'tanzil:1.1:112:1',title:contracts.QURAN_EVIDENCE_TITLE,locator:'112:1',excerpt:'قُلْ هُوَ ٱللَّهُ أَحَدٌ',url:'https://tanzil.net/#112:1'};
const finding={id:'f1',kind:'inversion',severity:'critical',sourceSegment:'',translationSegment:'not One',explanation:'قلب المعنى.',evidenceIds:[evidence.id],label:'NEGATION_FLIP',origin:'model'};
const result=(status,extra={})=>({status,confidence:null,summary:'ملخص الفحص.',explanation:'شرح حتمي.',sourceMatch:{matched:true,registryId:evidence.id,normalizedCitation:'112:1',method:'exact',note:''},findings:status==='CRITICAL'?[finding]:[],evidence:[evidence],modelVersion:'amanah-ml:v0.1',completedAt:new Date().toISOString(),...extra});
const glossaryAlert={termId:'tawhid',term:'التوحيد',approved:['Tawhid'],rule:'لا يختزل في الوحدانية.',reference:'المرجعية والحزمة العلمية',referenceUrl:'https://islamic-content.com/dictionary',alert:true,message:'ترجمة اختزالية محتملة.'};
const quranInput=(over={})=>({title:'فحص سورة الإخلاص',contentType:'quran',source:{title:'القرآن الكريم',locator:'112:1',author:'',edition:'',grade:'',url:''},originalText:'قُلْ هُوَ اللَّهُ أَحَدٌ',translation:'Say: He is Allah, the One.',targetLanguage:'en',publicationUse:'internal_draft',...over});
const longNote='اعتمدتُ الترجمة لأن المعنى المذكور قول معتبر عند المفسرين، وراجعتُ تفسير الآية في المصادر المعتمدة.';
const approve=(extra={})=>({decision:'approved',note:'راجعت الترجمة والمصدر.',sourceConfirmed:true,...extra});

async function createCheck(user,status,over={},extra={}){
 analyze=async()=>result(status,extra);
 const response=await call(checksRoute.POST,{method:'POST',user,body:quranInput(over)});
 assert.equal(response.status,201,JSON.stringify(response.body));
 return response.body.check;
}
let legacyCount=0;
function insertLegacy(userId,request,stored,{reviewStatus='pending',publicationStatus='HUMAN_REVIEW_REQUIRED'}={}){
 const id=`legacy-${++legacyCount}`;const now=new Date(Date.UTC(2025,0,1,0,legacyCount)).toISOString();
 sqlite.prepare('INSERT INTO amanah_checks (id, user_id, title, content_type, request_json, result_json, analysis_status, publication_status, review_status, review_note, reviewed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run(id,userId,request.title,request.contentType,JSON.stringify(request),JSON.stringify(stored),stored.status,publicationStatus,reviewStatus,'',now,now);
 return id;
}
const legacyHadith=(source,over={})=>({title:'حديث قديم',contentType:'hadith',source:{title:'صحيح البخاري',locator:'رقم 1',author:'',edition:'',...source},originalText:'إنما الأعمال بالنيات',translation:'Actions are but by intentions.',targetLanguage:'English',publicationUse:'internal_draft',...over});

test('every endpoint requires a session',async()=>{
 assert.equal((await list()).status,401);
 assert.equal((await call(checksRoute.POST,{method:'POST',body:quranInput()})).status,401);
 assert.equal((await review(undefined,'x',approve())).status,401);
 assert.equal((await remove(undefined,'x')).status,401);
});

test('reviewer identity comes from the admin role or AMANAH_REVIEWER_EMAILS',()=>{
 workerEnv.AMANAH_REVIEWER_EMAILS=' first@example.com ; REVIEWER@example.com,';
 assert.equal(http.isReviewerUser({email:'reviewer@EXAMPLE.com',role:'user'}),true);
 assert.equal(http.isReviewerUser({email:'someone@example.com',role:'user,admin'}),true);
 assert.equal(http.isReviewerUser({email:'someone@example.com',role:'user'}),false);
 assert.equal(http.isReviewerUser({email:'',role:null}),false);
 workerEnv.AMANAH_REVIEWER_EMAILS='';
 assert.equal(http.isReviewerUser({email:'reviewer@example.com',role:'user'}),false);
});

test('owner decides an internal draft; the decision is final and records reviewer identity',async()=>{
 const check=await createCheck(users.owner,'REVIEW');
 assert.equal(check.reviewStatus,'pending');assert.equal(check.reviewer,null);assert.equal(check.reviewOverride,false);
 const response=await review(users.owner,check.id,approve());
 assert.equal(response.status,200,JSON.stringify(response.body));
 assert.deepEqual({...response.body,reviewedAt:undefined},{id:check.id,reviewStatus:'approved',publicationStatus:'HUMAN_APPROVED',reviewNote:'راجعت الترجمة والمصدر.',reviewedAt:undefined,reviewer:{name:users.owner.name,email:users.owner.email},reviewerRole:'owner',reviewOverride:false});
 const stored=row(check.id);
 assert.equal(stored.reviewed_by,users.owner.id);assert.equal(stored.reviewer_role,'owner');assert.equal(stored.review_override,0);
 assert.equal((await review(users.owner,check.id,approve())).body.code,'REVIEW_FINAL');
 const mine=(await list(users.owner)).body.checks.find(item=>item.id===check.id);
 assert.deepEqual(mine.reviewer,{name:users.owner.name,email:users.owner.email});
 assert.equal(mine.reviewerRole,'owner');assert.equal(mine.owner,undefined);
});

test('official publication: the creator gets 403, a non-reviewer 404, an independent reviewer 200',async()=>{
 const check=await createCheck(users.owner,'REVIEW',{publicationUse:'official_publication'});
 const own=await review(users.owner,check.id,approve());
 assert.equal(own.status,403);assert.equal(own.body.code,'INDEPENDENT_REVIEW_REQUIRED');
 assert.equal((await review(users.owner,check.id,{decision:'changes_requested',note:'سأعدل الترجمة لاحقًا.',sourceConfirmed:false})).status,403);
 assert.equal((await review(users.outsider,check.id,approve())).status,404);
 const response=await review(users.admin,check.id,approve());
 assert.equal(response.status,200,JSON.stringify(response.body));
 assert.equal(response.body.reviewerRole,'reviewer');assert.deepEqual(response.body.reviewer,{name:users.admin.name,email:users.admin.email});
 const stored=row(check.id);
 assert.equal(stored.reviewed_by,users.admin.id);assert.equal(stored.reviewer_role,'reviewer');assert.equal(stored.user_id,users.owner.id);
 const mine=(await list(users.owner)).body.checks.find(item=>item.id===check.id);
 assert.equal(mine.publicationStatus,'HUMAN_APPROVED');assert.equal(mine.reviewer.email,users.admin.email);assert.equal(mine.reviewerRole,'reviewer');
});

test('a reviewer listed in AMANAH_REVIEWER_EMAILS may decide official checks (case-insensitive)',async()=>{
 const check=await createCheck(users.owner,'PASS',{publicationUse:'official_publication'});
 assert.equal((await review(users.listed,check.id,approve())).status,404);
 workerEnv.AMANAH_REVIEWER_EMAILS='nobody@example.com, reviewer@example.com';
 try{
  const response=await review(users.listed,check.id,{decision:'changes_requested',note:'المصطلح يحتاج إلى مراجعة.',sourceConfirmed:false});
  assert.equal(response.status,200,JSON.stringify(response.body));
  assert.equal(response.body.publicationStatus,'CHANGES_REQUESTED');
  assert.equal(row(check.id).reviewed_by,users.listed.id);assert.equal(row(check.id).reviewer_role,'reviewer');
 }finally{workerEnv.AMANAH_REVIEWER_EMAILS='';}
});

test('ABSTAIN is never approvable, even with an override',async()=>{
 const check=await createCheck(users.owner,'ABSTAIN',{publicationUse:'official_publication'});
 assert.equal(check.publicationStatus,'BLOCKED');
 const response=await review(users.admin,check.id,approve({override:true,note:longNote}));
 assert.equal(response.status,409);assert.equal(response.body.code,'APPROVAL_NOT_ALLOWED');
 const changes=await review(users.admin,check.id,{decision:'changes_requested',note:'النص لا يطابق الآية.',sourceConfirmed:false});
 assert.equal(changes.status,200);assert.equal(changes.body.publicationStatus,'CHANGES_REQUESTED');
});

test('CRITICAL needs a documented override by an independent reviewer',async()=>{
 const check=await createCheck(users.owner,'CRITICAL',{publicationUse:'official_publication'});
 const plain=await review(users.admin,check.id,approve());
 assert.equal(plain.status,409);assert.equal(plain.body.code,'OVERRIDE_REQUIRED');
 const short=await review(users.admin,check.id,approve({override:true,note:'قول معتبر.'}));
 assert.equal(short.status,400);assert.equal(short.body.code,'VALIDATION_ERROR');assert.match(short.body.error,/40/);
 const draft=await createCheck(users.owner,'CRITICAL');
 const ownOverride=await review(users.owner,draft.id,approve({override:true,note:longNote}));
 assert.equal(ownOverride.status,403);assert.equal(ownOverride.body.code,'OVERRIDE_REVIEWER_ONLY');
 assert.equal((await review(users.owner,draft.id,{decision:'changes_requested',note:'سأصحح النفي.',sourceConfirmed:false})).body.publicationStatus,'BLOCKED');
 const response=await review(users.admin,check.id,approve({override:true,note:longNote}));
 assert.equal(response.status,200,JSON.stringify(response.body));
 assert.equal(response.body.reviewOverride,true);assert.equal(response.body.publicationStatus,'HUMAN_APPROVED');
 assert.equal(row(check.id).review_override,1);assert.equal(row(check.id).review_note,longNote);
 assert.equal((await list(users.owner)).body.checks.find(item=>item.id===check.id).reviewOverride,true);
});

test('an override flag on a non-critical result is not recorded as an override',async()=>{
 const check=await createCheck(users.owner,'REVIEW',{publicationUse:'official_publication'});
 const response=await review(users.admin,check.id,approve({override:true,note:longNote}));
 assert.equal(response.status,200);assert.equal(response.body.reviewOverride,false);assert.equal(row(check.id).review_override,0);
});

test('approval requires confirming the source and, when glossary alerts exist, the terminology',async()=>{
 const check=await createCheck(users.owner,'REVIEW',{},{glossary:[glossaryAlert]});
 assert.equal((await review(users.owner,check.id,approve({sourceConfirmed:false}))).body.code,'SOURCE_CONFIRMATION_REQUIRED');
 const missing=await review(users.owner,check.id,approve());
 assert.equal(missing.status,400);assert.equal(missing.body.code,'TERMINOLOGY_CONFIRMATION_REQUIRED');
 assert.equal((await review(users.owner,check.id,approve({terminologyConfirmed:true}))).status,200);
 const quiet=await createCheck(users.owner,'REVIEW',{},{glossary:[{...glossaryAlert,alert:false}]});
 assert.equal((await review(users.owner,quiet.id,approve())).status,200);
});

// B3: Qur'an only. New hadith or tafsir checks are refused before any analysis; stored ones still list, read-only, and are never approved.
test('new hadith and tafsir checks are refused with 400; only the Qur\'an is analysed',async()=>{
 analyze=async()=>result('REVIEW');const before=analysisCalls;
 const tafsirSource={title:'تفسير ابن كثير',locator:'الإخلاص',author:'ابن كثير',edition:'',grade:'',url:''};
 for(const over of [
  {contentType:'hadith',source:{title:'صحيح البخاري',locator:'رقم 1',author:'',edition:'',grade:'صحيح',url:'https://dorar.net/hadith/1'},originalText:'إنما الأعمال بالنيات',translation:'Actions are but by intentions.'},
  {contentType:'tafsir',source:tafsirSource,originalText:'أي هو الواحد الأحد',translation:'He is the One.'},
  {contentType:'fatwa'},
 ]){
  const response=await call(checksRoute.POST,{method:'POST',user:users.owner,body:quranInput(over)});
  assert.equal(response.status,400,JSON.stringify(over));assert.equal(response.body.code,'VALIDATION_ERROR');assert.equal(response.body.error,contracts.QURAN_ONLY_MESSAGE);
 }
 assert.equal(analysisCalls,before,'a refused request never reaches the model');
});

test('stored hadith and tafsir checks still list and read, but their approval answers 409',async()=>{
 const httpEvidence={...evidence,id:'submitted:hadith:1',url:'http://example.com/hadith'};
 const hadithResult=result('REVIEW',{evidence:[httpEvidence],sourceMatch:{matched:false,registryId:httpEvidence.id,normalizedCitation:'صحيح البخاري · رقم 1',method:'submitted',note:''}});
 const draft=insertLegacy(users.owner.id,legacyHadith({grade:'صحيح (البخاري)',url:'https://dorar.net/hadith/1'}),hadithResult);
 const official=insertLegacy(users.owner.id,legacyHadith({grade:'صحيح',url:'https://dorar.net/hadith/2'},{publicationUse:'official_publication'}),hadithResult);
 const unsupported=insertLegacy(users.owner.id,legacyHadith({grade:'',url:''}),{...result('ABSTAIN'),modelVersion:'source:unsupported',evidence:[],sourceMatch:{matched:false,registryId:'',normalizedCitation:'رقم 1',method:'none',note:'لا يتوفر سجل مصادر موثق.'}});
 const tafsir=insertLegacy(users.owner.id,{...quranInput(),contentType:'tafsir',source:{title:'تفسير ابن كثير',locator:'الإخلاص',author:'ابن كثير',edition:'',grade:'',url:''},originalText:'أي هو الواحد الأحد'},result('PASS',{modelVersion:'partner:semantic-1',evidence:[]}));
 const listed=(await list(users.owner)).body.checks;
 for(const [id,type] of [[draft,'hadith'],[official,'hadith'],[unsupported,'hadith'],[tafsir,'tafsir']]){
  const item=listed.find(check=>check.id===id);
  assert.ok(item,id);assert.equal(item.request.contentType,type);assert.equal(item.reviewStatus,'pending');
  assert.equal(contracts.storedAnalysisResultSchema.safeParse(item.result).success,true,id);
 }
 assert.equal(listed.find(check=>check.id===draft).request.source.grade,'صحيح (البخاري)');
 for(const id of [draft,tafsir]){
  const response=await review(users.owner,id,approve({terminologyConfirmed:true,instructionsConfirmed:true}));
  assert.equal(response.status,409,id);assert.equal(response.body.code,'CONTENT_TYPE_RETIRED');assert.match(response.body.error,/القرآن الكريم فقط/);
 }
 assert.equal((await review(users.admin,official,approve())).body.code,'CONTENT_TYPE_RETIRED','an independent reviewer cannot approve it either');
 const queue=await list(users.admin,'review');const dash=await list(users.admin,'dashboard');
 assert.ok(!queue.body.checks.some(item=>item.id===official),'a stored official hadith check stays out of the reviewer queue (read-only, no decision form)');
 assert.equal(dash.body.reviewQueue,queue.body.checks.length,'and out of the queue count');
 for(const id of [draft,official,tafsir])assert.equal(row(id).review_status,'pending');
 const back=await review(users.owner,unsupported,{decision:'changes_requested',note:'خارج نطاق النسخة المقاسة.',sourceConfirmed:false});
 assert.equal(back.status,200,'it can still be closed as returned for correction');assert.equal(back.body.publicationStatus,'CHANGES_REQUESTED');
});

test('scope=review is reviewer-only and lists only other people\'s pending official checks with the owner',async()=>{
 const forbidden=await list(users.outsider,'review');
 assert.equal(forbidden.status,403);assert.equal(forbidden.body.code,'REVIEWER_ONLY');
 assert.equal((await list(users.owner,'everything')).status,400);
 const pending=await createCheck(users.owner,'REVIEW',{publicationUse:'official_publication'});
 const draft=await createCheck(users.owner,'REVIEW');
 const decided=await createCheck(users.owner,'REVIEW',{publicationUse:'official_publication'});
 await review(users.admin,decided.id,approve());
 const ownOfficial=await createCheck(users.admin,'REVIEW',{publicationUse:'official_publication'});
 const response=await list(users.admin,'review');
 assert.equal(response.status,200);assert.equal(response.body.viewer.isReviewer,true);
 const ids=response.body.checks.map(item=>item.id);
 assert.ok(ids.includes(pending.id));
 for(const excluded of [draft.id,decided.id,ownOfficial.id])assert.ok(!ids.includes(excluded),excluded);
 for(const item of response.body.checks){
  assert.equal(item.reviewStatus,'pending');assert.equal(item.request.publicationUse,'official_publication');assert.notEqual(item.owner?.email,users.admin.email);
 }
 assert.deepEqual(response.body.checks.find(item=>item.id===pending.id).owner,{name:users.owner.name,email:users.owner.email});
 assert.equal((await list(users.owner)).body.viewer.isReviewer,false);
});

test('GET and PATCH keep users isolated',async()=>{
 const check=await createCheck(users.owner,'REVIEW');
 const outsiderList=(await list(users.outsider)).body.checks;
 assert.ok(outsiderList.every(item=>item.id!==check.id));
 assert.ok((await list(users.owner)).body.checks.some(item=>item.id===check.id));
 assert.equal((await review(users.outsider,check.id,approve())).status,404);
 assert.equal((await review(users.admin,check.id,approve())).status,404);
 assert.equal(row(check.id).review_status,'pending');
});

test('DELETE removes only the caller\'s own check and enforces same origin',async()=>{
 const check=await createCheck(users.owner,'REVIEW');
 assert.equal((await remove(users.outsider,check.id)).status,404);
 assert.equal((await remove(users.admin,check.id)).status,404);
 assert.equal((await remove(users.owner,check.id,'https://evil.example')).status,403);
 assert.ok(row(check.id));
 const response=await remove(users.owner,check.id);
 assert.equal(response.status,200);assert.deepEqual(response.body,{id:check.id,deleted:true});
 assert.equal(row(check.id),null);
 assert.equal((await remove(users.owner,check.id)).status,404);
});

test('scope=export returns every own check past the 100-row list cap, and none of another user\'s',async()=>{
 const before=(await list(users.outsider,'export')).body.checks.length;
 const ids=Array.from({length:101},()=>insertLegacy(users.outsider.id,quranInput(),result('REVIEW')));
 const other=insertLegacy(users.owner.id,quranInput(),result('REVIEW'));
 assert.equal((await list(users.outsider)).body.checks.length,100);
 const exported=await list(users.outsider,'export');
 assert.equal(exported.status,200);assert.equal(exported.body.checks.length,before+101);
 const exportedIds=new Set(exported.body.checks.map(item=>item.id));
 assert.ok(ids.every(id=>exportedIds.has(id)));assert.ok(!exportedIds.has(other));
 for(const id of [...ids,other])sqlite.prepare('DELETE FROM amanah_checks WHERE id = ?').run(id);
});

test('an analysis result that breaks the contract is rejected and never stored',async()=>{
 const total=()=>Number(sqlite.prepare('SELECT COUNT(*) AS n FROM amanah_checks').get().n);const before=total();
 const logged=[];const original=console.error;console.error=(...args)=>logged.push(args);
 try{
  for(const bad of [result('REVIEW',{evidence:[{...evidence,url:'http://tanzil.net/#112:1'}]}),{...result('PASS'),status:'SAFE'},{...result('REVIEW'),summary:''}]){
   analyze=async()=>bad;
   const response=await call(checksRoute.POST,{method:'POST',user:users.owner,body:quranInput()});
   assert.equal(response.status,502,JSON.stringify(response.body));assert.equal(response.body.code,'INVALID_ANALYSIS_RESULT');
  }
 }finally{console.error=original;}
 assert.equal(total(),before);
 assert.ok(!JSON.stringify(logged).includes('tanzil'),JSON.stringify(logged));
});

test('input control rejects out-of-scope requests before any analysis',async()=>{
 analyze=async()=>result('REVIEW');
 const before=analysisCalls;
 const arabic=await call(checksRoute.POST,{method:'POST',user:users.owner,body:quranInput({translation:'قل هو الله أحد، وهذه ليست ترجمة إنجليزية'})});
 assert.equal(arabic.status,400);assert.equal(arabic.body.code,'TRANSLATION_LANGUAGE_MISMATCH');assert.match(arabic.body.error,/الإنجليزية/);
 assert.deepEqual(Object.keys(arabic.body.details.fieldErrors),['translation']);
 const referral='أمانة تفحص الترجمات ولا تجيب عن الأسئلة أو الفتاوى الشخصية؛ للفتوى ارجع إلى جهة إفتاء معتمدة.';
 for(const over of [
  {title:'هل يجوز لي أن أعقد زواجي في البلدية دون ولي؟'},
  {title:'سؤال: ما حُكْمُ أنْ أصلي في البيت؟'},
  {translation:'I am asking: is it permissible for me to marry without a guardian?'},
  {translation:'Is it HALAL for me to do this?'},
  {translation:'Please give me a fatwa about my marriage.'},
  {translation:'أنا في دولة أوروبية، هل يحل لي ذلك؟'},
 ]){
  const response=await call(checksRoute.POST,{method:'POST',user:users.owner,body:quranInput(over)});
  assert.equal(response.status,400,JSON.stringify(over));assert.equal(response.body.code,'OUT_OF_SCOPE_PERSONAL_FATWA');assert.equal(response.body.error,referral);
 }
 assert.equal(analysisCalls,before);
 for(const over of [
  {translation:'Say: He is Allah (الله), the One.'},
  {translation:'They ask you for a fatwa; say: Allah gives you a ruling.'},
  {translation:'ہمیشہ اللہ ایک ہے', targetLanguage:'ur'},
 ]){
  const response=await call(checksRoute.POST,{method:'POST',user:users.owner,body:quranInput(over)});
  assert.equal(response.status,201,JSON.stringify([over,response.body]));
 }
 assert.equal(analysisCalls,before+3);
});

test('request size limits are counted in UTF-8 bytes and contract messages surface in Arabic',async()=>{
 analyze=async()=>result('REVIEW');
 const huge=JSON.stringify(quranInput({translation:'a'.repeat(LIMITS.checkRequestMaxBytes)}));
 assert.equal((await call(checksRoute.POST,{method:'POST',user:users.owner,body:huge})).status,413);
 const arabicBody=JSON.stringify({...quranInput(),note:'ع'.repeat(Math.ceil(LIMITS.checkRequestMaxBytes/2)+10)});
 assert.ok(arabicBody.length<LIMITS.checkRequestMaxBytes);
 assert.equal((await call(checksRoute.POST,{method:'POST',user:users.owner,body:arabicBody})).status,413);
 const tooLong=await call(checksRoute.POST,{method:'POST',user:users.owner,body:quranInput({translation:'word '.repeat(900)})});
 assert.equal(tooLong.status,400);assert.match(tooLong.body.error,/4000/);
 const legacyName=await call(checksRoute.POST,{method:'POST',user:users.owner,body:quranInput({targetLanguage:'English'})});
 assert.equal(legacyName.status,400);assert.equal(legacyName.body.error,'اختر لغة الترجمة من القائمة.');
 assert.equal((await call(checksRoute.POST,{method:'POST',user:users.owner,body:'{oops'})).body.code,'INVALID_JSON');
 assert.equal((await call(reviewRoute.PATCH,{method:'PATCH',user:users.owner,id:'x',body:JSON.stringify({decision:'approved',note:'x'.repeat(LIMITS.reviewRequestMaxBytes),sourceConfirmed:true})})).status,413);
});

test('unexpected errors are logged by name only, never with payload text',async()=>{
 analyze=async()=>{const error=new TypeError('secret translation text قل هو الله أحد');error.code='E_STUB';throw error;};
 const logged=[];const original=console.error;console.error=(...args)=>logged.push(args);
 try{
  const response=await call(checksRoute.POST,{method:'POST',user:users.owner,body:quranInput()});
  assert.equal(response.status,500);assert.equal(response.body.code,'INTERNAL_ERROR');
 }finally{console.error=original;}
 const text=JSON.stringify(logged);
 assert.ok(!text.includes('secret')&&!text.includes('قل هو'),text);
 assert.match(text,/TypeError/);assert.match(text,/E_STUB/);
});

test('legacy rows with free-text language and http evidence still list and review',async()=>{
 const id=insertLegacy(users.owner.id,{...quranInput(),targetLanguage:'English'},result('REVIEW',{evidence:[{...evidence,url:'http://tanzil.net/#112:1'}]}));
 const item=(await list(users.owner)).body.checks.find(check=>check.id===id);
 assert.equal(item.request.targetLanguage,'English');assert.equal(item.reviewer,null);assert.equal(item.reviewerRole,null);assert.equal(item.reviewOverride,false);
 assert.equal(item.result.evidence[0].url,'http://tanzil.net/#112:1');
 assert.equal((await review(users.owner,id,approve())).status,200);
 const unsafe=insertLegacy(users.owner.id,{...quranInput(),source:{...quranInput().source,url:'javascript:alert(1)'}},result('REVIEW',{evidence:[{...evidence,url:'javascript:alert(1)'}]}));
 const cleaned=(await list(users.owner)).body.checks.find(check=>check.id===unsafe);
 assert.equal(cleaned.result.evidence[0].url,'');assert.equal(cleaned.request.source.url,'');
 assert.equal((await review(users.owner,unsafe,approve())).body.code,'RESULT_UNREADABLE');
});

// Better Auth is loaded for real in the last test below; here the options object is inspected through a stub.
const loadAuth=(betterAuth=(options)=>options)=>loadTs('lib/server/auth.ts',{'cloudflare:workers':cloudflare,'better-auth':{betterAuth},'better-auth/plugins':{admin:(options)=>({id:'admin',options})},'better-auth/plugins/admin/access':require('better-auth/plugins/admin/access'),'@/db/workspace':{workspaceDb:()=>d1}});
test('Better Auth config keeps sign-in rate limiting without storing the IP, and removes impersonation from the admin role',async()=>{
 const auth=loadAuth();
 assert.throws(()=>auth.createAuth(d1,'short'));
 const options=auth.createAuth(d1,'x'.repeat(32));
 assert.equal(options.advanced.ipAddress.disableIpTracking,undefined,'disableIpTracking would switch off Better Auth rate limiting');
 assert.equal(options.rateLimit.enabled,true,'Better Auth enables rate limiting by itself only when NODE_ENV is production, which the Worker never sets');
 assert.deepEqual(options.rateLimit.customRules['/delete-user'],{window:60,max:3});
 assert.deepEqual(options.advanced.ipAddress.ipAddressHeaders,['cf-connecting-ip']);
 assert.deepEqual(await options.databaseHooks.session.create.before({id:'s1',token:'t',userId:'u',ipAddress:'203.0.113.9',userAgent:'ua'},null),{data:{id:'s1',token:'t',userId:'u',ipAddress:'',userAgent:'ua'}});
 assert.deepEqual(await options.databaseHooks.session.update.before({ipAddress:'203.0.113.9'},null),{data:{ipAddress:''}});
 assert.equal(await options.databaseHooks.session.update.before({expiresAt:new Date()},null),undefined);
 assert.equal(options.user.deleteUser.enabled,true);
 assert.equal(options.emailAndPassword.disableSignUp,true);
 const roles=options.plugins[0].options.roles;
 assert.equal(roles.admin.authorize({user:['impersonate']}).success,false);
 assert.equal(roles.admin.authorize({user:['impersonate-admins']}).success,false);
 for(const permission of ['create','list','set-role','ban','delete','set-password','get','update'])assert.equal(roles.admin.authorize({user:[permission]}).success,true,permission);
 assert.equal(roles.user.authorize({user:['list']}).success,false);
});

test('account deletion removes the user\'s checks and the rows of the earlier products, and only theirs',async()=>{
 const options=loadAuth().createAuth(d1,'x'.repeat(32));
 const now='2026-01-01T00:00:00.000Z';
 const legacyRows=userId=>{sqlite.prepare('INSERT INTO workspaces (user_id, data, version, updated_at) VALUES (?, ?, 1, ?)').run(userId,'{"posts":[]}',now);sqlite.prepare('INSERT INTO nabd_runs (id, user_id, status, stage, input_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`run-${userId}`,userId,'done','report','{}',now,now);};
 const count=(table,userId)=>Number(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(userId).n);
 const request=quranInput();const stored=result('REVIEW');
 for(const userId of ['u-delete','u-removed','u-keep']){insertLegacy(userId,request,stored);insertLegacy(userId,request,stored);legacyRows(userId);}
 await options.user.deleteUser.beforeDelete({id:'u-delete'});
 await options.databaseHooks.user.delete.after({id:'u-removed'},null);
 for(const userId of ['u-delete','u-removed'])for(const table of ['amanah_checks','workspaces','nabd_runs'])assert.equal(count(table,userId),0,`${table} ${userId}`);
 assert.deepEqual(['amanah_checks','workspaces','nabd_runs'].map(table=>count(table,'u-keep')),[2,1,1]);
});

// The real library, with the options of lib/server/auth.ts (only the database is swapped): sign-in attempts are rate-limited and no IP
// reaches the session row. NODE_ENV stays unset, as in the deployed Worker, so the shipped rateLimit option is what switches the limiter on.
test('with the real Better Auth, wrong-password sign-ins are rate-limited and the stored session has no IP address',async()=>{
 assert.notEqual(process.env.NODE_ENV,'production','runs as the Worker does, without NODE_ENV=production');
 const {betterAuth}=await import('better-auth');const {memoryAdapter}=await import('better-auth/adapters/memory');
 const options=loadAuth().createAuth(d1,'x'.repeat(32));
 const db={user:[],session:[],account:[],verification:[]};
 const shared={secret:'y'.repeat(40),baseURL:'http://localhost:3000',emailAndPassword:{enabled:true},advanced:options.advanced,logger:{disabled:true}};
 assert.equal((await betterAuth({...shared,database:memoryAdapter({user:[],session:[],account:[],verification:[]})}).$context).rateLimit.enabled,false,'without the explicit option Better Auth would not rate-limit here');
 const real=betterAuth({...shared,database:memoryAdapter(db),rateLimit:options.rateLimit,databaseHooks:{session:options.databaseHooks.session}});
 assert.equal((await real.$context).rateLimit.enabled,true);
 const post=(route,body,ip)=>real.handler(new Request(`http://localhost:3000/api/auth/${route}`,{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost:3000','cf-connecting-ip':ip},body:JSON.stringify(body)}));
 const signUp=await post('sign-up/email',{email:'reviewer@example.com',password:'correct horse battery',name:'مراجع'},'198.51.100.1');
 assert.equal(signUp.status,200,await signUp.clone().text());
 assert.ok(db.session.length>0);assert.ok(db.session.every(session=>!session.ipAddress),JSON.stringify(db.session.map(session=>session.ipAddress)));
 const codes=[];for(let attempt=0;attempt<8;attempt++)codes.push((await post('sign-in/email',{email:'reviewer@example.com',password:`guess-${attempt}`},'203.0.113.9')).status);
 assert.deepEqual(codes.slice(0,4),[401,401,401,429],codes.join(','));
 assert.equal((await post('sign-in/email',{email:'reviewer@example.com',password:'correct horse battery'},'198.51.100.2')).status,200,'another address is not blocked');
 assert.ok(db.session.every(session=>!session.ipAddress));
 const deletes=[];for(let attempt=0;attempt<4;attempt++)deletes.push((await post('delete-user',{password:`guess-${attempt}`},'203.0.113.10')).status);
 assert.equal(deletes[3],429,deletes.join(','));
});

// An admin impersonating a listed reviewer must not count as an independent reviewer, nor read that user's drafts.
test('impersonated sessions are refused on every Amanah endpoint',async()=>{
 workerEnv.AMANAH_REVIEWER_EMAILS='reviewer@example.com';
 try{
  const official=await createCheck(users.owner,'REVIEW',{publicationUse:'official_publication'});
  const draft=await createCheck(users.listed,'REVIEW');
  const as=(user,options)=>call(options.handler,{...options,user,impersonator:users.admin});
  const responses=[
   await as(users.listed,{handler:reviewRoute.PATCH,method:'PATCH',url:`/api/amanah/checks/${official.id}/review`,id:official.id,body:approve()}),
   await as(users.listed,{handler:checksRoute.GET}),
   await as(users.listed,{handler:checksRoute.GET,url:'/api/amanah/checks?scope=review'}),
   await as(users.listed,{handler:checksRoute.POST,method:'POST',body:quranInput()}),
   await as(users.listed,{handler:checkRoute.DELETE,method:'DELETE',url:`/api/amanah/checks/${draft.id}`,id:draft.id}),
  ];
  for(const response of responses){assert.equal(response.status,403,JSON.stringify(response.body));assert.equal(response.body.code,'IMPERSONATION_NOT_ALLOWED');}
  assert.equal(row(official.id).review_status,'pending');assert.equal(row(official.id).reviewed_by,null);assert.ok(row(draft.id));
  assert.equal((await review(users.listed,official.id,approve())).status,200,'the reviewer in person may still decide');
 }finally{workerEnv.AMANAH_REVIEWER_EMAILS='';}
});

test('checks stored before the AMANAH model (LLM status or older Tanzil match) cannot be approved, only returned for correction',async()=>{
 const legacyLlm=result('PASS',{modelVersion:'workers-ai:@cf/meta/llama-3.3-70b-instruct-fp8-fast'});
 const draft=insertLegacy(users.owner.id,{...quranInput(),targetLanguage:'English'},legacyLlm);
 const approval=await review(users.owner,draft,approve());
 assert.equal(approval.status,409);assert.equal(approval.body.code,'RECHECK_REQUIRED');
 const official=insertLegacy(users.owner.id,{...quranInput(),targetLanguage:'English',publicationUse:'official_publication'},legacyLlm);
 assert.equal((await review(users.admin,official,approve())).body.code,'RECHECK_REQUIRED');
 const oldTitle=insertLegacy(users.owner.id,quranInput(),result('PASS',{modelVersion:'amanah-ml:v0.1',evidence:[{...evidence,title:'نص القرآن الكريم · مشروع تنزيل (نسخة 1.1)',excerpt:'قل هو الله أحد'}]}));
 assert.equal((await review(users.owner,oldTitle,approve())).body.code,'RECHECK_REQUIRED');
 const back=await review(users.owner,draft,{decision:'changes_requested',note:'أعد الفحص بنموذج أمانة.',sourceConfirmed:false});
 assert.equal(back.status,200);assert.equal(back.body.publicationStatus,'CHANGES_REQUESTED');
 // A Qur'an status from another engine (the former partner, with its own version and registry evidence) was never issued by the
 // AMANAH model (B1), so it is not approvable either, by its owner or by an independent reviewer; it can still be returned.
 const partnerResult=result('PASS',{modelVersion:'amanah-semantic-1',evidence:[{...evidence,id:'reg-1'}],sourceMatch:{matched:true,registryId:'reg-1',normalizedCitation:'112:1',method:'catalog',note:''}});
 const partnerDraft=insertLegacy(users.owner.id,quranInput(),partnerResult);
 assert.equal((await review(users.owner,partnerDraft,approve())).body.code,'RECHECK_REQUIRED');
 const partnerOfficial=insertLegacy(users.owner.id,quranInput({publicationUse:'official_publication'}),partnerResult);
 assert.equal((await review(users.admin,partnerOfficial,approve())).body.code,'RECHECK_REQUIRED');
 assert.equal(row(partnerDraft).review_status,'pending');
 assert.equal((await review(users.owner,partnerDraft,{decision:'changes_requested',note:'أعد الفحص بنموذج أمانة.',sourceConfirmed:false})).status,200);
 for(const [modelVersion,recheck] of [['amanah-ml:v0.1',false],['source:tanzil-1.1',false],['demo:sample',false],['amanah-semantic-1',true],['partner:semantic-1',true],['registry:tafsir',true]])assert.equal(contracts.needsRecheck('quran',{modelVersion,evidence:[evidence]}),recheck,modelVersion);
 const tafsirPartner=insertLegacy(users.owner.id,{...quranInput(),contentType:'tafsir',source:{title:'تفسير',locator:'1',author:'مؤلف',edition:'',grade:'',url:''}},result('REVIEW',{modelVersion:'partner:semantic-1',evidence:[]}));
 assert.equal((await review(users.owner,tafsirPartner,approve())).body.code,'CONTENT_TYPE_RETIRED','tafsir is outside the measured scope, whatever engine checked it');
});

test('a legacy row with a non-http(s) evidence link can be returned for correction but not approved',async()=>{
 const unsafe=insertLegacy(users.owner.id,quranInput(),result('REVIEW',{evidence:[{...evidence,url:'javascript:alert(1)'}]}));
 assert.equal((await review(users.owner,unsafe,approve())).body.code,'RESULT_UNREADABLE');
 const back=await review(users.owner,unsafe,{decision:'changes_requested',note:'الرابط غير صالح، أعد الفحص.',sourceConfirmed:false});
 assert.equal(back.status,200,JSON.stringify(back.body));assert.equal(row(unsafe).review_status,'changes_requested');
 const official=insertLegacy(users.owner.id,{...quranInput(),publicationUse:'official_publication'},result('REVIEW',{evidence:[{...evidence,url:'ftp://example.com/a'}]}));
 assert.equal((await review(users.admin,official,{decision:'changes_requested',note:'الرابط غير صالح، أعد الفحص.',sourceConfirmed:false})).status,200);
 const broken=insertLegacy(users.owner.id,quranInput(),{status:'REVIEW'});
 assert.equal((await review(users.owner,broken,{decision:'changes_requested',note:'نتيجة غير مقروءة.',sourceConfirmed:false})).body.code,'RESULT_UNREADABLE');
});

// م-06: the record and its export hold the canonical verse, never the submitted spelling whose spaces, digits and marks were ignored.
test('an exact Quran match stores the canonical verse as the original text; anything else keeps the submitted text',async()=>{
 const submitted='قل هو الله أحد (1) ✝✝';
 const exact=await createCheck(users.owner,'REVIEW',{originalText:submitted});
 assert.equal(exact.request.originalText,evidence.excerpt);
 assert.equal(JSON.parse(row(exact.id).request_json).originalText,evidence.excerpt);
 const abstained=await createCheck(users.owner,'ABSTAIN',{originalText:submitted},{sourceMatch:{matched:false,registryId:'',normalizedCitation:'',method:'none',note:'لا يطابق.'}});
 assert.equal(JSON.parse(row(abstained.id).request_json).originalText,submitted);
 // B5: only the ayah reference is sent; the stored record still carries the canonical verse of the exact match.
 analyze=async()=>result('REVIEW');
 const byReference=await call(checksRoute.POST,{method:'POST',user:users.owner,body:{title:'فحص سورة الإخلاص',contentType:'quran',source:{locator:'112:1'},translation:'Say: He is Allah, the One.',targetLanguage:'en',publicationUse:'internal_draft'}});
 assert.equal(byReference.status,201,JSON.stringify(byReference.body));
 const storedRequest=JSON.parse(row(byReference.body.check.id).request_json);
 assert.equal(storedRequest.originalText,evidence.excerpt);assert.equal(storedRequest.contentType,'quran');
 assert.deepEqual(storedRequest.source,{title:'',locator:'112:1',author:'',edition:'',grade:'',url:''});
 assert.equal(contracts.storedAmanahRequestSchema.safeParse(storedRequest).success,true);
});

test('a personal question pasted into the Arabic source field is referred, not analysed (م-26); no Quran verse triggers it',async()=>{
 analyze=async()=>result('REVIEW');const before=analysisCalls;
 for(const over of [{originalText:'هل يجوز لي أن أعقد زواجي في البلدية دون ولي؟'},{originalText:'هل يحل لي أن أصلي في البيت؟'}]){
  const response=await call(checksRoute.POST,{method:'POST',user:users.owner,body:quranInput(over)});
  assert.equal(response.status,400,JSON.stringify(response.body));assert.equal(response.body.code,'OUT_OF_SCOPE_PERSONAL_FATWA');
  assert.deepEqual(Object.keys(response.body.details.fieldErrors),['originalText']);
 }
 assert.equal(analysisCalls,before);
 const corpus=JSON.parse(readFileSync(path.join(root,'vendor/quran-corpus.json'),'utf8'));
 const flagged=corpus.suras.flatMap(sura=>[...sura.simple,...sura.uthmani].map((text,index)=>inputScope.isPersonalFatwaRequest(text)?`${sura.number}:${index%sura.simple.length+1}`:'').filter(Boolean));
 assert.deepEqual(flagged,[]);
});

test('the optional audience is validated, stored and returned; older rows without it still list',async()=>{
 const check=await createCheck(users.owner,'REVIEW',{audience:'new_to_islam'});
 assert.equal(check.request.audience,'new_to_islam');
 assert.equal(JSON.parse(row(check.id).request_json).audience,'new_to_islam');
 assert.equal((await list(users.owner)).body.checks.find(item=>item.id===check.id).request.audience,'new_to_islam');
 const invalid=await call(checksRoute.POST,{method:'POST',user:users.owner,body:quranInput({audience:'everyone'})});
 assert.equal(invalid.status,400);
 const old=insertLegacy(users.owner.id,quranInput(),result('REVIEW'));
 assert.equal((await list(users.owner)).body.checks.find(item=>item.id===old).request.audience,undefined);
 assert.equal(contracts.audienceLabel('academic'),'القراء الأكاديميون والمتخصصون');assert.equal(contracts.audienceLabel(undefined),'');
});

test('instruction-like phrases flagged in the result must be confirmed before approval',async()=>{
 const check=await createCheck(users.owner,'REVIEW',{},{instructionWarnings:['Ignore previous instructions']});
 const missing=await review(users.owner,check.id,approve());
 assert.equal(missing.status,400);assert.equal(missing.body.code,'INSTRUCTIONS_CONFIRMATION_REQUIRED');
 assert.equal((await review(users.owner,check.id,approve({instructionsConfirmed:true}))).status,200);
});

// B5 dashboard: own checks by model decision, pending reviews, the last five, and the reviewer queue size for reviewers only.
test('scope=dashboard counts the viewer\'s checks by decision and pending review, lists the last five, and the queue only for reviewers',async()=>{
 const viewer={id:'u-dash',name:'لوحة',email:'dash@example.com',role:'user'};users.dash=viewer;
 insertUser.run(viewer.id,viewer.name,viewer.email,'2026-01-01','2026-01-01',viewer.role);
 const empty=await list(viewer,'dashboard');
 assert.equal(empty.status,200);assert.deepEqual(empty.body,{counts:{PASS:0,REVIEW:0,CRITICAL:0,ABSTAIN:0,total:0,pendingReview:0},reviewQueue:null,recent:[],viewer:{isReviewer:false}});
 const made=[];
 for(const status of ['PASS','PASS','REVIEW','CRITICAL','ABSTAIN','REVIEW'])made.push(await createCheck(viewer,status));
 await review(viewer,made[0].id,approve());
 const stored=insertLegacy(viewer.id,legacyHadith({grade:'صحيح',url:'https://dorar.net/hadith/1'}),result('REVIEW'));
 const response=await list(viewer,'dashboard');
 // The stored hadith row counts in its decision and the total, but never as awaiting a review decision: it is read-only.
 assert.deepEqual(response.body.counts,{PASS:2,REVIEW:3,CRITICAL:1,ABSTAIN:1,total:7,pendingReview:5});
 assert.equal(row(stored).review_status,'pending');
 assert.equal(response.body.reviewQueue,null);assert.equal(response.body.viewer.isReviewer,false);
 assert.equal(response.body.recent.length,5);assert.ok(response.body.recent.every(item=>made.some(check=>check.id===item.id)),'the five newest are new checks of this viewer');
 assert.ok(!response.body.recent.some(item=>item.id===stored),'older rows come after newer ones');
 assert.ok((await list(users.outsider,'dashboard')).body.recent.every(item=>!made.some(check=>check.id===item.id)),'another user never sees them');
 const before=(await list(users.admin,'dashboard')).body.reviewQueue;
 await createCheck(viewer,'REVIEW',{publicationUse:'official_publication'});
 const admin=await list(users.admin,'dashboard');
 assert.equal(admin.body.viewer.isReviewer,true);assert.equal(admin.body.reviewQueue,before+1);
 assert.equal(admin.body.reviewQueue,(await list(users.admin,'review')).body.checks.length);
});

// B2 warm-up route. Loaded with its real dependencies; fetch is mocked, so nothing leaves the test.
function createLoader(mocks={}){
 const cache=new Map();
 const resolve=(specifier,fromDir)=>{
  const base=specifier.startsWith('@/')?path.join(root,specifier.slice(2)):path.resolve(fromDir,specifier);
  const file=[base,`${base}.ts`,`${base}.tsx`,path.join(base,'index.ts')].find(candidate=>existsSync(candidate)&&statSync(candidate).isFile());
  if(!file)throw new Error(`Cannot resolve ${specifier} from ${fromDir}`);
  return file;
 };
 const load=file=>{
  if(cache.has(file))return cache.get(file).exports;
  const loaded={exports:{}};cache.set(file,loaded);
  if(file.endsWith('.json')){loaded.exports=JSON.parse(readFileSync(file,'utf8'));return loaded.exports;}
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',code)(id=>id in mocks?mocks[id]:id.startsWith('@/')||id.startsWith('.')?load(resolve(id,path.dirname(file))):id.includes(':')?(()=>{throw new Error(`unmocked import ${id}`);})():require(id),loaded,loaded.exports);
  return loaded.exports;
 };
 return relativePath=>load(path.join(root,relativePath));
}
delete process.env.AMANAH_ML_URL;delete process.env.AMANAH_ML_TOKEN;delete process.env.AMANAH_ML_TRANSPORT;delete process.env.AMANAH_ML_TIMEOUT_MS;
const mlEnv={};const scheduled=[];let databaseCalls=0;
const warmupRoute=createLoader({'cloudflare:workers':{env:mlEnv,waitUntil:task=>scheduled.push(task)},'@/lib/server/http':http,'@/db/workspace':{workspaceDb:()=>{databaseCalls++;throw new Error('the warm-up must not use D1');}}})('app/api/amanah/ml/warmup/route.ts');
const warmup=(user,origin)=>call(warmupRoute.POST,{method:'POST',url:'/api/amanah/ml/warmup',user,origin});

test('warm-up: session and same origin required; one real request per 4-minute window; nothing when ML is not configured; no D1',async()=>{
 const realFetch=globalThis.fetch;const requests=[];
 globalThis.fetch=async(url,init)=>{requests.push({url:String(url),headers:init.headers,body:JSON.parse(init.body)});return Response.json({decision:'PASS',integrity_score:100,severity:'S0',confidence:0.998,drifts:[],needs_human_review:false,model_version:'repository',reference_status:'verified',notes:[]});};
 try{
  assert.equal((await warmup()).status,401);
  assert.equal((await warmup(users.owner,'https://evil.example')).status,403);
  const unconfigured=await warmup(users.owner);
  assert.equal(unconfigured.status,202);assert.deepEqual(unconfigured.body,{started:false});
  assert.equal(requests.length,0);assert.equal(scheduled.length,0);
  mlEnv.AMANAH_ML_URL='https://6ac0.endpoints.huggingface.cloud';mlEnv.AMANAH_ML_TOKEN='hf-test-token';
  const first=await warmup(users.owner);
  assert.equal(first.status,202);assert.deepEqual(first.body,{started:true},'the model answer is never returned');
  assert.equal(scheduled.length,1,'the request runs through waitUntil');
  await Promise.all(scheduled);
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,'https://6ac0.endpoints.huggingface.cloud');
  assert.deepEqual(requests[0].headers,{'content-type':'application/json','X-Scale-Up-Timeout':'600',authorization:'Bearer hf-test-token'});
  assert.deepEqual(Object.keys(requests[0].body.inputs),['source_type','source_ar','candidate_en','ayah_id']);
  assert.equal(requests[0].body.inputs.ayah_id,'1:1');assert.equal(requests[0].body.inputs.source_type,'quran');
  for(const user of [users.owner,users.admin,users.outsider]){const again=await warmup(user);assert.equal(again.status,202);assert.deepEqual(again.body,{started:false});}
  await Promise.all(scheduled);
  assert.equal(requests.length,1,'one endpoint call per window, whoever asks');
  assert.equal(databaseCalls,0);
  assert.ok(!JSON.stringify(first.body).includes('huggingface')&&!JSON.stringify(first.body).includes('hf-test-token'));
 }finally{globalThis.fetch=realFetch;delete mlEnv.AMANAH_ML_URL;delete mlEnv.AMANAH_ML_TOKEN;}
});
