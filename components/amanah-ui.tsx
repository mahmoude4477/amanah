'use client';
import type {ReactNode} from 'react';
import {Compass,Scale,Sparkles} from './app-icons';
import {analysisStatusLabels,driftLabel as contractDriftLabel,driftLabelNames as contractDriftLabelNames,isRetiredContentType,type AnalysisStatus,type ContentType,type PublicationStatus,type PublicationUse,type ReviewStatus} from '@/lib/contracts';
import {aiDisclosure,legacyLlmDisclosure,measuredScopeBadge,mlNoDecisionDisclosure,noDecisionDisclosure,partnerDisclosure,retiredLlmDisclosure,retiredReadOnly,scopeNotice} from '@/lib/products';
import {LANGUAGES} from '@/lib/languages';
export function Pill({children,tone='neutral'}:{children:ReactNode;tone?:string}){return <span className={'pill '+tone}>{children}</span>}
export function PageHeading({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:ReactNode}){return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action&&<div className="heading-action">{action}</div>}</div>}
export function Empty({title,body,action}:{title:string;body:string;action?:ReactNode}){return <div className="empty-state"><Compass size={34}/><h3>{title}</h3><p>{body}</p>{action}</div>}

export const contentNames:Record<ContentType,string>={quran:'قرآن',hadith:'حديث',tafsir:'تفسير'};
export const analysisLabels:Record<AnalysisStatus,string>=analysisStatusLabels;
export const publicationLabels:Record<PublicationStatus,string>={AI_SCREENED:'فُحص آليًا',HUMAN_REVIEW_REQUIRED:'بانتظار المراجع',HUMAN_APPROVED:'اعتماد بشري محفوظ',CHANGES_REQUESTED:'مطلوب تصحيح',BLOCKED:'النشر موقوف'};
export const publicationUseLabels:Record<PublicationUse,string>={internal_draft:'مسودة داخلية',official_publication:'نشر رسمي'};
export const reviewDecisionLabels:Record<ReviewStatus,string>={not_required:'لا يحتاج قرارًا',pending:'بانتظار قرار',approved:'اعتُمدت هذه النسخة',changes_requested:'أُعيدت للتصحيح'};
// A stored hadith or tafsir row with no saved decision is read-only (no reviewer can decide it), so it is never «بانتظار المراجع».
export const isReadOnlyRetired=(check:{request:{contentType:ContentType};reviewStatus:ReviewStatus})=>isRetiredContentType(check.request.contentType)&&(check.reviewStatus==='pending'||check.reviewStatus==='not_required');
export const publicationLabel=(check:{request:{contentType:ContentType};reviewStatus:ReviewStatus;publicationStatus:PublicationStatus})=>isReadOnlyRetired(check)?retiredReadOnly:publicationLabels[check.publicationStatus];
// Team handoff UI mapping: PASS green, REVIEW amber, CRITICAL red, ABSTAIN gray (no verdict, neither safe nor a warning).
export const statusTone=(status:AnalysisStatus)=>status==='PASS'?'green':status==='CRITICAL'?'critical':status==='ABSTAIN'?'neutral':'amber';
// Drift labels of the AMANAH model (v0.2 enum, AGENCY_SHIFT included) in Arabic: the one table in lib/contracts.ts, also used by the
// server for finding explanations. An unknown label is shown as returned.
export const driftLabelNames=contractDriftLabelNames;
export const driftLabel=contractDriftLabel;

// The release of the AMANAH model that decided a stored check, from result.modelVersion ('amanah-ml:<model_version>'). v0.2 names itself;
// v0.1 answered 'repository' (live on 3 October 2026, before the upgrade of 4 October 2026 behind the same endpoint).
export const AMANAH_MODEL_V02='amanah-semantic-integrity-v0.2';
const modelReleaseDetails:Readonly<Record<string,string>>={
 [`amanah-ml:${AMANAH_MODEL_V02}`]:'الإصدار v0.2 من نموذج الفريق.',
 'amanah-ml:repository':'أصدره الإصدار v0.1 قبل ترقية النموذج إلى v0.2 في ٤ أكتوبر ٢٠٢٦؛ يمكن إعادة الفحص للحصول على نتيجة الإصدار الحالي.',
};
const modelReleaseDetail=(modelVersion:string)=>Object.prototype.hasOwnProperty.call(modelReleaseDetails,modelVersion)?modelReleaseDetails[modelVersion]:'';

// Who produced the stored status, read from result.modelVersion (see lib/server/amanah-ml-analysis.ts, quran-source.ts and amanah-provider.ts).
// ml: the AMANAH model decided · ml-abstain: the model path abstained · source/registry: abstained before any model · partner: the former
// external engine (tafsir, and Qur'an checks from before the AMANAH model; a Qur'an status from it must be re-checked, see needsRecheck).
export type DecisionKind='demo'|'ml'|'ml-abstain'|'source'|'registry'|'legacy-llm'|'partner';
export type DecisionSource={label:string;detail:string;kind:DecisionKind};
const partnerSource:DecisionSource={label:'محرك تحليل الشريك',detail:'محرك خارجي كان يهيئه المشغّل قبل ربط نموذج أمانة، وليس نموذج أمانة.',kind:'partner'};
export function decisionSource(modelVersion:string,contentType?:ContentType):DecisionSource{
 if(modelVersion.startsWith('demo:'))return {label:'محاكاة تجريبية',detail:'لا تمثل فحصًا فعليًا.',kind:'demo'};
 if(modelVersion.startsWith('partner:'))return partnerSource;
 // Only Quran checks reach the AMANAH model and the Tanzil matcher; such a prefix on an older partner row is the partner's own text.
 const ownPrefix=contentType===undefined||contentType==='quran'||modelVersion==='source:unsupported';
 if(ownPrefix){
  if(modelVersion==='amanah-ml:timeout')return {label:'لا قرار آلي',detail:'لم تصل نتيجة نموذج أمانة في الوقت المحدد.',kind:'ml-abstain'};
  if(modelVersion==='amanah-ml:invalid-response')return {label:'لا قرار آلي',detail:'لم تطابق استجابة نموذج أمانة العقد المتفق عليه.',kind:'ml-abstain'};
  if(modelVersion==='amanah-ml:unavailable')return {label:'لا قرار آلي',detail:'تعذر الوصول إلى خدمة نموذج أمانة.',kind:'ml-abstain'};
  if(modelVersion==='amanah-ml:out-of-scope')return {label:'لا قرار آلي',detail:'لغة الترجمة خارج نطاق نموذج أمانة الحالي.',kind:'ml-abstain'};
  if(modelVersion.startsWith('amanah-ml:'))return {label:'نموذج أمانة للتعلم الآلي',detail:modelReleaseDetail(modelVersion),kind:'ml'};
  if(modelVersion==='source:unsupported')return {label:'لا قرار آلي',detail:'نوع المحتوى خارج نطاق الفحص الحالي.',kind:'source'};
  if(modelVersion.startsWith('source:'))return {label:'مطابقة المصدر',detail:'لم يطابق النص المصحف أو تعذر تحديد الآية، فلم يُستدعَ النموذج.',kind:'source'};
 }
 if(modelVersion.startsWith('registry:'))return {label:'سجل المصادر لدى الشريك',detail:'امتنع الفحص قبل التحليل.',kind:'registry'};
 if(modelVersion.startsWith('workers-ai:'))return {label:'نموذج لغوي كبير (فحص سابق)',detail:'أُنشئ هذا الفحص قبل ربط نموذج أمانة، وكان النموذج اللغوي يصدر الحالة والشرح.',kind:'legacy-llm'};
 return partnerSource;
}
// The AI notice of one result names who actually decided it; the general notice (AI_DISCLOSURE) describes the tool.
// ml-abstain: the model gave no decision (out of scope, unreachable, timeout, invalid answer) and no explanation was written.
// `retired`: a stored hadith or tafsir row, which cannot be re-checked, so its LLM notice offers no re-check.
export function resultDisclosure(kind:DecisionKind,retired=false):string{
 return kind==='ml'?aiDisclosure:kind==='ml-abstain'?mlNoDecisionDisclosure:kind==='legacy-llm'?retired?retiredLlmDisclosure:legacyLlmDisclosure:kind==='partner'?partnerDisclosure:kind==='demo'?'':noDecisionDisclosure;
}

// One wording everywhere (check page, result card, export, about, login, privacy): see lib/products.ts.
export const AI_DISCLOSURE=aiDisclosure;
export const SCOPE_NOTICE=`${scopeNotice} النطاق الحالي (${measuredScopeBadge}): آية واحدة من القرآن الكريم مع ترجمتها إلى ${LANGUAGES.filter(language=>language.mlSupported).map(language=>language.label).join(' أو ')}.`;
export function AiDisclosure({compact=false,text=AI_DISCLOSURE}:{compact?:boolean;text?:string}){return <div className={compact?'ai-disclosure compact':'ai-disclosure'} role="note"><Sparkles/><p>{text}</p></div>}
export function ScopeNotice(){return <div className="scope-notice" role="note"><Scale/><p><strong>حدود النطاق.</strong> {SCOPE_NOTICE}</p></div>}
