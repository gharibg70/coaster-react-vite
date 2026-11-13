# كوستر الجامعة

واجهة ويب عربية لإدارة حجوزات الحافلة الجامعية، مبنية باستخدام React وVite وتتصل بمشروع Supabase الحالي.

## التشغيل المحلي

1. ثبّت Node.js 18 أو أحدث.
2. نفّذ `npm install`.
3. انسخ `.env.example` إلى `.env.local` وأدخل `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY`.
4. شغّل `npm run dev`.

## البناء والنشر

`npm run build` ينشئ الموقع الساكن في `dist/`. عند البناء في GitHub Actions يستخدم Vite المسار `/coaster-react-vite/` الملائم للمستودع الجديد على GitHub Pages؛ أما التشغيل المحلي فيستخدم `/`.

سير العمل `.github/workflows/pages.yml` يهيّئ GitHub Pages عبر Actions ثم يبني وينشر الموقع تلقائيًا عند كل دفع إلى `main`. يتضمن ملف سير العمل عنوان Supabase ومفتاح `publishable` العام فقط ليعمل البناء بلا أسرار Actions؛ لا تضع أبدًا مفتاح `service_role` ضمن ملفات أو متغيرات `VITE_*` لأنها تُضمّن في حزمة المتصفح.

ملفات PWA الثابتة (manifest، service worker والأيقونات) موجودة في `public/`. يستخدم التطبيق عقود الجداول وRPC وEdge Function الموجودة مسبقاً، لذا يلزم استمرار سياسات Supabase كما يتوقع التطبيق الأصلي.
