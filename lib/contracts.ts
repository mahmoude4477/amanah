import {z} from 'zod';
import {LANGUAGE_CODES} from './languages';

// All three values stay readable for stored rows. New checks are Qur'an only: the measured scope of the AMANAH model (v0.2, as v0.1
// before it) is Qur'an Arabic → English, so hadith and tafsir checks are no longer created, and their stored rows are read-only (never approved).
export const contentTypeSchema=z.enum(['quran','hadith','tafsir']);
export type ContentType=z.infer<typeof contentTypeSchema>;
export const QURAN_ONLY_MESSAGE='المتاح حاليًا هو القرآن الكريم فقط.';
export const isRetiredContentType=(value:string|null|undefined)=>value!=='quran';

export const publicationUseSchema=z.enum(['internal_draft','official_publication']);
export type PublicationUse=z.infer<typeof publicationUseSchema>;

// Intended readers of the translation (م-17, G-10). Stored, shown to the reviewer and exported; it does not change the model decision.
export const audienceSchema=z.enum(['general','muslims','new_to_islam','academic']);
export type Audience=z.infer<typeof audienceSchema>;
export const audienceLabels:Record<Audience,string>={general:'عامة القراء',muslims:'المسلمون',new_to_islam:'غير المسلمين والجدد على الإسلام',academic:'القراء الأكاديميون والمتخصصون'};
export const audienceLabel=(value:string|null|undefined)=>value?audienceLabels[value as Audience]??value:'';

// Title of the Tanzil evidence written by the current matcher. Rows stored before it carry an older title and a Simple Clean excerpt.
export const QURAN_EVIDENCE_TITLE='نص القرآن الكريم · مشروع Tanzil 1.1 · رواية حفص · الرسم العثماني';

// Arabic number agreement: 1 and 2 have their own forms, 3–10 take the plural, 11–99 the singular accusative, round hundreds the singular.
export type CountForms={one:string;two:string;plural:string;accusative:string;singular:string};
export function arabicCount(value:number,forms:CountForms,format:(value:number)=>string=String):string{
 const rest=value%100;
 if(value===1)return forms.one;
 if(value===2)return forms.two;
 return `${format(value)} ${rest>=3&&rest<=10?forms.plural:rest>=11?forms.accusative:forms.singular}`;
}
export const alertCountForms:CountForms={one:'تنبيه واحد',two:'تنبيهان',plural:'تنبيهات',accusative:'تنبيهًا',singular:'تنبيه'};
export const letterCountForms:CountForms={one:'حرف واحد',two:'حرفان',plural:'أحرف',accusative:'حرفًا',singular:'حرف'};
// After «خلال»: «خلال ثانيتين»، «خلال ٥ ثوانٍ»، «خلال ٢٥ ثانية».
export const secondCountForms:CountForms={one:'ثانية واحدة',two:'ثانيتين',plural:'ثوانٍ',accusative:'ثانية',singular:'ثانية'};
// After «خلال»: «خلال دقيقتين»، «خلال ٤ دقائق»، «خلال ١٠ دقائق».
export const minuteCountForms:CountForms={one:'دقيقة واحدة',two:'دقيقتين',plural:'دقائق',accusative:'دقيقة',singular:'دقيقة'};

// The longest verse in Tanzil 1.1 is 2:282 (1173 Uthmani / 679 Simple Clean characters); the margin covers verse markers and pause marks.
// checkRequestMaxBytes covers both texts at their limits even when every character is sent as a \uXXXX escape.
export const LIMITS={titleMax:140,quranTextMax:1500,textMax:4000,translationMax:4000,urlMax:2048,checkRequestMaxBytes:64000,reviewNoteMin:8,reviewNoteMax:2500,overrideNoteMin:40,reviewRequestMaxBytes:16000} as const;

const httpsUrl=(message:string)=>z.string().max(LIMITS.urlMax,'الرابط أطول من المسموح.').url(message).refine(value=>/^https:\/\//i.test(value),'استخدم رابطًا آمنًا يبدأ بـ https://');
const anyHttpsUrl=httpsUrl('الرابط غير صالح.');
export const isHttpsUrl=(value:string|null|undefined)=>anyHttpsUrl.safeParse(value??'').success;

// Only `locator` (the ayah, e.g. '2:256') is needed for a Qur'an check; the other fields default to '' and are kept for stored rows.
export const sourceInputSchema=z.object({
 title:z.string().trim().max(240).default(''),
 locator:z.string().trim().min(1,'اختر السورة والآية أو اكتب رقمها مثل 2:256.').max(240),
 author:z.string().trim().max(200).default(''),
 edition:z.string().trim().max(200).default(''),
 grade:z.string().trim().max(120).default(''),
 url:z.union([z.literal(''),httpsUrl('رابط المصدر غير صالح.')]).default(''),
}).strict();
export type SourceInput=z.infer<typeof sourceInputSchema>;

// Display of stored hadith rows only (grade and https source link present).
export const hadithSourceComplete=(source:{grade?:string|null;url?:string|null}|null|undefined)=>Boolean(source?.grade?.trim())&&isHttpsUrl(source?.url?.trim());

// New requests carry an ISO code from LANGUAGES; use languageInfo() to read older stored values such as 'English'.
export const targetLanguageSchema=z.enum(LANGUAGE_CODES,{errorMap:()=>({message:'اختر لغة الترجمة من القائمة.'})});

// New checks: Qur'an only. The trusted Arabic text is resolved on the server from source.locator (Tanzil), so originalText may be
// omitted; when it is sent, it must still match that verse exactly or the check abstains (D2).
export const amanahAnalyzeRequestSchema=z.object({
 title:z.string().trim().min(3,'اكتب اسمًا واضحًا للفحص.').max(LIMITS.titleMax),
 contentType:z.literal('quran',{errorMap:()=>({message:QURAN_ONLY_MESSAGE})}),
 source:sourceInputSchema,
 originalText:z.string().trim().max(LIMITS.quranTextMax,'النص أطول من أطول آية في المصحف. أدخل آية واحدة فقط.').default(''),
 translation:z.string().trim().min(1,'أدخل الترجمة المراد فحصها.').max(LIMITS.translationMax,`الترجمة أطول من ${LIMITS.translationMax} حرف.`),
 targetLanguage:targetLanguageSchema,
 publicationUse:publicationUseSchema,
 audience:audienceSchema.optional(),
}).strict();
export type AmanahAnalyzeRequest=z.infer<typeof amanahAnalyzeRequestSchema>;
// What a client may send (source fields other than locator, and originalText, may be left out).
export type AmanahAnalyzeInput=z.input<typeof amanahAnalyzeRequestSchema>;

// Stored request_json rows are read leniently: older rows keep free-text targetLanguage (e.g. 'English') and http source links.
export const storedAmanahRequestSchema=z.object({
 title:z.string(),
 contentType:contentTypeSchema,
 source:z.object({title:z.string(),locator:z.string(),author:z.string(),edition:z.string(),grade:z.string(),url:z.string()}),
 originalText:z.string(),
 translation:z.string(),
 targetLanguage:z.string(),
 publicationUse:publicationUseSchema,
 audience:z.string().optional(),
});
export type StoredAmanahRequest=z.infer<typeof storedAmanahRequestSchema>;

export const evidenceSchema=z.object({
 id:z.string().min(1).max(120),
 title:z.string().min(1).max(300),
 locator:z.string().max(240),
 excerpt:z.string().max(2000),
 url:z.union([z.literal(''),httpsUrl('رابط الدليل غير صالح.')]),
}).strict();
export type Evidence=z.infer<typeof evidenceSchema>;
const storedEvidenceSchema=evidenceSchema.extend({url:z.union([z.literal(''),z.string().max(LIMITS.urlMax).regex(/^https?:\/\//i)])});

export const sourceMatchSchema=z.object({
 matched:z.boolean(),
 registryId:z.string().max(160),
 normalizedCitation:z.string().max(500),
 method:z.enum(['exact','catalog','submitted','none']),
 note:z.string().max(1000),
}).strict();
export type SourceMatch=z.infer<typeof sourceMatchSchema>;

export const findingOriginSchema=z.enum(['model','rule','fusion','glossary','partner']);
export type FindingOrigin=z.infer<typeof findingOriginSchema>;

export const amanahFindingSchema=z.object({
 id:z.string().min(1).max(120),
 kind:z.enum(['omission','addition','inversion','ambiguity','terminology','context','other']),
 severity:z.enum(['low','medium','high','critical']),
 sourceSegment:z.string().max(2000),
 translationSegment:z.string().max(2000),
 explanation:z.string().min(1).max(2500),
 evidenceIds:z.array(z.string().max(120)).max(12),
 label:z.string().max(80).optional(),
 origin:findingOriginSchema.optional(),
 modelSourceSpan:z.string().max(2000).optional(),
 sourceSegmentVerified:z.boolean().optional(),
 translationSegmentVerified:z.boolean().optional(),
 // The drift's own confidence (0..1) as the AMANAH model returned it; older rows and non-model findings have none.
 modelConfidence:z.number().min(0).max(1).optional(),
}).strict();
export type AmanahFinding=z.infer<typeof amanahFindingSchema>;
export type FindingKind=AmanahFinding['kind'];
export type FindingSeverity=AmanahFinding['severity'];

export const glossaryNoteSchema=z.object({
 termId:z.string().min(1).max(60),
 term:z.string().min(1).max(80),
 approved:z.array(z.string().min(1).max(120)).max(12),
 rule:z.string().max(1200),
 reference:z.string().max(500),
 referenceUrl:z.union([z.literal(''),httpsUrl('رابط المرجع غير صالح.')]).optional(),
 alert:z.boolean(),
 message:z.string().max(1200),
 arabicMatch:z.string().max(200).optional(),
 translationMatch:z.string().max(200).optional(),
}).strict();
export type GlossaryNote=z.infer<typeof glossaryNoteSchema>;

export const aiExplanationStatusSchema=z.enum(['ok','blocked','unavailable']);
export type AiExplanationStatus=z.infer<typeof aiExplanationStatusSchema>;
export const aiExplanationSchema=z.object({
 text:z.string().max(5000),
 model:z.string().max(160),
 status:aiExplanationStatusSchema,
 reasons:z.array(z.string().max(300)).max(12).optional(),
}).strict();
export type AiExplanation=z.infer<typeof aiExplanationSchema>;

// Overall severity returned by the AMANAH model (authoritative, stored as returned). S0 lowest, S3 highest.
export const mlSeveritySchema=z.enum(['S0','S1','S2','S3']);
export type MlSeverity=z.infer<typeof mlSeveritySchema>;
export const mlSeverityLabels:Record<MlSeverity,string>={S0:'منخفضة',S1:'متوسطة',S2:'مرتفعة',S3:'حرجة'};

export const analysisStatusSchema=z.enum(['PASS','REVIEW','CRITICAL','ABSTAIN']);
export type AnalysisStatus=z.infer<typeof analysisStatusSchema>;
export const analysisStatusLabels:Record<AnalysisStatus,string>={PASS:'لم يُرصد اختلاف مؤثر',REVIEW:'يحتاج مراجعة',CRITICAL:'اختلاف مؤثر',ABSTAIN:'تعذّر الحكم'};
// Wording of each decision (team handoff, UI mapping: PASS green, REVIEW amber, CRITICAL red, ABSTAIN gray). It is also the summary of
// every result the AMANAH adapter writes. A PASS is never a certification or a guarantee of correctness.
export const analysisStatusMessages:Record<AnalysisStatus,string>={PASS:'لم يُرصد انحراف جوهري في المعنى في هذا التحليل',REVIEW:'انحراف محتمل في المعنى — يوصى بمراجعة بشرية',CRITICAL:'انحراف عالي الأثر في المعنى — المراجعة لازمة',ABSTAIN:'تعذّر التحقق بأمان — يلزم مراجعة بشرية'};
export const hasGlossaryAlerts=(result:{glossary?:GlossaryNote[]|null}|null|undefined)=>Boolean(result?.glossary?.some(note=>note.alert));
export const hasInstructionWarnings=(result:{instructionWarnings?:string[]|null}|null|undefined)=>Boolean(result?.instructionWarnings?.length);
// What the AMANAH model itself asks for: REVIEW, CRITICAL and ABSTAIN, or a PASS with needs_human_review. Shown among the model outputs.
export const modelRequestsHumanReview=(result:{status:AnalysisStatus;needsHumanReview?:boolean|null})=>result.status!=='PASS'||result.needsHumanReview===true;
// Why a person must review the result before it is relied on: the model's own request (above), and also, on a PASS, a glossary alert or
// an instruction-like phrase, which the reviewer has to confirm before approval anyway (review route: TERMINOLOGY_/INSTRUCTIONS_
// CONFIRMATION_REQUIRED). They drive the one human-review mark (banner, history row, export); none of them changes the model decision.
export type HumanReviewReason='decision'|'model'|'glossary'|'instructions';
export type HumanReviewInput={status:AnalysisStatus;needsHumanReview?:boolean|null;glossary?:GlossaryNote[]|null;instructionWarnings?:string[]|null};
export function humanReviewReasons(result:HumanReviewInput):HumanReviewReason[]{
 const reasons:HumanReviewReason[]=[];
 if(result.status!=='PASS')reasons.push('decision');
 if(result.needsHumanReview===true)reasons.push('model');
 if(hasGlossaryAlerts(result))reasons.push('glossary');
 if(hasInstructionWarnings(result))reasons.push('instructions');
 return reasons;
}
export const requiresHumanReview=(result:HumanReviewInput)=>humanReviewReasons(result).length>0;
// reference_status of the AMANAH model, shown as returned. The values of the team service v0.2 (amanah_engine/service.py): 'verified',
// 'source_mismatch' (source_ar differs from its canonical text), 'missing' (no trusted reference, or no English reference, for the ayah),
// 'unverified_provenance', and 'unknown' (the schema default). A value without an Arabic name is shown raw.
const ownKey=(table:Readonly<Record<string,string>>,key:string)=>Object.prototype.hasOwnProperty.call(table,key);
export const referenceStatusLabels:Readonly<Record<string,string>>={verified:'المرجع موثّق',source_mismatch:'النص لا يطابق مرجع النموذج',missing:'لا يوجد مرجع موثوق لهذه الآية لدى النموذج',unverified_provenance:'مصدر المرجع لدى النموذج غير موثّق',unknown:'حالة المرجع غير معروفة'};
export const referenceStatusLabel=(value:string)=>ownKey(referenceStatusLabels,value)?referenceStatusLabels[value]:value;
// Arabic names of the drift labels of the AMANAH model, one table for the server (finding explanations) and the UI. The keys are the whole
// DriftLabel enum of the team's v0.2 code (data/models.py). The v0.2 benchmark reports six of them (FAITHFUL, NEGATION_FLIP, OMISSION,
// MODALITY_SHIFT, QUANTIFIER_CHANGE, CONDITION_LOSS), and the v0.2 deterministic rules add AGENCY_SHIFT (agent and patient reversed, as
// in a 35:28 rendering checked live on 4 October 2026). A label without an Arabic name (a future one) is shown as returned and never
// changes the decision.
export const driftLabelNames:Readonly<Record<string,string>>={
 FAITHFUL:'بلا انحراف',NEGATION_FLIP:'انقلاب النفي',OMISSION:'حذف',ADDITION:'إضافة',MODALITY_SHIFT:'تغير صيغة الحكم أو الإمكان',QUANTIFIER_CHANGE:'تغير الكم أو العموم',
 ENTITY_SWAP:'استبدال المذكور بغيره',AGENCY_SHIFT:'انقلاب الإسناد (الفاعل والمفعول)',CONDITION_LOSS:'سقوط الشرط',TEMPORAL_SHIFT:'تغير الزمن',TERM_FLATTENING:'اختزال المصطلح',
 LEXICAL_SEMANTIC_SHIFT:'تغير دلالة اللفظ',SEMANTIC_NARROWING:'تضييق المعنى',SEMANTIC_BROADENING:'توسيع المعنى',SEMANTIC_GRADATION_LOSS:'ضياع درجة المعنى أو شدته',
 INTERPRETATION_ADDITION:'إضافة تفسيرية',UNCERTAIN:'انحراف غير محسوم',
};
export const hasDriftLabelName=(label:string)=>ownKey(driftLabelNames,label);
export const driftLabel=(label:string)=>hasDriftLabelName(label)?driftLabelNames[label]:label;
// «ثقة النموذج»: the model's confidence (0..1) as a percentage in Arabic digits, cut (not rounded) to one decimal: 0.998 → ٩٩٫٨٪.
export const formatModelConfidence=(value:number)=>`${(Math.floor(value*1000+1e-9)/10).toLocaleString('ar-SA',{maximumFractionDigits:1})}٪`;

export const amanahAnalysisResultSchema=z.object({
 status:analysisStatusSchema,
 // The AMANAH model's own confidence (0..1), stored as returned, on results the model decided; null otherwise and on older rows.
 confidence:z.number().min(0).max(1).nullable(),
 summary:z.string().min(1).max(3000),
 explanation:z.string().min(1).max(5000),
 sourceMatch:sourceMatchSchema,
 findings:z.array(amanahFindingSchema).max(40),
 evidence:z.array(evidenceSchema).max(40),
 modelVersion:z.string().min(1).max(160),
 completedAt:z.string().datetime(),
 // The model's own overall severity, only on results the AMANAH model decided; older rows have none.
 mlSeverity:mlSeveritySchema.optional(),
 // Further structured outputs of the AMANAH model (integrity_score 0..100, needs_human_review, reference_status), stored as returned,
 // only on results the model decided. The explanation layer never changes them.
 integrityScore:z.number().min(0).max(100).optional(),
 needsHumanReview:z.boolean().optional(),
 referenceStatus:z.string().max(80).optional(),
 glossary:z.array(glossaryNoteSchema).max(20).optional(),
 aiExplanation:aiExplanationSchema.optional(),
 // Phrases in the submitted texts that read like instructions to the tool or claims of endorsement (م-13). Advisory only.
 instructionWarnings:z.array(z.string().min(1).max(200)).max(10).optional(),
}).strict();
export type AmanahAnalysisResult=z.infer<typeof amanahAnalysisResultSchema>;
// Use for result_json read from the database: identical except that older evidence links may still be http.
export const storedAnalysisResultSchema=amanahAnalysisResultSchema.extend({evidence:z.array(storedEvidenceSchema).max(40)});

// Checks stored before the AMANAH model was connected: an LLM wrote their status, and Quran rows were matched by the older, looser rule.
export const isLegacyLlmResult=(result:{modelVersion:string})=>result.modelVersion.startsWith('workers-ai:');
export const isLegacyQuranEvidence=(item:{id:string;title:string})=>/^tanzil:/.test(item.id)&&item.title!==QURAN_EVIDENCE_TITLE;
// A Qur'an status is approvable only when the AMANAH model issued it ('amanah-ml:'); 'demo:' rows and the abstentions of the current
// source check ('source:') are refused by their own rules. Anything else (an LLM, or the former partner engine with its own
// version such as 'amanah-semantic-1') is a status the model never issued, so the check must be re-run first (B1).
const ownQuranVersion=/^(?:amanah-ml|demo|source):/;
export const needsRecheck=(contentType:ContentType,result:{modelVersion:string;evidence:{id:string;title:string}[]})=>isLegacyLlmResult(result)||contentType==='quran'&&(!ownQuranVersion.test(result.modelVersion)||result.evidence.some(isLegacyQuranEvidence));

export const publicationStatusSchema=z.enum(['AI_SCREENED','HUMAN_REVIEW_REQUIRED','HUMAN_APPROVED','CHANGES_REQUESTED','BLOCKED']);
export type PublicationStatus=z.infer<typeof publicationStatusSchema>;

export const reviewStatusSchema=z.enum(['not_required','pending','approved','changes_requested']);
export type ReviewStatus=z.infer<typeof reviewStatusSchema>;

// owner: the creator decided an internal draft. reviewer: an independent reviewer (admin or AMANAH_REVIEWER_EMAILS) who is not the creator.
export const reviewerRoleSchema=z.enum(['owner','reviewer']);
export type ReviewerRole=z.infer<typeof reviewerRoleSchema>;
export const reviewerRoleLabels:Record<ReviewerRole,string>={owner:'صاحب الفحص (مسودة داخلية)',reviewer:'مراجع مستقل'};
export type ReviewerInfo={name:string;email:string};

export type AmanahCheck={
 id:string;
 request:StoredAmanahRequest;
 result:AmanahAnalysisResult;
 publicationStatus:PublicationStatus;
 reviewStatus:ReviewStatus;
 reviewNote:string;
 reviewedAt:string|null;
 createdAt:string;
 reviewer?:ReviewerInfo|null;
 reviewerRole?:ReviewerRole|null;
 reviewOverride?:boolean;
 owner?:ReviewerInfo|null;
};
export type AmanahReviewUpdate=Pick<AmanahCheck,'id'|'reviewStatus'|'publicationStatus'|'reviewNote'|'reviewedAt'|'reviewer'|'reviewerRole'|'reviewOverride'>;

export const amanahReviewRequestSchema=z.object({
 decision:z.enum(['approved','changes_requested']),
 note:z.string().trim().min(LIMITS.reviewNoteMin,'اكتب سبب القرار بوضوح.').max(LIMITS.reviewNoteMax),
 sourceConfirmed:z.boolean(),
 terminologyConfirmed:z.boolean().optional(),
 instructionsConfirmed:z.boolean().optional(),
 override:z.boolean().optional(),
}).strict().superRefine((value,ctx)=>{
 if(!value.override)return;
 if(value.decision!=='approved')ctx.addIssue({code:z.ZodIssueCode.custom,path:['override'],message:'تجاوز النتيجة الحرجة يكون مع قرار الاعتماد فقط.'});
 if(value.note.length<LIMITS.overrideNoteMin)ctx.addIssue({code:z.ZodIssueCode.custom,path:['note'],message:`اكتب تعليلًا علميًا لا يقل عن ${LIMITS.overrideNoteMin} حرفًا لتجاوز النتيجة الحرجة.`});
});
export type AmanahReviewRequest=z.infer<typeof amanahReviewRequestSchema>;

// 'ready': the model answered within the last minutes on this server instance, or its transport does not scale to zero.
// 'may_need_wakeup': a scale-to-zero Hugging Face endpoint may be asleep, so the first check can take a minute or two.
export type MlEndpointState='ready'|'may_need_wakeup';
export type IntegrationStatus={
 amanah:{ready:boolean;mode:'live'|'unavailable';missing:string[];provider:string;supportedContentTypes:readonly ContentType[];transport?:'fastapi'|'hf'|null;endpointState?:MlEndpointState|null};
};

// GET /api/amanah/checks?scope=dashboard: the viewer's own checks counted by model decision, how many await a review decision,
// the last five checks, and (reviewers only) how many official checks of other users await an independent reviewer.
export type AmanahDashboard={
 counts:Record<AnalysisStatus,number>&{total:number;pendingReview:number};
 reviewQueue:number|null;
 recent:AmanahCheck[];
 viewer:{isReviewer:boolean};
};
