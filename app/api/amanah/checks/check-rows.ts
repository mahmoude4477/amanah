import {reviewerRoleSchema,type AmanahCheck,type PublicationStatus,type ReviewerInfo,type ReviewStatus} from '@/lib/contracts';

export type CheckRow={id:string;request_json:string;result_json:string;publication_status:PublicationStatus;review_status:ReviewStatus;review_note:string;reviewed_at:string|null;created_at:string;reviewer_role:string|null;review_override:number|null;reviewer_name:string|null;reviewer_email:string|null;owner_name?:string|null;owner_email?:string|null};

const columns='c.id, c.request_json, c.result_json, c.publication_status, c.review_status, c.review_note, c.reviewed_at, c.created_at, c.reviewer_role, c.review_override, r.name AS reviewer_name, r.email AS reviewer_email';
const ownChecksBase=`SELECT ${columns} FROM amanah_checks c LEFT JOIN "user" r ON r.id = c.reviewed_by WHERE c.user_id = ? ORDER BY c.created_at DESC`;
export const ownChecksSql=`${ownChecksBase} LIMIT 100`;
// Data export (scope=export): every check of the viewer, with no row cap.
export const ownChecksExportSql=ownChecksBase;
// Reviewer queue: pending official-publication Qur'an checks created by someone else. Bind: review_status, viewer id, publicationUse.
// Stored hadith and tafsir checks are read-only (never approved, no decision form), so they stay in their owner's history and out of the queue.
const reviewQueueWhere=`WHERE c.review_status = ? AND c.user_id <> ? AND json_extract(c.request_json, '$.publicationUse') = ? AND c.content_type = 'quran'`;
export const reviewQueueSql=`SELECT ${columns}, o.name AS owner_name, o.email AS owner_email FROM amanah_checks c LEFT JOIN "user" r ON r.id = c.reviewed_by LEFT JOIN "user" o ON o.id = c.user_id ${reviewQueueWhere} ORDER BY c.created_at DESC LIMIT 100`;
// Dashboard (scope=dashboard): the viewer's checks counted by model decision and review state, the last five, and the queue size.
// `awaiting` is 1 for a pending Qur'an check: stored hadith and tafsir rows are read-only, so they never await a review decision.
export const dashboardCountsSql=`SELECT analysis_status AS status, (review_status = 'pending' AND content_type = 'quran') AS awaiting, COUNT(*) AS n FROM amanah_checks WHERE user_id = ? GROUP BY analysis_status, awaiting`;
export const recentChecksSql=`${ownChecksBase} LIMIT 5`;
export const reviewQueueCountSql=`SELECT COUNT(*) AS n FROM amanah_checks c ${reviewQueueWhere}`;

const person=(name:string|null|undefined,email:string|null|undefined):ReviewerInfo|null=>email?{name:name||email,email}:null;
// Older rows were validated with a plain url() check, so links other than http(s) (e.g. javascript:) are blanked before they reach the UI.
const safeUrl=(value:unknown)=>typeof value==='string'&&/^https?:\/\//i.test(value)?value:'';
function readRequest(raw:string):AmanahCheck['request']{const request=JSON.parse(raw);return request?.source?{...request,source:{...request.source,url:safeUrl(request.source.url)}}:request;}
// Shared with the review route, so a legacy row whose only fault is such a link can still be returned for correction.
export function withSafeEvidenceLinks<T>(result:T):T{const value=result as {evidence?:unknown};return Array.isArray(value?.evidence)?{...value,evidence:value.evidence.map((item:{url?:unknown})=>({...item,url:safeUrl(item.url)}))} as T:result;}
function readResult(raw:string):AmanahCheck['result']{return withSafeEvidenceLinks(JSON.parse(raw));}
export function toCheck(row:CheckRow):AmanahCheck{
 return {id:row.id,request:readRequest(row.request_json),result:readResult(row.result_json),publicationStatus:row.publication_status,reviewStatus:row.review_status,reviewNote:row.review_note,reviewedAt:row.reviewed_at,createdAt:row.created_at,reviewer:person(row.reviewer_name,row.reviewer_email),reviewerRole:reviewerRoleSchema.safeParse(row.reviewer_role).data??null,reviewOverride:Boolean(row.review_override),...(row.owner_email!==undefined?{owner:person(row.owner_name,row.owner_email)}:{})};
}
