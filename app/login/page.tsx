'use client';
import {useState,useSyncExternalStore,type FormEvent} from 'react';
import Link from 'next/link';
import {authClient,authErrorMessage} from '@/lib/auth-client';
import {AmanahMark} from '@/components/product-mark';
import {aiDisclosure,amanah} from '@/lib/products';
import {useRouter} from 'next/navigation';

const noSubscription=()=>()=>{};
export default function LoginPage(){
 const router=useRouter();
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const accountDeleted=useSyncExternalStore(noSubscription,()=>new URLSearchParams(window.location.search).get('deleted')==='1',()=>false);
 async function submit(event:FormEvent){
  event.preventDefault();setBusy(true);setError('');
  try{
   const result=await authClient.signIn.email({email,password});
   if(result.error){setError(authErrorMessage(result.error,'تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور.'));return;}
   router.replace(amanah.home);router.refresh();
  }catch{setError('تعذر تسجيل الدخول الآن. حاول مرة أخرى.');}
  finally{setBusy(false);}
 }
 return <main className="login-page"><div className="login-card"><div className="login-brand"><AmanahMark/><span>{amanah.name}</span></div><h1>تسجيل الدخول</h1>{accountDeleted&&<div className="mb-4 rounded-[7px] bg-[#edf5e8] px-3 py-2.5 text-[.85rem] leading-7 text-[#285434]" role="status">حُذف حسابك وجميع فحوصك المحفوظة.</div>}<form onSubmit={submit}><label htmlFor="email">البريد الإلكتروني</label><input id="email" type="email" autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)} required autoFocus/><label htmlFor="password">كلمة المرور</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required/>{error&&<p className="login-error" role="alert">{error}</p>}<button className="btn primary" type="submit" disabled={busy}>{busy?'جارٍ تسجيل الدخول…':'تسجيل الدخول'}</button></form><div className="mt-3 text-[.8rem] leading-7 text-[#536359]">لا يمكن إنشاء حساب من هنا؛ يُنشئ مشغّل التطبيق الحسابات.</div><div className="mt-5 border-t border-[#e4e9dd] pt-4"><p className="text-[.8rem] leading-7 text-[#536359]">{aiDisclosure}</p><Link href={amanah.privacy} className="text-link mt-2">سياسة الخصوصية وحذف البيانات</Link></div></div></main>;
}
