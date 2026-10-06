import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {existsSync,readFileSync,statSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
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
  new Function('require','module','exports',code)(id=>id in mocks?mocks[id]:id.startsWith('@/')||id.startsWith('.')?load(resolve(id,path.dirname(file))):require(id),loaded,loaded.exports);
  return loaded.exports;
 };
 return relativePath=>load(path.join(root,relativePath));
}

const load=createLoader();
const {checkGlossary,glossaryTerms}=load('lib/server/glossary.ts');
const {glossaryNoteSchema,hasGlossaryAlerts}=load('lib/contracts.ts');
const corpus=JSON.parse(readFileSync(path.join(root,'vendor/quran-corpus.json'),'utf8'));
const glossaryFile=JSON.parse(readFileSync(path.join(root,'vendor/glossary.json'),'utf8'));
const verse=locator=>{const [sura,ayah]=locator.split(':').map(Number);return corpus.suras[sura-1].simple[ayah-1];};
const check=(locator,translation,targetLanguage='en')=>checkGlossary({arabic:verse(locator),translation,targetLanguage,contentType:'quran'});
const note=(notes,termId)=>notes.find(item=>item.termId===termId);
const validate=notes=>{for(const item of notes)assert.doesNotThrow(()=>glossaryNoteSchema.parse(item),item.termId);};

test('the glossary holds the 10 PDF terms with approved renderings, rules and the dictionary reference',()=>{
 assert.deepEqual(glossaryTerms().map(term=>term.term),['الإسلام','التوحيد','العبادة','النبوة','الوحي','الشريعة','الحديث','السنة','الفتوى','الدعوة']);
 assert.equal(glossaryFile.referenceUrl,'https://islamic-content.com/dictionary');
 assert.match(glossaryFile.reference,/نماذج لقاموس المصطلحات الأساسية/);
 assert.deepEqual(glossaryTerms().find(term=>term.id==='tawhid').approved,['Tawhid','Oneness of God']);
 for(const term of glossaryFile.terms)for(const detector of term.detectors){
  for(const pattern of detector.arabic)assert.doesNotThrow(()=>new RegExp(pattern,'u'),`${term.id} ${pattern}`);
  if(detector.alert)assert.doesNotThrow(()=>new RegExp(detector.alert.pattern,'iu'),term.id);
 }
});

test('each alert rule fires on a reductive English rendering',()=>{
 const cases=[
  ['21:45','Say, "I only warn you by inspiration." But the deaf do not hear the call.','wahy','inspiration','بالوحي'],
  ['45:18','Then We put you on a criminal law concerning the matter, so follow it.','sharia','criminal law','شريعة'],
  ['51:56','I did not create the jinn and mankind except to perform rituals for Me.','ibadah','rituals','ليعبدون'],
  ['33:62','This is the Sunnah of Allah among those who passed on before.','sunnah','Sunnah','سنة الله'],
  ['17:77','The Sunnah of those We sent before you of Our messengers.','sunnah','Sunnah','سنة من قد'],
  ['3:137','Sunnahs have passed before you, so travel through the land.','sunnah','Sunnahs','سنن'],
  ['3:19','Indeed, the religion with Allah is a culture of submission.','islam','culture','الاسلام'],
  ['3:79','It is not for a human that Allah should give him the Scripture, authority and leadership.','nubuwwah','leadership','والنبوة'],
  ['4:176','They ask you for an opinion. Say, "Allah gives you His opinion concerning the kalalah."','fatwa','opinion','يستفتونك'],
 ];
 for(const [locator,translation,termId,english,arabic] of cases){
  const notes=check(locator,translation);
  validate(notes);
  const hit=note(notes,termId);
  assert.ok(hit,`${locator} ${termId}`);
  assert.equal(hit.alert,true,`${locator} ${termId}`);
  assert.equal(hit.translationMatch,english,locator);
  assert.equal(hit.arabicMatch,arabic,locator);
  assert.ok(hit.message.includes(english)&&hit.message.includes(arabic),locator);
  assert.equal(hit.referenceUrl,'https://islamic-content.com/dictionary');
  assert.equal(hasGlossaryAlerts({glossary:notes}),true);
 }
 const tawhid=checkGlossary({arabic:'التوحيد هو إفراد الله بالعبادة',translation:'Unity means singling out God in worship.',targetLanguage:'en',contentType:'tafsir'});
 validate(tawhid);
 assert.equal(note(tawhid,'tawhid').alert,true);
 assert.equal(note(tawhid,'tawhid').translationMatch,'Unity');
 assert.equal(note(tawhid,'ibadah').alert,false);
 assert.equal(check('21:45','I only warn you by inspiration.','English').find(item=>item.termId==='wahy').alert,true,'legacy stored language name');
});

test('approved renderings and non-English translations do not alert',()=>{
 const cases=[
  ['21:45','Say, "I only warn you by revelation."','wahy'],
  ['45:18','Then We put you on a Sharia (way) concerning the matter, so follow it.','sharia'],
  ['51:56','I did not create the jinn and mankind except to worship Me.','ibadah'],
  ['51:56','I did not create the jinn and mankind except to worship Me through every rite of life.','ibadah'],
  ['33:62','This is the way of Allah with those who passed on before.','sunnah'],
  ['3:19','Indeed, the religion in the sight of Allah is Islam.','islam'],
  ['3:79','It is not for a human that Allah should give him the Scripture, authority and prophethood.','nubuwwah'],
  ['4:176','They request from you a ruling. Say, "Allah gives you a ruling concerning the kalalah."','fatwa'],
 ];
 for(const [locator,translation,termId] of cases){
  const notes=check(locator,translation);
  validate(notes);
  const hit=note(notes,termId);
  assert.ok(hit,`${locator} ${termId} is still listed as a reference note`);
  assert.equal(hit.alert,false,`${locator} ${translation}`);
  assert.equal(hit.translationMatch,undefined);
 }
 assert.match(note(check('33:62','This is the way of Allah.'),'sunnah').message,/طريقته الجارية في خلقه/);
 const tawhid=checkGlossary({arabic:'التوحيد إفراد الله بالعبادة',translation:'Tawhid, the oneness of God, means singling Him out in worship.',targetLanguage:'en',contentType:'tafsir'});
 assert.equal(note(tawhid,'tawhid').alert,false);
 assert.equal(note(checkGlossary({arabic:'التوحيد',translation:'Oneness of God.',targetLanguage:'en',contentType:'tafsir'}),'tawhid').alert,false);
 const french=check('21:45','Dis : « Je ne vous avertis que par l’inspiration. »','fr');
 assert.equal(note(french,'wahy').alert,false);
 assert.equal(hasGlossaryAlerts({glossary:french}),false);
});

test('ambiguous Qur\'anic words are not mistaken for the glossary terms',()=>{
 assert.equal(note(check('2:255','Neither Sunnah nor sleep overtakes Him.'),'sunnah'),undefined,'سنة = slumber');
 assert.equal(note(check('2:96','One of them wishes he could live a thousand Sunnah.'),'sunnah'),undefined,'سنة = year');
 assert.equal(note(check('16:68','And your Lord gave inspiration to the bee.'),'wahy'),undefined,'أوحى (verb) to the bee');
 assert.equal(note(check('12:43','O eminent ones, give me your opinion about my vision.'),'fatwa'),undefined,'أفتوني about a dream');
 assert.equal(note(check('18:1','Praise be to Allah, who sent down the Book upon His servant.'),'ibadah'),undefined,'عبده = His servant');
 assert.equal(note(check('39:23','Allah has sent down the best statement.'),'hadith'),undefined,'حديث = speech in the Quran');
 assert.equal(note(check('2:186','I respond to the call of the caller.'),'dawah'),undefined,'دعوة = supplication in the Quran');
 const tafsir=checkGlossary({arabic:'وفي الحديث الصحيح بيان ذلك، وهذه الدعوة إلى التوحيد',translation:'The authentic hadith explains it; this invitation to Tawhid.',targetLanguage:'en',contentType:'tafsir'});
 assert.equal(note(tafsir,'hadith').alert,false);
 assert.equal(note(tafsir,'dawah').alert,false);
 assert.equal(note(tafsir,'tawhid').alert,false);
});

test('whole-corpus sweep: a neutral translation yields zero alerts; verses per term are listed',t=>{
 const neutral='This is a neutral test rendering of the verse.';
 const hits=new Map(glossaryTerms().map(term=>[term.id,[]]));
 let alerts=0;let verses=0;
 for(const sura of corpus.suras)sura.simple.forEach((text,index)=>{
  verses++;
  const notes=checkGlossary({arabic:text,translation:neutral,targetLanguage:'en',contentType:'quran'});
  for(const item of notes){hits.get(item.termId).push(`${sura.number}:${index+1}`);if(item.alert)alerts++;}
 });
 assert.equal(verses,6236);
 assert.equal(alerts,0);
 for(const [termId,locators] of hits)t.diagnostic(`${termId}: ${locators.length} verse(s)${locators.length?` — ${locators.join(' ')}`:''}`);
 assert.deepEqual(hits.get('hadith'),[]);
 assert.deepEqual(hits.get('dawah'),[]);
 assert.deepEqual(hits.get('tawhid'),[]);
 assert.deepEqual(hits.get('islam'),['3:19','3:85','5:3','6:125','9:74','39:22','49:17','61:7']);
 assert.deepEqual(hits.get('nubuwwah'),['3:79','6:89','29:27','45:16','57:26']);
 assert.deepEqual(hits.get('wahy'),['11:37','20:114','21:45','23:27','42:51','53:4']);
 assert.deepEqual(hits.get('sharia'),['5:48','45:18']);
 assert.deepEqual(hits.get('fatwa'),['4:127','4:176']);
 assert.deepEqual(hits.get('sunnah'),['3:137','4:26','8:38','15:13','17:77','18:55','33:38','33:62','35:43','40:85','48:23']);
 for(const locator of ['1:5','2:21','51:56','109:4','4:172','18:110','43:20','109:3'])assert.ok(hits.get('ibadah').includes(locator),locator);
 for(const locator of ['18:1','2:23','17:1','26:22','25:63'])assert.ok(!hits.get('ibadah').includes(locator),locator);
});
