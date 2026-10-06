'use client';
import {useEffect,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {AlertTriangle,CheckCircle2,Info,ShieldCheck,Sparkles,Users} from './app-icons';
import {PageHeading,Pill} from './amanah-ui';
import {AlertDialog,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogTitle,AlertDialogTrigger} from '@/components/ui/alert-dialog';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {apiFetch} from '@/lib/client-api';
import {authClient,authErrorMessage} from '@/lib/auth-client';
import {LIMITS,type AmanahCheck,type IntegrationStatus} from '@/lib/contracts';
import {LANGUAGES} from '@/lib/languages';
import {amanah,coldStartNotice,explanationModelName,measuredScopeBadge,mlProcessorName} from '@/lib/products';

export type AccountSummary={checks:number;isReviewer:boolean};
export type AccountUser={name:string;email:string};
type ChecksResponse={checks:AmanahCheck[];viewer?:{isReviewer?:boolean}};
// GET /api/amanah/checks returns at most 100 rows.
const CHECKS_LIST_CAP=100;
const mlLanguages=LANGUAGES.filter(language=>language.mlSupported).map(language=>language.label).join('، ');
const checksCount=(count:number)=>count>=CHECKS_LIST_CAP?`${CHECKS_LIST_CAP} أو أكثر`:String(count);

export function IntegrationSettings() {
  const [status,setStatus]=useState<IntegrationStatus|null>(null);
  const [error,setError]=useState('');
  const [account,setAccount]=useState<AccountSummary|null>(null);
  const [accountError,setAccountError]=useState('');
  const [user,setUser]=useState<AccountUser|null>(null);
  useEffect(()=>{
    apiFetch<IntegrationStatus>('/api/integrations/status').then(setStatus).catch(e=>setError(e.message));
    apiFetch<ChecksResponse>('/api/amanah/checks').then(data=>setAccount({checks:data.checks.length,isReviewer:Boolean(data.viewer?.isReviewer)})).catch(e=>setAccountError(e.message));
    authClient.getSession().then(result=>{const current=result.data?.user;if(current)setUser({name:current.name,email:current.email});}).catch(()=>undefined);
  },[]);
  return <IntegrationSettingsView status={status} error={error} account={account} accountError={accountError} user={user}/>;
}

export function IntegrationSettingsView({status,error,account,accountError,user}:{status:IntegrationStatus|null;error:string;account:AccountSummary|null;accountError:string;user:AccountUser|null}) {
  const ready=Boolean(status?.amanah.ready);const quran=ready&&(status?.amanah.supportedContentTypes??[]).includes('quran');const asleep=status?.amanah.endpointState==='may_need_wakeup';
  // Qur'an only (measured scope v0.2, B3): hadith and tafsir are removed from the product, so they are not listed as content types.
  const scope=[
    {key:'quran',title:'الآيات القرآنية',ok:quran,state:quran?'متاح':'غير مهيأ',body:quran?`يصدر القرار نموذج أمانة للتعلم الآلي (${measuredScopeBadge}). لغة الترجمة المقاسة: ${mlLanguages}، واللغات الأخرى خارج نطاق النسخة المقاسة.`:'نموذج أمانة للتعلم الآلي غير مهيأ، لذلك لا تُحلَّل الآيات الآن.'},
  ];
  const flow=[['نص المصحف الموثّق','يُضاف نص الآية من Tanzil (رواية حفص) تلقائيًا عند اختيارها أو كتابة رقمها، ولا يُكتب يدويًا.'],['قرار نموذج أمانة','القرار ودرجة الخطورة وثقة النموذج ومؤشر سلامة المعنى ونوع الانحراف من النموذج وحده.'],['شرح النموذج اللغوي','شرح مختصر في مربع مستقل لا يغيّر القرار.'],['عند التعذر','انتهاء المهلة أو تعذر الوصول أو استجابة غير صالحة يعني امتناعًا لا حكمًا بديلًا.'],['قرار المراجع','المسودة الداخلية لصاحبها، والنشر الرسمي لمراجع مستقل.']] as const;
  const role=account===null?accountError?'تعذر التحقق من دورك الآن.':'جارٍ التحقق من دورك…':account.isReviewer?`أنت مراجع معتمد: تظهر لك فحوص النشر الرسمي التي تنتظر مراجعة مستقلة، ولا تقرر في فحص أنشأته بنفسك للنشر الرسمي. يمكنك تجاوز النتيجة الحرجة بملاحظة علمية لا تقل عن ${LIMITS.overrideNoteMin} حرفًا.`:'تقرر في مسوداتك الداخلية. فحوص النشر الرسمي يقرر فيها مراجع مستقل معتمد.';
  return <>
    <PageHeading eyebrow="حالة الخدمة" title="حالة فحص أمانة" description="تعرّف إلى نطاق الفحص ومن يتخذ القرار قبل بدء العمل."/>
    {error&&<div className="notice warning" role="alert"><Info/><span>{error}</span></div>}
    <div className="integration-layout">
      <section className="panel integration-card" aria-labelledby="service-heading">
        <div className="integration-card-head"><ShieldCheck/><div><h2 id="service-heading">فحص المعنى</h2><p>{status===null?'جارٍ التحقق من الحالة…':ready?status.amanah.provider:'غير متصل'}</p></div><Pill tone={ready?'green':'amber'}>{status===null?'…':ready?'متاح':'غير متاح'}</Pill></div>
        {status===null?<div className="integration-row"><span className="integration-state pending"><Info/></span><div><strong>جارٍ التحقق من الحالة…</strong></div></div>:<>
          {!ready&&<div className="integration-row"><span className="integration-state pending"><AlertTriangle/></span><div><strong>الفحص متوقف مؤقتًا</strong><p>لا تُنشأ نتائج افتراضية عند غياب خدمة التحليل.</p></div></div>}
          {ready&&<div className="integration-row"><span className={asleep?'integration-state pending':'integration-state ready'}>{asleep?<Info/>:<CheckCircle2/>}</span><div><strong>حالة النموذج</strong><p>{asleep?coldStartNotice:'استجاب النموذج مؤخرًا أو لا يتوقف عند الخمول.'}{status.amanah.transport==='hf'?` يعمل على ${mlProcessorName}، ويستدعيه الخادم وحده.`:''}</p></div><Pill tone={asleep?'amber':'green'}>{asleep?'قد يحتاج للاستيقاظ':'جاهز'}</Pill></div>}
          {scope.map(item=><div className="integration-row" key={item.key}><span className={item.ok?'integration-state ready':'integration-state pending'}>{item.ok?<CheckCircle2/>:<Info/>}</span><div><strong>{item.title}</strong><p>{item.body}</p></div><Pill tone={item.ok?'green':'amber'}>{item.state}</Pill></div>)}
          <div className="integration-row"><span className="integration-state ready"><Sparkles/></span><div><strong>الشرح المولّد بالذكاء الاصطناعي</strong><p>يكتبه نموذج لغوي كبير ({explanationModelName}) بعد القرار، ولا يغيّر القرار. إذا تعذّر أو حُجب ظهر تنبيه بدلًا منه.</p></div><Pill tone="neutral">لا يغيّر القرار</Pill></div>
        </>}
      </section>
      <section className="panel contract-card" aria-labelledby="flow-heading"><span className="soft-icon"><Info/></span><h2 id="flow-heading">من يتخذ القرار؟</h2><ol>{flow.map(([title,body])=><li key={title}><strong>{title}</strong><span>{body}</span></li>)}</ol></section>
    </div>
    <section className="panel integration-card" aria-labelledby="account-heading">
      <div className="integration-card-head"><Users/><div><h2 id="account-heading">حسابك وبياناتك</h2><p>{user?`${user.name} · ${user.email}`:'جارٍ تحميل بيانات الحساب…'}</p></div><Pill tone={account?.isReviewer?'green':'neutral'}>{account===null?'…':account.isReviewer?'مراجع معتمد':'مستخدم'}</Pill></div>
      <div className="integration-row"><span className="integration-state ready"><ShieldCheck/></span><div><strong>دورك</strong><p>{role}</p></div></div>
      <div className="integration-row"><span className="integration-state ready"><Info/></span><div><strong>{account===null?'فحوصك المحفوظة':`فحوصك المحفوظة: ${checksCount(account.checks)}`}</strong><p>تبقى حتى تحذفها من صفحة «السجل والمراجعات» أو تحذف حسابك، ولا توجد مدة حذف تلقائي حاليًا. لا يُحفظ عنوان IP مع جلستك. <Link href={amanah.privacy} className="text-link">سياسة الخصوصية</Link></p></div></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-[.8rem] leading-7 text-[#536359]">حذف الحساب يحذف حسابك وجلساتك وجميع فحوصك نهائيًا.</p><DeleteAccountDialog checks={account?.checks??null}/></div>
    </section>
  </>;
}

function DeleteAccountDialog({checks}:{checks:number|null}) {
  const router=useRouter();
  const [open,setOpen]=useState(false);
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function remove(event:FormEvent){
    event.preventDefault();if(!password||busy)return;setBusy(true);setError('');
    try{
      // A password is always sent: Better Auth otherwise refuses sessions older than freshAge (1 day) with SESSION_EXPIRED.
      const result=await authClient.deleteUser({password});
      if(result.error){setError(authErrorMessage(result.error,'تعذر حذف الحساب الآن. حاول مرة أخرى.'));return;}
      setOpen(false);router.replace('/login?deleted=1');router.refresh();
    }catch{setError('تعذر حذف الحساب الآن. حاول مرة أخرى.');}
    finally{setBusy(false);}
  }
  const saved=checks===null?'جميع فحوصك المحفوظة':`جميع فحوصك المحفوظة (${checksCount(checks)})`;
  return <AlertDialog open={open} onOpenChange={next=>{if(busy)return;setOpen(next);if(!next){setPassword('');setError('');}}}>
    <AlertDialogTrigger asChild><button type="button" className="btn secondary text-[#a04f45]!"><AlertTriangle/>حذف حسابي وبياناتي</button></AlertDialogTrigger>
    <AlertDialogContent className="text-right">
      <form onSubmit={remove} className="grid gap-4">
        <AlertDialogTitle>حذف الحساب نهائيًا؟</AlertDialogTitle>
        <AlertDialogDescription className="leading-7">سيُحذف حسابك (الاسم والبريد وكلمة المرور) وجلساتك و{saved}. لا يمكن التراجع عن ذلك. المراجعات التي أجريتها على فحوص غيرك تبقى معها دون اسمك أو بريدك.</AlertDialogDescription>
        <label htmlFor="delete-account-password" className="text-sm font-semibold">أدخل كلمة المرور للتأكيد</label>
        <Input id="delete-account-password" type="password" dir="ltr" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required/>
        {error&&<p className="login-error" role="alert">{error}</p>}
        <AlertDialogFooter className="sm:justify-start"><Button type="submit" variant="destructive" disabled={busy||!password}>{busy?'جارٍ الحذف…':'احذف حسابي نهائيًا'}</Button><AlertDialogCancel disabled={busy}>إلغاء</AlertDialogCancel></AlertDialogFooter>
      </form>
    </AlertDialogContent>
  </AlertDialog>;
}
