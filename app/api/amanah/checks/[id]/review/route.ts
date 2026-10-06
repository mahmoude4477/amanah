import {amanahReviewRequestSchema,hasGlossaryAlerts,hasInstructionWarnings,isRetiredContentType,LIMITS,needsRecheck,storedAmanahRequestSchema,storedAnalysisResultSchema,type AmanahReviewUpdate,type PublicationStatus,type ReviewerRole,type ReviewStatus} from '@/lib/contracts';
import {workspaceDb} from '@/db/workspace';
import {ApiError,assertSameOrigin,errorResponse,jsonResponse,parseJson,requestSession} from '@/lib/server/http';
import {withSafeEvidenceLinks} from '../../check-rows';

export const dynamic='force-dynamic';
type Row={user_id:string;request_json:string;result_json:string;review_status:ReviewStatus};
const readJson=(raw:string):unknown=>{try{return JSON.parse(raw);}catch{return null;}};
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  assertSameOrigin(request);const viewer=await requestSession(request);const {id}=await params;const input=await parseJson(request,amanahReviewRequestSchema,LIMITS.reviewRequestMaxBytes);const db=workspaceDb();
  const row=await db.prepare('SELECT user_id, request_json, result_json, review_status FROM amanah_checks WHERE id = ?').bind(id).first<Row>();
  if(!row)throw new ApiError(404,'CHECK_NOT_FOUND','الفحص غير موجود.');
  const stored=storedAmanahRequestSchema.safeParse(readJson(row.request_json));const isOwner=row.user_id===viewer.id;
  // An unreadable request is treated as official publication, the stricter path.
  const official=!stored.success||stored.data.publicationUse==='official_publication';
  if(!isOwner&&!(viewer.isReviewer&&official))throw new ApiError(404,'CHECK_NOT_FOUND','الفحص غير موجود.');
  if(isOwner&&official)throw new ApiError(403,'INDEPENDENT_REVIEW_REQUIRED','النشر الرسمي يتطلب قرارًا من مراجع مستقل غير صاحب الفحص.');
  const reviewerRole:ReviewerRole=isOwner?'owner':'reviewer';
  if(row.review_status==='approved'||row.review_status==='changes_requested')throw new ApiError(409,'REVIEW_FINAL','قرار المراجعة محفوظ ولا يمكن استبداله.');
  // Live AMANAH results pass amanahAnalysisResultSchema when stored and parse here (local end-to-end run against the live endpoint, 3 October 2026).
  const raw=readJson(row.result_json);const strict=storedAnalysisResultSchema.safeParse(raw);
  // Older rows may hold a non-http(s) evidence link (they were validated with a plain url() check): such a row can still be
  // returned for correction with the link blanked, as the list shows it, but it is never approved.
  const parsed=strict.success?strict:storedAnalysisResultSchema.safeParse(withSafeEvidenceLinks(raw));
  if(!parsed.success||(!strict.success&&input.decision==='approved'))throw new ApiError(409,'RESULT_UNREADABLE','تعذر قراءة نتيجة هذا الفحص. أعد الفحص ثم راجعه.');
  const result=parsed.data;const override=input.decision==='approved'&&result.status==='CRITICAL'&&input.override===true;
  if(input.decision==='approved'){
   if(result.modelVersion.startsWith('demo:'))throw new ApiError(409,'DEMO_APPROVAL_NOT_ALLOWED','لا يمكن اعتماد نتيجة تجريبية. أنشئ فحصًا فعليًا ثم أعد المراجعة.');
   // Hadith and tafsir are outside the measured scope of the AMANAH model (v0.2, as v0.1): their stored checks are kept for reading, never approved.
   if(stored.success&&isRetiredContentType(stored.data.contentType))throw new ApiError(409,'CONTENT_TYPE_RETIRED','فحوص الحديث والتفسير محفوظة للاطلاع فقط ولا تُعتمد، فالمتاح حاليًا هو القرآن الكريم فقط.');
   // Checks from before the AMANAH model: an LLM wrote the status and Quran text was matched by the older, looser rule (م-06, م-18).
   if(needsRecheck(stored.success?stored.data.contentType:'quran',result))throw new ApiError(409,'RECHECK_REQUIRED','هذا فحص سابق لربط نموذج أمانة ومعيار المطابقة الحالي، فلا يُعتمد. أعد الفحص بنموذج أمانة ثم راجعه.');
   if(!input.sourceConfirmed)throw new ApiError(400,'SOURCE_CONFIRMATION_REQUIRED','أكد مراجعة المصدر قبل الاعتماد البشري.');
   if(result.status==='ABSTAIN')throw new ApiError(409,'APPROVAL_NOT_ALLOWED','امتنع الفحص عن الحكم، فلا تقبل النتيجة الاعتماد قبل التصحيح وإعادة الفحص.');
   if(result.status==='CRITICAL'&&!override)throw new ApiError(409,'OVERRIDE_REQUIRED','النتيجة حرجة، ولا تُعتمد إلا بتجاوز موثق من مراجع مستقل مع تعليل علمي.');
   if(override&&reviewerRole!=='reviewer')throw new ApiError(403,'OVERRIDE_REVIEWER_ONLY','تجاوز النتيجة الحرجة متاح لمراجع مستقل غير صاحب الفحص فقط.');
   if(hasGlossaryAlerts(result)&&!input.terminologyConfirmed)throw new ApiError(400,'TERMINOLOGY_CONFIRMATION_REQUIRED','أكد مراجعة تنبيهات المصطلحات الشرعية قبل الاعتماد.');
   if(hasInstructionWarnings(result)&&!input.instructionsConfirmed)throw new ApiError(400,'INSTRUCTIONS_CONFIRMATION_REQUIRED','أكد مراجعة العبارات التي تشبه التعليمات أو التزكية في النص المقدم قبل الاعتماد.');
   if(!stored.success)throw new ApiError(409,'REQUEST_UNREADABLE','تعذر قراءة طلب هذا الفحص. أعد الفحص ثم راجعه.');
  }
  const reviewStatus:ReviewStatus=input.decision;const publicationStatus:PublicationStatus=input.decision==='approved'?'HUMAN_APPROVED':result.status==='CRITICAL'?'BLOCKED':'CHANGES_REQUESTED';const reviewedAt=new Date().toISOString();
  const update=await db.prepare('UPDATE amanah_checks SET review_status = ?, publication_status = ?, review_note = ?, reviewed_at = ?, reviewed_by = ?, reviewer_role = ?, review_override = ?, updated_at = ? WHERE id = ? AND user_id = ? AND review_status IN (?, ?)').bind(reviewStatus,publicationStatus,input.note,reviewedAt,viewer.id,reviewerRole,override?1:0,reviewedAt,id,row.user_id,'pending','not_required').run();
  if(!update.meta.changes)throw new ApiError(409,'REVIEW_CONFLICT','تغيرت حالة المراجعة. حدّث الصفحة.');
  const body:AmanahReviewUpdate={id,reviewStatus,publicationStatus,reviewNote:input.note,reviewedAt,reviewer:{name:viewer.name||viewer.email,email:viewer.email},reviewerRole,reviewOverride:override};
  return jsonResponse(body);
 }catch(error){return errorResponse(error);}
}
