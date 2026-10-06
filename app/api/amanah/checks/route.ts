import {amanahAnalysisResultSchema,amanahAnalyzeRequestSchema,analysisStatusSchema,LIMITS,type AmanahCheck,type AmanahDashboard,type PublicationStatus,type ReviewStatus} from '@/lib/contracts';
import {workspaceDb} from '@/db/workspace';
import {runAmanahAnalysis} from '@/lib/server/amanah-provider';
import {ApiError,assertSameOrigin,errorResponse,jsonResponse,parseJson,requestSession,requestUserId} from '@/lib/server/http';
import {dashboardCountsSql,ownChecksExportSql,ownChecksSql,recentChecksSql,reviewQueueCountSql,reviewQueueSql,toCheck,type CheckRow} from './check-rows';
import {assertCheckInScope} from './input-scope';

export const dynamic='force-dynamic';
function policy(status:string):{publicationStatus:PublicationStatus;reviewStatus:ReviewStatus}{
 if(status==='CRITICAL'||status==='ABSTAIN')return {publicationStatus:'BLOCKED',reviewStatus:'pending'};
 return {publicationStatus:'HUMAN_REVIEW_REQUIRED',reviewStatus:'pending'};
}
async function dashboard(viewer:{id:string;isReviewer:boolean}):Promise<AmanahDashboard>{
 const db=workspaceDb();
 const [grouped,recent,queue]=await Promise.all([
  db.prepare(dashboardCountsSql).bind(viewer.id).all<{status:string;awaiting:number;n:number}>(),
  db.prepare(recentChecksSql).bind(viewer.id).all<CheckRow>(),
  viewer.isReviewer?db.prepare(reviewQueueCountSql).bind('pending',viewer.id,'official_publication').first<number>('n'):Promise.resolve(null),
 ]);
 const counts:AmanahDashboard['counts']={PASS:0,REVIEW:0,CRITICAL:0,ABSTAIN:0,total:0,pendingReview:0};
 for(const item of grouped.results){const n=Number(item.n)||0;const status=analysisStatusSchema.safeParse(item.status);if(status.success)counts[status.data]+=n;counts.total+=n;if(Number(item.awaiting)===1)counts.pendingReview+=n;}
 return {counts,reviewQueue:queue===null?null:Number(queue)||0,recent:recent.results.map(toCheck),viewer:{isReviewer:viewer.isReviewer}};
}
export async function GET(request:Request){
 try{
  const viewer=await requestSession(request);const scope=new URL(request.url).searchParams.get('scope')||'mine';
  if(scope!=='mine'&&scope!=='review'&&scope!=='export'&&scope!=='dashboard')throw new ApiError(400,'INVALID_SCOPE','نطاق القائمة غير معروف.');
  if(scope==='dashboard')return jsonResponse(await dashboard(viewer));
  if(scope==='review'){
   if(!viewer.isReviewer)throw new ApiError(403,'REVIEWER_ONLY','قائمة المراجعة متاحة للمراجعين المعتمدين فقط.');
   const rows=await workspaceDb().prepare(reviewQueueSql).bind('pending',viewer.id,'official_publication').all<CheckRow>();
   return jsonResponse({checks:rows.results.map(toCheck),viewer:{isReviewer:true}});
  }
  const rows=await workspaceDb().prepare(scope==='export'?ownChecksExportSql:ownChecksSql).bind(viewer.id).all<CheckRow>();
  return jsonResponse({checks:rows.results.map(toCheck),viewer:{isReviewer:viewer.isReviewer}});
 }catch(error){return errorResponse(error);}
}
// New checks are Qur'an only (the request schema rejects hadith and tafsir with QURAN_ONLY_MESSAGE). Every check is saved to the
// history with a pending review: the model decision is the screening result, and a person decides publication.
export async function POST(request:Request){
 try{
  assertSameOrigin(request);const userId=await requestUserId(request);const input=await parseJson(request,amanahAnalyzeRequestSchema,LIMITS.checkRequestMaxBytes);assertCheckInScope(input);
  // Only a result that matches the contract is stored, so the review route can always read it back.
  const analysis=amanahAnalysisResultSchema.safeParse(await runAmanahAnalysis(input));
  if(!analysis.success)throw new ApiError(502,'INVALID_ANALYSIS_RESULT','تعذر حفظ نتيجة الفحص لأنها لا تطابق عقد أمانة. أعد المحاولة لاحقًا.');
  const result=analysis.data;const id=crypto.randomUUID();const createdAt=new Date().toISOString();const state=result.modelVersion.startsWith('demo:')?{publicationStatus:'BLOCKED' as const,reviewStatus:'not_required' as const}:policy(result.status);
  // An exact match stores the canonical Tanzil verse (the Uthmani evidence excerpt), also when the client sent only the ayah reference,
  // never the submitted spelling whose spaces, digits and marks the match ignored (م-06). The record and its export carry the reference text.
  const canonical=result.sourceMatch.matched&&result.sourceMatch.method==='exact'?result.evidence.find(item=>item.id===result.sourceMatch.registryId)?.excerpt:undefined;
  const stored=canonical?{...input,originalText:canonical}:input;
  await workspaceDb().prepare('INSERT INTO amanah_checks (id, user_id, title, content_type, request_json, result_json, analysis_status, publication_status, review_status, review_note, reviewed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').bind(id,userId,input.title,input.contentType,JSON.stringify(stored),JSON.stringify(result),result.status,state.publicationStatus,state.reviewStatus,'',createdAt,createdAt).run();
  const check:AmanahCheck={id,request:stored,result,...state,reviewNote:'',reviewedAt:null,createdAt,reviewer:null,reviewerRole:null,reviewOverride:false};
  return jsonResponse({check},201);
 }catch(error){return errorResponse(error);}
}
