import {z} from 'zod';
import {alertCountForms,analysisStatusMessages,arabicCount,driftLabel,hasDriftLabelName,minuteCountForms,mlSeveritySchema,referenceStatusLabel,secondCountForms,type AiExplanation,type AmanahAnalyzeRequest,type AmanahAnalysisResult,type AmanahFinding,type CountForms,type GlossaryNote,type MlEndpointState} from '@/lib/contracts';
import {languageInfo} from '@/lib/languages';
import {buildGroundedExplanationPrompt,callAmanahML,type AmanahMLResult} from './amanah-ml-integration';
import {getQuranVerse,quranSuraBismillah,type QuranSource} from './quran-source';
import {runtimeValue,safeHttpsUrl} from './env';
import {explainResult,withTimeout} from './workers-ai-analysis';
import {checkGlossary} from './glossary';
import {mapSourceSpan,translationSpanVerified} from './quran-spans';

// The AMANAH model is the only decision maker: decision, severity, confidence, integrity score, drifts, needs_human_review and
// reference_status are stored as returned. The LLM only explains the validated result and never changes any of them. Without a
// working model endpoint, or with an invalid answer, the result is ABSTAIN, never an LLM verdict.
// Each drift becomes one finding (toFinding): label, origin and confidence as returned, severity S0..S3 written one-to-one as
// low..critical, spans checked against the verse and the translation, evidence added to the finding's explanation. A result keeps
// at most 40 findings (amanahAnalysisResultSchema).
// Live model since 4 October 2026: AMANAH v0.2 behind the same endpoint, model_version 'amanah-semantic-integrity-v0.2' (stored as
// 'amanah-ml:amanah-semantic-integrity-v0.2'). Its response has the same fields as v0.1. What changed: a retrained classifier (a new
// fine-tune with a 512-token context instead of 256, new weights and new thresholds, on the same six labels), the AGENCY_SHIFT and
// true-negation rules, the abstention on inputs longer than the model context instead of a silent truncation, and the model_version name.
// The reference_status values (verified, source_mismatch, missing, unverified_provenance, unknown) are those of the v0.1 service too;
// only their Arabic names in lib/contracts.ts are new in the app.

export type AmanahMlConfig={endpoint:string;token:string;transport:'fastapi'|'hf';timeoutMs:number;explainTimeoutMs?:number};
// The Hugging Face Inference Endpoint scales to zero: after idle, the first request waits while a CPU replica starts (the proxy holds it
// up to X-Scale-Up-Timeout = 600 s), so 'hf' waits longer by default. Measured live on 3 October 2026: one cold start answered after
// 126.8 s and a replica woken by a cut-off warm-up was ready about 155 s later; warm answers take 0.4–1.7 s. 240 s covers those with a
// margin, and with the 12 s explanation a check still ends (about 252 s) before the 300 s response limit common in browsers and proxies.
// AMANAH_ML_TIMEOUT_MS overrides both defaults within min..max (max = X-Scale-Up-Timeout).
export const ML_TIMEOUT_MS={fastapi:25000,hf:240000,min:3000,max:600000} as const;

export function mlTimeoutMs(value:string|null|undefined,transport:AmanahMlConfig['transport']='fastapi'):number{
 const raw=(value??'').trim();const parsed=Number(raw);
 return raw&&Number.isFinite(parsed)?Math.min(ML_TIMEOUT_MS.max,Math.max(ML_TIMEOUT_MS.min,Math.round(parsed))):ML_TIMEOUT_MS[transport];
}

// 'hf' is the custom handler of a Hugging Face Inference Endpoint (POST {inputs} to the root). Anything else, including a Docker
// Space on *.hf.space running the team's FastAPI service, is 'fastapi' (POST /v1/analyze) unless AMANAH_ML_TRANSPORT says otherwise.
export function mlTransport(endpoint:string,configured:string):AmanahMlConfig['transport']{
 if(configured==='fastapi'||configured==='hf')return configured;
 try{return /(?:^|\.)endpoints\.huggingface\.cloud$/i.test(new URL(endpoint).hostname)?'hf':'fastapi';}catch{return 'fastapi';}
}

// AMANAH_ML_URL and AMANAH_ML_TOKEN are server-side secrets: they are read here only and never returned to a client.
// The bearer token and the user's texts go to this URL, so it must be https (http only for localhost during development).
// A plain-http or malformed URL counts as not configured: the check answers 503 CONFIGURATION_REQUIRED instead of sending anything.
export function amanahMlConfig():AmanahMlConfig|null{
 const endpoint=runtimeValue('AMANAH_ML_URL');
 if(!endpoint)return null;
 try{safeHttpsUrl(endpoint,'AMANAH_ML_URL');}catch{console.error('AMANAH_ML_URL must be an https URL');return null;}
 const transport=mlTransport(endpoint,runtimeValue('AMANAH_ML_TRANSPORT'));
 return {endpoint,token:runtimeValue('AMANAH_ML_TOKEN'),transport,timeoutMs:mlTimeoutMs(runtimeValue('AMANAH_ML_TIMEOUT_MS'),transport)};
}

// The team's reference store is Tanzil Uthmani in the plain-text export (txt-2), where verse 1 of every sura except 1 and 9 begins
// with the sura's opening basmala; the service abstains ('source_mismatch') when source_ar differs after its normalization.
// So that basmala (Tanzil's own, verbatim) is prepended here, in the model payload only. Spans, glossary, display and the explanation prompt keep the verse without it.
// Confirmed live on 3 October 2026: 112:1 and 2:1 sent this way return reference_status 'verified' (and 1:1, sent without a prefix, too).
// TODO(after-ml): also send 95:1 (its basmala is spelled «بِّسْمِ») and 36:1, and 9:1 without a basmala, and expect reference_status 'verified'.
export function mlSourceText(source:Pick<QuranSource,'sura'|'ayah'|'uthmani'>):string{
 const bismillah=source.ayah===1?quranSuraBismillah(source.sura):null;
 return bismillah?`${bismillah} ${source.uthmani}`:source.uthmani;
}

type MlPayload={source_type:'quran';source_ar:string;candidate_en:string;ayah_id?:string};
// The team's helper (amanah-ml-integration.ts, kept byte-identical) adds X-Scale-Up-Timeout: 600 in callAmanahML only; its
// callAmanahHFEndpoint omits the header that the team's live-endpoint handoff requires for the scale-to-zero Inference Endpoint
// (without it a sleeping endpoint answers 503 at once). This is callAmanahHFEndpoint with that header and nothing else changed.
// Still so in the team's v0.2 code: its integration file equals this copy.
// TODO(after-ml): once the team's helper sends X-Scale-Up-Timeout from callAmanahHFEndpoint, call it here instead.
async function callAmanahHF(endpoint:string,apiToken:string|undefined,payload:MlPayload):Promise<AmanahMLResult>{
 const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','X-Scale-Up-Timeout':'600',...(apiToken?{authorization:`Bearer ${apiToken}`}:{})},body:JSON.stringify({inputs:payload})});
 if(!response.ok)throw new Error(`AMANAH HF request failed: ${response.status}`);
 return (await response.json()) as AmanahMLResult;
}
const callAmanahModel=(config:AmanahMlConfig,payload:MlPayload)=>config.transport==='hf'?callAmanahHF(config.endpoint,config.token||undefined,payload):callAmanahML(config.endpoint,config.token||undefined,payload);

// AnalyzeResponse of the team service (handoff: an object, integrity_score 0..100, confidences 0..1). An array or any other shape is invalid.
const mlTextSchema=z.string().nullable().optional();
const mlResultSchema=z.object({
 decision:z.enum(['PASS','REVIEW','CRITICAL','ABSTAIN']),
 severity:mlSeveritySchema,
 drifts:z.array(z.object({label:z.string().min(1).max(80),severity:mlSeveritySchema,confidence:z.number().finite().min(0).max(1),source_span:mlTextSchema,target_span:mlTextSchema,evidence:mlTextSchema,origin:z.enum(['model','rule','fusion'])})),
 integrity_score:z.number().finite().min(0).max(100),
 confidence:z.number().finite().min(0).max(1),
 needs_human_review:z.boolean(),
 model_version:z.string().min(1).max(120),
 reference_status:z.string().max(80),
 notes:z.array(z.string()),
});
type MlResult=z.infer<typeof mlResultSchema>;
type MlDrift=MlResult['drifts'][number];

// When this server instance last received a valid model answer (analysis or warm-up). Per isolate, so only a hint for the status page.
let lastModelAnswerAt=0;
let lastWarmupAt=Number.NEGATIVE_INFINITY;
const AWAKE_WINDOW_MS=10*60_000;
export const WARMUP_INTERVAL_MS=4*60_000;
export function mlEndpointState(config:AmanahMlConfig|null,now=Date.now()):MlEndpointState|null{
 if(!config)return null;
 return config.transport!=='hf'||now-lastModelAnswerAt<AWAKE_WINDOW_MS?'ready':'may_need_wakeup';
}

// Warm-up (B2): one real minimal request, verse 1:1 exactly as an analysis sends it with a correct English rendering, so a sleeping
// endpoint starts its replica before the first check. At most once every 4 minutes per isolate, and not when the model answered within
// that time. The answer is only validated; it is never returned or stored, and no check is read or changed. Logs carry error names only.
export const WARMUP_TRANSLATION='In the name of Allah, the Most Gracious, the Most Merciful.';
export function warmupPayload():MlPayload{
 const verse=getQuranVerse(1,1);
 if(!verse)throw new Error('Quran corpus is missing verse 1:1');
 return {source_type:'quran',source_ar:mlSourceText({sura:1,ayah:1,uthmani:verse.uthmani}),candidate_en:WARMUP_TRANSLATION,ayah_id:verse.locator};
}
// `schedule` is waitUntil from 'cloudflare:workers': the request keeps running after the response (Workers allow about 30 s more),
// which is enough for Hugging Face to receive it and start scaling up even if the replica takes longer to answer.
export function startMlWarmup(config:AmanahMlConfig,schedule:(task:Promise<unknown>)=>void,now=Date.now()):boolean{
 if(now-Math.max(lastWarmupAt,lastModelAnswerAt)<WARMUP_INTERVAL_MS)return false;
 lastWarmupAt=now;
 const task=callAmanahModel(config,warmupPayload()).then(value=>{if(mlResultSchema.safeParse(value).success)lastModelAnswerAt=Date.now();else console.error('Amanah ML warm-up: response does not match the contract');},error=>{console.error('Amanah ML warm-up failed',error instanceof Error?error.name:typeof error);});
 schedule(task);
 return true;
}

const severityMap={S0:'low',S1:'medium',S2:'high',S3:'critical'} as const;
// The finding kind is the app's own grouping (used when a finding has no label); a label not listed here is 'other'. AGENCY_SHIFT reverses
// who does what to whom, so it is an inversion like NEGATION_FLIP.
const driftKinds:Readonly<Record<string,AmanahFinding['kind']>>={NEGATION_FLIP:'inversion',AGENCY_SHIFT:'inversion',OMISSION:'omission',ADDITION:'addition',INTERPRETATION_ADDITION:'addition',TERM_FLATTENING:'terminology',UNCERTAIN:'ambiguity'};
const driftKind=(label:string):AmanahFinding['kind']=>Object.prototype.hasOwnProperty.call(driftKinds,label)?driftKinds[label]:'other';
const originNames={model:'المصنف',rule:'قاعدة حتمية',fusion:'دمج القرار'} as const;
const reminder='راجع النص والمصدر قبل الاعتماد.';
const coldStartNote='قد يكون النموذج في وضع السكون ويستيقظ الآن؛ أعد الفحص بعد دقيقة أو دقيقتين.';

// The notes of the team service v0.2 (amanah_engine/service.py and scoring.py), each given in Arabic beside the note as returned.
// Any other note (an exception text, a future note) is shown as returned.
const noteNames:Readonly<Record<string,string>>={
 'Submitted Arabic source does not match the trusted canonical source for this ayah.':'النص العربي المرسل لا يطابق النص المرجعي الموثوق لهذه الآية لدى النموذج.',
 'Trusted reference not found; provenance cannot be verified.':'لم يجد النموذج مرجعًا موثوقًا لهذه الآية، فلا يمكن التحقق من مصدره.',
 'Trusted reference provenance is not verified.':'مصدر المرجع الموثوق لدى النموذج غير موثّق.',
 'Trusted English reference missing.':'لا توجد لدى النموذج ترجمة إنجليزية مرجعية لهذه الآية.',
 'High-precision critical rule triggered.':'انطبقت قاعدة حتمية عالية الدقة تدل على انحراف حرج.',
 'Model confidence below abstention threshold.':'ثقة المصنف دون عتبة الامتناع.',
 'Critical semantic drift detected.':'رُصد انحراف حرج في المعنى.',
 'Potential semantic drift requires review.':'رُصد انحراف محتمل في المعنى يحتاج مراجعة.',
 'Model unavailable; human review required.':'المصنف غير متاح لدى الخدمة، فيلزم مراجعة بشرية.',
 'Model unavailable.':'المصنف غير متاح لدى الخدمة.',
 'model unavailable':'المصنف غير متاح لدى الخدمة.',
};
// v0.2 refuses an input longer than its context instead of cutting it: ABSTAIN, integrity_score 0, confidence 0, no drifts, reference_status
// 'verified' (the source check ran first) and the one note 'input_exceeds_model_context:<tokens>>512' (Arabic plus English, mDeBERTa
// tokenizer, no truncation). Live on 4 October 2026 a full rendering of 2:282 returned it with 1322 tokens; a full 2:255 fits.
const CONTEXT_NOTE=/^input_exceeds_model_context:(\d+)>(\d+)$/;
const tokenCountForms:CountForms={one:'رمز واحد',two:'رمزان',plural:'رموز',accusative:'رمزًا',singular:'رمز'};
export function modelContextExceeded(notes:readonly string[]):{tokens:number;limit:number}|null{
 for(const note of notes){const match=note.trim().match(CONTEXT_NOTE);if(match)return {tokens:Number(match[1]),limit:Number(match[2])};}
 return null;
}
// Why no automated verdict was given for a long input. It never falls back to another model: the reviewer reads the whole translation.
export function modelContextExplanation({tokens,limit}:{tokens:number;limit:number}):string{
 return `بلغ طول الآية مع الترجمة ${arabicCount(tokens,tokenCountForms)} (token) في محلل النموذج، وهذا أطول من السياق الذي دُرّب عليه النموذج وقيس (${arabicCount(limit,tokenCountForms)})؛ فامتنع النموذج عن تحليلها بدل أن يقتطع آخرها. لذلك لا يصدر لهذه الترجمة حكم آلي، ولا يُستعاض عنه بحكم من نموذج لغوي، ويلزم أن يراجع مراجعٌ بشري الترجمة كاملة.`;
}
export function modelNoteText(note:string):string{
 const name=Object.prototype.hasOwnProperty.call(noteNames,note)?noteNames[note]:CONTEXT_NOTE.test(note.trim())?'المدخل أطول من سياق النموذج، فلم يُحلَّل.':'';
 return name?`${name} (${note})`:note;
}

function clip(value:string|null|undefined,max:number):string{return (value??'').slice(0,max);}
// «خلال ٤ دقائق» for whole minutes from two minutes up (the hf default is 240 s), otherwise seconds («خلال ٢٥ ثانية»).
function waitSpan(ms:number):string{const seconds=Math.max(1,Math.round(ms/1000));return seconds>=120&&seconds%60===0?arabicCount(seconds/60,minuteCountForms):arabicCount(seconds,secondCountForms);}
const httpStatus=(error:unknown)=>Number((error instanceof Error?error.message:'').match(/\b(\d{3})$/)?.[1])||null;

function toFinding(drift:MlDrift,index:number,source:QuranSource,translation:string):AmanahFinding{
 const name=hasDriftLabelName(drift.label)?`${driftLabel(drift.label)} (${drift.label})`:`وسم انحراف لا اسم عربيًا له في أمانة بعد (${drift.label})`;
 const rawSource=(drift.source_span??'').trim();
 const rawTarget=(drift.target_span??'').trim();
 const mapped=rawSource?mapSourceSpan(rawSource,{simple:source.text,uthmani:source.uthmani}):null;
 const canonical=mapped?.verified?mapped.uthmani??mapped.simple??'':'';
 // Rule findings of the team service quote the English reference translation, not the Arabic source. Live on 3 October 2026, rule
 // drifts quoted English reference words ('no', 'never', 'if') and model drifts carried no span at all (null source_span and target_span);
 // on 4 October 2026 the v0.2 rules quoted reference phrases ('fear Allah' for AGENCY_SHIFT, 'This is the Book' for NEGATION_FLIP).
 // TODO(after-ml): no live drift has carried an Arabic source_span yet; when one does, check that verified spans map to the right canonical words.
 const referenceQuote=rawSource&&!/\p{Script=Arabic}/u.test(rawSource)?` · مقطع من الترجمة المرجعية لدى النموذج: «${clip(rawSource,200)}»`:'';
 return {
  id:`drift-${index+1}`,
  kind:driftKind(drift.label),
  severity:severityMap[drift.severity],
  sourceSegment:clip(canonical,2000),
  translationSegment:clip(rawTarget,2000),
  explanation:clip(`${name} · المصدر: ${originNames[drift.origin]}${drift.evidence?` · ${drift.evidence}`:''}${referenceQuote}`,2500),
  evidenceIds:[source.registryId],
  label:clip(drift.label,80),
  origin:drift.origin,
  modelConfidence:drift.confidence,
  ...(rawSource?{modelSourceSpan:clip(rawSource,2000),sourceSegmentVerified:Boolean(mapped?.verified)}:{}),
  ...(rawTarget?{translationSegmentVerified:translationSpanVerified(rawTarget,translation)}:{}),
 };
}

// An abstention without a model answer: no model fields (confidence, severity, integrity score…) are invented for it.
function abstain(source:QuranSource,reason:string,modelVersion:string,glossary:GlossaryNote[]):AmanahAnalysisResult{
 return {status:'ABSTAIN',confidence:null,summary:analysisStatusMessages.ABSTAIN,explanation:clip([reason,reminder].join('\n'),5000),sourceMatch:source.match,findings:[],evidence:source.evidence,modelVersion,completedAt:new Date().toISOString(),...(glossary.length?{glossary}:{})};
}

type ModelOutcome={kind:'answer';value:unknown}|{kind:'error';error:unknown}|{kind:'timeout'};
async function askModel(config:AmanahMlConfig,payload:MlPayload):Promise<ModelOutcome>{
 const call=callAmanahModel(config,payload).then(value=>({kind:'answer' as const,value}),error=>({kind:'error' as const,error}));
 const outcome=await withTimeout(call,config.timeoutMs);
 return outcome.timedOut?{kind:'timeout'}:outcome.value;
}

export async function runAmanahMlQuranAnalysis(input:AmanahAnalyzeRequest,source:QuranSource,config:AmanahMlConfig):Promise<AmanahAnalysisResult>{
 const glossary=checkGlossary({arabic:source.text,translation:input.translation,targetLanguage:input.targetLanguage,contentType:'quran'});
 const language=languageInfo(input.targetLanguage);
 // The v0.2 handoff (4 October 2026) still measures Qur'an Arabic → English only; enable another language in lib/languages.ts only
 // after the team measures it.
 if(!language.mlSupported)return abstain(source,`نموذج أمانة الحالي (v0.2) مدرب على الترجمة من العربية إلى الإنجليزية فقط، ولغة هذه الترجمة ${language.label}. يلزم مراجعة بشرية لهذه اللغة.`,'amanah-ml:out-of-scope',glossary);
 // The team service compares source_ar with its Tanzil Uthmani text and abstains ('source_mismatch') otherwise, so the Uthmani verse is sent (see mlSourceText).
 // Long verses: v0.1 cut the input silently (live on 3 October 2026 a negation added at the end of 2:255 passed unseen). v0.2 refuses an
 // input over its 512-token context with ABSTAIN instead (modelContextExceeded), and the explanation says why in Arabic.
 const outcome=await askModel(config,{source_type:'quran',source_ar:mlSourceText(source),candidate_en:input.translation,ayah_id:source.locator});
 const coldStart=config.transport==='hf'?` ${coldStartNote}`:'';
 if(outcome.kind==='timeout'){console.error('Amanah ML endpoint timeout');return abstain(source,`لم تصل نتيجة نموذج أمانة خلال ${waitSpan(config.timeoutMs)}، فلم يصدر حكم آلي.${coldStart}`,'amanah-ml:timeout',glossary);}
 if(outcome.kind==='error'){
  if(outcome.error instanceof SyntaxError){console.error('Amanah ML invalid response','body is not JSON');return abstain(source,'أعادت خدمة نموذج أمانة استجابة لا تطابق العقد المتفق عليه، فلم يُعتمد منها شيء.','amanah-ml:invalid-response',glossary);}
  const status=httpStatus(outcome.error);
  console.error('Amanah ML endpoint unavailable',status??(outcome.error instanceof Error?outcome.error.name:'network'));
  return abstain(source,`تعذر الوصول إلى خدمة نموذج أمانة، فلم يصدر حكم آلي.${status&&[502,503,504].includes(status)?coldStart:''}`,'amanah-ml:unavailable',glossary);
 }
 const parsed=mlResultSchema.safeParse(outcome.value);
 if(!parsed.success){console.error('Amanah ML invalid response',parsed.error.issues.slice(0,5).map(issue=>`${issue.path.join('.')||'root'}:${issue.code}`));return abstain(source,'أعادت خدمة نموذج أمانة استجابة لا تطابق العقد المتفق عليه، فلم يُعتمد منها شيء.','amanah-ml:invalid-response',glossary);}
 const ml=parsed.data;
 lastModelAnswerAt=Date.now();
 const decision=ml.decision;
 const suraName=getQuranVerse(source.sura,source.ayah)?.suraName??null;
 // The team's own prompt builder, given the verse alone: for the explanation layer the basmala prepended in the payload is not part of verse 1.
 // TODO(after-ml): with live explanations of 2:1 and 112:1, check that Llama does not present the basmala as part of verse 1.
 const prompt=buildGroundedExplanationPrompt(ml as AmanahMLResult,source.uthmani,input.translation);
 const aiExplanation:AiExplanation|undefined=decision!=='ABSTAIN'?await explainResult(prompt,{ayahLocator:source.locator,suraName,decision,translation:input.translation,timeoutMs:config.explainTimeoutMs}):undefined;
 const findings=ml.drifts.slice(0,40).map((drift,index)=>toFinding(drift,index,source,input.translation));
 const unverified=findings.some(finding=>finding.sourceSegmentVerified===false&&/\p{Script=Arabic}/u.test(finding.modelSourceSpan??''));
 const alerts=glossary.filter(note=>note.alert).length;
 const longInput=decision==='ABSTAIN'?modelContextExceeded(ml.notes):null;
 // Confidence, integrity score, severity and reference status are result fields shown as returned, so they are not repeated here;
 // only a reference status other than 'verified' is spelled out as a warning. Each model note is given in Arabic beside its raw text.
 const explanation=[
  decision==='ABSTAIN'?'امتنع نموذج أمانة عن الحكم.':'',
  longInput?modelContextExplanation(longInput):'',
  ml.reference_status!=='verified'?`حالة المرجع لدى النموذج: ${referenceStatusLabel(ml.reference_status)}`:'',
  ml.notes.length?`ملاحظات النموذج: ${ml.notes.map(modelNoteText).join(' · ')}`:'',
  unverified?'بعض المقاطع العربية التي حددها النموذج لا تطابق نص المصحف حرفيًا، فلا تُعرض بوصفها نصًا قرآنيًا.':'',
  alerts?`قاموس المصطلحات: ${arabicCount(alerts,alertCountForms)}، ويلزم تأكيد المراجع قبل الاعتماد.`:'',
  reminder,
 ].filter(Boolean).join('\n');
 return {
  status:decision,
  confidence:ml.confidence,
  summary:analysisStatusMessages[decision],
  explanation:clip(explanation,5000),
  sourceMatch:source.match,
  findings,
  evidence:source.evidence,
  modelVersion:clip(`amanah-ml:${ml.model_version}`,160),
  mlSeverity:ml.severity,
  integrityScore:ml.integrity_score,
  needsHumanReview:ml.needs_human_review,
  referenceStatus:ml.reference_status,
  completedAt:new Date().toISOString(),
  ...(glossary.length?{glossary}:{}),
  ...(aiExplanation?{aiExplanation}:{}),
 };
}
