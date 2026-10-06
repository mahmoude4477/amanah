import Link from 'next/link';
import {ArrowLeft, CheckCheck, Info, Scale, ShieldCheck, Sparkles} from './app-icons';
import {PageHeading} from './amanah-ui';
import {LIMITS} from '@/lib/contracts';
import {LANGUAGES} from '@/lib/languages';
import {aiDisclosure,amanah,explanationModelName,measuredScopeBadge,mlProcessorName,passNotCertification,scopeNotice} from '@/lib/products';

export function ProductAboutProduction() {
  const mlLanguages=LANGUAGES.filter(language=>language.mlSupported).map(language=>language.label).join('، ');
  const steps=['من «لوحة المتابعة» افتح «تحليل جديد».', 'اختر السورة والآية أو اكتب رقمها مثل 2:256، فيُضاف نصها الموثّق من المصحف تلقائيًا، ثم ألصق ترجمتها الإنجليزية.', 'راجع قرار نموذج أمانة ونوع الانحراف ودرجة الخطورة وثقة النموذج ومؤشر سلامة المعنى، ثم الشرح وتنبيهات المصطلحات.', 'يُحفظ كل تحليل في «السجل والمراجعات»، وفيه توثّق قرار المراجعة. النشر الرسمي يقرر فيه مراجع مستقل غير منشئ الفحص.'];
  const notes=['النتيجة الآلية تساعد على المراجعة ولا تكفي وحدها لاعتماد النشر. '+passNotCertification, 'نتيجة الامتناع (ABSTAIN) لا تُعتمد. والنتيجة الحرجة لا تُعتمد إلا بتجاوز يوثّقه مراجع مستقل بملاحظة علمية لا تقل عن '+LIMITS.overrideNoteMin+' حرفًا.', 'إذا ظهرت تنبيهات مصطلحات فراجعها وأكّد ذلك قبل الاعتماد.'];
  const flow=[
    ['النص الموثّق','لا يُكتب النص العربي يدويًا: يُضاف نص الآية من مشروع Tanzil (رواية حفص) بحسب رقمها، فلا يدخل التحليلَ نصٌّ مكتوب خطأً.'],
    ['القرار','يصدر نموذج أمانة للتعلم الآلي (AMANAH ML) القرار (PASS أو REVIEW أو CRITICAL أو ABSTAIN) ودرجة الخطورة وثقة النموذج ومؤشر سلامة المعنى ونوع الانحراف ومواضعه، وتُعرض كما صدرت، ولا يغيّرها أي جزء آخر من أمانة.'],
    ['الشرح','يكتب نموذج لغوي كبير ('+explanationModelName+') شرحًا مختصرًا للقرار في مربع مستقل. ويُحجب الشرح إذا رصد فيه مرشح آلي نسبة قول إلى أحد، أو حكمًا، أو آية أخرى، أو اقتباسًا لا يطابق المصحف، أو حكمًا على صحة الترجمة أو على حاجتها إلى المراجعة. والمرشح أنماط ثابتة قد تفوته بعض الصيغ، فراجع الشرح بنفسك.'],
    ['عند التعذر','إذا تعذّر الوصول إلى النموذج أو تأخر أو أعاد استجابة غير صالحة، تكون النتيجة امتناعًا (ABSTAIN) لا حكمًا بديلًا. وقد يستغرق أول تحليل بعد فترة خمول من دقيقتين إلى أربع دقائق لأن النموذج يستيقظ من وضع السكون، فأبقِ الصفحة مفتوحة حتى تظهر النتيجة.'],
    ['المراجعة البشرية','يقرر صاحب الفحص في مسودته الداخلية، ويقرر مراجع مستقل معتمد في فحوص النشر الرسمي.'],
  ] as const;
  const scope=['الآيات القرآنية ('+measuredScopeBadge+'): اللغة التي قيس عليها النموذج هي '+mlLanguages+'، واللغات الأخرى خارج نطاق النسخة المقاسة.', 'ملاحظات المصطلحات مأخوذة من نماذج قاموس المصطلحات في المرجعية العلمية، وهي تنبيهات للمراجع لا تغيّر القرار.'];
  return <>
    <PageHeading eyebrow="عن أمانة" title="أمانة لمراجعة سلامة المعنى." description="افحص ترجمة الآية بالرجوع إلى نص المصحف، ثم وثّق قرارك."/>
    <div className="notice" role="note"><Info/><span><strong>حدود النطاق: </strong>{scopeNotice}</span></div>
    <div className="about-grid">
      <section className="panel"><span className="soft-icon"><CheckCheck/></span><h2>كيف تستخدمه</h2><ul className="clean-list">{steps.map(item=><li key={item}>{item}</li>)}</ul></section>
      <section className="panel"><span className="soft-icon"><Scale/></span><h2>قبل الاعتماد</h2><ul className="clean-list">{notes.map(item=><li key={item}>{item}</li>)}</ul></section>
    </div>
    <section className="panel about-section" aria-labelledby="about-flow"><h2 id="about-flow">من يتخذ القرار؟</h2><ol className="clean-list">{flow.map(([title,body])=><li key={title}><strong>{title}: </strong>{body}</li>)}</ol></section>
    <section className="panel about-section" aria-labelledby="about-ai"><div className="mb-4"><span className="soft-icon"><Sparkles/></span></div><h2 id="about-ai">الإفصاح عن الذكاء الاصطناعي</h2><p>{aiDisclosure}</p><p>يستدعي خادم أمانة نموذج أمانة على {mlProcessorName} ويرسل إليه نص الآية وموضعها والترجمة، ويُرسل إلى نموذج الشرح النص والترجمة ونتيجة القرار، دون اسمك أو بريدك أو عنوان الفحص.</p></section>
    <section className="panel about-section" aria-labelledby="about-scope"><div className="mb-4"><span className="soft-icon"><ShieldCheck/></span></div><h2 id="about-scope">النطاق الحالي</h2><ul className="clean-list">{scope.map(item=><li key={item}>{item}</li>)}</ul></section>
    <section className="panel about-section"><h2>ابدأ الفحص</h2><p>اختر الآية وألصق ترجمتها، ثم راجع النتيجة قبل اتخاذ القرار.</p><div className="flex flex-wrap gap-x-6 gap-y-2"><Link href={amanah.newAnalysis} className="text-link">تحليل جديد<ArrowLeft/></Link><Link href={amanah.home+'/sources'} className="text-link">مكتبة المصادر<ArrowLeft/></Link><Link href={amanah.privacy} className="text-link">سياسة الخصوصية<ArrowLeft/></Link></div></section>
  </>;
}
