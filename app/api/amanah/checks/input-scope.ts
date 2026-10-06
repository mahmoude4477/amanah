import type {AmanahAnalyzeRequest} from '@/lib/contracts';
import {languageInfo} from '@/lib/languages';
import {ApiError} from '@/lib/server/http';

export const PERSONAL_FATWA_REFERRAL='أمانة تفحص الترجمات ولا تجيب عن الأسئلة أو الفتاوى الشخصية؛ للفتوى ارجع إلى جهة إفتاء معتمدة.';
const MAX_ARABIC_SHARE=0.3;

const arabicKey=(text:string)=>text.normalize('NFKC').replace(/[\p{M}\p{Cf}ـ]/gu,'').replace(/[أإآٱ]/gu,'ا').replace(/ة/gu,'ه').replace(/[ىی]/gu,'ي').replace(/\s+/gu,' ');
const latinKey=(text:string)=>text.normalize('NFKC').replace(/[‘’ʼ`]/gu,'\'').replace(/\s+/gu,' ');
const personalArabic=[/هل\s+يجوز\s+لي(?!\p{L})/u,/هل\s+يحل\s+لي(?!\p{L})/u,/انا\s+في\s+دوله(?!\p{L})/u,/ما\s+حكم\s+ان\s+ا/u];
// "fatwa" alone is the approved rendering of الفتوى (G-09), so only first-person requests for one are rejected.
const personalLatin=[/\bis\s+it\s+(?:permissible|halal|haram|allowed|lawful)\s+for\s+me\b/i,/\b(?:give|send|issue)\s+me\s+(?:a\s+)?fatwa\b/i,/\bi\s+(?:need|want|request|am\s+asking\s+for)\s+(?:a\s+)?fatwa\b/i,/\bfatwa\s+(?:for|about)\s+(?:me|my)\b/i];

export const isPersonalFatwaRequest=(text:string)=>personalArabic.some(pattern=>pattern.test(arabicKey(text)))||personalLatin.some(pattern=>pattern.test(latinKey(text)));
export function arabicLetterShare(text:string):number{
 const letters=text.match(/\p{L}/gu)?.length??0;if(!letters)return 0;
 return (text.match(/(?=\p{L})\p{Script=Arabic}/gu)?.length??0)/letters;
}

const fieldError=(field:'title'|'translation'|'originalText',message:string)=>({formErrors:[],fieldErrors:{[field]:[message]}});
// Scope control (R-02, R-06): runs before any analysis, so rejected input never reaches the AMANAH model.
// The Arabic source field is checked too (م-26): a personal question pasted as the text to translate is referred, not analysed.
// No Quran verse matches these first-person patterns (tests/api.test.mjs sweeps the corpus).
export function assertCheckInScope(input:Pick<AmanahAnalyzeRequest,'title'|'translation'|'targetLanguage'>&Partial<Pick<AmanahAnalyzeRequest,'originalText'>>){
 for(const field of ['title','translation','originalText'] as const){const value=input[field];if(value&&isPersonalFatwaRequest(value))throw new ApiError(400,'OUT_OF_SCOPE_PERSONAL_FATWA',PERSONAL_FATWA_REFERRAL,fieldError(field,PERSONAL_FATWA_REFERRAL));}
 const language=languageInfo(input.targetLanguage);
 if(language.script==='latin'&&arabicLetterShare(input.translation)>MAX_ARABIC_SHARE){const message=`الترجمة مكتوبة في معظمها بالحروف العربية، واللغة المختارة هي ${language.label}. أدخل نص الترجمة المراد فحصها باللغة المختارة.`;throw new ApiError(400,'TRANSLATION_LANGUAGE_MISMATCH',message,fieldError('translation',message));}
}
