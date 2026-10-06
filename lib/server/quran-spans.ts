// Source spans returned by the AMANAH model are only shown as source text after they are found, word for word, in the canonical text.
// What gets displayed is always the canonical words at the matched position, never the quote as the model wrote it.

export type VerseTexts={simple:string;uthmani:string};
export type SourceSpanMatch={verified:true;simple:string|null;uthmani:string|null}|{verified:false};
export type WordSpan={start:number;end:number;words:string[]};
type Tokens={words:string[];keys:string[]};

// Letters only: every combining mark (harakat, Quranic annotation marks), tatweel and non-letter is removed and ٱ becomes ا. No other letter is unified.
export function arabicLetters(value:string):string{
 return value.normalize('NFKC').replace(/ٱ/gu,'ا').replace(/[\p{M}ـ]/gu,'').replace(/[^\p{L}]/gu,'');
}

function tokens(text:string,key:(word:string)=>string=arabicLetters):Tokens{
 const words:string[]=[];const keys:string[]=[];
 for(const word of text.split(/[\s\p{P}\p{S}\p{N}]+/u)){const value=key(word);if(value){words.push(word);keys.push(value);}}
 return {words,keys};
}
export {tokens as wordTokens};
// For informal quotes in generated text only: also unifies the hamza seats of alef, alef maqsura and ta marbuta, which writers often drop.
export const looseKey=(letters:string)=>letters.replace(/[أإآ]/gu,'ا').replace(/ى/gu,'ي').replace(/ة/gu,'ه');
export const looseLetters=(value:string)=>looseKey(arabicLetters(value));

function locate(query:readonly string[],keys:readonly string[]):number{
 outer:for(let start=0;start+query.length<=keys.length;start++){for(let offset=0;offset<query.length;offset++)if(keys[start+offset]!==query[offset])continue outer;return start;}
 return -1;
}

const meaningful=(query:Tokens)=>query.keys.length>0&&[...query.keys.join('')].length>=2;

// Whole words of `span` must appear contiguously in `text`; returns the words of `text` at that position.
export function findWordSpan(span:string,text:string):WordSpan|null{
 const query=tokens(span);
 if(!meaningful(query))return null;
 const target=tokens(text);
 const start=locate(query.keys,target.keys);
 return start<0?null:{start,end:start+query.keys.length,words:target.words.slice(start,start+query.keys.length)};
}

export function mapSourceSpan(span:string,verse:VerseTexts):SourceSpanMatch{
 const query=tokens(span);
 if(!meaningful(query))return {verified:false};
 const simple=tokens(verse.simple);
 const uthmani=tokens(verse.uthmani);
 const aligned=simple.keys.length===uthmani.keys.length;
 const pick=(source:Tokens,start:number)=>source.words.slice(start,start+query.keys.length).join(' ');
 const inSimple=locate(query.keys,simple.keys);
 if(inSimple>=0)return {verified:true,simple:pick(simple,inSimple),uthmani:aligned?pick(uthmani,inSimple):null};
 // The AMANAH model receives the Uthmani text, so its quotes may follow the Uthmani spelling (e.g. ٱلْعَٰلَمِينَ).
 const inUthmani=locate(query.keys,uthmani.keys);
 if(inUthmani>=0)return {verified:true,simple:aligned?pick(simple,inUthmani):null,uthmani:pick(uthmani,inUthmani)};
 return {verified:false};
}

function plainTranslation(value:string):string{
 return value.normalize('NFKC').toLowerCase().replace(/\p{Cf}/gu,'').replace(/[’‘ʼ`´]/gu,'\'').replace(/[“”„]/gu,'"').replace(/[یى]/gu,'ي').replace(/ک/gu,'ك').replace(/[ەہ]/gu,'ه').replace(/[ً-ٰٟ]/gu,'').replace(/[\p{P}\p{S}]/gu,' ').replace(/\s+/gu,' ').trim();
}

// Case-insensitive whole-word containment after unifying spacing, punctuation, apostrophes and Persian/Urdu letter forms.
export function translationSpanVerified(span:string,translation:string):boolean{
 const needle=plainTranslation(span);
 if((needle.match(/\p{L}/gu)??[]).length<2)return false;
 const haystack=plainTranslation(translation);
 if(/\p{Script=Han}/u.test(needle))return haystack.replace(/ /gu,'').includes(needle.replace(/ /gu,''));
 return ` ${haystack} `.includes(` ${needle} `);
}

// Quranic quotations in Arabic prose (here, generated explanations) are conventionally wrapped in ﴿ ﴾. Digit-only brackets are verse-number ornaments and are ignored.
export function bracketedQuranQuotes(text:string):string[]{
 return [...text.matchAll(/﴿([^﴿﴾]+)﴾/gu)].map(match=>match[1].trim()).filter(quote=>tokens(quote).keys.length>0);
}

// Arabic text that generated prose presents as a quotation, other than between ﴿ ﴾: inside «» or quotation marks, the words after a
// quotation formula («قوله تعالى»، «الآية تقول:»), and runs of three or more diacritized words. Whether it looks like the Quran is decided by the caller.
const wordChars=/[\u0620-\u064A\u066E-\u06D3\u06D5\u06FA-\u06FF\p{M}\u0640]/u.source;
const diacritizedWord=`${wordChars}*${/[\u064B-\u065F\u0670\u06D6-\u06ED]/u.source}${wordChars}*`;
const diacritizedRun=new RegExp(`${diacritizedWord}(?:${/\s+/u.source}${diacritizedWord}){2,}`,'gu');
// Each Arabic letter of a formula may carry marks or a tatweel, and any alef may carry a hamza.
const marks=/[\p{M}\u0640]*/u.source;
const loosePattern=(pattern:RegExp)=>[...pattern.source].map(char=>/[\u0620-\u064A]/u.test(char)?`${char==='ا'?'[اأإآٱ]':char}${marks}`:char).join('');
const notWord=/(?<![\p{L}\p{M}])/u.source;
const unbracketedQuote=/[^\S\n]*[:：]?[^\S\n]*([^.،,؛;!?؟:：\n«»"“”﴿﴾()[\]]+)/u.source;
const quoteFormula=new RegExp(`${notWord}${loosePattern(/(?:(?:و|ف)?(?:قوله|قول الله|قال الله|يقول الله|قال|يقول)\s+(?:تعالى|سبحانه(?:\s+وتعالى)?)|(?:ال)?اية(?:\s+الكريمة)?\s+(?:تقول|نصها)|تقول\s+(?:ال)?اية(?:\s+الكريمة)?|نص\s+(?:ال)?اية)/u)}${unbracketedQuote}`,'gu');
// Commentary after an unbracketed quote usually starts with one of these words.
const commentaryStart=new RegExp(`${notWord}${loosePattern(/(?:اي|يعني|بمعنى|معناه|معناها|والمعنى|الترجمة|والترجمة|لكن|ولكن|بينما|حيث)/u)}${/(?![\p{L}\p{M}])/u.source}`,'u');
// `formula` marks the words after a formula, which may also be reported speech («تقول الآية إن الكتاب…»).
export type QuotedSegment={quote:string;formula:boolean};
export function quotedArabicSegments(text:string):QuotedSegment[]{
 const segments:QuotedSegment[]=[];
 const take=(segment:string|undefined,formula=false)=>{if(segment&&/[\u0620-\u064A\u066E-\u06D3]/u.test(segment))segments.push({quote:segment.trim(),formula});return '\n';};
 let rest=text.replace(/﴿[^﴿﴾]*﴾/gu,'\n').replace(/«([^«»]+)»|“([^“”]+)”|"([^"]+)"/gu,(_,a?:string,b?:string,c?:string)=>take(a??b??c));
 rest=rest.replace(quoteFormula,(_,quote:string)=>take(quote.split(commentaryStart)[0],true));
 for(const match of rest.matchAll(diacritizedRun))take(match[0]);
 return segments;
}
