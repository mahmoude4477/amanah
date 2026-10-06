import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const corpus=JSON.parse(readFileSync(path.join(root,'vendor/quran-corpus.json'),'utf8'));
function loadTs(relativePath,mocks){
 const source=readFileSync(path.join(root,relativePath),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const loadedModule={exports:{}};
 new Function('require','module','exports',code)((id)=>id in mocks?mocks[id]:require(id),loadedModule,loadedModule.exports);
 return loadedModule.exports;
}
const languages=loadTs('lib/languages.ts',{});
const contracts=loadTs('lib/contracts.ts',{'./languages':languages});
const spans=loadTs('lib/server/quran-spans.ts',{});
const quran=loadTs('lib/server/quran-source.ts',{'@/vendor/quran-corpus.json':corpus,'@/lib/contracts':contracts,'./quran-spans':spans});
const {resolveQuranSource,parseQuranLocator,locateQuranVerse,getQuranVerse,listQuranSuras,normalizeQuranText,prepareQuranText,quranSuraBismillah,generatedQuoteIssues,SURA_ALIASES,QURAN_EVIDENCE_TITLE}=quran;

const check=(locator,originalText)=>resolveQuranSource({source:{title:'القرآن الكريم',locator,author:'',edition:'',grade:'',url:''},originalText});
const verse=(sura,ayah,kind='simple')=>corpus.suras[sura-1][kind][ayah-1];
const replaceWord=(text,index,word)=>text.split(' ').map((item,position)=>position===index?word:item).join(' ');
// The pre-fix comparison (strip every mark and dagger alef, unify ٱ, letters only) that let the misquotes below pass.
const legacyNormalize=(value)=>value.normalize('NFKC').replace(/[\p{M}ـ]/gu,'').replace(/ٱ/gu,'ا').replace(/[^\p{L}]/gu,'');
function abstains(locator,text){
 const resolved=check(locator,text);
 assert.equal(resolved.source,null,`${locator} must not match: ${text}`);
 assert.equal(resolved.result?.status,'ABSTAIN');
 assert.equal(resolved.result.sourceMatch.matched,false);
 assert.equal(resolved.result.sourceMatch.method,'none');
 contracts.amanahAnalysisResultSchema.parse(resolved.result);
 return resolved.result.sourceMatch.note;
}

test('corpus JSON carries Tanzil attribution and every verse verbatim from the XML',()=>{
 for(const key of ['attribution','source','license','licenseUrl','updatesUrl','verseNumbering','textTypes'])assert.ok(corpus[key],`missing ${key}`);
 assert.match(corpus.license,/Creative Commons Attribution 3\.0/);
 assert.match(corpus.licenseUrl,/^https:\/\/tanzil\.net\//);
 assert.match(corpus.updatesUrl,/^https:\/\/tanzil\.net\/updates\/$/);
 assert.equal(corpus.textTypes.simple.name,'Tanzil Quran Text (Simple Clean, Version 1.1)');
 assert.equal(corpus.textTypes.uthmani.name,'Tanzil Quran Text (Uthmani, Version 1.1)');
 const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:'\''};
 for(const [kind,file] of [['simple','quran-simple-clean.xml'],['uthmani','quran-uthmani.xml']]){
  const xml=readFileSync(path.join(root,'vendor',file),'utf8');
  let sura=0,count=0;
  for(const match of xml.matchAll(/<sura index="(\d+)"|<aya index="(\d+)" text="([^"]*)"/g)){
   if(match[1]){sura=Number(match[1]);continue;}
   assert.equal(verse(sura,Number(match[2]),kind),match[3].replace(/&(\w+);/g,(_,name)=>entities[name]),`${kind} ${sura}:${match[2]}`);
   count++;
  }
  assert.equal(count,6236);
  assert.equal(corpus.suras.reduce((total,item)=>total+item[kind].length,0),6236);
 }
});

// Live on 3 October 2026 the Uthmani text of 1:2, 1:7, 2:2, 2:255, 9:3 and 35:28 (among 21 verses) returned reference_status 'verified'.
// Live on 4 October 2026 (AMANAH v0.2) the Uthmani text of 2:282, the longest verse, returned reference_status 'verified' (its long-input
// ABSTAIN runs after the source check).
// TODO(after-ml): send 1:4 too and confirm reference_status is 'verified', not 'source_mismatch'.
test('every one of the 6236 verses matches itself in Simple Clean and in Uthmani form',()=>{
 const failures=[];
 let longest=0;
 for(const sura of corpus.suras)for(let ayah=1;ayah<=sura.simple.length;ayah++)for(const kind of ['simple','uthmani']){
  const resolved=check(`${sura.number}:${ayah}`,sura[kind][ayah-1]);
  if(resolved.result||resolved.source?.match.method!=='exact'||resolved.source.text!==sura.simple[ayah-1]||resolved.source.uthmani!==sura.uthmani[ayah-1]||resolved.source.evidence[0].excerpt!==sura.uthmani[ayah-1])failures.push(`${kind} ${sura.number}:${ayah}`);
  longest=Math.max(longest,resolved.source?.evidence[0].excerpt.length??0);
 }
 assert.deepEqual(failures,[]);
 assert.ok(longest<=2000,'evidence excerpt fits the contract');
 contracts.evidenceSchema.parse(check('2:282',verse(2,282,'uthmani')).source.evidence[0]);
});

test('ayah numbers, brackets, bidi marks, tatweel, pause marks and spacing are ignored; nothing else is',()=>{
 for(const text of ['\u200F﴿قُلْ هُوَ ٱللَّهُ أَحَدٌ ﴿١﴾','قُلْ  هُوَ\nٱللَّهُ أَحَدٌ (1)','قـل هو الله أحد \u06DD١','قل هو الله أحد [۱]','قلهو الله أحد','قل هو الله ۚ أحد','\u202Bقل هو الله أحد\u202C'])assert.equal(check('112:1',text).result,null,text);
 const nfd='قُلْ هُوَ ٱللَّهُ أَحَدٌ'.normalize('NFD');
 assert.equal(check('112:1',nfd).result,null);
 const resolved=check('112:1','قُلْ هُوَ ٱللَّهُ أَحَدٌ');
 assert.match(resolved.source.match.note,/مع التشكيل/);
 assert.match(check('112:1','قل هو الله أحد').source.match.note,/Simple Clean/);
 assert.match(abstains('112:1','قل هو الله احد'),/«أحد» كُتبت «احد»/);
 assert.match(abstains('112:1','قُلْ هُوَ اللَّهُ أَحَدٌ'),/الحروف موافقة/);
 assert.match(abstains('112:1','قُلْ هُوَ ٱللَّهُ أَحَدٌ وَ'),/«وَ» زائدة/);
 assert.match(abstains('112:1','قل هو الله'),/«أحد» ناقصة/);
 assert.match(abstains('112:1','١'),/لم يبقَ/);
 assert.match(abstains('1:2','الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ'),/حروفه توافق النص الإملائي/);
});

test('known misquotes abstain and say what differs, word by word',()=>{
 const ayatAlKursi=verse(2,255);
 const sleep=ayatAlKursi.split(' ').indexOf('نوم');
 const note255=abstains('2:255',replaceWord(ayatAlKursi,sleep,'يوم'));
 assert.match(note255,/الاختلاف في الحروف/);
 assert.match(note255,/«نوم» كُتبت «يوم»/);
 assert.match(abstains('1:7',verse(1,7).replace('الضالين','الظالين')),/«الضالين» كُتبت «الظالين»/);
 const tawbah=verse(9,3,'uthmani').split(' ');
 const messenger=tawbah.lastIndexOf('وَرَسُولُهُۥ');
 assert.ok(messenger>0);
 const note93=abstains('9:3',replaceWord(verse(9,3,'uthmani'),messenger,'وَرَسُولِهِۦ'));
 assert.match(note93,/الحروف موافقة، والاختلاف في الحركات/);
 assert.match(note93,/«وَرَسُولُهُۥ» كُتبت «وَرَسُولِهِۦ»/);
 const fatir=verse(35,28,'uthmani').split(' ');
 const fears=fatir.indexOf('يَخْشَى');
 const [allah,scholars]=[fatir[fears+1],fatir[fears+4]];
 assert.equal(legacyNormalize(allah),'الله');
 assert.equal(legacyNormalize(scholars),'العلمؤا');
 const [allahSubject,scholarsObject]=[allah.replace(/\u064E$/u,'\u064F'),scholars.replace('\u0624\u064F','\u0624\u064E')];
 assert.notEqual(allahSubject,allah);
 assert.notEqual(scholarsObject,scholars);
 const swapped=fatir.map((word,index)=>index===fears+1?allahSubject:index===fears+4?scholarsObject:word).join(' ');
 assert.equal(legacyNormalize(swapped),legacyNormalize(verse(35,28,'uthmani')));
 const note3528=abstains('35:28',swapped);
 assert.match(note3528,/الحروف موافقة/);
 assert.ok(note3528.includes(`«${allah}» كُتبت «${allahSubject.normalize('NFC')}»`),note3528);
 const anfal=replaceWord(verse(8,51),verse(8,51).split(' ').indexOf('بظلام'),'بظلم');
 assert.equal(legacyNormalize(anfal),legacyNormalize(verse(8,51,'uthmani')));
 assert.match(abstains('8:51',anfal),/«بظلام» كُتبت «بظلم»/);
 const note14=abstains('1:4','ملك يوم الدين');
 assert.match(note14,/«مالك» كُتبت «ملك»/);
 assert.match(note14,/الرسم المجرد لا يميّز/);
});

test('single-word substitutions the old letters-only comparison accepted (65 verses) all abstain',()=>{
 const vocabulary=new Set(corpus.suras.flatMap(sura=>sura.simple.flatMap(text=>text.split(' '))));
 const verses=new Set();
 for(const sura of corpus.suras)for(let ayah=1;ayah<=sura.simple.length;ayah++){
  const simple=sura.simple[ayah-1].split(' '),uthmani=sura.uthmani[ayah-1].split(' ');
  if(simple.length!==uthmani.length)continue;
  simple.forEach((word,index)=>{
   const substitute=legacyNormalize(uthmani[index]);
   if(substitute===word||!vocabulary.has(substitute))return;
   const text=replaceWord(sura.simple[ayah-1],index,substitute);
   if(legacyNormalize(text)!==legacyNormalize(sura.uthmani[ayah-1])&&legacyNormalize(text)!==legacyNormalize(sura.simple[ayah-1]))return;
   verses.add(`${sura.number}:${ayah} ${word}→${substitute}`);
   abstains(`${sura.number}:${ayah}`,text);
  });
 }
 console.log(`single-word substitution class: ${verses.size} verses, e.g. ${[...verses].slice(0,6).join(' · ')}`);
 assert.equal(verses.size,65);
 assert.ok(verses.has('1:4 مالك→ملك')&&verses.has('8:51 بظلام→بظلم'));
});

test('diacritized single-word substitutions with the same skeleton abstain (one per verse)',()=>{
 const bySkeleton=new Map();
 for(const sura of corpus.suras)for(const text of sura.uthmani)for(const word of text.split(' ')){const key=legacyNormalize(word);if(!bySkeleton.has(key))bySkeleton.set(key,new Set());bySkeleton.get(key).add(word);}
 let tried=0;
 for(const sura of corpus.suras)for(let ayah=1;ayah<=sura.uthmani.length;ayah++){
  const words=sura.uthmani[ayah-1].split(' ');
  for(let index=0;index<words.length;index++){
   const substitute=[...bySkeleton.get(legacyNormalize(words[index]))].find(word=>word!==words[index]);
   if(!substitute)continue;
   const resolved=check(`${sura.number}:${ayah}`,replaceWord(sura.uthmani[ayah-1],index,substitute));
   assert.equal(resolved.result?.status,'ABSTAIN',`${sura.number}:${ayah} ${words[index]}→${substitute}`);
   tried++;
   break;
  }
 }
 assert.ok(tried>5000,`tried ${tried}`);
});

test('a text that is another verse names that verse; a missing locator still points to it',()=>{
 assert.match(abstains('112:2',verse(112,1)),/هذا النص يطابق الآية 112:1 \(سورة الإخلاص\)/);
 assert.match(abstains('2:255',verse(112,1,'uthmani')),/هذا النص يطابق الآية 112:1/);
 const repeated=abstains('55:12',verse(55,13));
 assert.match(repeated,/هذا النص يطابق الآية 55:13/);
 assert.match(repeated,/55:16/);
 const noLocator=check('',verse(2,255));
 assert.equal(noLocator.result?.status,'ABSTAIN');
 assert.match(noLocator.result.sourceMatch.note,/هذا النص يطابق الآية 2:255/);
 contracts.amanahAnalysisResultSchema.parse(noLocator.result);
 assert.doesNotMatch(abstains('112:1','قل هو الله'),/هذا النص يطابق/);
});

test('the other-verse search finds sampled verses, including ones that NFC composes',()=>{
 const stable=(text)=>text.replace(/[^ب-غف-ه]/g,'');
 const composed=[];
 for(const sura of corpus.suras)sura.uthmani.forEach((text,index)=>{
  assert.equal(stable(text.replace(/ـ/g,'').normalize('NFC')),stable(text),`${sura.number}:${index+1}`);
  if(text.replace(/ـ/g,'').normalize('NFC').length<text.replace(/ـ/g,'').length)composed.push([sura.number,index+1]);
 });
 const sample=[...composed.filter((_,index)=>index%10===0),...corpus.suras.flatMap(sura=>sura.simple.map((_,index)=>[sura.number,index+1])).filter((_,index)=>index%50===0)];
 assert.ok(composed.length>50);
 for(const [sura,ayah] of sample)for(const kind of ['simple','uthmani']){
  const locator=`${sura}:${ayah===1?2:1}`;
  const resolved=check(locator,verse(sura,ayah,kind));
  if(!resolved.result)continue;
  const first=corpus.suras.flatMap(item=>item[kind].map((text,index)=>[`${item.number}:${index+1}`,text])).find(([key,text])=>key!==locator&&text===verse(sura,ayah,kind))[0];
  assert.ok(resolved.result.sourceMatch.note.includes(`هذا النص يطابق الآية ${first} `),`${kind} ${sura}:${ayah}`);
 }
});

// Tanzil's notice must be reproduced in files derived from its text (م-23); the opening basmala is carried per sura, verbatim.
test('corpus JSON carries the full Tanzil copyright notice and each sura opening basmala verbatim from the XML',()=>{
 for(const [kind,file,name] of [['simple','quran-simple-clean.xml','Simple Clean'],['uthmani','quran-uthmani.xml','Uthmani']]){
  const xml=readFileSync(path.join(root,'vendor',file),'utf8');
  const block=xml.split('<!--')[1].split('-->')[0].split(/\r?\n/).map(line=>line.trimEnd()).filter(line=>line.trim()).map(line=>line.replace(/^# ?/,''));
  assert.equal(corpus.licenseNotice[kind],block.join('\n'),kind);
  for(const phrase of ['PLEASE DO NOT REMOVE OR CHANGE THIS COPYRIGHT BLOCK',`Tanzil Quran Text (${name}, Version 1.1)`,'CHANGING IT IS NOT ALLOWED','This copyright notice shall be included in all verbatim copies','Please check updates at: http://tanzil.net/updates/'])assert.ok(corpus.licenseNotice[kind].includes(phrase),`${kind}: ${phrase}`);
  const attributes=new Map([...xml.matchAll(/<sura index="(\d+)"[^>]*>\s*<aya index="1" text="[^"]*"(?: bismillah="([^"]*)")?/g)].map(match=>[Number(match[1]),match[2]]));
  assert.equal(attributes.size,114);
  for(const sura of corpus.suras)assert.equal(sura.bismillah?.[kind],attributes.get(sura.number),`${kind} ${sura.number}`);
 }
 assert.equal(corpus.suras.filter(sura=>sura.bismillah).length,112);
 assert.equal(quranSuraBismillah(1),null);
 assert.equal(quranSuraBismillah(9),null);
 assert.equal(quranSuraBismillah(2),verse(1,1,'uthmani'));
 assert.equal(quranSuraBismillah(95),corpus.suras[94].bismillah.uthmani);assert.notEqual(quranSuraBismillah(95),quranSuraBismillah(2));
 for(const value of [0,115,1.5])assert.equal(quranSuraBismillah(value),null);
});

// R-17: the schools differ on whether the basmala is a verse, so the note names the count the corpus follows (Kufi, Hafs, Tanzil).
test('a basmala before ayah 1 is explained as not part of the verse in the Kufi count used here',()=>{
 const simple=abstains('112:1',`بسم الله الرحمن الرحيم ${verse(112,1)}`);
 assert.match(simple,/في العدّ الكوفي المعتمد هنا \(رواية حفص، Tanzil\) لا تُعدّ البسملة في أول السورة من آيات سورة الإخلاص/);
 assert.match(simple,/فهي الآية 1 من الفاتحة، وبعض الآية 30 من سورة النمل، ولا تُكتب في أول التوبة/);
 assert.doesNotMatch(simple,/آية في الفاتحة وحدها/);
 assert.match(simple,/والنص بعد حذفها يطابق الآية/);
 assert.doesNotMatch(simple,/الفرق على مستوى الكلمات/);
 assert.match(abstains('2:1',`${verse(1,1,'uthmani')} ${verse(2,1,'uthmani')}`),/البسملة/);
 assert.match(abstains('112:1',verse(1,1)),/هذا النص يطابق الآية 1:1/);
 assert.equal(check('1:1',verse(1,1)).result,null);
 assert.doesNotMatch(abstains('9:1',`${verse(1,1)} ${verse(9,1)}`),/البسملة/);
 assert.doesNotMatch(abstains('2:2',`${verse(1,1)} ${verse(2,2)}`),/البسملة/);
});

// Only the basmala was entered: the note must not describe the empty rest as undiacritized text missing the verse words.
test('a basmala entered alone for ayah 1 gets only the basmala note and the verse it matches',()=>{
 for(const [locator,basmala] of [['2:1',verse(1,1,'uthmani')],['112:1',verse(1,1)],['95:1',corpus.suras[94].bismillah.uthmani]]){
  const note=abstains(locator,basmala);
  assert.match(note,/والنص المدخل هو البسملة وحدها، دون نص الآية\./,locator);
  assert.doesNotMatch(note,/غير مشكَّل|مشكَّل فقورن|الفرق على مستوى الكلمات|ناقصة|والنص بعد حذفها يطابق/,locator);
 }
 assert.match(abstains('2:1',verse(1,1,'uthmani')),/هذا النص يطابق الآية 1:1/);
});

// The locator was right once the basmala is removed, so copies of the same text in other suras are not suggested.
test('after the basmala is removed and the rest matches, the note does not ask to change the locator',()=>{
 for(const text of ['بسم الله الرحمن الرحيم الم',`${verse(1,1)} ${verse(2,1)}`,`${verse(1,1,'uthmani')} ${verse(2,1,'uthmani')}`]){
  const note=abstains('2:1',text);
  assert.match(note,/والنص بعد حذفها يطابق الآية/,text);
  assert.doesNotMatch(note,/صحّح الموضع|هذا النص يطابق الآية 3:1/,text);
 }
 assert.match(abstains('2:1','بسم الله الرحمن الرحيم حم'),/هذا النص يطابق الآية 40:1/);
});

// In Tanzil Uthmani a tatweel can separate a letter from its hamza mark (e.g. 2:255 «يَـُٔودُهُۥ»); both sides are prepared before comparing letters.
test('a single changed haraka is reported as a diacritics difference, also in verses with tatweel before a hamza mark',()=>{
 const rotate={'\u064E':'\u064F','\u064F':'\u0650','\u0650':'\u064E'};
 const affected=[];
 for(const sura of corpus.suras)sura.uthmani.forEach((text,index)=>{if(normalizeQuranText(text)!==normalizeQuranText(prepareQuranText(text)))affected.push([sura.number,index+1,text]);});
 assert.ok(affected.length>=100,`${affected.length} verses`);
 assert.ok(affected.some(([sura,ayah])=>sura===2&&ayah===255)&&affected.some(([sura,ayah])=>sura===2&&ayah===282));
 const wrong=[];
 for(const [sura,ayah,text] of affected){
  const position=[...text].findIndex(char=>char in rotate);if(position<0)continue;
  const chars=[...text];chars[position]=rotate[chars[position]];
  const note=abstains(`${sura}:${ayah}`,chars.join(''));
  if(!note.includes('الحروف موافقة'))wrong.push(`${sura}:${ayah}`);
 }
 assert.deepEqual(wrong,[]);
});

// Generated text: a quote between ﴿ ﴾ follows the strict tiers against the whole Mushaf (letters only → Simple Clean, with diacritics →
// Uthmani with its diacritics). Without a known ayah (location null) only such misquotes are reported.
test('verses quoted between ﴿ ﴾ in generated text follow the strict tiers',()=>{
 const misquotes=text=>generatedQuoteIssues(text,null).filter(item=>item.bracketed).map(item=>item.quote);
 assert.deepEqual(misquotes('﴿غير المغضوب عليهم ولا الظالين﴾'),['غير المغضوب عليهم ولا الظالين']);
 const words=verse(9,3,'uthmani').split(' ');const index=words.findIndex(word=>normalizeQuranText(word)==='ورسوله');
 assert.ok(index>0);
 const kasra=words[index].replace(/\u064F/gu,'\u0650');
 assert.notEqual(kasra,words[index]);
 const correct=words.slice(index-3,index+1).join(' ');const reversed=[...words.slice(index-3,index),kasra].join(' ');
 for(const [quote,strict] of [
  [verse(112,1,'uthmani'),true],
  [verse(112,1),true],
  [correct,true],
  [reversed,false], // a vowel inside the word changed («وَرَسُولِهِ» read as genitive)
  ['ملك يوم الدين',false],
  ['مالك يوم الدين',true],
  ['الحمد لله ... العالمين',true],
  ['قل هو الله واحد',false],
  ['قُلْ هو الله أحد',false],
 ])assert.equal(misquotes(`قال ﴿${quote}﴾ ﴿١﴾`).length===0,strict,`strict ${quote}`);
 assert.deepEqual(generatedQuoteIssues('لا اقتباس هنا',null),[]);
 // The quote checks serve generated explanations only: the lenient helpers of the removed partner and tafsir paths are gone.
 assert.equal(quran.unverifiedQuranQuotes,undefined);assert.equal(quran.inexactQuranQuotes,undefined);
});

// Generated text may quote only the checked ayah; Arabic in «», quotation marks or after a quotation formula is checked once it looks like a verse.
test('generated text: quotes of another verse and misquotes outside ﴿ ﴾ are found; exact fragments and ordinary words are not',()=>{
 const issues=(text,sura,ayah)=>generatedQuoteIssues(text,sura?{sura,ayah}:null).map(item=>`${item.issue}${item.bracketed?' ﴿﴾':''}`);
 const flipped='إِنَّمَا يَخْشَى ٱللَّهُ مِنْ عِبَادِهِ ٱلْعُلَمَاءَ';
 assert.deepEqual(issues(`الآية تقول «${flipped}» والترجمة قلبت المعنى.`,35,28),['misquote']);
 assert.deepEqual(issues(`الآية تقول "${flipped}" والترجمة قلبت المعنى.`,35,28),['misquote']);
 assert.deepEqual(issues('في قوله تعالى «إنما يخشى اللهُ من عباده العلماءَ» قلبت الترجمة الفاعل.',35,28),['misquote']);
 assert.deepEqual(issues(`الآية «${verse(35,28,'uthmani').split(' ').slice(8,13).join(' ')}» واضحة.`,35,28),[]);
 assert.deepEqual(issues('الآية «إنما يخشى اللهَ من عباده العلماءُ» واضحة.',35,28),[]);
 assert.deepEqual(issues('«إن هي إلا وحي يوحى»',53,4),['misquote']);
 assert.deepEqual(issues('«إن هو إلا وحي يوحى»',53,4),[]);
 assert.deepEqual(issues('﴿ما ضل صاحبكم وما غوى﴾',53,4),['other-verse ﴿﴾']);
 assert.deepEqual(issues('«ما ضل صاحبكم وما غوى»',53,4),['other-verse']);
 assert.deepEqual(issues('The verse reads «قُلْ هُوَ ٱللَّهُ أَحَدٌ وَلَدٌ», so "One" is correct.',112,1),['misquote']);
 assert.deepEqual(issues('الآية تقول: قل هو الله أحد ولد، والترجمة حذفت كلمة.',112,1),['misquote']);
 assert.deepEqual(issues('الآية تقول قُلْ هُوَ ٱللَّهُ أَحَدٌ وَلَدٌ.',112,1),['misquote'],'a run of diacritized words');
 assert.deepEqual(issues(`الآية «أَنَّ ٱللَّهَ بَرِىٓءٌ مِّنَ ٱلْمُشْرِكِينَ وَرَسُولِهِ» عطفت`,9,3),['misquote']);
 assert.deepEqual(issues(`﴿${verse(1,1,'uthmani')} ${verse(112,1,'uthmani')}﴾`,112,1),['misquote ﴿﴾'],'the basmala is not part of 112:1');
 assert.deepEqual(issues(`﴿${verse(1,1,'uthmani')}﴾`,2,1),['other-verse ﴿﴾']);
 for(const allowed of [`﴿${verse(112,1,'uthmani')}﴾`,'﴿قل هو الله أحد﴾','حذفت الترجمة «أحد» من «قل هو الله أحد».','تقول الآية قل هو الله احد بمعنى أن الله واحد','رصد النموذج «انقلاب النفي» في الترجمة.','قال تعالى: قُلْ هُوَ ٱللَّهُ أَحَدٌ','الترجمة سليمة. «In the name of God»','«من عند الله»'])assert.deepEqual(issues(allowed,112,1),[],allowed);
 assert.deepEqual(issues('الترجمة تنقل ﴿قل هو الله واحد﴾ بدقة.',null),['misquote ﴿﴾'],'partner text: whole corpus, strict');
 assert.deepEqual(issues(`﴿${verse(53,2)}﴾`,null),[],'partner text may quote any verse exactly');
 assert.deepEqual(issues('لا اقتباس هنا',112,1),[]);
 assert.deepEqual(issues('تقول الآية إن الكتاب لا ريب فيه، والترجمة حذفت النفي.',2,2),[],'reported speech after a formula is not a quote');
});

test('evidence shows the Uthmani text; source and verse lookup expose both text types',()=>{
 const {source,result}=check('الإخلاص ١','قل هو الله أحد');
 assert.equal(result,null);
 assert.equal(source.registryId,'tanzil:1.1:112:1');
 assert.equal(source.url,'https://tanzil.net/#112:1');
 assert.equal(source.locator,'112:1');
 assert.equal(source.sura,112);
 assert.equal(source.ayah,1);
 assert.equal(source.text,'قل هو الله أحد');
 assert.equal(source.uthmani,verse(112,1,'uthmani'));
 assert.equal(source.uthmani.normalize('NFC'),'قُلْ هُوَ ٱللَّهُ أَحَدٌ'.normalize('NFC'));
 assert.deepEqual(source.evidence,[{id:'tanzil:1.1:112:1',title:'نص القرآن الكريم · مشروع Tanzil 1.1 · رواية حفص · الرسم العثماني',locator:'القرآن الكريم · سورة الإخلاص (112:1)',excerpt:verse(112,1,'uthmani'),url:'https://tanzil.net/#112:1'}]);
 assert.equal(QURAN_EVIDENCE_TITLE,source.evidence[0].title);
 assert.ok(source.links.some(link=>link.url==='https://quran.ksu.edu.sa/tafseer/katheer/sura112-aya1.html'));
 const found=getQuranVerse(112,1);
 assert.deepEqual({sura:found.sura,suraName:found.suraName,ayah:found.ayah,locator:found.locator,text:found.text,uthmani:found.uthmani,url:found.url},{sura:112,suraName:'الإخلاص',ayah:1,locator:'112:1',text:'قل هو الله أحد',uthmani:verse(112,1,'uthmani'),url:'https://tanzil.net/#112:1'});
 for(const [sura,ayah] of [[112,5],[0,1],[115,1],[1.5,1],[2,0],[Number.NaN,1]])assert.equal(getQuranVerse(sura,ayah),null);
 assert.equal(listQuranSuras().length,114);
 assert.equal(listQuranSuras()[1].ayahCount,286);
 assert.equal(normalizeQuranText('قُلْ هُوَ ٱللَّهُ أَحَدٌ'),'قلهوالله' + 'أحد');
});

test('locator parser accepts common forms and rejects ranges and impossible verses',()=>{
 for(const locator of ['112:1','١١٢:١','۱۱۲:۱','سورة الإخلاص، الآية 1','الإخلاص١','إخلاص 1','البقره 255','براءة 1','بني إسرائيل 1','ياسين 1','ن 1','112 1','112.1','\u200F112:1','112/1','سورة 112 آية 1','الإخلاص: ١','(الإخلاص: 1)','سورة الإخلاص الآية رقم 1'])assert.ok(parseQuranLocator(locator),locator);
 const expectations={'١١٢:١':[112,1],'سورة الإخلاص، الآية 1':[112,1],'البقره 255':[2,255],'براءة 1':[9,1],'بني إسرائيل 1':[17,1],'ياسين 1':[36,1],'ن 1':[68,1],'112.1':[112,1],'الإسراء 1':[17,1],'سبأ 1':[34,1],'النبأ 1':[78,1],'إبراهيم 1':[14,1],'الانسان 1':[76,1],'الإنسان 1':[76,1],'حم السجدة 1':[41,1],'تبت 1':[111,1],'آل عمران 1':[3,1],'المؤمنون 1':[23,1],'المؤمن 1':[40,1],'الشورى 1':[42,1]};
 for(const [locator,[sura,ayah]] of Object.entries(expectations)){const parsed=parseQuranLocator(locator);assert.equal(parsed?.sura.number,sura,locator);assert.equal(parsed?.ayah,ayah,locator);}
 for(const locator of ['112:1-4','0:1','115:1','2:287','','1121','112-1','الإخلاص 5','سورة غير موجودة 1','112:1:2','الإخلاص'])assert.equal(parseQuranLocator(locator),null,locator);
 assert.equal(locateQuranVerse('112:1-4').reason,'range');
 assert.match(locateQuranVerse('112:1-4').message,/آية واحدة/);
 assert.equal(locateQuranVerse('البقرة ٢٥٥-٢٥٧').reason,'range');
 assert.equal(locateQuranVerse('0:1').reason,'sura');
 assert.equal(locateQuranVerse('115:1').reason,'sura');
 assert.equal(locateQuranVerse('2:287').reason,'ayah');
 assert.match(locateQuranVerse('2:287').message,/286/);
 assert.equal(locateQuranVerse('').reason,'empty');
 const rangeResult=check('112:1-4',verse(112,1));
 assert.equal(rangeResult.result?.status,'ABSTAIN');
 assert.match(rangeResult.result.sourceMatch.note,/آية واحدة/);
});

test('verse route returns both text types, resolves a typed locator and rejects malformed numbers',async()=>{
 const http={jsonResponse:(data,status=200)=>Response.json(data,{status}),errorResponse:(error)=>Response.json({error:error.message},{status:error.status??500}),requestUserId:async()=>'user-1'};
 const {GET}=loadTs('app/api/amanah/quran/route.ts',{'@/lib/server/quran-source':quran,'@/lib/server/http':http});
 const call=async(query)=>{const response=await GET(new Request(`https://amanah.test/api/amanah/quran${query}`));return {status:response.status,body:await response.json()};};
 assert.equal((await call('')).body.suras.length,114);
 const byNumber=await call('?sura=112&ayah=1');
 assert.equal(byNumber.status,200);
 assert.equal(byNumber.body.verse.uthmani,verse(112,1,'uthmani'));
 assert.equal(byNumber.body.verse.text,verse(112,1));
 for(const query of ['?sura=112&ayah=5','?sura=1.5&ayah=1','?sura=112&ayah=1e0','?sura=&ayah=1','?sura=112'])assert.equal((await call(query)).status,404,query);
 const typed=await call(`?locator=${encodeURIComponent('البقره ٢٥٥')}`);
 assert.equal(typed.body.verse.locator,'2:255');
 const range=await call(`?locator=${encodeURIComponent('112:1-4')}`);
 assert.equal(range.status,400);
 assert.match(range.body.error,/آية واحدة/);
});

test('every sura name and alias resolves to one sura, with or without «سورة» and «ال»',()=>{
 for(const sura of corpus.suras){
  for(const locator of [`${sura.name} 1`,`سورة ${sura.name}، الآية ١`,`${sura.name}${'١'}`])assert.equal(parseQuranLocator(locator)?.sura.number,sura.number,locator);
  if(sura.name.startsWith('ال')&&sura.name.length>4)assert.equal(parseQuranLocator(`${sura.name.slice(2)} 1`)?.sura.number,sura.number,sura.name);
 }
 for(const [alias,number] of Object.entries(SURA_ALIASES))assert.equal(parseQuranLocator(`${alias} 1`)?.sura.number,number,alias);
});
