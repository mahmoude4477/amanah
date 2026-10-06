export class ClientApiError extends Error{
 constructor(message:string,public code:string,public status:number,public details?:unknown,public missing:string[]=[]){super(message);this.name='ClientApiError';}
}
function record(value:unknown):Record<string,unknown>{return value!==null&&typeof value==='object'?value as Record<string,unknown>:{};}
// Used when the response carries no JSON error (e.g. a gateway page), so the user still gets an Arabic message.
function statusMessage(status:number):string{
 if(status===401)return 'انتهت الجلسة. سجّل الدخول ثم حاول مرة أخرى.';
 if(status===413)return 'حجم الطلب أكبر من الحد المسموح.';
 if(status===429)return 'طلبات كثيرة في وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.';
 if(status>=500)return 'تعذر الوصول إلى الخادم الآن. حاول مرة أخرى بعد قليل.';
 return 'تعذر إكمال الطلب.';
}
export async function apiFetch<T>(url:string,init?:RequestInit):Promise<T>{
 let response:Response;
 try{response=await fetch(url,{...init,headers:{Accept:'application/json',...(init?.body?{'Content-Type':'application/json'}:{}),...init?.headers}});}
 catch(error){if(error instanceof DOMException&&error.name==='AbortError')throw error;throw new ClientApiError('تعذر الاتصال بالخادم. تحقق من الاتصال ثم حاول مرة أخرى.','NETWORK_ERROR',0);}
 const raw:unknown=await response.json().catch(()=>null);const payload=record(raw);
 if(!response.ok)throw new ClientApiError(typeof payload.error==='string'?payload.error:statusMessage(response.status),typeof payload.code==='string'?payload.code:'REQUEST_FAILED',response.status,payload.details,Array.isArray(payload.missing)?payload.missing.filter((item):item is string=>typeof item==='string'):[]);
 return raw as T;
}
// First server message for a form field (zod flatten shape: details.fieldErrors[field][0]), e.g. 'title' or 'translation'.
export function apiFieldError(error:unknown,field:string):string{
 if(!(error instanceof ClientApiError))return '';
 const messages=record(record(error.details).fieldErrors)[field];
 return Array.isArray(messages)&&typeof messages[0]==='string'?messages[0]:'';
}
