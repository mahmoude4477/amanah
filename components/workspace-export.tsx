'use client';
import {useState} from 'react';
import {Download,Copy,Check} from './app-icons';
import {Sheet,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {SheetContent} from './localized-sheet';
import {toast} from 'sonner';
import {analysisStatusMessages,audienceLabel,formatModelConfidence,hadithSourceComplete,humanReviewReasons,isRetiredContentType,mlSeverityLabels,needsRecheck,referenceStatusLabel,requiresHumanReview,reviewerRoleLabels,type AmanahCheck} from '@/lib/contracts';
import {languageInfo} from '@/lib/languages';
import {AI_DISCLOSURE,analysisLabels,contentNames,decisionSource,driftLabel,isReadOnlyRetired,publicationLabel,publicationUseLabels,resultDisclosure,reviewDecisionLabels} from './amanah-ui';
import {retiredContentNotice,retiredReadOnly} from '@/lib/products';
// The exported «جواز أمانة»: who decided what, with which model, plus the full stored record. The model outputs (decision, severity,
// confidence, integrity score, drift labels, reference status, review state) are exported as stored, only for results the model decided.
// `drifts` lists every drift the model returned, in its order, with its own confidence when the row stores it, on a model ABSTAIN too:
// v0.2 keeps the drifts it found (and the computed severity and score) when the classifier's confidence is under the abstention threshold.
// Those come with `driftsNote`, which says they are not a verdict; their spans are not shown on screen (`findingsShown` stays 0).
// A stored hadith or tafsir row is read-only, as on screen: it can be neither re-checked nor approved, so it asks for neither
// (`review.readOnly`), and its review label is «للاطلاع فقط» while no decision was saved. Its stored status codes are exported unchanged.
export function amanahPassportRecord(check:AmanahCheck,exportedAt=new Date().toISOString()){
 const {request,result}=check;const demo=result.modelVersion.startsWith('demo:');const language=languageInfo(request.targetLanguage);const origin=decisionSource(result.modelVersion,request.contentType);const ai=result.aiExplanation;const ml=origin.kind==='ml';const retired=isRetiredContentType(request.contentType);
 const drifts=result.findings.flatMap(finding=>finding.label?[{label:finding.label,name:driftLabel(finding.label),confidence:finding.modelConfidence===undefined?null:{value:finding.modelConfidence,label:formatModelConfidence(finding.modelConfidence)}}]:[]);
 return {
  notice:demo?'نتيجة افتراضية غير صالحة للاعتماد أو النشر':'سجل تحليل ومراجعة؛ لا يمثل فتوى أو اعتماد جهة خارج النظام',
  disclosure:resultDisclosure(origin.kind,retired)||AI_DISCLOSURE,
  exportedAt,
  passport:{
   checkId:check.id,title:request.title,createdAt:check.createdAt,
   contentType:{code:request.contentType,label:contentNames[request.contentType],...(retired?{retired:true,note:retiredContentNotice}:{})},
   publicationUse:{code:request.publicationUse,label:publicationUseLabels[request.publicationUse]},
   targetLanguage:{code:language.code,label:language.label,stored:request.targetLanguage},
   audience:request.audience?{code:request.audience,label:audienceLabel(request.audience)}:null,
   source:{citation:result.sourceMatch.normalizedCitation||request.source.locator,registryId:result.sourceMatch.registryId||null,matched:result.sourceMatch.matched,method:result.sourceMatch.method,...(request.contentType==='hadith'?{hadith:{grade:request.source.grade||null,url:request.source.url||null,complete:hadithSourceComplete(request.source)}}:{})},
   analysis:{status:result.status,label:analysisLabels[result.status],message:origin.kind==='legacy-llm'||origin.kind==='partner'?null:analysisStatusMessages[result.status],decisionSource:origin.label,decisionKind:origin.kind,decisionDetail:origin.detail||null,modelVersion:result.modelVersion,modelSeverity:result.mlSeverity?{code:result.mlSeverity,label:mlSeverityLabels[result.mlSeverity]}:null,modelConfidence:ml&&result.confidence!==null?{value:result.confidence,label:formatModelConfidence(result.confidence)}:null,integrityScore:ml?result.integrityScore??null:null,referenceStatus:ml&&result.referenceStatus?{code:result.referenceStatus,label:referenceStatusLabel(result.referenceStatus)}:null,modelNeedsHumanReview:ml?result.needsHumanReview??null:null,humanReviewRequired:!retired&&requiresHumanReview(result),humanReviewReasons:retired?[]:humanReviewReasons(result),drifts:ml?drifts:[],driftsNote:ml&&result.status==='ABSTAIN'&&drifts.length?'انحرافات أعادها النموذج مع امتناعه عن الحكم؛ ليست حكمًا على الترجمة.':null,completedAt:result.completedAt,confidence:result.confidence,findingsShown:result.status==='ABSTAIN'?0:result.findings.length,recheckRequired:!retired&&needsRecheck(request.contentType,result)},
   aiExplanation:ai?{status:ai.status,model:ai.model,...(ai.reasons?.length?{reasons:ai.reasons}:{})}:null,
   instructionWarnings:result.instructionWarnings??[],
   glossary:(result.glossary??[]).map(note=>({termId:note.termId,term:note.term,approved:note.approved,alert:note.alert,message:note.message,reference:note.reference,...(note.referenceUrl?{referenceUrl:note.referenceUrl}:{})})),
   review:{status:check.reviewStatus,label:isReadOnlyRetired(check)?retiredReadOnly:reviewDecisionLabels[check.reviewStatus],readOnly:retired,publicationStatus:check.publicationStatus,publicationLabel:publicationLabel(check),note:check.reviewNote||null,reviewedAt:check.reviewedAt,reviewer:check.reviewer??null,reviewerRole:check.reviewerRole??null,reviewerRoleLabel:check.reviewerRole?reviewerRoleLabels[check.reviewerRole]:null,override:Boolean(check.reviewOverride)},
  },
  record:check,
 };
}
// Every own check in one file (scope=export), for the user's right to a copy of their data.
export function amanahAccountExport(checks:AmanahCheck[],exportedAt=new Date().toISOString()){return {notice:'نسخة من جميع فحوصك المحفوظة في أمانة ونتائجها وقرارات مراجعتها؛ لا تمثل فتوى أو اعتماد جهة خارج النظام',disclosure:AI_DISCLOSURE,exportedAt,count:checks.length,checks:checks.map(check=>amanahPassportRecord(check,exportedAt))};}
export function downloadFile(filename:string,text:string,type:string){const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export function ExportSheet({open,onOpenChange,title,filename,text,type}:{open:boolean;onOpenChange:(open:boolean)=>void;title:string;filename:string;text:string;type:string}){
 const [copied,setCopied]=useState(false);
 async function copy(){try{await navigator.clipboard.writeText(text);setCopied(true);toast.success('نُسخ المحتوى');}catch{toast.error('حدد النص في المعاينة وانسخه يدويًا.');}}
 return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="left" className="detail-sheet export-sheet"><SheetHeader><SheetTitle>{title}</SheetTitle><SheetDescription>هذه معاينة محتوى الملف نفسه. يمكنك تنزيله أو نسخه.</SheetDescription></SheetHeader><div className="sheet-body"><label className="field-label" htmlFor="export-content">محتوى الملف</label><textarea id="export-content" dir="auto" className="export-preview" readOnly value={text}/><p className="caption" dir="ltr">{filename} · {new TextEncoder().encode(text).length.toLocaleString('ar-SA')} bytes</p></div><div className="sheet-actions"><button className="btn primary" onClick={()=>downloadFile(filename,text,type)}><Download size={18}/>تنزيل الملف</button><button className="btn secondary" onClick={copy}>{copied?<Check size={18}/>:<Copy size={18}/>}نسخ المحتوى</button></div></SheetContent></Sheet>;
}
