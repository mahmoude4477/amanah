export type TextDirection='ltr'|'rtl';
export type LanguageScript='latin'|'arabic'|'cyrillic'|'bengali'|'han';
type LanguageDefinition={code:string;label:string;english:string;native:string;dir:TextDirection;script:LanguageScript;mlSupported:boolean;aliases:readonly string[]};

// Only English is inside the measured scope of the AMANAH model (v0.2, as v0.1 before it). Other languages are accepted and end in ABSTAIN.
export const LANGUAGES=[
 {code:'en',label:'الإنجليزية',english:'English',native:'English',dir:'ltr',script:'latin',mlSupported:true,aliases:['eng','انجليزي','انكليزي','الانكليزية']},
 {code:'fr',label:'الفرنسية',english:'French',native:'Français',dir:'ltr',script:'latin',mlSupported:false,aliases:['fra','fre','فرنسي']},
 {code:'es',label:'الإسبانية',english:'Spanish',native:'Español',dir:'ltr',script:'latin',mlSupported:false,aliases:['spa','اسباني']},
 {code:'de',label:'الألمانية',english:'German',native:'Deutsch',dir:'ltr',script:'latin',mlSupported:false,aliases:['deu','ger','الماني']},
 {code:'ru',label:'الروسية',english:'Russian',native:'Русский',dir:'ltr',script:'cyrillic',mlSupported:false,aliases:['rus','روسي']},
 {code:'tr',label:'التركية',english:'Turkish',native:'Türkçe',dir:'ltr',script:'latin',mlSupported:false,aliases:['tur','تركي']},
 {code:'id',label:'الإندونيسية',english:'Indonesian',native:'Bahasa Indonesia',dir:'ltr',script:'latin',mlSupported:false,aliases:['ind','indonesia','اندونيسي']},
 {code:'ms',label:'الملايوية',english:'Malay',native:'Bahasa Melayu',dir:'ltr',script:'latin',mlSupported:false,aliases:['msa','may','zsm','melayu','malaysian','الماليزية','ملايو']},
 {code:'ur',label:'الأردية',english:'Urdu',native:'اردو',dir:'rtl',script:'arabic',mlSupported:false,aliases:['urd','اوردو','الاوردية']},
 {code:'fa',label:'الفارسية',english:'Persian',native:'فارسی',dir:'rtl',script:'arabic',mlSupported:false,aliases:['fas','per','farsi','فارسي']},
 {code:'bn',label:'البنغالية',english:'Bengali',native:'বাংলা',dir:'ltr',script:'bengali',mlSupported:false,aliases:['ben','bangla','بنغالي']},
 {code:'zh',label:'الصينية',english:'Chinese',native:'中文',dir:'ltr',script:'han',mlSupported:false,aliases:['zho','chi','mandarin','صيني']},
 {code:'ha',label:'الهوسا',english:'Hausa',native:'Hausa',dir:'ltr',script:'latin',mlSupported:false,aliases:['hau','هوسا']},
 {code:'sw',label:'السواحيلية',english:'Swahili',native:'Kiswahili',dir:'ltr',script:'latin',mlSupported:false,aliases:['swa','swh','السواحلية','سواحلي']},
] as const satisfies readonly LanguageDefinition[];

export type Language=typeof LANGUAGES[number];
export type LanguageCode=Language['code'];
export const LANGUAGE_CODES=LANGUAGES.map(language=>language.code) as unknown as readonly [LanguageCode,...LanguageCode[]];
export const DEFAULT_LANGUAGE:LanguageCode='en';
export type LanguageInfo={code:LanguageCode|null;label:string;english:string;native:string;dir:TextDirection|'auto';script:LanguageScript|'unknown';mlSupported:boolean};

function languageKey(value:string):string{
 return value.normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'').replace(/ى|ی/gu,'ي').replace(/ة/gu,'ه').replace(/ک/gu,'ك').replace(/^اللغه\s+/u,'').replace(/^لغه\s+/u,'').replace(/^ال/u,'').replace(/[^\p{L}\p{N}]/gu,'');
}
const byKey=new Map<string,Language>();
for(const language of LANGUAGES)for(const name of [language.code,language.label,language.english,language.native,...language.aliases])byKey.set(languageKey(name),language);

export function isLanguageCode(value:unknown):value is LanguageCode{return typeof value==='string'&&(LANGUAGE_CODES as readonly string[]).includes(value);}

// Accepts ISO codes (also with a region, e.g. en-GB) and the free-text names stored by older checks (e.g. 'English').
export function languageInfo(value:string|null|undefined):LanguageInfo{
 const raw=(value??'').trim();
 const primary=raw.match(/^([a-z]{2,3})[-_][a-z0-9-]+$/i)?.[1]??raw;
 const language=byKey.get(languageKey(primary))??byKey.get(languageKey(raw));
 if(!language)return {code:null,label:raw||'غير محددة',english:raw,native:raw,dir:'auto',script:'unknown',mlSupported:false};
 return {code:language.code,label:language.label,english:language.english,native:language.native,dir:language.dir,script:language.script,mlSupported:language.mlSupported};
}

export function normalizeLanguageCode(value:string|null|undefined):LanguageCode|null{return languageInfo(value).code;}
