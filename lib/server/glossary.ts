import glossaryData from '@/vendor/glossary.json';
import type {ContentType,GlossaryNote} from '@/lib/contracts';
import {languageInfo} from '@/lib/languages';

// Deterministic terminology check against the approved glossary (PDF p.8, islamic-content.com/dictionary).
// Notes are advisory: they never change the model decision, severity or drifts; the reviewer confirms terminology when an alert exists.
type DetectorScope='all'|'quran'|'other';
type Detector={scope:DetectorScope;arabic:string[];note?:string;alert?:{pattern:string;unless?:string;message:string}};
type Term={id:string;term:string;english:string[];rule:string;detectors:Detector[]};
type Glossary={version:string;source:string;reference:string;referenceUrl:string;terms:Term[]};
export type GlossaryInput={arabic:string;translation:string;targetLanguage:string;contentType?:ContentType};

const glossary=glossaryData as Glossary;
const compiled=glossary.terms.map(term=>({term,detectors:term.detectors.map(detector=>({
 scope:detector.scope,note:detector.note,
 arabic:detector.arabic.map(pattern=>new RegExp(`(?:^| )(${pattern})(?= |$)`,'u')),
 alert:detector.alert?{message:detector.alert.message,pattern:new RegExp(detector.alert.pattern,'iu'),unless:detector.alert.unless?new RegExp(detector.alert.unless,'iu'):null}:null,
}))}));

export const glossaryTerms=()=>glossary.terms.map(term=>({id:term.id,term:term.term,approved:term.english,rule:term.rule}));

export function glossaryArabicText(value:string):string{
 return value.normalize('NFKC').replace(/[\p{M}ـ]/gu,'').replace(/[أإآٱ]/gu,'ا').replace(/[^\p{L}]+/gu,' ').trim();
}
const englishText=(value:string)=>value.normalize('NFKC').replace(/[’‘ʼ`]/gu,'\'').replace(/\s+/gu,' ');
const fill=(template:string,arabic:string,english:string)=>template.replace(/\{arabic\}/gu,arabic).replace(/\{english\}/gu,english);
const clip=(value:string,max:number)=>value.slice(0,max);

export function checkGlossary(input:GlossaryInput):GlossaryNote[]{
 const arabic=glossaryArabicText(input.arabic);
 if(!arabic)return [];
 const translation=englishText(input.translation);
 const english=languageInfo(input.targetLanguage).code==='en';
 const quran=(input.contentType??'quran')==='quran';
 const notes:GlossaryNote[]=[];
 for(const {term,detectors} of compiled){
  let note:GlossaryNote|null=null;
  for(const detector of detectors){
   if(detector.scope==='quran'&&!quran||detector.scope==='other'&&quran)continue;
   const arabicMatch=detector.arabic.map(pattern=>arabic.match(pattern)?.[1]).find(Boolean);
   if(!arabicMatch)continue;
   const hit=english&&detector.alert?translation.match(detector.alert.pattern):null;
   const alert=Boolean(hit)&&!detector.alert?.unless?.test(translation);
   const message=alert&&detector.alert&&hit?fill(detector.alert.message,arabicMatch,hit[0]):fill(detector.note??`ورد مصطلح «${term.term}» في النص. المقابل المعتمد في القاموس: ${term.english.join(' / ')}. ضابط الاستخدام: ${term.rule}`,arabicMatch,'');
   const candidate:GlossaryNote={termId:term.id,term:term.term,approved:term.english,rule:term.rule,reference:glossary.reference,referenceUrl:glossary.referenceUrl,alert,message:clip(message,1200),arabicMatch:clip(arabicMatch,200),...(alert&&hit?{translationMatch:clip(hit[0],200)}:{})};
   if(!note||alert&&!note.alert)note=candidate;
   if(alert)break;
  }
  if(note)notes.push(note);
 }
 return notes.slice(0,20);
}
