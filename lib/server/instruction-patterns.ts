// Phrases in submitted text that address the tool instead of translating, or claim an endorsement nobody verified (م-13).
// They never change the model decision or its drifts: the reviewer confirms them before approval, and a generated explanation that repeats them is withheld.
const plain=(text:string)=>text.normalize('NFKC').replace(/[\p{M}\p{Cf}ـ]/gu,'').replace(/[أإآٱ]/gu,'ا').replace(/ة/gu,'ه').replace(/ى/gu,'ي').replace(/[’‘ʼ`]/gu,'\'').replace(/\s+/gu,' ');

const decisions='PASS|REVIEW|CRITICAL|ABSTAIN';
const instructionPatterns:readonly RegExp[]=[
 /\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier|preceding|system|your)\s+(?:instructions?|prompts?|rules?|messages?)\b/giu,
 new RegExp(`\\b(?:return|output|respond\\s+with|answer\\s+with|reply\\s+with|set\\s+(?:the\\s+)?(?:decision|status|result|verdict)\\s+to|mark\\s+(?:it|this)\\s+as|classify\\s+(?:it|this)\\s+as)\\s*:?\\s*["'«]?(?:${decisions}|approved)\\b`,'giu'),
 /\b(?:system\s+prompt|new\s+instructions?|developer\s+mode|jailbreak)\b/giu,
 /\b(?:verified|approved|certified|endorsed|reviewed|authenticated|checked|authori[sz]ed)\s+by\s+(?:the\s+|a\s+)?(?:senior\s+)?(?:scholars?|ulama|ulema|al-?azhar|imams?|shaykhs?|sheikhs?|muftis?|experts?|committees?|councils?|king\s+fahd)\b/giu,
 /\bscholar(?:ly|s)?[-\s]+(?:verified|approved|endorsed|certified)\b/giu,
 /تجاهل\s+(?:كل\s+|جميع\s+)?(?:التعليمات|الاوامر|ما\s+سبق)/gu,
 new RegExp(`(?:اعد|ارجع|اجعل|اكتب)\\s+(?:النتيجه|القرار|الحكم)\\s*[:：]?\\s*["'«]?(?:${decisions}|سليمه|سليم|صحيحه|صحيح|مقبوله|مقبول|معتمده|معتمد)`,'giu'),
 /(?:معتمده|معتمد|موثقه|موثق|مجازه|مجاز|مراجعه|مصادق\s+عليها|مصادق\s+عليه)\s+من\s+(?:قبل\s+)?(?:كبار\s+)?(?:العلماء|علماء|هيئه|لجنه|الازهر|مجمع|المشايخ|المفتي|دار\s+الافتاء)/gu,
];

export function instructionLikePhrases(...texts:readonly string[]):string[]{
 const found=new Set<string>();
 for(const text of texts){const value=plain(text);for(const pattern of instructionPatterns)for(const match of value.matchAll(pattern))found.add(match[0].trim().slice(0,200));}
 return [...found].slice(0,10);
}
