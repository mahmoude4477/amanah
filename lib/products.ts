// 'dashboard' is /amanah, 'new' the analysis form at /amanah/new, 'reviews' the history and reviews page. 'verify' is the former name of 'new'.
export type AmanahPage = 'dashboard' | 'new' | 'verify' | 'reviews' | 'sources' | 'settings' | 'about' | 'benchmarks';

export const amanah = {
  name: 'أمانة', home: '/amanah', newAnalysis: '/amanah/new', history: '/amanah/reviews', privacy: '/privacy',
  tagline: 'لصون المعنى', description: 'فحص الترجمة ومراجعة الدليل',
} as const;

export const pageNames: Record<AmanahPage, string> = {
  dashboard: 'لوحة المتابعة', new: 'تحليل جديد', verify: 'تحليل جديد', reviews: 'السجل والمراجعات', sources: 'مكتبة المصادر',
  settings: 'حالة الخدمة', about: 'عن التطبيق', benchmarks: 'قراءة النتائج',
};

// Shared wording for the AI disclosure (R-22) and the scope notice (R-02, R-06). The server's referral for a personal fatwa request is
// PERSONAL_FATWA_REFERRAL in app/api/amanah/checks/input-scope.ts, shown to the user as the API error message.
export const explanationModelName = 'Cloudflare Workers AI · Llama 3.3 70B';
export const aiDisclosure = `أمانة أداة مدعومة بالذكاء الاصطناعي: يصدر قرار الفحص نموذج أمانة للتعلم الآلي (AMANAH ML)، ويكتب الشرح نموذج لغوي كبير (${explanationModelName}). قد يخطئ كلاهما، ولا يغني أيّ منهما عن مراجع مؤهل.`;
// Per-result wording when the AMANAH model did not decide (see decisionSource and resultDisclosure in components/amanah-ui.tsx).
// partnerDisclosure is kept for stored checks of the former partner engine (tafsir, and Qur'an before the AMANAH model), which is no longer called.
export const partnerDisclosure = 'أصدر هذه النتيجة محرك تحليل خارجي (شريك) كان يهيّئه مشغّل التطبيق قبل ربط نموذج أمانة، لا نموذج أمانة؛ وملخصه وشروحه نص قد يكون مولّدًا آليًا. قد يخطئ، ولا يغني عن مراجع مؤهل.';
export const legacyLlmDisclosure = 'أصدر هذه النتيجة نموذج لغوي كبير قبل ربط نموذج أمانة؛ فحالتها وشرحها مولّدان آليًا، وليست قرار نموذج أمانة. لا تُعتمد قبل إعادة الفحص.';
// The same for a stored hadith or tafsir row: it can be neither re-checked nor approved, so no re-check is offered.
export const retiredLlmDisclosure = 'أصدر هذه النتيجة نموذج لغوي كبير قبل ربط نموذج أمانة؛ فحالتها وشرحها مولّدان آليًا، وليست قرار نموذج أمانة. وهي محفوظة للاطلاع فقط ولا تُعتمد.';
export const noDecisionDisclosure = 'لم يصدر في هذا الفحص حكم آلي: امتنع قبل استدعاء أي نموذج تحليل، عند التحقق من المصدر أو من نوع المحتوى.';
export const mlNoDecisionDisclosure = 'لم يصدر نموذج أمانة حكمًا في هذا الفحص: لغة الترجمة خارج نطاقه، أو تعذر الوصول إليه، أو انتهت المهلة (وقد يكون في وضع السكون)، أو جاءت استجابته غير صالحة؛ ولم يُكتب شرح آلي. يلزم مراجعة بشرية كاملة.';
// Every new check is saved with its result, before any human decision (the confirmation shown after an analysis).
export const savedToHistory = 'حُفظ في السجل';
// Measured scope of the AMANAH model v0.2 (team handoff of 4 October 2026, unchanged from v0.1): Qur'an only, Arabic → English. Hadith and tafsir checks are no longer created.
export const quranSourceName = 'القرآن الكريم';
// The arrow is U+2190: arrows are not mirrored in right-to-left text, so «←» is what reads as Arabic to English on screen.
export const measuredScopeBadge = 'النسخة المقاسة v0.2 · العربية ← الإنجليزية';
export const outOfMeasuredScope = 'خارج نطاق النسخة المقاسة';
// Stored hadith and tafsir checks stay listed and readable, but are never approved (the server answers 409 CONTENT_TYPE_RETIRED).
export const retiredContentNotice = 'نوع غير متاح حاليًا';
// Their state while no decision was saved: no reviewer can decide them, so they are never shown as awaiting one.
export const retiredReadOnly = 'للاطلاع فقط';
export const retiredContentDetail = 'فحوص الحديث والتفسير محفوظة في السجل للاطلاع فقط ولا تُعتمد؛ المتاح حاليًا هو القرآن الكريم فقط. يستطيع صاحب الفحص حذفه من السجل.';
// The model endpoint scales to zero when idle (Hugging Face Inference Endpoints), so the first check after a pause waits for it to wake.
// Measured live (3 October 2026): cold starts of about 127 and 155 s, warm answers within 2 s; the server waits up to 240 s by default.
export const coldStartNotice = 'قد يستغرق أول تحليل بعد فترة خمول من دقيقتين إلى أربع دقائق، لأن النموذج يستيقظ من وضع السكون؛ أما التحليلات التالية فتستغرق ثوانيَ.';
// Shown while a check is still waiting after the first seconds: the page never gives up on its own, so it must stay open.
export const coldStartWaitingNotice = 'لم يصل الرد بعد، فالأرجح أن النموذج يستيقظ الآن، وقد يستغرق ذلك دقيقتين أو ثلاثًا. أبقِ هذه الصفحة مفتوحة ولا تُعد الإرسال: ستظهر النتيجة هنا حين يجيب النموذج، وإن لم يجب خلال مهلة الخادم ظهرت نتيجة «تعذّر الحكم» مع سببها.';
// Where the AMANAH model runs (team handoff). The server calls it; the browser never sees its address or token.
export const mlProcessorName = 'Hugging Face Inference Endpoints';
// A PASS is a screening result of this analysis only (handoff UI mapping), never a certification.
export const passNotCertification = 'نتيجة فحص آلي لهذا التحليل فقط، وليست شهادة بصحة الترجمة ولا اعتمادًا شرعيًا.';
export const scopeNotice = 'أمانة أداة لمراجعة الترجمات، لا تصدر فتاوى ولا تحكم على الأشخاص أو الجماعات، ولا تجيب عن الأسئلة أو الحالات الشخصية؛ للفتوى ارجع إلى جهة إفتاء معتمدة أو مختص مؤهل.';
