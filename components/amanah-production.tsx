'use client';
import {useEffect,useMemo,useRef,useState,type FormEvent,type ReactNode} from 'react';
import Link from 'next/link';
import {AlertTriangle,ArrowLeft,BookOpen,Check,CheckCircle2,Clock3,Download,ExternalLink,FileText,Info,Plus,Scale,Search,ShieldCheck,Sparkles,Users,X} from './app-icons';
import {AiDisclosure,analysisLabels,contentNames,decisionSource,driftLabel,Empty,PageHeading,Pill,publicationLabel,publicationUseLabels,resultDisclosure,reviewDecisionLabels,ScopeNotice,statusTone,type DecisionKind} from './amanah-ui';
import {apiFetch,apiFieldError,ClientApiError} from '@/lib/client-api';
import {alertCountForms,analysisStatusMessages,arabicCount,audienceLabel,audienceLabels,audienceSchema,formatModelConfidence,hasDriftLabelName,hasGlossaryAlerts,hasInstructionWarnings,humanReviewReasons,isLegacyQuranEvidence,isRetiredContentType,letterCountForms,LIMITS,mlSeverityLabels,modelRequestsHumanReview,needsRecheck,referenceStatusLabel,requiresHumanReview,reviewerRoleLabels,type AiExplanation,type AiExplanationStatus,type AmanahAnalysisResult,type AmanahAnalyzeInput,type AmanahCheck,type AmanahDashboard,type AmanahFinding,type AmanahReviewUpdate,type AnalysisStatus,type Audience,type Evidence,type HumanReviewReason,type FindingKind,type FindingOrigin,type FindingSeverity,type GlossaryNote,type IntegrationStatus,type PublicationUse,type ReviewerInfo} from '@/lib/contracts';
import {DEFAULT_LANGUAGE,LANGUAGES,languageInfo,type LanguageCode} from '@/lib/languages';
import {amanah,coldStartNotice,coldStartWaitingNotice,measuredScopeBadge,mlProcessorName,outOfMeasuredScope,passNotCertification,quranSourceName,retiredContentDetail,retiredContentNotice,retiredReadOnly,savedToHistory} from '@/lib/products';
import {amanahAccountExport,amanahPassportRecord,downloadFile} from './workspace-export';

const findingKindLabels:Record<FindingKind,string>={omission:'حذف',addition:'إضافة',inversion:'عكس المعنى',ambiguity:'التباس',terminology:'مصطلح',context:'سياق',other:'ملاحظة'};
const severityLabels:Record<FindingSeverity,string>={critical:'حرج',high:'مرتفع',medium:'متوسط',low:'منخفض'};
const severityTone=(severity:FindingSeverity|null)=>severity==='critical'||severity==='high'?'critical':severity==='medium'?'amber':'neutral';
const originLabels:Record<FindingOrigin,string>={model:'المصنف',rule:'قاعدة حتمية',fusion:'دمج القرار',glossary:'قاموس المصطلحات',partner:'محرك الشريك'};
// The filter is a list of fixed patterns, so a passing text is described by what was not found, not as verified.
const aiStatusLabels:Record<AiExplanationStatus,string>={ok:'لم يرصد المرشح الآلي فيه نسبة قول أو حكمًا أو اقتباسًا مخالفًا من الأنماط المعروفة، وقد يفوته بعضها',blocked:'حُجب لأنه تضمن ما لا يمكن التحقق منه',unavailable:'غير متاح'};
const isDemo=(check:AmanahCheck)=>check.result.modelVersion.startsWith('demo:');
const isPending=(check:AmanahCheck)=>check.reviewStatus==='pending'||check.reviewStatus==='not_required';
// «بانتظار قرار» in the history: stored hadith and tafsir rows are read-only (no decision form), so they never wait for one.
const awaitsDecision=(check:AmanahCheck)=>isPending(check)&&!isRetiredContentType(check.request.contentType);
const count=(value:number)=>value.toLocaleString('ar-SA');
const formatScore=(value:number)=>value.toLocaleString('ar-SA',{maximumFractionDigits:1});
const formatElapsed=(seconds:number)=>`${count(Math.floor(seconds/60))}:${count(seconds%60).padStart(2,'٠')}`;
const httpsHref=(value:string|null|undefined)=>value&&/^https:\/\/\S+$/i.test(value)?value:undefined;
const formatDate=(value:string|null)=>{if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?value:date.toLocaleString('ar-SA-u-ca-gregory',{dateStyle:'medium',timeStyle:'short'});};
const citation=(check:AmanahCheck)=>check.result.sourceMatch.normalizedCitation||check.request.source.locator;
const arabicScript=/\p{Script=Arabic}/u;
const historyHref=(id:string)=>`${amanah.history}?id=${encodeURIComponent(id)}`;

type VerseLink={label:string;url:string};
const verseLinks=(sura:number,ayah:number):VerseLink[]=>[{label:'مشروع Tanzil',url:`https://tanzil.net/#${sura}:${ayah}`},{label:'المصحف الإلكتروني بجامعة الملك سعود · مع تفسير ابن كثير',url:`https://quran.ksu.edu.sa/tafseer/katheer/sura${sura}-aya${ayah}.html`}];
const tanzilLocation=(id:string)=>{const match=id.match(/^tanzil:1\.1:(\d{1,3}):(\d{1,3})$/);return match?{sura:Number(match[1]),ayah:Number(match[2])}:null;};
function LinkList({links,className='verse-links'}:{links:VerseLink[];className?:string}){return links.length?<span className={className}>{links.map(link=><a key={link.url} href={link.url} target="_blank" rel="noreferrer"><ExternalLink/>{link.label}</a>)}</span>:null}
function Person({person}:{person:ReviewerInfo}){return <>{person.name&&person.name!==person.email?<>{person.name} · </>:null}<bdi dir="ltr">{person.email}</bdi></>}

// Marks the first occurrence of each quoted segment inside the full text (case-insensitive when lowercasing keeps offsets).
function highlight(text:string,segments:string[]):ReactNode{
 const lower=text.toLowerCase();const caseless=lower.length===text.length;const haystack=caseless?lower:text;const ranges:[number,number][]=[];
 for(const segment of segments){const needle=(caseless?segment.toLowerCase():segment).trim();if(needle.length<2)continue;const start=haystack.indexOf(needle);const end=start+needle.length;if(start>=0&&!ranges.some(([from,to])=>start<to&&end>from))ranges.push([start,end]);}
 if(!ranges.length)return text;ranges.sort((a,b)=>a[0]-b[0]);
 const parts:ReactNode[]=[];let cursor=0;ranges.forEach(([from,to],index)=>{parts.push(text.slice(cursor,from),<mark key={index}>{text.slice(from,to)}</mark>);cursor=to;});parts.push(text.slice(cursor));return parts;
}

const alertCount=(value:number)=>arabicCount(value,alertCountForms,count);
const recheckNotice='فحص سابق لربط نموذج أمانة ومعيار المطابقة الحالي؛ أعد الفحص قبل الاعتماد.';
// Why a PASS still carries the human-review mark (humanReviewReasons): the model asked for it, a glossary alert, or an instruction-like phrase.
const passReviewReasons:Record<Exclude<HumanReviewReason,'decision'>,string>={model:'طلب النموذج مراجعة بشرية لهذه النتيجة رغم أنه لم يرصد انحرافًا جوهريًا.',glossary:'رصد «مرجع المصطلحات» في الترجمة ما يلزم أن يتحقق منه المراجع.',instructions:'في النص المقدم عبارات تشبه التعليمات أو التزكية يلزم أن يتحقق منها المراجع.'};
const passReviewNote=(result:AmanahAnalysisResult)=>humanReviewReasons(result).flatMap(reason=>reason==='decision'?[]:[passReviewReasons[reason]]).join(' ');

// The structured output of the AMANAH model (B1): drift labels as returned, once each, with the severity and confidence of their first
// occurrence. A model ABSTAIN can carry drifts too: v0.2 keeps the drifts it found, with the computed severity and score, when the classifier's
// confidence is under the abstention threshold (and the rule drifts when the classifier is unavailable). They are listed as returned and
// marked as not a verdict; their spans stay hidden (no finding cards on an abstention).
type ModelDrift={label:string;name:string;severity:FindingSeverity;confidence?:number};
function modelDrifts(result:AmanahAnalysisResult):ModelDrift[]{
 const drifts=new Map<string,ModelDrift>();
 for(const finding of result.findings)if(finding.label&&!drifts.has(finding.label))drifts.set(finding.label,{label:finding.label,name:driftLabel(finding.label),severity:finding.severity,confidence:finding.modelConfidence});
 return [...drifts.values()];
}
const abstainDriftsNote='انحرافات أعادها النموذج مع امتناعه عن الحكم (كأن تكون ثقته دون عتبة الامتناع): تُعرض كما أعادها، وليست حكمًا على الترجمة، ولا تُعرض مواضعها.';
// One line of model outputs for history rows: severity, confidence, integrity score and drift names, on results from the AMANAH model
// (on its ABSTAIN the drift names it returned are said to come with the abstention).
function modelSummary(check:AmanahCheck):string{
 const {result}=check;if(decisionSource(result.modelVersion,check.request.contentType).kind!=='ml')return '';
 const drifts=modelDrifts(result).map(item=>item.name).join('، ');
 return [result.mlSeverity?`الخطورة ${mlSeverityLabels[result.mlSeverity]} (${result.mlSeverity})`:'',result.confidence===null?'':`ثقة النموذج ${formatModelConfidence(result.confidence)}`,result.integrityScore===undefined?'':`سلامة المعنى ${formatScore(result.integrityScore)} / ${count(100)}`,drifts?`${result.status==='ABSTAIN'?'انحراف أعاده مع الامتناع':'الانحراف'}: ${drifts}`:''].filter(Boolean).join(' · ');
}

function ProviderNotice(){return <div className="provider-gate demo-provider-gate"><span className="provider-gate-icon"><AlertTriangle/></span><div><h2>التحليل غير متاح حاليًا</h2><p>نموذج أمانة غير مهيأ على الخادم أو تعذر الاتصال به. يمكنك الاطلاع على السجل حتى تعود الخدمة.</p></div><Link href="/amanah/settings" className="btn secondary">حالة الخدمة<ArrowLeft/></Link></div>}

// The trusted Arabic text is never typed: the ayah is chosen (surah + ayah) or its reference typed (e.g. 2:256), and the server's
// Tanzil text of that ayah is shown read-only. The check request then carries only the reference; the server resolves the same text.
type QuranSuraOption={number:number;name:string;ayahCount:number};
type QuranVerseChoice={sura:number;suraName:string;ayah:number;locator:string;text:string;uthmani:string;url:string};
function QuranPicker({verse,onVerse,error:fieldError=''}:{verse:QuranVerseChoice|null;onVerse:(verse:QuranVerseChoice|null)=>void;error?:string}){
 const [suras,setSuras]=useState<QuranSuraOption[]>([]);const [sura,setSura]=useState(0);const [ayah,setAyah]=useState(0);const [ayahId,setAyahId]=useState('');const [loading,setLoading]=useState(false);const [error,setError]=useState('');const requestId=useRef(0);const lastQuery=useRef('');
 useEffect(()=>{apiFetch<{suras:QuranSuraOption[]}>('/api/amanah/quran').then(data=>setSuras(data.suras)).catch(e=>setError((e as Error).message))},[]);
 const selected=suras.find(item=>item.number===sura);
 async function load(query:string){
  const current=++requestId.current;setLoading(true);setError('');onVerse(null);
  try{const data=await apiFetch<{verse:QuranVerseChoice}>(`/api/amanah/quran?${query}`);if(current!==requestId.current)return;setSura(data.verse.sura);setAyah(data.verse.ayah);setAyahId(data.verse.locator);lastQuery.current=data.verse.locator;onVerse(data.verse);}
  catch(e){if(current===requestId.current)setError((e as Error).message);}
  finally{if(current===requestId.current)setLoading(false);}
 }
 function selectSura(next:number){requestId.current++;setSura(next);setAyah(0);setAyahId('');lastQuery.current='';setError('');setLoading(false);onVerse(null);}
 function selectAyah(next:number){setAyah(next);if(next){void load(`sura=${sura}&ayah=${next}`);return;}requestId.current++;setLoading(false);onVerse(null);}
 // On blur only a new reference is looked up; Enter and the button always look it up again.
 function resolveId(fromBlur=false){const value=ayahId.trim();if(!value){if(!fromBlur)setError('اكتب رقم الآية مثل 2:256.');return;}if(verse&&value===verse.locator)return;if(fromBlur&&value===lastQuery.current)return;lastQuery.current=value;void load(`locator=${encodeURIComponent(value)}`);}
 const message=error||fieldError;
 return <div className="source-fields quran-picker">
  <label>السورة<select value={sura} onChange={e=>selectSura(Number(e.target.value))}><option value={0}>اختر السورة</option>{suras.map(item=><option key={item.number} value={item.number}>{count(item.number)}. {item.name}</option>)}</select></label>
  <label>الآية<select value={ayah} onChange={e=>selectAyah(Number(e.target.value))} disabled={!selected}><option value={0}>اختر رقم الآية</option>{selected&&Array.from({length:selected.ayahCount},(_,index)=><option key={index+1} value={index+1}>{count(index+1)}</option>)}</select></label>
  <div className="ayah-id-field"><label>أو اكتب رقم الآية<input dir="auto" value={ayahId} onChange={e=>setAyahId(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();resolveId();}}} onBlur={()=>resolveId(true)} placeholder="2:256" maxLength={60} aria-describedby="ayah-id-help" aria-invalid={Boolean(message)||undefined}/></label><button type="button" className="btn secondary" onClick={()=>resolveId()} disabled={loading}><Search/>عرض الآية</button><small id="ayah-id-help">رقم السورة ثم رقم الآية، مثل 2:256، أو اسم السورة ورقم الآية مثل «البقرة 256».</small></div>
  {message&&<p className="field-error" role="alert">{message}</p>}
  <figure className="verse-preview" aria-live="polite"><figcaption><strong>نص الآية من المصحف · الرسم العثماني</strong><small>{verse?`سورة ${verse.suraName} · الآية ${verse.locator} · `:''}مشروع Tanzil 1.1 · رواية حفص · يُضاف تلقائيًا ولا يُعدَّل</small></figcaption>{verse?<blockquote dir="rtl" lang="ar" className="quran-text">{verse.uthmani}</blockquote>:<p>{loading?'جارٍ إحضار نص الآية…':'اختر السورة والآية أو اكتب رقمها ليظهر نصها الموثّق هنا.'}</p>}{verse&&<LinkList links={verseLinks(verse.sura,verse.ayah)}/>}</figure>
 </div>;
}

function SourceDetails({check}:{check:AmanahCheck}){
 const {request}=check;const source=request.source;if(request.contentType==='quran')return null;const url=httpsHref(source.url);const hadith=request.contentType==='hadith';
 return <dl className="source-details">
  <div><dt>المصدر</dt><dd>{source.title||'—'}</dd></div>
  {request.contentType==='tafsir'&&<div><dt>المفسر أو المؤلف</dt><dd>{source.author||'—'}</dd></div>}
  <div><dt>الموضع</dt><dd>{source.locator||'—'}</dd></div>
  {source.edition&&<div><dt>الطبعة</dt><dd>{source.edition}</dd></div>}
  {hadith&&<div><dt>درجة الحديث</dt><dd>{source.grade||<span className="missing">لم تُذكر — لا يُعتمد الحديث بدونها</span>}</dd></div>}
  <div><dt>رابط المصدر</dt><dd>{url?<a href={url} target="_blank" rel="noreferrer" dir="ltr">{url}</a>:source.url?<span className="missing"><bdi dir="ltr">{source.url}</bdi> · رابط غير آمن (ليس https)</span>:<span className={hadith?'missing':undefined}>{hadith?'لا يوجد — لا يُعتمد الحديث بدونه':'لا يوجد'}</span>}</dd></div>
 </dl>;
}

// Canonical text (Uthmani from Tanzil when available) beside the FULL submitted translation, with verified quotes marked.
// TODO(after-ml): with real drifts, check that verified source spans (Uthmani words) are found and marked inside the verse, and translation spans inside the translation.
// Rows stored before the current matcher carry an older evidence title and the Simple Clean excerpt: they are captioned as such,
// never as the Uthmani Mushaf text, and the submitted text is shown beside them because the older match was looser (م-05, م-06).
function TextComparison({check}:{check:AmanahCheck}){
 const {request,result}=check;const language=languageInfo(request.targetLanguage);const quran=request.contentType==='quran';const canonical=quran?result.evidence.find(item=>tanzilLocation(item.id)):undefined;const findings=result.status==='ABSTAIN'?[]:result.findings;
 const sourceMarks=findings.filter(finding=>finding.sourceSegmentVerified===true&&finding.sourceSegment).map(finding=>finding.sourceSegment);
 const translationMarks=findings.filter(finding=>finding.translationSegmentVerified===true&&finding.translationSegment).map(finding=>finding.translationSegment);
 const legacyText=Boolean(canonical&&isLegacyQuranEvidence(canonical));const recheck=quran&&needsRecheck(request.contentType,result);
 const mismatch=Boolean(canonical&&!result.sourceMatch.matched&&request.originalText.trim());const submitted=Boolean(canonical&&request.originalText.trim()&&(mismatch||recheck));
 const audience=audienceLabel(request.audience);
 return <div className="text-comparison">
  <figure><figcaption><strong>{canonical?legacyText?'نص الآية من مشروع Tanzil · النص الإملائي (Simple Clean)':'نص الآية من المصحف · الرسم العثماني':quran?'النص العربي كما أُدخل (لم يُتحقق منه)':'النص العربي الأصلي كما أُدخل'}</strong><small>{canonical?`${canonical.locator} · ${canonical.title}`:citation(check)}</small></figcaption><blockquote dir="rtl" lang="ar" className={canonical&&!legacyText?'quran-text':undefined}>{highlight(canonical?canonical.excerpt:request.originalText,sourceMarks)}</blockquote>{submitted&&<div className="submitted-mismatch"><small>{mismatch?'النص الذي أُدخل ولم يطابق المصحف':'النص الذي أُدخل · طوبق بمعيار سابق أضعف من الحالي'}</small><p dir="rtl">{request.originalText}</p></div>}</figure>
  <figure><figcaption><strong>الترجمة المقدمة كاملة</strong><small>{language.label}{quran&&!language.mlSupported?' · خارج نطاق النموذج الحالي':''}{audience?` · الجمهور: ${audience}`:''}</small></figcaption><blockquote dir={language.dir} lang={language.code??undefined}>{highlight(request.translation,translationMarks)}</blockquote></figure>
 </div>;
}

function AiExplanationBox({value}:{value:AiExplanation}){
 return <section className={'ai-explanation '+value.status} aria-label="شرح مولّد بالذكاء الاصطناعي"><div className="ai-explanation-head"><Sparkles/><div><h3>شرح مولّد بالذكاء الاصطناعي — لا يغيّر القرار</h3><small>{aiStatusLabels[value.status]} · <code dir="ltr">{value.model}</code></small></div></div><p dir="auto">{value.text}</p>{value.status==='blocked'&&value.reasons?.length?<ul>{value.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>:null}</section>;
}

function FindingCard({finding,quran,dir}:{finding:AmanahFinding;quran:boolean;dir:string}){
 const canonical=finding.sourceSegmentVerified===true?finding.sourceSegment:'';
 // Older rows carry no verification flag, so their source quote is the model's own text and is never shown as canonical.
 // Live on 3 October 2026, non-Arabic spans came only from rule findings quoting the English reference translation, as labelled below.
 const modelSpan=canonical?'':finding.modelSourceSpan||finding.sourceSegment||'';
 const translationLabel=finding.translationSegmentVerified===true?'من الترجمة المقدمة':finding.translationSegmentVerified===false?'مقطع من الترجمة حدده النموذج (غير مطابق حرفيًا)':'من الترجمة كما اقتبسها النموذج';
 return <article className={'finding-card '+finding.severity}>
  <div><Pill tone={severityTone(finding.severity)}>{severityLabels[finding.severity]}</Pill><strong className="drift-name">{finding.label?driftLabel(finding.label):findingKindLabels[finding.kind]}</strong>{finding.origin&&<span className="finding-origin">{originLabels[finding.origin]}</span>}{finding.label&&hasDriftLabelName(finding.label)&&<code dir="ltr">{finding.label}</code>}{finding.modelConfidence!==undefined&&<span className="finding-confidence">ثقة النموذج في هذا الانحراف {formatModelConfidence(finding.modelConfidence)}</span>}</div>
  <div className="finding-segments">
   {canonical?<blockquote className="verified"><small>{quran?'من نص المصحف':'من النص الأصلي'}</small><span dir="rtl" className={quran?'quran-text':undefined}>{canonical}</span></blockquote>:modelSpan?<blockquote className="unverified"><small>{arabicScript.test(modelSpan)?'مقطع حدده النموذج (غير مطابق حرفيًا)':'مقطع من الترجمة المرجعية لدى النموذج'}</small><span dir="auto">{modelSpan}</span></blockquote>:<blockquote className="empty"><small>{quran?'من نص المصحف':'من النص الأصلي'}</small><span>لم يحدد النموذج موضعًا في النص الأصلي.</span></blockquote>}
   {finding.translationSegment?<blockquote className={finding.translationSegmentVerified===false?'unverified':finding.translationSegmentVerified===true?'verified':undefined}><small>{translationLabel}</small><span dir={dir}>{finding.translationSegment}</span></blockquote>:<blockquote className="empty"><small>من الترجمة</small><span>لم يحدد النموذج موضعًا في الترجمة.</span></blockquote>}
  </div>
  <p>{finding.explanation}</p>
 </article>;
}

function GlossaryNotes({notes}:{notes:GlossaryNote[]}){
 const alerts=notes.filter(note=>note.alert).length;
 return <section className="glossary-notes" aria-label="مرجع المصطلحات"><div className="glossary-head"><h3><BookOpen/>مرجع المصطلحات</h3><Pill tone={alerts?'critical':'neutral'}>{alerts?alertCount(alerts):'لا تنبيهات'}</Pill></div><p className="glossary-intro">ملاحظات ثابتة من نماذج قاموس المصطلحات في المرجعية العلمية (موسوعة الجمهرة)، للاسترشاد ولا تغيّر قرار النموذج.{alerts?' يلزم تأكيد مراجعة التنبيهات قبل الاعتماد.':''}</p>{notes.map(note=><article key={note.termId} className={note.alert?'glossary-note alert':'glossary-note'}><div className="glossary-term"><strong>{note.term}</strong><span dir="ltr">{note.approved.join(' / ')}</span>{note.alert&&<Pill tone="critical"><AlertTriangle/>تنبيه</Pill>}</div><p>{note.message}</p><small>ضابط الاستخدام: {note.rule}</small>{httpsHref(note.referenceUrl)?<a href={note.referenceUrl} target="_blank" rel="noreferrer"><ExternalLink/>{note.reference}</a>:<small>{note.reference}</small>}</article>)}</section>;
}

// Only the Quran path builds Tanzil evidence itself. A Tanzil id elsewhere (an older partner row) is never styled or linked as Mushaf text.
function EvidenceList({items,quran}:{items:Evidence[];quran:boolean}){
 return <div className="evidence-live"><h3><BookOpen/>الأدلة المرتبطة بالنتيجة</h3>{items.map(item=>{const location=quran?tanzilLocation(item.id):null;const mushaf=Boolean(location)&&!isLegacyQuranEvidence(item);const url=httpsHref(item.url);const links=location?verseLinks(location.sura,location.ayah):url?[{label:'افتح المصدر',url}]:[];return <article key={item.id} className="evidence-item"><span><strong>{item.title}</strong><small>{item.locator}</small></span><div><p dir={location?'rtl':'auto'} className={mushaf?'quran-text':undefined}>{item.excerpt}</p><LinkList links={links} className="evidence-links"/></div></article>})}</div>;
}

// The automated stamp names who actually decided (decisionSource). A status the AMANAH model did not issue (a pre-model LLM, or the
// former partner engine) is never shown as an active screening stamp, as in DecisionBanner; a Qur'an one is re-checked first.
function TrustPassport({check}:{check:AmanahCheck}){
 const result=check.result;const demo=isDemo(check);const origin=decisionSource(result.modelVersion,check.request.contentType);const legacy=origin.kind==='legacy-llm';const partner=origin.kind==='partner';const retired=isRetiredContentType(check.request.contentType);const screened=!demo&&!legacy&&!partner&&result.status==='PASS';const human=!demo&&check.publicationStatus==='HUMAN_APPROVED';const role=check.reviewerRole?reviewerRoleLabels[check.reviewerRole]:'';const readOnly=retired&&isPending(check);
 return <section className="trust-passport"><div className="passport-heading"><div><span className="eyebrow">{demo?'نموذج جواز أمانة':'جواز أمانة'}</span><h3>{check.request.title}</h3></div><button className="text-link" onClick={()=>downloadFile(`amanah-passport-${check.id}.json`,JSON.stringify(amanahPassportRecord(check),null,2),'application/json;charset=utf-8')}><Download/>تنزيل السجل</button></div><div className="passport-stamps"><div className={screened?'passport-stamp active':'passport-stamp'}><ShieldCheck/><span><strong>{demo?'نتيجة تجريبية':'فحص آلي'}</strong><small>{demo?'محاكاة لشرح الرحلة؛ لا تمثل فحصًا فعليًا':legacy?'حالة من نموذج لغوي (فحص سابق) — ليست قرار نموذج أمانة':partner?`حالة من ${origin.label} (فحص سابق) — ليست قرار نموذج أمانة${retired?'':'؛ أعد الفحص'}`:screened?`لم يرصد ${origin.label} اختلافًا مؤثرًا`:'لا تتوفر نتيجة آلية قابلة للاعتماد المباشر'}</small></span></div><div className={human?'passport-stamp human active':'passport-stamp human'}><CheckCircle2/><span><strong>مراجعة بشرية</strong><small>{human?<>اعتمدها {check.reviewer?<Person person={check.reviewer}/>:'مراجع'}{role?` · ${role}`:''}{check.reviewOverride?' · بتجاوز موثق لنتيجة حرجة':''}</>:demo?'لا يمكن اعتماد نتيجة تجريبية':readOnly?`${retiredReadOnly} — لا يُعتمد`:check.reviewStatus==='changes_requested'?'أُعيدت للتصحيح':'لم يُحفظ اعتماد بشري بعد'}</small></span></div></div><p>{demo?'حالة التجربة: غير صالحة للنشر أو الاعتماد':<>نتيجة التحليل: <b>{analysisLabels[result.status]}</b> · حالة النشر: <b>{publicationLabel(check)}</b> · الإصدار: <code dir="ltr">{result.modelVersion}</code></>}</p></section>;
}

// Team handoff UI mapping: the decision code, its wording and colour, and a visible mark whenever a human reviewer is required
// (requiresHumanReview: also a PASS with a glossary alert or an instruction-like phrase, with the reason under the wording).
// A status that the AMANAH model did not issue (an LLM before the model, or the former partner engine) is not given the model's wording.
// Stored hadith/tafsir rows can be neither re-checked nor approved, so they get no review mark and no re-check advice.
function DecisionBanner({result,kind,retired=false}:{result:AmanahAnalysisResult;kind:DecisionKind;retired?:boolean}){
 const tone=statusTone(result.status);const human=!retired&&requiresHumanReview(result);const foreign=kind==='legacy-llm'||kind==='partner';
 return <div className={'decision-banner '+tone}><span className="decision-code" dir="ltr">{result.status}</span><div><strong>{foreign?`حالة من فحص سابق لم يصدرها نموذج أمانة؛ ${retired?`${retiredReadOnly}.`:'أعد الفحص قبل الاعتماد.'}`:analysisStatusMessages[result.status]}</strong>{result.status==='PASS'&&!foreign&&<small>{passNotCertification}</small>}{human&&result.status==='PASS'&&<small className="human-review-reason">{passReviewNote(result)}</small>}</div>{human&&<span className="human-review-flag"><Users/>مراجعة بشرية لازمة</span>}</div>;
}

// Decision, severity, confidence, integrity score, reference status, review state and drift labels, exactly as the model returned them.
// «المراجعة البشرية» here is the model's own request; a glossary or instruction mark on a PASS is shown in the banner, not as a model output.
// On a model ABSTAIN the values stay as returned (v0.2 sends score 0, S0 and confidence 0 when it refuses an input, and the computed values
// when its confidence is below the abstention threshold); one line says they are not a verdict on the translation.
const modelAbstainNote='امتنع النموذج عن الحكم: القيم أعلاه كما أعادها، ولا تُقرأ حكمًا على الترجمة. وسبب الامتناع في ملاحظات التحليل أدناه.';
function ModelMetrics({result}:{result:AmanahAnalysisResult}){
 const drifts=modelDrifts(result);const human=modelRequestsHumanReview(result);const mismatch=Boolean(result.referenceStatus&&result.referenceStatus!=='verified');
 return <section className="model-metrics" aria-label="مخرجات نموذج أمانة">
  <dl>
   <div><dt>قرار النموذج</dt><dd><bdi dir="ltr">{result.status}</bdi> · {analysisLabels[result.status]}</dd></div>
   <div><dt>درجة الخطورة</dt><dd>{result.mlSeverity?<>{mlSeverityLabels[result.mlSeverity]} <bdi dir="ltr">({result.mlSeverity})</bdi></>:'—'}</dd></div>
   <div><dt>ثقة النموذج</dt><dd>{result.confidence===null?'—':formatModelConfidence(result.confidence)}</dd></div>
   <div><dt>مؤشر سلامة المعنى</dt><dd>{result.integrityScore===undefined?'—':`${formatScore(result.integrityScore)} / ${count(100)}`}</dd></div>
   <div><dt>حالة المرجع لدى النموذج</dt><dd className={mismatch?'warn':undefined}>{result.referenceStatus?referenceStatusLabel(result.referenceStatus):'—'}</dd></div>
   <div><dt>المراجعة البشرية</dt><dd className={human?'warn':undefined}>{human?'لازمة':result.needsHumanReview===false?'لم يطلبها النموذج':'—'}</dd></div>
  </dl>
  {result.status==='ABSTAIN'&&<p className="model-metrics-note">{modelAbstainNote}</p>}
  <div className="drift-summary"><span>نوع الانحراف</span>{drifts.length?<ul>{drifts.map(item=><li key={item.label}><Pill tone={severityTone(item.severity)}>{item.name}</Pill>{hasDriftLabelName(item.label)&&<code dir="ltr">{item.label}</code>}{result.status==='ABSTAIN'&&<small className="abstain-drift">{`${severityLabels[item.severity]}${item.confidence===undefined?'':` · ثقة النموذج في هذا الانحراف ${formatModelConfidence(item.confidence)}`}`}</small>}</li>)}</ul>:<p>{result.status==='ABSTAIN'?'لم يُعِد النموذج انحرافًا مع امتناعه.':'لم يرصد النموذج انحرافًا.'}</p>}{result.status==='ABSTAIN'&&drifts.length>0&&<p className="abstain-drifts-note">{abstainDriftsNote}</p>}</div>
 </section>;
}

function AnalysisResult({check,context='verify'}:{check:AmanahCheck;context?:'verify'|'review'}){
 const result=check.result;const demo=isDemo(check);const quran=check.request.contentType==='quran';const retired=isRetiredContentType(check.request.contentType);const language=languageInfo(check.request.targetLanguage);const origin=decisionSource(result.modelVersion,check.request.contentType);const abstain=result.status==='ABSTAIN';const findings=abstain?[]:result.findings;const official=check.request.publicationUse==='official_publication';const recheck=needsRecheck(check.request.contentType,result);
 // A stored hadith or tafsir source will never be verified now (read-only), so it is never «بانتظار التحقق».
 const sourceState=demo?'افتراضية فقط':retired?`${result.sourceMatch.method==='submitted'?'لم يُتحقق منه':result.sourceMatch.matched?'مطابق':'غير مطابق'} · ${retiredReadOnly}`:result.sourceMatch.method==='submitted'?'بانتظار التحقق':result.sourceMatch.matched?recheck&&quran?'مطابقة بمعيار سابق — أعد الفحص':result.sourceMatch.method==='exact'?'مطابق حرفيًا':'مطابق':'غير مطابق';
 const next=demo?'هذه نتيجة افتراضية لاستعراض الفحص فقط.':retired?retiredContentDetail:recheck?recheckNotice:abstain?'امتنع الفحص عن الحكم، فلا تقبل النتيجة الاعتماد. راجع سبب الامتناع، ثم أعد الفحص أو أحِل النص إلى مراجعة بشرية كاملة.':official?'سيظهر هذا الفحص في قائمة المراجعين المستقلين؛ لا يعتمد النشر الرسمي إلا مراجع غير صاحب الفحص.':'افتح الفحص في السجل لتوثيق قرارك لهذه المسودة الداخلية.';
 // Summary and explanation of a partner or a pre-model LLM are generated text, labelled as such (م-04, R-16).
 const generated=origin.kind==='partner'?'ملخص محرك الشريك وشرحه أدناه نص قد يكون مولّدًا آليًا، وليس قرار نموذج أمانة؛ راجعه بنفسك.':origin.kind==='legacy-llm'?'فحص سابق لربط نموذج أمانة: كتب نموذج لغوي كبير هذه الحالة والشرح.':'';
 const disclosure=demo?'':resultDisclosure(origin.kind,retired);const warnings=result.instructionWarnings??[];
 // The adapter's summary is the decision wording already shown in the banner; an older or generated summary is still shown.
 const summary=result.summary===analysisStatusMessages[result.status]?'':result.summary;
 return <section className="analysis-live-result" aria-live="polite">{demo&&<div className="demo-result-banner"><Sparkles/><div><strong>نتيجة افتراضية للتجربة</strong><span>لم يُستخدم سجل مصادر أو نموذج أمانة الحقيقي، ولا تصلح هذه النتيجة للنشر أو الاعتماد.</span></div></div>}
  <div className="live-result-head"><div><span className="eyebrow">{demo?'محاكاة نتيجة أمانة':'نتيجة التحليل الآلي'}</span><h2>{check.request.title}</h2></div><div className="result-badges">{demo&&<Pill tone="amber">تجريبي</Pill>}{retired&&<Pill tone="neutral">{retiredContentNotice}</Pill>}<Pill tone={statusTone(result.status)}>{analysisLabels[result.status]}</Pill><Pill tone={check.publicationStatus==='HUMAN_APPROVED'?'green':'neutral'}>{publicationLabel(check)}</Pill></div></div>
  {!demo&&<DecisionBanner result={result} kind={origin.kind} retired={retired}/>}
  {retired&&<div className="source-note retired-note" role="note"><Info/><div><strong>{retiredContentNotice} · {retiredReadOnly}</strong><p>{retiredContentDetail}</p></div></div>}
  {origin.kind==='ml'&&<ModelMetrics result={result}/>}
  <div className="result-overview"><div><span>مصدر القرار</span><strong>{origin.label}</strong><code dir="ltr">{result.modelVersion}</code>{origin.detail&&<small>{origin.detail}</small>}</div><div><span>حالة المصدر</span><strong>{sourceState}</strong></div><div><span>المحتوى</span><strong>{quran?quranSourceName:contentNames[check.request.contentType]}</strong></div><div><span>لغة الترجمة</span><strong>{language.label}</strong></div></div>
  {disclosure&&<AiDisclosure compact text={disclosure}/>}
  {!demo&&!result.sourceMatch.matched&&result.sourceMatch.note&&<div className="source-note" role="note"><AlertTriangle/><div><strong>ملاحظة مطابقة المصدر</strong><p>{result.sourceMatch.note}</p></div></div>}
  {warnings.length>0&&<div className="source-note instruction-note" role="note"><AlertTriangle/><div><strong>عبارات تشبه التعليمات أو التزكية في النص المقدم</strong><p>وردت عبارات موجهة إلى الأداة أو تدّعي اعتمادًا لم يُتحقق منه. لا تغيّر قرار النموذج، ويلزم أن يتحقق منها المراجع قبل الاعتماد.</p><ul>{warnings.map(phrase=><li key={phrase}><bdi dir="auto">{phrase}</bdi></li>)}</ul></div></div>}
  <TextComparison check={check}/>
  <SourceDetails check={check}/>
  <div className="result-narrative">{generated&&<small className="generated-label">{generated}</small>}<h3>{summary||'ملاحظات التحليل'}</h3><p>{result.explanation}</p></div>
  {result.aiExplanation&&<AiExplanationBox value={result.aiExplanation}/>}
  {abstain&&result.findings.length>0&&<p className="findings-hidden">أُخفيت ملاحظات النموذج لأن الفحص امتنع عن الحكم.</p>}
  {findings.length>0&&<div className="finding-grid">{findings.map(finding=><FindingCard key={finding.id} finding={finding} quran={quran} dir={language.dir}/>)}</div>}
  {result.glossary&&result.glossary.length>0&&<GlossaryNotes notes={result.glossary}/>}
  {result.evidence.length>0&&<EvidenceList items={result.evidence} quran={quran}/>}
  <TrustPassport check={check}/>
  {context==='verify'&&<div className="result-next">{!demo&&<p className="saved-to-history" role="status"><CheckCircle2/><strong>{savedToHistory}</strong></p>}<p><Info/>{next}</p><Link href={demo?'/amanah/settings':historyHref(check.id)} className="btn primary">{demo?'حالة الخدمة':'فتحه في السجل والمراجعات'}<ArrowLeft/></Link></div>}
 </section>;
}

// The new-analysis page asks the server to wake a scale-to-zero model endpoint once when it opens (the server sends one fixed request
// for verse 1:1 and never returns its answer). The browser repeats it at most every 4 minutes per tab; the server throttles it too.
const WARMUP_KEY='amanah:ml-warmup';
const WARMUP_INTERVAL_MS=4*60_000;
function requestWarmup(){
 let recent=false;
 try{const last=Number(sessionStorage.getItem(WARMUP_KEY));recent=last>0&&Date.now()-last<WARMUP_INTERVAL_MS;if(!recent)sessionStorage.setItem(WARMUP_KEY,String(Date.now()));}catch{}
 if(!recent)apiFetch<{started:boolean}>('/api/amanah/ml/warmup',{method:'POST'}).catch(()=>undefined);
}

// While a check runs: elapsed time (m:ss) and the cold-start notice. A warm model answers within seconds; from WAKING_AFTER_S on, the page
// says the model is most likely waking up (two to four minutes) and that it must stay open. The page never cuts the request itself
// (apiFetch has no timeout): only the server's model timeout ends it, and then an ABSTAIN result is shown.
const WAKING_AFTER_S=20;
function AnalysisBusy({elapsed}:{elapsed:number}){const waking=elapsed>=WAKING_AFTER_S;return <div className={waking?'busy-notice waking':'busy-notice'} role="status"><Clock3/><div><strong>جارٍ التحليل… <span className="elapsed" role="timer" aria-live="off">{formatElapsed(elapsed)}</span></strong><p>يرسل الخادم نص الآية الموثّق والترجمة إلى نموذج أمانة على {mlProcessorName}. {coldStartNotice}</p>{waking&&<p className="waking-note">{coldStartWaitingNotice}</p>}</div></div>}

type AnalysisForm={title:string;translation:string;targetLanguage:LanguageCode;publicationUse:PublicationUse;audience:Audience};
const blankForm=():AnalysisForm=>({title:'فحص معنى جديد',translation:'',targetLanguage:DEFAULT_LANGUAGE,publicationUse:'internal_draft',audience:'general'});
type FieldErrors={title:string;translation:string;locator:string};
const noFieldErrors:FieldErrors={title:'',translation:'',locator:''};

// Workflow (team handoff, B5): Qur'an only → ayah chosen or typed → trusted Arabic text resolved → English translation → AMANAH model
// → structured result → optional LLM explanation → human review when required → saved to history.
export function AmanahNewAnalysisProduction(){
 const [form,setForm]=useState<AnalysisForm>(blankForm);const [verse,setVerse]=useState<QuranVerseChoice|null>(null);const [titleEdited,setTitleEdited]=useState(false);const [status,setStatus]=useState<IntegrationStatus['amanah']|null>(null);const [result,setResult]=useState<AmanahCheck|null>(null);const [busy,setBusy]=useState(false);const [elapsed,setElapsed]=useState(0);const [error,setError]=useState('');const [fieldErrors,setFieldErrors]=useState<FieldErrors>(noFieldErrors);const resultRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{apiFetch<IntegrationStatus>('/api/integrations/status').then(data=>setStatus(data.amanah)).catch(e=>setError((e as Error).message));requestWarmup();},[]);
 useEffect(()=>{if(!busy)return;const started=Date.now();const timer=setInterval(()=>setElapsed(Math.floor((Date.now()-started)/1000)),1000);return()=>clearInterval(timer);},[busy]);
 function chooseVerse(next:QuranVerseChoice|null){setVerse(next);setFieldErrors(current=>({...current,locator:''}));if(next&&!titleEdited)setForm(current=>({...current,title:`ترجمة الآية ${next.locator} · سورة ${next.suraName}`}));}
 async function submit(event:FormEvent){
  event.preventDefault();if(!verse||busy)return;setElapsed(0);setBusy(true);setError('');setFieldErrors(noFieldErrors);setResult(null);
  // Only the ayah reference is sent: the server resolves and stores the trusted Tanzil text itself. The page never cancels this request:
  // the first check after idle waits for the model to wake up, bounded by the server (model timeout, 240 s by default for hf, plus 12 s
  // for the explanation), so the page must never give up before the server does.
  const body:AmanahAnalyzeInput={title:form.title,contentType:'quran',source:{title:quranSourceName,locator:verse.locator},translation:form.translation,targetLanguage:form.targetLanguage,publicationUse:form.publicationUse,audience:form.audience};
  try{const data=await apiFetch<{check:AmanahCheck}>('/api/amanah/checks',{method:'POST',body:JSON.stringify(body)});setResult(data.check);requestAnimationFrame(()=>resultRef.current?.scrollIntoView({behavior:'smooth',block:'start'}));}
  catch(e){const err=e as ClientApiError;setError(err.message);setFieldErrors({title:apiFieldError(err,'title'),translation:apiFieldError(err,'translation'),locator:apiFieldError(err,'locator')});if(err.code==='CONFIGURATION_REQUIRED')setStatus({ready:false,mode:'unavailable',missing:err.missing,provider:'غير متصل',supportedContentTypes:['quran'],transport:null,endpointState:null});}
  finally{setBusy(false);}
 }
 const language=languageInfo(form.targetLanguage);const ready=Boolean(status?.ready);const asleep=ready&&status?.endpointState==='may_need_wakeup';
 return <><PageHeading eyebrow="أمانة · تحليل جديد" title="حلّل ترجمة آية قبل نشرها." description="اختر الآية فيُضاف نصها الموثّق من المصحف تلقائيًا، ثم أدخل ترجمتها الإنجليزية ليصدر نموذج أمانة قراره." action={<Link href={amanah.history} className="btn secondary"><Clock3/>السجل والمراجعات</Link>}/>
 <div className="risk-strip"><span><b>١</b>الآية ونصها الموثّق</span><ArrowLeft/><span><b>٢</b>قرار نموذج أمانة</span><ArrowLeft/><span><b>٣</b>مراجعة بشرية عند الحاجة</span><ArrowLeft/><span><b>٤</b>الحفظ في السجل</span></div>
 <div className="scope-disclosure"><ScopeNotice/><AiDisclosure/></div>
 {status&&!ready&&<ProviderNotice/>}
 {asleep&&<div className="notice wake-notice" role="note"><Clock3/><span>{coldStartNotice} أُرسل طلب لتنبيهه عند فتح هذه الصفحة.</span></div>}
 {error&&<div className="notice warning" role="alert"><AlertTriangle/><span>{error}</span></div>}
 <form className="amanah-live-form" onSubmit={submit}>
  <section className="panel form-section"><div className="form-section-title"><span>01</span><div><h2>اختر الآية</h2></div></div><div className="fixed-source"><span className="soft-icon"><BookOpen/></span><div><strong>{quranSourceName}</strong><small>المصدر المتاح للتحليل في هذه النسخة</small></div><span className="scope-badge">{measuredScopeBadge}</span></div><QuranPicker verse={verse} onVerse={chooseVerse} error={fieldErrors.locator}/></section>
  <section className="panel form-section"><div className="form-section-title"><span>02</span><div><h2>أدخل الترجمة الإنجليزية</h2></div></div><div className="text-pair translation-only"><label>الترجمة المراد فحصها<textarea dir={language.dir} lang={language.code??undefined} rows={7} value={form.translation} onChange={e=>{setForm({...form,translation:e.target.value});setFieldErrors(current=>({...current,translation:''}));}} placeholder="ألصق الترجمة الإنجليزية المراد فحصها" maxLength={LIMITS.translationMax} aria-invalid={Boolean(fieldErrors.translation)||undefined} required/>{fieldErrors.translation&&<span className="field-error">{fieldErrors.translation}</span>}<small>{language.label} · {count(form.translation.length)} / {count(LIMITS.translationMax)}</small></label><label>لغة الترجمة<select value={form.targetLanguage} onChange={e=>setForm({...form,targetLanguage:e.target.value as LanguageCode})} required>{LANGUAGES.map(item=><option key={item.code} value={item.code} disabled={!item.mlSupported}>{item.label} · {item.native}{item.mlSupported?'':` — ${outOfMeasuredScope}`}</option>)}</select><small>النسخة المقاسة v0.2 تفحص الترجمة من العربية إلى الإنجليزية فقط؛ اللغات الأخرى خارج نطاقها حاليًا.</small></label></div></section>
  <section className="panel form-section"><div className="form-section-title"><span>03</span><div><h2>حدد الاستخدام ثم حلّل</h2></div></div><div className="policy-fields"><label>اسم الفحص<input value={form.title} onChange={e=>{setTitleEdited(true);setForm({...form,title:e.target.value});setFieldErrors(current=>({...current,title:''}));}} maxLength={LIMITS.titleMax} aria-invalid={Boolean(fieldErrors.title)||undefined} required/>{fieldErrors.title&&<span className="field-error">{fieldErrors.title}</span>}<small>يظهر في السجل.</small></label><label>الاستخدام<select value={form.publicationUse} onChange={e=>setForm({...form,publicationUse:e.target.value as PublicationUse})}><option value="internal_draft">مسودة / استخدام داخلي</option><option value="official_publication">نشر رسمي أو مؤسسي</option></select></label><label>الجمهور المستهدف<select value={form.audience} onChange={e=>setForm({...form,audience:e.target.value as Audience})}>{audienceSchema.options.map(value=><option key={value} value={value}>{audienceLabels[value]}</option>)}</select><small>يُحفظ مع الفحص ويظهر للمراجع ليقدّر المقابل بحسب القارئ؛ لا يغيّر قرار النموذج.</small></label></div>
   <div className="policy-explainer"><Scale/><p><strong>النتيجة الآلية ليست اعتمادًا نهائيًا.</strong> {form.publicationUse==='official_publication'?'النشر الرسمي لا يعتمده إلا مراجع مستقل غير صاحب الفحص.':'في المسودة الداخلية تقرر بنفسك بعد مراجعة المصدر والمعنى.'} يُحفظ كل تحليل في السجل تلقائيًا.</p></div>
   {busy&&<AnalysisBusy elapsed={elapsed}/>}
   <button className="btn primary submit-analysis" type="submit" disabled={busy||!ready||!verse||!form.translation.trim()}><ShieldCheck/>{busy?'جارٍ التحليل…':'تحليل'}</button>
   {!busy&&!verse&&<p className="submit-hint">اختر الآية أولًا ليُفعَّل زر التحليل.</p>}
  </section>
 </form>
 {result&&<div ref={resultRef}><AnalysisResult check={result}/></div>}
 </>;
}

type MlStatusView={label:string;tone:string;body:string};
function mlStatusView(status:IntegrationStatus['amanah']|null,error:string):MlStatusView{
 if(!status)return error?{label:'تعذر التحقق',tone:'amber',body:error}:{label:'جارٍ التحقق…',tone:'neutral',body:'جارٍ التحقق من حالة النموذج…'};
 if(!status.ready)return {label:'غير متصل',tone:'critical',body:'نموذج أمانة غير مهيأ على الخادم، فلا يمكن إجراء تحليل جديد الآن. يمكنك الاطلاع على السجل.'};
 if(status.endpointState==='may_need_wakeup')return {label:'قد يحتاج للاستيقاظ',tone:'amber',body:coldStartNotice};
 return {label:'جاهز',tone:'green',body:'النموذج متصل ويستقبل التحليلات.'};
}
const decisionOrder:AnalysisStatus[]=['PASS','REVIEW','CRITICAL','ABSTAIN'];
const workflowSteps=['اختر السورة والآية أو اكتب رقمها، فيُضاف نصها الموثّق من المصحف تلقائيًا.','أدخل الترجمة الإنجليزية المراد فحصها.','يصدر نموذج أمانة القرار (PASS أو REVIEW أو CRITICAL أو ABSTAIN) مع نوع الانحراف ودرجة الخطورة وثقة النموذج ومؤشر سلامة المعنى.','يكتب نموذج لغوي كبير شرحًا اختياريًا لا يغيّر القرار.','تُعلَّم النتيجة للمراجعة البشرية عند الحاجة، ويُحفظ كل تحليل في السجل.'];

export function AmanahDashboardView({dashboard,status,error='',statusError=''}:{dashboard:AmanahDashboard|null;status:IntegrationStatus['amanah']|null;error?:string;statusError?:string}){
 const ml=mlStatusView(status,statusError);const counts=dashboard?.counts;const value=(n:number|undefined|null)=>n===undefined||n===null?'…':count(n);const newButton=<Link href={amanah.newAnalysis} className="btn primary"><Plus/>تحليل جديد</Link>;
 return <><PageHeading eyebrow="أمانة · لوحة المتابعة" title="سلامة المعنى في ترجمات الآيات." description="ابدأ تحليلًا جديدًا لترجمة آية إلى الإنجليزية، وتابع نتائج فحوصك وما ينتظر المراجعة البشرية." action={newButton}/>
  <section className="panel ml-status" aria-labelledby="ml-status-heading"><div className="ml-status-head"><span className="soft-icon"><ShieldCheck/></span><div><h2 id="ml-status-heading">نموذج أمانة للتعلم الآلي</h2><p>{ml.body}</p></div><Pill tone={ml.tone}>{ml.label}</Pill></div><div className="ml-status-meta"><span className="scope-badge">{measuredScopeBadge}</span><span>المصدر: {quranSourceName}</span>{status?.transport==='hf'&&<span>الخادم: {mlProcessorName}</span>}</div></section>
  {error&&<div className="notice warning" role="alert"><AlertTriangle/><span>{error}</span></div>}
  <div className="stat-grid dashboard-stats"><article className="stat-card"><div className="stat-label">إجمالي فحوصي</div><strong>{value(counts?.total)}</strong><small>كل التحليلات المحفوظة في السجل</small></article><article className="stat-card"><div className="stat-label">بانتظار قرار المراجعة</div><strong>{value(counts?.pendingReview)}</strong><small>من فحوص الآيات التي لم يُحفظ فيها قرار بشري</small></article>{dashboard?.viewer.isReviewer&&<article className="stat-card"><div className="stat-label">قائمة المراجع المستقل</div><strong>{value(dashboard.reviewQueue)}</strong><small>فحوص نشر رسمي لغيرك تنتظر قرارك</small></article>}</div>
  <section className="panel decision-counts" aria-label="فحوصي حسب قرار النموذج">{decisionOrder.map(item=><div key={item} className={'decision-count '+statusTone(item)}><Pill tone={statusTone(item)}>{analysisLabels[item]}</Pill><strong>{value(counts?.[item])}</strong><small dir="ltr">{item}</small></div>)}</section>
  <section className="panel recent-checks" aria-labelledby="recent-heading"><div className="section-head"><div><h2 id="recent-heading">آخر الفحوص</h2><p>آخر خمسة تحليلات حفظتها</p></div><Link href={amanah.history} className="text-link">السجل والمراجعات<ArrowLeft/></Link></div>{dashboard===null?error?null:<div className="workspace-loading"><FileText/><h2>جارٍ تحميل آخر الفحوص…</h2></div>:dashboard.recent.length?<div className="production-review-list">{dashboard.recent.map(check=><CheckRow key={check.id} check={check} href={historyHref(check.id)}/>)}</div>:<Empty title="لا توجد فحوص بعد" body="ابدأ أول تحليل: اختر الآية، وأدخل ترجمتها الإنجليزية، ثم حلّلها." action={newButton}/>}</section>
  <section className="panel about-section workflow-steps" aria-labelledby="workflow-heading"><h2 id="workflow-heading">خطوات التحليل</h2><ol className="clean-list">{workflowSteps.map(step=><li key={step}>{step}</li>)}</ol></section>
 </>;
}
export function AmanahDashboardProduction(){
 const [dashboard,setDashboard]=useState<AmanahDashboard|null>(null);const [status,setStatus]=useState<IntegrationStatus['amanah']|null>(null);const [error,setError]=useState('');const [statusError,setStatusError]=useState('');
 useEffect(()=>{apiFetch<IntegrationStatus>('/api/integrations/status').then(data=>setStatus(data.amanah)).catch(e=>setStatusError((e as Error).message));apiFetch<AmanahDashboard>('/api/amanah/checks?scope=dashboard').then(setDashboard).catch(e=>setError((e as Error).message));},[]);
 return <AmanahDashboardView dashboard={dashboard} status={status} error={error} statusError={statusError}/>;
}

function DecisionRecord({check}:{check:AmanahCheck}){
 const approved=check.reviewStatus==='approved';
 return <div className={approved?'human-decision decision-record approved':'human-decision decision-record'}><div className="human-decision-title">{approved?<CheckCircle2/>:<AlertTriangle/>}<div><h3>{reviewDecisionLabels[check.reviewStatus]}</h3><p>{publicationLabel(check)}</p></div></div><dl><div><dt>المراجع</dt><dd>{check.reviewer?<Person person={check.reviewer}/>:check.reviewerRole?'حساب غير متاح (ربما حُذف)':'غير مسجل في هذا القرار'}</dd></div><div><dt>الدور</dt><dd>{check.reviewerRole?reviewerRoleLabels[check.reviewerRole]:'—'}</dd></div><div><dt>وقت القرار</dt><dd>{formatDate(check.reviewedAt)}</dd></div><div><dt>تجاوز نتيجة حرجة</dt><dd>{check.reviewOverride?'نعم، بتعليل علمي موثق':'لا'}</dd></div></dl><blockquote><small>سبب القرار</small>{check.reviewNote||'—'}</blockquote></div>;
}

// Stored hadith and tafsir checks are read-only: no decision form (the server refuses their approval with 409 CONTENT_TYPE_RETIRED).
function RetiredDecision(){return <div className="human-decision waiting retired-decision"><Info/><div><h3>{retiredContentNotice} · {retiredReadOnly}</h3><p>{retiredContentDetail}</p></div></div>}

type ReviewView='mine'|'queue';
function DecisionPanel({check,from,onDecided}:{check:AmanahCheck;from:ReviewView;onDecided:(update:AmanahReviewUpdate)=>void}){
 const [note,setNote]=useState('');const [sourceConfirmed,setSourceConfirmed]=useState(false);const [terminologyConfirmed,setTerminologyConfirmed]=useState(false);const [instructionsConfirmed,setInstructionsConfirmed]=useState(false);const [override,setOverride]=useState(false);const [saving,setSaving]=useState(false);const [error,setError]=useState('');
 const {request,result}=check;const quran=request.contentType==='quran';const official=request.publicationUse==='official_publication';const independent=from==='queue';const alerts=hasGlossaryAlerts(result);const warnings=hasInstructionWarnings(result);const critical=result.status==='CRITICAL';const audience=audienceLabel(request.audience);
 if(isDemo(check))return <div className="human-decision demo-decision"><Sparkles/><div><h3>هذه تجربة افتراضية</h3><p>يمكن استعراض هذه النتيجة، لكن لا يمكن اعتمادها لأنها افتراضية.</p></div></div>;
 if(!isPending(check))return <DecisionRecord check={check}/>;
 if(isRetiredContentType(request.contentType))return <RetiredDecision/>;
 if(official&&!independent)return <div className="human-decision waiting"><Users/><div><h3>بانتظار مراجع مستقل</h3><p>هذا الفحص للنشر الرسمي، فلا يقرره صاحبه. يظهر في قائمة المراجعين المعتمدين في أمانة، ويُسجل هنا اسم من يقرر ودوره ووقت القرار. يمكنك حذف الفحص من السجل إن لم تعد تحتاجه.</p></div></div>;
 const blockers=[
  needsRecheck(request.contentType,result)?recheckNotice:'',
  result.status==='ABSTAIN'?'امتنع الفحص عن الحكم، فلا تقبل النتيجة الاعتماد. راجع سبب الامتناع ثم أنشئ تحليلًا جديدًا، أو أعد الفحص للتصحيح.':'',
  critical&&!independent?'النتيجة حرجة، ولا يتجاوزها إلا مراجع مستقل غير صاحب الفحص. صحح الترجمة وأعد الفحص، أو أنشئ فحصًا للنشر الرسمي ليراجعه مراجع مستقل.':'',
 ].filter(Boolean);
 const overriding=critical&&independent&&override;const minNote=overriding?LIMITS.overrideNoteMin:LIMITS.reviewNoteMin;const noteLength=note.trim().length;
 const canApprove=!saving&&!blockers.length&&noteLength>=minNote&&sourceConfirmed&&(!alerts||terminologyConfirmed)&&(!warnings||instructionsConfirmed)&&(!critical||overriding);
 async function decide(decision:'approved'|'changes_requested'){setSaving(true);setError('');try{const body={decision,note,sourceConfirmed,...(alerts?{terminologyConfirmed}:{}),...(warnings?{instructionsConfirmed}:{}),...(decision==='approved'&&overriding?{override:true}:{})};const update=await apiFetch<AmanahReviewUpdate>(`/api/amanah/checks/${check.id}/review`,{method:'PATCH',body:JSON.stringify(body)});onDecided(update);}catch(e){setError((e as Error).message);}finally{setSaving(false);}}
 return <div className="human-decision"><div className="human-decision-title"><CheckCircle2/><div><h3>قرار المراجعة</h3><p>{independent?<>مراجعة مستقلة لفحص نشر رسمي أرسله {check.owner?<Person person={check.owner}/>:'مستخدم آخر'}.</>:'مسودة داخلية: تقرر فيها بصفتك صاحب الفحص.'} قارن نص الآية بالترجمة كاملة وراجع الأدلة قبل حفظ القرار.{audience?` الجمهور المستهدف: ${audience}.`:''}</p></div></div>
  {requiresHumanReview(result)&&<p className="decision-hint human-review-hint"><Users/>{result.status==='PASS'?passReviewNote(result):`${analysisStatusMessages[result.status]}.`}</p>}
  {critical&&independent&&<label className="confirmation-check override-check"><input type="checkbox" checked={override} onChange={e=>setOverride(e.target.checked)}/><span><strong>تجاوز النتيجة الحرجة بتعليل علمي</strong>أقر بأني راجعت الملاحظات الحرجة وأن الترجمة مقبولة علميًا، كأن تكون اختيارًا تفسيريًا معتبرًا. يُسجل التجاوز باسمي، ويلزم تعليل لا يقل عن {count(LIMITS.overrideNoteMin)} حرفًا.</span></label>}
  <label>سبب القرار<textarea rows={4} value={note} onChange={e=>setNote(e.target.value)} placeholder={overriding?'اذكر التعليل العلمي للتجاوز: لماذا تُقبل الترجمة رغم النتيجة الحرجة، وإلى أي مرجع رجعت؟':'ما الذي راجعته؟ ولماذا اعتمدت النسخة أو أعدتها للتصحيح؟'} maxLength={LIMITS.reviewNoteMax}/><small className="note-counter">{count(noteLength)} / {arabicCount(minNote,letterCountForms,count)} على الأقل</small></label>
  <label className="confirmation-check"><input type="checkbox" checked={sourceConfirmed} onChange={e=>setSourceConfirmed(e.target.checked)}/><span>{quran?'قارنت الترجمة بنص الآية من المصحف وفتحت مصدرها للتحقق من الموضع.':'فتحت المصدر وتحققت من موضع النص وهوية الإصدار.'}</span></label>
  {alerts&&<label className="confirmation-check terminology-check"><input type="checkbox" checked={terminologyConfirmed} onChange={e=>setTerminologyConfirmed(e.target.checked)}/><span>راجعت تنبيهات «مرجع المصطلحات» وتحققت من المقابلات المعتمدة في قاموس الجمهرة.</span></label>}
  {warnings&&<label className="confirmation-check instructions-check"><input type="checkbox" checked={instructionsConfirmed} onChange={e=>setInstructionsConfirmed(e.target.checked)}/><span>تحققت من العبارات التي تشبه التعليمات أو التزكية في النص المقدم، وأنها جزء مقصود من النص أو ستُحذف قبل النشر، ولا تُعد اعتمادًا للترجمة.</span></label>}
  <div className="decision-actions"><button className="btn primary" disabled={!canApprove} onClick={()=>void decide('approved')}><Check/>{overriding?'اعتماد بتجاوز موثق':'اعتماد هذه النسخة'}</button><button className="btn secondary" disabled={saving||noteLength<LIMITS.reviewNoteMin} onClick={()=>void decide('changes_requested')}><AlertTriangle/>إعادة للتصحيح</button></div>
  {critical&&independent&&!override&&<p className="decision-hint">النتيجة حرجة: لا تُعتمد إلا بتفعيل التجاوز الموثق وكتابة تعليل علمي.</p>}
  {blockers.map(item=><p key={item} className="decision-blocked">{item}</p>)}
  {error&&<p className="decision-blocked" role="alert">{error}</p>}
 </div>;
}

type Deletion={confirming:boolean;busy:boolean;onAsk:()=>void;onCancel:()=>void;onConfirm:()=>void};
// A history row: decision (handoff colours), model outputs, a visible human-review mark while a required review is pending,
// and the retired-type mark for stored hadith/tafsir rows. With `href` (dashboard) the row is a link to the history page.
// `selected`: the check open in the workspace below the list.
function CheckRow({check,onSelect,href,showOwner=false,deletion,selected=false}:{check:AmanahCheck;onSelect?:(check:AmanahCheck)=>void;href?:string;showOwner?:boolean;deletion?:Deletion;selected?:boolean}){
 const language=languageInfo(check.request.targetLanguage);const {result}=check;const retired=isRetiredContentType(check.request.contentType);const reviewNeeded=!retired&&!isDemo(check)&&isPending(check)&&requiresHumanReview(result);const metrics=modelSummary(check);
 const inner=<><span className="soft-icon"><FileText/></span><span><strong>{check.request.title}</strong><small>{contentNames[check.request.contentType]} · {citation(check)} · {language.label} · {publicationUseLabels[check.request.publicationUse]} · {formatDate(check.createdAt)}{showOwner&&check.owner?<> · أرسله <Person person={check.owner}/></>:null}</small>{metrics&&<small className="row-metrics">{metrics}</small>}</span><span className="row-pills"><Pill tone={statusTone(result.status)}>{analysisLabels[result.status]}</Pill>{retired&&<Pill tone="neutral">{retiredContentNotice}</Pill>}{reviewNeeded&&<Pill tone="review">مراجعة بشرية لازمة</Pill>}<Pill tone={check.publicationStatus==='HUMAN_APPROVED'?'green':'neutral'}>{publicationLabel(check)}</Pill></span><ArrowLeft/></>;
 return <div className={['production-review-item',deletion?.confirming?'confirming':'',selected?'selected':''].filter(Boolean).join(' ')}>{href?<Link href={href} className="production-review-row">{inner}</Link>:<button type="button" className="production-review-row" aria-current={selected||undefined} onClick={()=>onSelect?.(check)}>{inner}</button>}{deletion&&<div className="row-delete">{deletion.confirming?<><span role="alert">حذف نهائي للفحص ونتيجته وقرار مراجعته؟</span><button type="button" className="btn danger" disabled={deletion.busy} onClick={deletion.onConfirm}>{deletion.busy?'جارٍ الحذف…':'تأكيد الحذف'}</button><button type="button" className="btn secondary" disabled={deletion.busy} onClick={deletion.onCancel}>إلغاء</button></>:<button type="button" className="row-delete-button" aria-label={`حذف الفحص: ${check.request.title}`} onClick={deletion.onAsk}><X/>حذف</button>}</div>}</div>;
}

type ChecksResponse={checks:AmanahCheck[];viewer?:{isReviewer:boolean}};
// The workspace of the opened check is below the list (up to 100 rows), so opening one from ?id= (the link after an analysis, the
// dashboard's last checks) or from a row would leave it off-screen. Used as the ref of the workspace, which is keyed by the check, so
// it runs each time another check opens: scrolls the workspace into view and moves focus to it.
function revealWorkspace(element:HTMLElement|null){
 if(!element)return;
 const reveal=()=>{let reduced=false;try{reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;}catch{}element.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});element.focus({preventScroll:true});};
 if(typeof requestAnimationFrame==='function')requestAnimationFrame(reveal);else reveal();
}
type ReviewFilter='all'|'pending'|'approved'|'changes';
const filterMatches=(check:AmanahCheck,filter:ReviewFilter)=>filter==='all'||(filter==='pending'&&awaitsDecision(check))||(filter==='approved'&&check.reviewStatus==='approved')||(filter==='changes'&&check.reviewStatus==='changes_requested');
export function AmanahReviewsProduction(){
 const [checks,setChecks]=useState<AmanahCheck[]>([]);const [queue,setQueue]=useState<AmanahCheck[]>([]);const [isReviewer,setIsReviewer]=useState(false);const [view,setView]=useState<ReviewView>('mine');const [selected,setSelected]=useState<{check:AmanahCheck;from:ReviewView}|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [filter,setFilter]=useState<ReviewFilter>('all');const [confirmDelete,setConfirmDelete]=useState('');const [deleting,setDeleting]=useState(false);const [exporting,setExporting]=useState(false);
 useEffect(()=>{let active=true;(async()=>{try{const data=await apiFetch<ChecksResponse>('/api/amanah/checks');if(!active)return;setChecks(data.checks);const reviewer=Boolean(data.viewer?.isReviewer);setIsReviewer(reviewer);let review:AmanahCheck[]=[];if(reviewer){try{review=(await apiFetch<ChecksResponse>('/api/amanah/checks?scope=review')).checks;if(active)setQueue(review);}catch(e){if(active)setError((e as Error).message);}}if(!active)return;const id=new URLSearchParams(location.search).get('id');const own=id?data.checks.find(item=>item.id===id):undefined;const queued=id?review.find(item=>item.id===id):undefined;if(own)setSelected({check:own,from:'mine'});else if(queued){setSelected({check:queued,from:'queue'});setView('queue');}}catch(e){if(active)setError((e as Error).message);}finally{if(active)setLoading(false);}})();return()=>{active=false}},[]);
 function selectCheck(check:AmanahCheck|null,from:ReviewView=view){setSelected(check?{check,from}:null);setError('');}
 function applyUpdate(update:AmanahReviewUpdate){const merge=(item:AmanahCheck)=>item.id===update.id?{...item,...update}:item;setChecks(items=>items.map(merge));setQueue(items=>items.map(merge));setSelected(current=>current&&current.check.id===update.id?{...current,check:{...current.check,...update}}:current);}
 async function remove(check:AmanahCheck){setDeleting(true);setError('');try{await apiFetch<{id:string;deleted:boolean}>(`/api/amanah/checks/${check.id}`,{method:'DELETE'});setChecks(items=>items.filter(item=>item.id!==check.id));setQueue(items=>items.filter(item=>item.id!==check.id));setSelected(current=>current?.check.id===check.id?null:current);setConfirmDelete('');}catch(e){setError((e as Error).message);}finally{setDeleting(false);}}
 // The list shows the latest 100 checks; the export asks for every own check (scope=export).
 async function exportAll(){setExporting(true);setError('');try{const data=await apiFetch<ChecksResponse>('/api/amanah/checks?scope=export');const exportedAt=new Date().toISOString();downloadFile(`amanah-checks-${exportedAt.slice(0,10)}.json`,JSON.stringify(amanahAccountExport(data.checks,exportedAt),null,2),'application/json;charset=utf-8');}catch(e){setError((e as Error).message);}finally{setExporting(false);}}
 const visible=useMemo(()=>checks.filter(check=>filterMatches(check,filter)),[checks,filter]);
 const pendingQueue=queue.filter(isPending).length;
 return <><PageHeading eyebrow="أمانة · السجل والمراجعات" title="سجل تحليلاتك وقرارات مراجعتها." description="يُحفظ كل تحليل هنا تلقائيًا. افتح أي فحص لترى نص الآية والترجمة كاملة وقرار النموذج والأدلة، ثم وثّق قرارك." action={<><button type="button" className="btn secondary" disabled={loading||exporting||!checks.length} onClick={()=>void exportAll()}><Download/>{exporting?'جارٍ تجهيز الملف…':'تصدير جميع فحوصي'}</button><Link href={amanah.newAnalysis} className="btn primary"><Plus/>تحليل جديد</Link></>}/>
 {isReviewer&&<div className="review-view-switch" role="tablist" aria-label="نوع القائمة"><button role="tab" aria-selected={view==='mine'} className={view==='mine'?'active':''} onClick={()=>setView('mine')}><FileText/>فحوصي<span>{count(checks.length)}</span></button><button role="tab" aria-selected={view==='queue'} className={view==='queue'?'active':''} onClick={()=>setView('queue')}><Users/>قائمة المراجع المستقل<span>{count(pendingQueue)}</span></button></div>}
 {view==='queue'?<>
  <div className="notice"><Users/><span>فحوص «نشر رسمي» أرسلها مستخدمون آخرون وتنتظر قرار مراجع مستقل. لا تظهر هنا فحوصك ولا المسودات الداخلية. للنتيجة الحرجة يمكنك التجاوز بتعليل علمي موثق.</span></div>
  {loading?<div className="workspace-loading"><FileText/><h2>جارٍ تحميل قائمة المراجعة…</h2></div>:queue.length?<div className="panel production-review-list">{queue.map(check=><CheckRow key={check.id} check={check} showOwner selected={selected?.check.id===check.id} onSelect={item=>selectCheck(item,'queue')}/>)}</div>:<Empty title="لا توجد فحوص بانتظار مراجعتك" body="ستظهر هنا فحوص النشر الرسمي التي يرسلها غيرك."/>}
 </>:<>
  <div className="review-filter" role="tablist">{([['all','الكل'],['pending','بانتظار قرار'],['approved','معتمد بشريًا'],['changes','مطلوب تصحيح']] as const).map(([id,label])=><button role="tab" aria-selected={filter===id} className={filter===id?'active':''} onClick={()=>setFilter(id)} key={id}>{label}<span>{count(checks.filter(check=>filterMatches(check,id)).length)}</span></button>)}</div>
  {loading?<div className="workspace-loading"><FileText/><h2>جارٍ تحميل سجل أمانة…</h2></div>:visible.length?<div className="panel production-review-list">{visible.map(check=><CheckRow key={check.id} check={check} selected={selected?.check.id===check.id} onSelect={item=>selectCheck(item,'mine')} deletion={{confirming:confirmDelete===check.id,busy:deleting,onAsk:()=>setConfirmDelete(check.id),onCancel:()=>setConfirmDelete(''),onConfirm:()=>void remove(check)}}/>)}</div>:<Empty title="لا توجد فحوص في هذه الحالة" body="ابدأ تحليلًا جديدًا، أو اختر «الكل» لعرض جميع فحوصك." action={<Link href={amanah.newAnalysis} className="btn primary"><Plus/>تحليل جديد</Link>}/>}
 </>}
 {error&&<div className="notice warning" role="alert"><AlertTriangle/><span>{error}</span></div>}
 {selected&&<section key={`${selected.from}:${selected.check.id}`} ref={revealWorkspace} tabIndex={-1} className="review-workspace" aria-label={`تفاصيل الفحص: ${selected.check.request.title}`}><div className="review-workspace-head"><div><span className="eyebrow">{selected.from==='queue'?'مراجعة مستقلة · نشر رسمي':'مراجعة النسخة المحفوظة'}</span><h2>{selected.check.request.title}</h2><p>{citation(selected.check)}{selected.from==='queue'&&selected.check.owner?<> · أرسله <Person person={selected.check.owner}/></>:null}</p></div><button className="icon-button bordered" aria-label="إغلاق تفاصيل الفحص" onClick={()=>selectCheck(null)}>×</button></div><AnalysisResult check={selected.check} context="review"/><DecisionPanel key={selected.check.id} check={selected.check} from={selected.from} onDecided={applyUpdate}/></section>}
 </>;
}

type ReferenceUse='used'|'manual'|'planned';
const referenceUseLabels:Record<ReferenceUse,string>={used:'مستخدم في الفحص',manual:'مرجع للتحقق اليدوي',planned:'مخطط له'};
const referenceUseTone:Record<ReferenceUse,string>={used:'green',manual:'neutral',planned:'amber'};
// The approved references of the challenge's «المرجعية والحزمة العلمية» (R-07..R-15), and how Amanah uses each one today.
const references:{domain:string;reference:string;links:VerseLink[];use:ReferenceUse;how:string}[]=[
 {domain:'القرآن الكريم · النص',reference:'النص القرآني بالرسم والنص المعتمد',links:[{label:'tanzil.net',url:'https://tanzil.net/'}],use:'used',how:'نص مشروع Tanzil 1.1 مضمّن في أمانة: يُضاف نص الآية بالرسم العثماني (رواية حفص) تلقائيًا عند اختيارها، فيُعرض ويُرسل إلى نموذج أمانة، ويُستعمل النص الإملائي غير المشكَّل (Simple Clean) للمطابقة. ولكل آية رابط تحقق في Tanzil.'},
 {domain:'القرآن الكريم · التحقق من الآية',reference:'المصحف الإلكتروني بجامعة الملك سعود (الآية مع تفسير ابن كثير)',links:[{label:'quran.ksu.edu.sa',url:'https://quran.ksu.edu.sa/'}],use:'manual',how:'رابط مساعد لكل آية في النتيجة والأدلة، تُحقق من صيغته بفتحه. ليس من قائمة المرجعية، ويُستعمل للتحقق اليدوي فقط.'},
 {domain:'القرآن الكريم · الترجمات المعتمدة',reference:'ترجمات مجمع الملك فهد أو الواردة في quranpedia.net',links:[{label:'quranpedia.net',url:'https://quranpedia.net/'}],use:'planned',how:'لم تُضمَّن ترجمة معتمدة بعد للمقارنة الآلية لأنها تحتاج إذن الناشر؛ يقارن المراجع بها يدويًا حتى ذلك الحين.'},
 {domain:'التفسير',reference:'مصادر القرون الثلاثة الأولى، أو الدرر السنية · التفسير',links:[{label:'dorar.net/tafseer',url:'https://dorar.net/tafseer'}],use:'manual',how:'يرجع إليه المراجع لفهم معنى الآية وتمييز كلام المفسر من نص الآية.'},
 {domain:'الحديث النبوي',reference:'الصحيحان وكتب السنة بعد التحقق: الدرر السنية · الحديث، والطبعات المعتمدة في المكتبة الشاملة',links:[{label:'dorar.net/hadith',url:'https://dorar.net/hadith'},{label:'shamela.ws',url:'https://shamela.ws/'}],use:'manual',how:'يرجع إليه المراجع عند ورود حديث في سياق الآية؛ أمانة تفحص ترجمات الآيات فقط.'},
 {domain:'العقيدة والتعريف بالإسلام',reference:'مصادر القرون الثلاثة الأولى، أو الدرر السنية · العقيدة',links:[{label:'dorar.net/aqeeda',url:'https://dorar.net/aqeeda'}],use:'manual',how:'لا تصدر أمانة أحكامًا عقدية؛ يرجع إليه المراجع عند تقدير معنى الترجمة.'},
 {domain:'الفقه العام',reference:'كتاب معتمد في أحد المذاهب الأربعة، أو الدرر السنية · الفقه',links:[{label:'dorar.net/feqhia',url:'https://dorar.net/feqhia'}],use:'manual',how:'لا تصدر أمانة فتوى ولا ترجيحًا فقهيًا، وتُرفض أسئلة الفتوى الشخصية مع الإحالة إلى جهة إفتاء معتمدة.'},
 {domain:'السيرة والتاريخ',reference:'مصادر القرون الثلاثة الأولى، أو الدرر السنية · التاريخ',links:[{label:'dorar.net/history',url:'https://dorar.net/history'}],use:'manual',how:'خارج نطاق الفحص الآلي؛ مرجع للتحقق اليدوي.'},
 {domain:'الموضوعات الدعوية',reference:'المستودع الدعوي الرقمي، وموسوعة الجمهرة',links:[{label:'dawa.center',url:'https://dawa.center/'},{label:'islamic-content.com',url:'https://islamic-content.com/'}],use:'manual',how:'مرجعان شاملان للمراجع؛ خارج نطاق الفحص الآلي.'},
 {domain:'الشبهات والأسئلة المتكررة',reference:'«بينات: أسئلة وأجوبة عن الإسلام»',links:[{label:'dawa.center/file/7937',url:'https://dawa.center/file/7937'}],use:'manual',how:'أمانة لا تجيب عن الأسئلة؛ مرجع للمراجع عند الحاجة.'},
 {domain:'الترجمة والمصطلحات',reference:'موسوعة الجمهرة · مفردات المحتوى الإسلامي',links:[{label:'islamic-content.com/dictionary',url:'https://islamic-content.com/dictionary'}],use:'used',how:'نماذج المصطلحات العشرة في المرجعية (الإسلام، التوحيد، العبادة، النبوة، الوحي، الشريعة، الحديث، السنة، الفتوى، الدعوة) مضمّنة في أمانة: تظهر في «مرجع المصطلحات» مع تنبيه على المقابلات المختزلة، ويلزم تأكيدها قبل الاعتماد.'},
];
// The only source type of the measured scope (v0.2, as v0.1 before it; B3): hadith and tafsir are removed from the product until the model supports them.
export function AmanahSourcesProduction(){const sources=[{id:'quran',title:'القرآن الكريم',fields:'اختر السورة والآية، أو اكتب رقمها مثل 2:256',rule:'يُضاف نص الآية الموثّق بالرسم العثماني من مشروع Tanzil 1.1 (رواية حفص) تلقائيًا ولا يُكتب يدويًا، ثم يُرسل مع الترجمة الإنجليزية إلى نموذج أمانة.',state:`متاح · ${measuredScopeBadge}`,tone:'green'}];return <><PageHeading eyebrow="أمانة · المصادر" title="مصدر النص موثّق قبل التحليل." description="تُحلَّل ترجمة الآية مقابل نصها من المصحف، وتُراجع المصطلحات في المراجع المعتمدة."/><div className="adapter-grid">{sources.map((source,index)=><article className="panel adapter-card" key={source.id}><div><span>{String(index+1).padStart(2,'0')}</span><BookOpen/></div><h2>{source.title}</h2><dl><div><dt>البيانات المطلوبة</dt><dd>{source.fields}</dd></div><div><dt>حالة الفحص</dt><dd>{source.rule}</dd></div></dl><Pill tone={source.tone}>{source.state}</Pill></article>)}</div>
 <section className="panel reference-table"><div className="section-title"><div><h2>المرجعية العلمية المعتمدة</h2><p>مصادر وثيقة «المرجعية والحزمة العلمية» لكل مجال، وكيف تستخدمها أمانة اليوم.</p></div></div><table><thead><tr><th scope="col">المجال</th><th scope="col">المرجع</th><th scope="col">الرابط</th><th scope="col">استخدام أمانة</th></tr></thead><tbody>{references.map(item=><tr key={item.domain}><th scope="row">{item.domain}</th><td data-label="المرجع">{item.reference}</td><td data-label="الرابط">{item.links.map(link=><a key={link.url} href={link.url} target="_blank" rel="noreferrer" dir="ltr">{link.label}</a>)}</td><td data-label="استخدام أمانة"><Pill tone={referenceUseTone[item.use]}>{referenceUseLabels[item.use]}</Pill><p>{item.how}</p></td></tr>)}</tbody></table></section>
 <section className="panel source-policy"><ShieldCheck/><div><h2>تحقق من المصدر</h2><p>افتح الآية في Tanzil أو في المصحف الإلكتروني بجامعة الملك سعود قبل الاعتماد، وراجع المصطلحات الشرعية في قاموس الجمهرة.</p></div><Link href={amanah.newAnalysis} className="btn secondary">تحليل جديد<ArrowLeft/></Link></section></>}

// How to read a result: the handoff wording of each decision, and what each model output means.
const statusGuidance:Record<AnalysisStatus,string>={PASS:`${passNotCertification} يبقى قرار النشر لصاحب المسودة أو لمراجع مستقل.`,REVIEW:'رصد النموذج انحرافًا محتملًا؛ راجع نوع الانحراف ومواضعه في النص والترجمة قبل القرار.',CRITICAL:'رصد النموذج انحرافًا عالي الأثر. لا تُعتمد إلا بتجاوز موثق من مراجع مستقل مع تعليل علمي.',ABSTAIN:'لم يصدر حكم آلي آمن: امتنع النموذج، أو اللغة خارج النطاق، أو تعذر الوصول إلى النموذج أو انتهت المهلة (وقد يكون في وضع السكون). لا تُعتمد، ويلزم مراجعة بشرية كاملة.'};
const resultFields=[['قرار النموذج','PASS أو REVIEW أو CRITICAL أو ABSTAIN، كما أصدره نموذج أمانة دون تعديل.'],['نوع الانحراف','مثل الحذف أو انقلاب النفي أو سقوط الشرط، مع موضعه في النص والترجمة إن حدده النموذج.'],['درجة الخطورة','من S0 (منخفضة) إلى S3 (حرجة).'],['ثقة النموذج','ثقة النموذج في قراره كما أعادها، نسبةً مئوية.'],['مؤشر سلامة المعنى','من 0 إلى 100 كما أعاده النموذج.'],['حالة المرجع','هل طابق النص العربي المرسل مرجع النموذج للآية.'],['الشرح','يكتبه نموذج لغوي كبير بعد القرار، ولا يغيّر أيًّا مما سبق.']] as const;
export function AmanahBenchmarkProduction(){return <><PageHeading eyebrow="أمانة · قراءة النتائج" title="افهم النتيجة قبل استخدامها." description="تعرض أمانة قرار نموذج أمانة كما صدر، لتساعدك على تحديد الخطوة التالية."/><div className="benchmark-status-grid">{decisionOrder.map(status=><article className={'panel status-guide '+statusTone(status)} key={status}><Pill tone={statusTone(status)}>{analysisLabels[status]}</Pill><h3><bdi dir="ltr">{status}</bdi> · {analysisStatusMessages[status]}</h3><p>{statusGuidance[status]}</p></article>)}</div><section className="panel about-section" aria-labelledby="result-fields"><h2 id="result-fields">ما الذي تعرضه النتيجة</h2><ul className="clean-list">{resultFields.map(([title,body])=><li key={title}><strong>{title}: </strong>{body}</li>)}</ul></section><AiDisclosure/><section className="panel source-policy"><Scale/><div><h2>قبل الاعتماد</h2><p>راجع نص الآية والترجمة كاملة والمصدر. الشرح المولد لا يغيّر القرار، وملاحظات المصطلحات للاسترشاد. لا تعتمد نتيجة غير محسومة أو نتيجة لا تكفي أدلتها.</p></div><Link href={amanah.newAnalysis} className="btn secondary">تحليل جديد<ArrowLeft/></Link></section></>}
