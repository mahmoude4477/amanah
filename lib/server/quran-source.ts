import corpus from '@/vendor/quran-corpus.json';
import {QURAN_EVIDENCE_TITLE,type AmanahAnalyzeRequest,type AmanahAnalysisResult} from '@/lib/contracts';
import {bracketedQuranQuotes,looseKey,looseLetters,quotedArabicSegments,wordTokens} from './quran-spans';

type Sura={number:number;name:string;simple:string[];uthmani:string[];bismillah?:{simple:string;uthmani:string}};
type QuranLink={label:string;url:string};
type QuranTier='simple'|'uthmani';
type QuranSource={citation:string;registryId:string;sura:number;ayah:number;locator:string;text:string;uthmani:string;url:string;links:QuranLink[];match:AmanahAnalysisResult['sourceMatch'];evidence:AmanahAnalysisResult['evidence']};
type QuranLocation={ok:true;sura:Sura;ayah:number}|{ok:false;reason:'empty'|'format'|'range'|'sura'|'ayah';message:string};
type WordChange={expected?:string;received?:string};

const suras:readonly Sura[]=corpus.suras;
const modelVersion='source:tanzil-1.1';
export {QURAN_EVIDENCE_TITLE};
export const quranVerseUrl=(sura:number,ayah:number)=>`https://tanzil.net/#${sura}:${ayah}`;
export const quranVerseLinks=(sura:number,ayah:number):QuranLink[]=>[{label:'Tanzil · نص الآية',url:quranVerseUrl(sura,ayah)},{label:'المصحف الإلكتروني بجامعة الملك سعود · الآية مع تفسير ابن كثير',url:`https://quran.ksu.edu.sa/tafseer/katheer/sura${sura}-aya${ayah}.html`}];

export function listQuranSuras(){return suras.map(sura=>({number:sura.number,name:sura.name,ayahCount:sura.simple.length}));}
// Tanzil's own opening basmala of a sura (Uthmani), kept outside verse 1; null for Al-Fatiha (where it is verse 1) and At-Tawbah.
export function quranSuraBismillah(suraNumber:number):string|null{return (Number.isInteger(suraNumber)?suras[suraNumber-1]?.bismillah?.uthmani:undefined)??null;}
export function getQuranVerse(suraNumber:number,ayah:number){
 const sura=Number.isInteger(suraNumber)?suras[suraNumber-1]:undefined;
 if(!sura||!Number.isInteger(ayah)||ayah<1||ayah>sura.simple.length)return null;
 return {sura:sura.number,suraName:sura.name,ayah,locator:`${sura.number}:${ayah}`,text:sura.simple[ayah-1],uthmani:sura.uthmani[ayah-1],url:quranVerseUrl(sura.number,ayah),links:quranVerseLinks(sura.number,ayah)};
}

const arabicDigits='٠١٢٣٤٥٦٧٨٩';
const persianDigits='۰۱۲۳۴۵۶۷۸۹';
const latinDigits=(value:string)=>value.replace(/[٠-٩۰-۹]/gu,digit=>String(Math.max(arabicDigits.indexOf(digit),persianDigits.indexOf(digit))));
const clip=(value:string,max:number)=>value.length>max?`${value.slice(0,max-1)}…`:value;
const quote=(value:string)=>`«${clip(value,40)}»`;

// Names only: hamza seats, ta marbuta and alef maqsura are unified so «البقره» and «سبأ» resolve; the verse text is never unified.
function suraKey(value:string):string{
 return value.normalize('NFC').replace(/[\p{M}\u0640]/gu,'').replace(/[أإآٱ]/gu,'ا').replace(/ؤ/gu,'و').replace(/ئ/gu,'ي').replace(/ء/gu,'').replace(/ة/gu,'ه').replace(/ى/gu,'ي').split(/[^\p{L}]+/u).filter(Boolean).map(word=>word.replace(/^ال(?=\p{L}{2})/u,'')).join('');
}
export const SURA_ALIASES:Readonly<Record<string,number>>={'الحمد':1,'أم الكتاب':1,'أم القرآن':1,'براءة':9,'التوبة':9,'بني إسرائيل':17,'الإسراء':17,'الملائكة':35,'فاطر':35,'يس':36,'ياسين':36,'المؤمن':40,'غافر':40,'فصلت':41,'حم السجدة':41,'القتال':47,'محمد':47,'تبارك':67,'ن':68,'نون':68,'القلم':68,'الدهر':76,'الإنسان':76,'عم':78,'النبأ':78,'التطفيف':83,'الشرح':94,'الانشراح':94,'ألم نشرح':94,'اقرأ':96,'الزلزال':99,'المسد':111,'تبت':111,'اللهب':111,'التوحيد':112};
let suraNames:Map<string,Sura>|null=null;
function suraByName(key:string):Sura|undefined{
 if(!suraNames){const names=new Map<string,Sura>();for(const sura of suras)names.set(suraKey(sura.name),sura);for(const [alias,number] of Object.entries(SURA_ALIASES))names.set(suraKey(alias),suras[number-1]);suraNames=names;}
 return suraNames.get(key);
}

const locatorHelp='اكتب موضع آية واحدة بصيغة السورة:الآية، مثل 112:1، أو باسم السورة ورقم الآية، مثل الإخلاص 1.';
const locatorStopWords=new Set(['سوره','ايه','ايات','رقم']);
const rangeWords=new Set(['الي','حتي']);
const isNumber=(token:string)=>/^\d+$/.test(token);
export function locateQuranVerse(locator:string):QuranLocation{
 const value=latinDigits(locator.normalize('NFC').replace(/\p{Cf}/gu,'')).replace(/\s+/gu,' ').trim();
 const tokens=(value.match(/\d+|[\p{L}\p{M}\u0640]+|[-–—~]/gu)??[]).map(token=>isNumber(token)?token:/^[-–—~]$/.test(token)?'-':suraKey(token)).map(token=>rangeWords.has(token)?'-':token).filter(token=>token&&!locatorStopWords.has(token));
 const unclear={ok:false as const,reason:'format' as const,message:`تعذر فهم الموضع ${quote(value)}. ${locatorHelp}`};
 if(!tokens.length)return {ok:false,reason:'empty',message:locatorHelp};
 const dash=tokens.indexOf('-');
 if(dash>=0)return dash>=2&&dash===tokens.length-2&&isNumber(tokens[dash-1])&&isNumber(tokens[dash+1])?{ok:false,reason:'range',message:'أمانة تفحص آية واحدة في كل مرة؛ اكتب موضع آية واحدة مثل 112:1 بدل نطاق مثل 112:1-4، وافحص كل آية على حدة.'}:unclear;
 const ayahToken=tokens[tokens.length-1];
 const suraTokens=tokens.slice(0,-1);
 const numeric=suraTokens.length===1&&isNumber(suraTokens[0]);
 if(!isNumber(ayahToken)||!suraTokens.length||!numeric&&suraTokens.some(isNumber))return unclear;
 const sura=numeric?suras[Number(suraTokens[0])-1]:suraByName(suraTokens.join(''));
 if(!sura)return {ok:false,reason:'sura',message:numeric?'رقم السورة يجب أن يكون بين 1 و114.':`لم نتعرف على اسم السورة في ${quote(value)}. اكتب اسمها كما في المصحف، مثل البقرة، أو رقمها من 1 إلى 114.`};
 const ayah=Number(ayahToken);
 if(!Number.isInteger(ayah)||ayah<1||ayah>sura.simple.length)return {ok:false,reason:'ayah',message:`عدد آيات سورة ${sura.name} ${sura.simple.length}، فلا توجد فيها الآية ${ayah}.`};
 return {ok:true,sura,ayah};
}
export function parseQuranLocator(locator:string):{sura:Sura;ayah:number}|null{
 const location=locateQuranVerse(locator);
 return location.ok?{sura:location.sura,ayah:location.ayah}:null;
}

// This comparison transforms copies in memory only; the Tanzil source files remain verbatim.
export function normalizeQuranText(value:string):string{
 return value.normalize('NFKC').replace(/[\p{M}\u0640\u06D6-\u06ED]/gu,'').replace(/ٱ/gu,'ا').replace(/[^\p{L}]/gu,'');
}
const decorations=/[\p{Cf}\u0640\u06D6-\u06DB\u06DD\u06DE\u06E9\uFD3E\uFD3F()[\]0-9٠-٩۰-۹]/gu;
export function prepareQuranText(value:string):string{return value.replace(decorations,'').normalize('NFC').replace(/\s+/gu,' ').trim();}
export const hasQuranDiacritics=(value:string)=>/[\u064B-\u065F\u0670\u06D6-\u06ED]/u.test(value);
const textKey=(prepared:string)=>prepared.replace(/[^\p{L}\p{M}]/gu,'');
const tierOf=(prepared:string):QuranTier=>hasQuranDiacritics(prepared)?'uthmani':'simple';
const verseText=(sura:Sura,ayah:number,tier:QuranTier)=>tier==='simple'?sura.simple[ayah-1]:sura.uthmani[ayah-1];
function compareVerse(prepared:string,sura:Sura,ayah:number){
 const tier=tierOf(prepared);
 const key=textKey(prepared);
 return {tier,matched:Boolean(key)&&key===textKey(prepareQuranText(verseText(sura,ayah,tier)))};
}

// Consonants that NFC, tatweel removal and decoration removal never change: equal consonants are a cheap precondition for an exact match.
const isStableLetter=(code:number)=>code>=0x0628&&code<=0x063A||code>=0x0641&&code<=0x0647;
function sameStableLetters(text:string,consonants:string):boolean{
 let position=0;
 for(let index=0;index<text.length;index++){const code=text.charCodeAt(index);if(!isStableLetter(code))continue;if(code!==consonants.charCodeAt(position))return false;position++;}
 return position===consonants.length;
}
function matchingVerses(prepared:string):string[]{
 const key=textKey(prepared);
 if(!key)return [];
 const tier=tierOf(prepared);
 const consonants=Array.from(key).filter(char=>isStableLetter(char.charCodeAt(0))).join('');
 const found:string[]=[];
 for(const sura of suras)for(let ayah=1;ayah<=sura.simple.length;ayah++){const text=verseText(sura,ayah,tier);if(sameStableLetters(text,consonants)&&textKey(prepareQuranText(text))===key)found.push(`${sura.number}:${ayah}`);}
 return found;
}
function otherVersesNote(locators:string[]):string{
 const [first,...rest]=locators;
 const name=suras[Number(first.split(':')[0])-1]?.name??'';
 return `هذا النص يطابق الآية ${first} (سورة ${name})${rest.length?`، ويتكرر النص نفسه في ${rest.slice(0,4).join('، ')}${rest.length>4?` ومواضع أخرى عددها ${rest.length-4}`:''}`:''}؛ صحّح الموضع إن كان هذا هو المقصود.`;
}

const basmala='بسماللهالرحمنالرحيم';
function withoutBasmala(prepared:string):string|null{
 const words=prepared.split(' ');
 return words.length>=4&&normalizeQuranText(words.slice(0,4).join(''))===basmala?words.slice(4).join(' '):null;
}

function wordChanges(expectedText:string,receivedText:string):WordChange[]{
 const expected=expectedText.split(' ');
 const expectedKeys=expected.map(word=>textKey(prepareQuranText(word)));
 const received=receivedText.split(' ').filter(word=>textKey(word));
 const receivedKeys=received.map(textKey);
 const rows=expected.length+1,cols=received.length+1;
 const cost=Array.from({length:rows},(_,i)=>Array.from({length:cols},(_,j)=>i===0?j:j===0?i:0));
 for(let i=1;i<rows;i++)for(let j=1;j<cols;j++)cost[i][j]=Math.min(cost[i-1][j]+1,cost[i][j-1]+1,cost[i-1][j-1]+(expectedKeys[i-1]===receivedKeys[j-1]?0:1));
 const changes:WordChange[]=[];
 for(let i=rows-1,j=cols-1;i>0||j>0;){
  if(i>0&&j>0&&expectedKeys[i-1]===receivedKeys[j-1]&&cost[i][j]===cost[i-1][j-1]){i--;j--;}
  else if(i>0&&j>0&&cost[i][j]===cost[i-1][j-1]+1){changes.push({expected:expected[i-1],received:received[j-1]});i--;j--;}
  else if(i>0&&cost[i][j]===cost[i-1][j]+1){changes.push({expected:expected[i-1]});i--;}
  else{changes.push({received:received[j-1]});j--;}
 }
 return changes.reverse();
}
function describeChanges(changes:WordChange[]):string{
 if(!changes.length)return '';
 const shown=changes.slice(0,5).map(change=>change.expected&&change.received?`${quote(change.expected)} كُتبت ${quote(change.received)}`:change.expected?`${quote(change.expected)} ناقصة`:`${quote(change.received??'')} زائدة`);
 return `الفرق على مستوى الكلمات مقارنة بنص الآية: ${shown.join('؛ ')}${changes.length>5?`؛ وفروق أخرى عددها ${changes.length-5}`:''}.`;
}

// Both sides are prepared the same way: in Tanzil Uthmani a tatweel can separate a letter from its hamza mark (e.g. «شَيْـًٔا»), which only NFC after tatweel removal composes.
const canonicalSkeleton=(text:string)=>normalizeQuranText(prepareQuranText(text));
function mismatchNote(prepared:string,sura:Sura,ayah:number):string{
 const locator=`${sura.number}:${ayah}`;
 if(!textKey(prepared))return 'لم يبقَ في النص العربي أي حرف بعد حذف أرقام الآيات وزخارفها. أدخل نص الآية كاملًا.';
 const rest=ayah===1&&sura.number!==1&&sura.number!==9?withoutBasmala(prepared):null;
 // Only the basmala, without the verse: the tier and the word diff would describe an empty text, so only the basmala note is given.
 const onlyBasmala=rest==='';
 const body=rest||prepared;
 const tier=tierOf(body);
 const skeleton=normalizeQuranText(body);
 const parts=[`النص العربي لا يطابق الآية ${locator} (سورة ${sura.name}) مطابقة تامة، فامتنعت أمانة عن التحليل.`];
 const restMatched=Boolean(rest)&&compareVerse(rest??'',sura,ayah).matched;
 const uthmaniNote=skeleton===canonicalSkeleton(sura.uthmani[ayah-1])?'النص مشكَّل فقورن بالرسم العثماني مع التشكيل: الحروف موافقة، والاختلاف في الحركات أو علامات الضبط، وتغيير الحركة قد يغيّر المعنى.':`النص مشكَّل فقورن بالرسم العثماني مع التشكيل، والاختلاف في الحروف.${textKey(body.replace(/\p{M}/gu,''))===textKey(prepareQuranText(sura.simple[ayah-1]))?' وحروفه توافق النص الإملائي، لكن النص المشكَّل لا يُقارن إلا بالرسم العثماني؛ فاحذف التشكيل أو انسخ الآية بالرسم العثماني.':''}`;
 const simpleNote=`النص غير مشكَّل فقورن حرفًا بحرف بالنص الإملائي (Simple Clean) دون توحيد الهمزات أو الألف أو الياء أو التاء المربوطة، والاختلاف في الحروف.${skeleton&&skeleton===canonicalSkeleton(sura.uthmani[ayah-1])?' وحروفه توافق رسم المصحف العثماني بعد حذف تشكيله، لكن الرسم المجرد لا يميّز بين كلمات مثل «ملك» و«مالك»؛ فأدخل الآية بالرسم العثماني كاملًا بتشكيله أو بالنص الإملائي.':''}`;
 // The verse count is the one of the corpus (Kufi, as in Tanzil and the Hafs Mushaf); the schools differ on the basmala, so the note names that count.
 if(rest!==null)parts.push(`في العدّ الكوفي المعتمد هنا (رواية حفص، Tanzil) لا تُعدّ البسملة في أول السورة من آيات سورة ${sura.name}؛ فهي الآية 1 من الفاتحة، وبعض الآية 30 من سورة النمل، ولا تُكتب في أول التوبة. احذفها من النص.${onlyBasmala?' والنص المدخل هو البسملة وحدها، دون نص الآية.':restMatched?' والنص بعد حذفها يطابق الآية.':''}`);
 if(!restMatched&&!onlyBasmala)parts.push(tier==='uthmani'?uthmaniNote:simpleNote);
 // Once the text after the basmala matches the given verse, the locator is right: copies of the same text elsewhere are not suggested.
 const others=[...new Set([...matchingVerses(prepared),...(rest&&!restMatched?matchingVerses(rest):[])])].filter(item=>item!==locator);
 if(others.length)parts.push(otherVersesNote(others));
 const changes=restMatched||onlyBasmala?'':describeChanges(wordChanges(verseText(sura,ayah,tier),body));
 if(changes)parts.push(changes);
 parts.push('انسخ الآية من منتقي الآيات أو من Tanzil دون تعديل.');
 return clip(parts.join(' '),1000);
}

export function resolveQuranSource(input:Pick<AmanahAnalyzeRequest,'source'|'originalText'>):{source:QuranSource|null;result:AmanahAnalysisResult|null}{
 const location=locateQuranVerse(input.source.locator);
 const completedAt=new Date().toISOString();
 const prepared=prepareQuranText(input.originalText);
 if(!location.ok){
  const others=matchingVerses(prepared);
  const note=clip(others.length?`${location.message} ${otherVersesNote(others)}`:location.message,1000);
  const match={matched:false,registryId:'',normalizedCitation:'',method:'none' as const,note};
  return {source:null,result:{status:'ABSTAIN',confidence:null,summary:'تعذر تحديد موضع الآية في المصحف.',explanation:note,sourceMatch:match,findings:[],evidence:[],modelVersion,completedAt}};
 }
 const {sura,ayah}=location;
 const locator=`${sura.number}:${ayah}`;
 const text=sura.simple[ayah-1];
 const uthmani=sura.uthmani[ayah-1];
 const citation=`القرآن الكريم · سورة ${sura.name} (${locator})`;
 const registryId=`tanzil:1.1:${locator}`;
 const url=quranVerseUrl(sura.number,ayah);
 const evidence=[{id:registryId,title:QURAN_EVIDENCE_TITLE,locator:citation,excerpt:uthmani,url}];
 const {tier,matched}=compareVerse(prepared,sura,ayah);
 const ignored='بعد تجاهل المسافات وعلامات الترقيم وأرقام الآيات وزخارفها وعلامات الوقف والتطويل فقط.';
 const note=matched?tier==='uthmani'?`طابق النص العربي الآية ${locator} كاملة حرفًا بحرف مع التشكيل في نص Tanzil بالرسم العثماني (رواية حفص)، ${ignored}`:`طابق النص العربي الآية ${locator} كاملة حرفًا بحرف في نص Tanzil الإملائي غير المشكَّل (Simple Clean)، ${ignored}`:mismatchNote(prepared,sura,ayah);
 const match={matched,registryId,normalizedCitation:citation,method:matched?'exact' as const:'none' as const,note};
 if(!matched)return {source:null,result:{status:'ABSTAIN',confidence:null,summary:'تعذر مطابقة النص العربي مع الآية المحددة.',explanation:note,sourceMatch:match,findings:[],evidence,modelVersion,completedAt}};
 return {source:{citation,registryId,sura:sura.number,ayah,locator,text,uthmani,url,links:quranVerseLinks(sura.number,ayah),match,evidence},result:null};
}

// Verses quoted in a generated explanation are checked against the checked ayah and the corpus (generatedQuoteIssues).
// A track is one text of a sura or verse (Simple Clean or Uthmani) as whole words, keyed by «loose» letters, with the Uthmani word
// at each position (null where the Simple Clean and Uthmani texts of a verse split into a different number of words).
type Keyed={joined:string;starts:number[]};
type Track={loose:Keyed;uthmani:(string|null)[]};
type QuoteIndex={simple:string[];uthmani:string[];tracks:Track[]};
let quoteIndex:QuoteIndex|null=null;
const quoteKey=(text:string)=>prepareQuranText(text).replace(/[^\p{L}\p{M}\s]/gu,' ').replace(/\s+/gu,' ').trim();
function keyed(keys:readonly string[]):Keyed{const starts:number[]=[];let offset=1;for(const key of keys){starts.push(offset);offset+=key.length+1;}return {joined:` ${keys.join(' ')} `,starts};}
type Words={words:string[];keys:string[]};
const track=(text:Words,uthmani:readonly (string|null)[]):Track=>({loose:keyed(text.keys.map(looseKey)),uthmani:[...uthmani]});
function verseWords(simple:string,uthmani:string){const simpleWords=wordTokens(simple);const uthmaniWords=wordTokens(uthmani);return {simpleWords,uthmaniWords,aligned:simpleWords.words.length===uthmaniWords.words.length?uthmaniWords.words:simpleWords.words.map(()=>null)};}
function verseTracks(simple:string,uthmani:string):Track[]{const {simpleWords,uthmaniWords,aligned}=verseWords(simple,uthmani);return [track(simpleWords,aligned),track(uthmaniWords,uthmaniWords.words)];}
function quranQuoteIndex():QuoteIndex{
 if(quoteIndex)return quoteIndex;
 const index:QuoteIndex={simple:[],uthmani:[],tracks:[]};
 for(const sura of suras){
  index.simple.push(quoteKey(sura.simple.join(' ')));index.uthmani.push(quoteKey(sura.uthmani.join(' ')));
  const simpleWords:Words={words:[],keys:[]};const uthmaniWords:Words={words:[],keys:[]};const aligned:(string|null)[]=[];
  sura.simple.forEach((text,verse)=>{const words=verseWords(text,sura.uthmani[verse]);for(const [all,part] of [[simpleWords,words.simpleWords],[uthmaniWords,words.uthmaniWords]] as const){all.words.push(...part.words);all.keys.push(...part.keys);}aligned.push(...words.aligned);});
  index.tracks.push(track(simpleWords,aligned),track(uthmaniWords,uthmaniWords.words));
 }
 return quoteIndex=index;
}

// The case vowel of a word: its last short vowel or tanween (shadda ignored). A quoted word ending in sukun is a pause and is not compared.
const quotedCase=(word:string)=>{const last=word.normalize('NFC').match(/[\u064B-\u0650\u0652]/gu)?.at(-1);return last&&last!=='\u0652'?last:null;};
const canonicalCase=(word:string)=>word.normalize('NFC').match(/[\u064B-\u0650]/gu)?.at(-1)??null;
function wordStarts(keys:Keyed,needle:string):number[]{
 const found:number[]=[];
 for(let at=keys.joined.indexOf(needle);at>=0;at=keys.joined.indexOf(needle,at+1)){let low=0,high=keys.starts.length-1;while(low<high){const middle=(low+high)>>1;if(keys.starts[middle]<at+1)low=middle+1;else high=middle;}found.push(low);}
 return found;
}
// Each part of the quote (split at an ellipsis) must be a run of whole words of one track, compared by loose letters (hamza seats,
// alef maqsura and ta marbuta unified). With `cases`, every quoted word that carries a
// case vowel must also agree with the Uthmani word at the same place, so «يَخْشَى اللَّهُ … الْعُلَمَاءَ» (35:28 with subject and object swapped)
// or «وَرَسُولِهِ» after «بَرِيءٌ مِنَ الْمُشْرِكِينَ» (9:3) is rejected, while the same verses vowelled correctly in ordinary spelling pass.
function quoteFits(quote:string,tracks:readonly Track[],cases=true):boolean{
 const parts=quote.split(/\.{2,}|…/u).map(part=>wordTokens(part,looseLetters)).filter(part=>[...part.keys.join('')].length>=2);
 return parts.every(part=>{
  const needle=` ${part.keys.join(' ')} `;const vowels=cases?part.words.map(quotedCase):[];
  if(!vowels.some(Boolean))return tracks.some(item=>item.loose.joined.includes(needle));
  return tracks.some(item=>wordStarts(item.loose,needle).some(start=>vowels.every((vowel,offset)=>{const word=item.uthmani[start+offset];return !vowel||!word||canonicalCase(word)===vowel;})));
 });
}
const inSequences=(part:string,sequences:readonly string[])=>sequences.some(sequence=>` ${sequence} `.includes(` ${part} `));
// Strict tiers, as in verse matching: a part without diacritics must be whole words of Simple Clean, a part with diacritics whole words
// of the Uthmani text with its diacritics. So «ملك يوم الدين» or «وَرَسُولِهِ» (9:3) is rejected.
const strictFits=(quote:string,simple:readonly string[],uthmani:readonly string[])=>quote.split(/\.{2,}|…/u).map(quoteKey).filter(part=>part.replace(/[^\p{L}]/gu,'').length>=2).every(part=>inSequences(part,hasQuranDiacritics(part)?uthmani:simple));

function longestRun(keys:readonly string[],tracks:readonly Track[]):number{
 let best=0;
 for(let start=0;start<keys.length;start++)for(let end=keys.length;end>start+best;end--)if(tracks.some(item=>item.loose.joined.includes(` ${keys.slice(start,end).join(' ')} `))){best=end-start;break;}
 return best;
}
export type QuoteIssue={quote:string;bracketed:boolean;issue:'misquote'|'other-verse'};
// Quotes in a generated explanation of one ayah (location null when the ayah is unknown: then only misquotes are reported). Between ﴿ ﴾
// the strict tiers apply and an explanation may quote only the checked ayah. Other Arabic quotes («», quotation marks, the words after «قوله تعالى» or
// «الآية تقول:», runs of three or more diacritized words) are checked once they look like the Quran (two words in a row of the checked
// ayah, or four anywhere in the Mushaf): their letters must be whole words of the ayah (hamza seats, alef maqsura and ta marbuta unified,
// because informal quotes often drop them) and their case vowels, where written, must agree with the Uthmani text.
export function generatedQuoteIssues(text:string,location:{sura:number;ayah:number}|null):QuoteIssue[]{
 const bracketed=bracketedQuranQuotes(text);const segments=quotedArabicSegments(text);
 if(!bracketed.length&&!segments.length)return [];
 // The corpus index is built only when a quote is not simply a fragment of the checked ayah.
 const corpus=()=>quranQuoteIndex();
 const verse=location?getQuranVerse(location.sura,location.ayah):null;
 const own=verse?verseTracks(verse.text,verse.uthmani):[];
 const ownSimple=verse?[quoteKey(verse.text)]:[];const ownUthmani=verse?[quoteKey(verse.uthmani)]:[];
 const issues:QuoteIssue[]=[];
 for(const quote of bracketed){
  if(verse&&strictFits(quote,ownSimple,ownUthmani))continue;
  if(!strictFits(quote,corpus().simple,corpus().uthmani))issues.push({quote,bracketed:true,issue:'misquote'});
  else if(verse)issues.push({quote,bracketed:true,issue:'other-verse'});
 }
 for(const {quote,formula} of segments){
  const keys=wordTokens(quote,looseLetters).keys;
  if(keys.length<2)continue;
  // After a formula the words count as a quote only when they open with two words of the ayah in a row; otherwise they are reported speech.
  const opening=` ${keys.slice(0,2).join(' ')} `;
  const quranLike=formula?own.some(item=>item.loose.joined.includes(opening)):(verse&&longestRun(keys,own)>=2)||(keys.length>=4&&quoteFits(quote,corpus().tracks,false));
  if(!quranLike||(verse&&quoteFits(quote,own)))continue;
  if(!quoteFits(quote,corpus().tracks))issues.push({quote,bracketed:false,issue:'misquote'});
  else if(verse)issues.push({quote,bracketed:false,issue:'other-verse'});
 }
 return issues;
}

export type {QuranSource,QuranLink,QuranLocation};
