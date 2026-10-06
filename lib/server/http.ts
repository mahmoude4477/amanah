import type {ZodType,ZodTypeDef} from 'zod';
import {getAuth} from './auth';
import {runtimeValue} from './env';

export class ApiError extends Error{
 constructor(public status:number,public code:string,message:string,public details?:unknown){super(message);this.name='ApiError';}
}

export const jsonResponse=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});

export type RequestSession={id:string;email:string;name:string;role:string;isReviewer:boolean};

// Reviewer = Better Auth role 'admin' or an email listed in AMANAH_REVIEWER_EMAILS (comma-separated, case-insensitive).
export const reviewerEmails=()=>runtimeValue('AMANAH_REVIEWER_EMAILS').split(/[\s,;]+/).map(email=>email.trim().toLowerCase()).filter(Boolean);
export function isReviewerUser(user:{email?:string|null;role?:string|null}):boolean{
 const roles=(user.role??'').split(',').map(role=>role.trim().toLowerCase());const email=(user.email??'').trim().toLowerCase();
 return roles.includes('admin')||Boolean(email&&reviewerEmails().includes(email));
}

// An admin impersonating a user (Better Auth admin plugin) acts with that user's identity. Amanah refuses such sessions outright:
// otherwise an admin could approve an official check as an independent reviewer they impersonate, or read another user's drafts.
// Impersonation is also removed from the admin role in lib/server/auth.ts; this check is the second line.
export async function requestSession(request:Request):Promise<RequestSession>{
 const session=await getAuth().api.getSession({headers:request.headers});
 const user=session?.user as {id?:string;email?:string|null;name?:string|null;role?:string|null}|undefined;
 if(!user?.id)throw new ApiError(401,'AUTH_REQUIRED','يلزم تسجيل الدخول.');
 if((session?.session as {impersonatedBy?:string|null}|undefined)?.impersonatedBy)throw new ApiError(403,'IMPERSONATION_NOT_ALLOWED','لا تقبل أمانة جلسة انتحال حساب مستخدم آخر. سجّل الدخول بحسابك.');
 return {id:user.id,email:user.email??'',name:user.name??'',role:user.role||'user',isReviewer:isReviewerUser(user)};
}

export async function requestUserId(request:Request):Promise<string>{return (await requestSession(request)).id;}

export function assertSameOrigin(request:Request){
 const host=new URL(request.url).host;
 const origin=request.headers.get('origin');
 if(!origin)return;
 try{if(new URL(origin).host!==host)throw new Error();}catch{throw new ApiError(403,'INVALID_ORIGIN','طلب غير مسموح.');}
}

const payloadTooLarge=()=>new ApiError(413,'PAYLOAD_TOO_LARGE','حجم الطلب أكبر من الحد المسموح.');
// maxBytes counts UTF-8 bytes (Arabic letters take 2 bytes each), and the body is read in chunks so an oversized body is never fully buffered.
async function readBody(request:Request,maxBytes:number):Promise<string>{
 if(!request.body)return '';
 const reader=request.body.getReader();const chunks:Uint8Array[]=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel().catch(()=>undefined);throw payloadTooLarge();}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}

// T is the parsed output: schemas with defaults accept less than they return (e.g. a Qur'an check without originalText).
export async function parseJson<T>(request:Request,schema:ZodType<T,ZodTypeDef,unknown>,maxBytes=160000):Promise<T>{
 const length=Number(request.headers.get('content-length')||0);
 if(length>maxBytes)throw payloadTooLarge();
 let raw='';
 try{raw=await readBody(request,maxBytes);}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(400,'INVALID_BODY','تعذر قراءة الطلب.');}
 let value:unknown;
 try{value=JSON.parse(raw);}catch{throw new ApiError(400,'INVALID_JSON','صيغة JSON غير صالحة.');}
 const parsed=schema.safeParse(value);
 if(!parsed.success){const message=parsed.error.issues.map(issue=>issue.message).find(text=>/\p{Script=Arabic}/u.test(text));throw new ApiError(400,'VALIDATION_ERROR',message||'تحقق من الحقول المطلوبة.',parsed.error.flatten());}
 return parsed.data;
}

// Logs only the error name and code: messages and payloads may carry user texts or provider output.
export function logSafeError(label:string,error:unknown){
 const maybe=(error&&typeof error==='object'?error:{}) as {name?:unknown;code?:unknown;status?:unknown};
 console.error(label,{name:typeof maybe.name==='string'?maybe.name:typeof error,code:typeof maybe.code==='string'||typeof maybe.code==='number'?maybe.code:undefined,status:typeof maybe.status==='number'?maybe.status:undefined});
}

export function errorResponse(error:unknown):Response{
 if(error instanceof ApiError){if(error.status>=500)logSafeError('api request failed',error);return jsonResponse({error:error.message,code:error.code,details:error.details},error.status);}
 const maybe=error as {name?:string;missing?:string[];message?:string};
 if(maybe?.name==='ConfigurationError')return jsonResponse({error:maybe.missing?.includes('AMANAH_ML_URL')?'نموذج أمانة غير مهيأ. أضف AMANAH_ML_URL (رابطًا يبدأ بـ https://) وAMANAH_ML_TOKEN في أسرار الخادم.':'التكامل غير مكتمل. أضف متغيرات البيئة المطلوبة.',code:'CONFIGURATION_REQUIRED',missing:maybe.missing||[]},503);
 logSafeError('api request failed',error);
 return jsonResponse({error:'حدث خطأ غير متوقع. حاول مرة أخرى.',code:'INTERNAL_ERROR'},500);
}

export function publicErrorMessage(error:unknown):string{
 if(error instanceof ApiError)return error.message;
 const message=error instanceof Error?error.message:'';
 if(/rate|429/i.test(message))return 'بلغ مزود البيانات حد الطلبات مؤقتًا.';
 if(/timeout|aborted/i.test(message))return 'انتهت مهلة الاتصال بأحد المزودين.';
 return 'تعذر إكمال المعالجة لدى أحد المزودين.';
}
