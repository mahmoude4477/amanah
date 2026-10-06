import {createAuthClient} from 'better-auth/react';

export const authClient=createAuthClient();

// Better Auth 1.7.5 error codes (BASE_ERROR_CODES and the admin plugin) mapped to Arabic.
const authErrors:Record<string,string>={
 INVALID_EMAIL_OR_PASSWORD:'تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور.',
 INVALID_PASSWORD:'كلمة المرور غير صحيحة.',
 BANNED_USER:'هذا الحساب موقوف. تواصل مع مشغّل التطبيق.',
 SESSION_EXPIRED:'انتهت صلاحية الجلسة لهذا الإجراء. أدخل كلمة المرور ثم حاول مرة أخرى.',
 CREDENTIAL_ACCOUNT_NOT_FOUND:'لا ترتبط بهذا الحساب كلمة مرور. تواصل مع مشغّل التطبيق لحذفه.',
 UNAUTHORIZED:'انتهت الجلسة. سجّل الدخول ثم حاول مرة أخرى.',
};
export function authErrorMessage(error:{code?:string;status?:number}|null|undefined,fallback:string):string{
 if(error?.code&&authErrors[error.code])return authErrors[error.code];
 if(error?.status===429)return 'محاولات كثيرة في وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.';
 return fallback;
}
