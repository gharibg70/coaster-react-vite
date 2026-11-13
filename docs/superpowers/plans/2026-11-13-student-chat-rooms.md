# خطة تنفيذ غرف دردشة الشباب والبنات

> **للعاملين الوكلاء:** يُنفّذ كل جزء باختبارات قبل/بعد، ويُراجع نطاق SQL قبل النشر. تُستخدم مربعات الاختيار لتتبّع التنفيذ.

**الهدف:** فصل الدردشة إلى غرفة للشباب وأخرى للبنات بحسب `profiles.group_type`، مع تمكين المشرف من مشاهدة كل غرفة والكتابة فيها دون خلط الرسائل.

**المعمارية:** يضيف ترحيل لاحق حقل `room_group` وسياسات RLS وRPCs تتحقق من مجموعة الطالب أو دور المشرف. يُعاد استخدام مكوّن الدردشة مع وسيط غرفة صريح وتصفية Realtime؛ الطالب يحصل على مجموعته من الملف الشخصي، بينما يختار المشرف غرفة واحدة من تبويبين ويشارك فيها.

**التقنيات:** React 18، Supabase JS v2/Postgres RPC/RLS/Realtime، Node.js tests، PGlite.

**المواصفات:** `docs/superpowers/specs/2026-11-13-student-chat-rooms.md`

## قيود عامة

- الغرفتان فقط: `boys` و`girls`، ومصدر تعيين الطالب `profiles.group_type`؛ لا يختار العميل مجموعة الطالب.
- قاعدة البيانات تمنع الطالب من قراءة أو إرسال رسائل للمجموعة الأخرى، وتسمح للمشرف بالغرفتين.
- المشرف يرسل رسائل منفصلة لكل غرفة، وتُعرض رسالته بعلامة/اسم إداري؛ لا إرسال مزدوج.
- يبقى حد الرسالة 500 محرف Unicode، وحد الإرسال رسائل كل ثانيتين للحساب عبر الغرفتين، وسجل العرض 100 رسالة.
- الرسائل القديمة تُصنّف من هوية المؤلف الخاصة ومجموعة ملفه؛ الرسائل التي يتعذر تصنيفها تبقى محفوظة وغير مرئية في الغرفتين.
- لا يُطبّق SQL على Supabase ضمن هذه المهمة. على قاعدة جديدة يلزم الترحيل الأساسي ثم ترحيل الغرف بالترتيب؛ على قاعدة مطبقة سابقًا يكفي الترحيل اللاحق.
- النشر المصرح به للمستودع الجديد `gharibg70/coaster-react-vite` فقط؛ يبقى `gharibg70/coaster` دون تعديل.

## نقاط المراجعة

- طالب مجموعة `boys` يحاول قراءة أو إرسال `girls` بتغيير طلب RPC أو query: يجب أن يُرفض خادميًا.
- طالب بلا `group_type` أو بقيمة غير معروفة: لا يظهر له اختيار الغرفة ولا يستطيع استدعاء الغرفة.
- مشرف يدخل غرفة ثم يبدل إلى الأخرى: تُغلق القناة القديمة وتُرفض أي استجابة متأخرة أو رسالة من الغرفة السابقة.
- إرسال المشرف في غرفة واحدة لا يظهر إلا في تلك الغرفة؛ ويكون حساب معدل الإرسال مشتركًا بين الغرفتين.
- البلاغات وقائمة الحذف مقيدة بغرفة الإدارة المحددة؛ هوية المبلّغ لا تُعرض.
- الرسائل القديمة التي لا يمكن ربطها بمجموعة تظل محفوظة لكنها غير مرئية ولا تُنسب اعتباطيًا لأي غرفة.

---

### المهمة 1: ترحيل غرفتين مع سياسات قاعدة بيانات واختبارات PGlite

**الملفات:** إنشاء `supabase/migrations/20261113_student_chat_rooms.sql`؛ تعديل `tests/chatDatabase.test.js` و`tests/chatPolicy.test.js`.

**العقود:** `chat_room_access(p_room text) -> boolean`; `send_chat_room_message(p_room text,p_body text) -> {id,room_group,display_name,is_admin,body,created_at}`; `admin_list_student_chat_reports(p_room text,p_limit integer default 100)`؛ `admin_delete_student_chat_message(p_message_id uuid,p_room text)`.

- [ ] أضف اختبارات فاشلة باسم `student_chat_room_rls_hides_other_group_messages` و`chat_room_access_is_group_bound_and_admin_has_both_rooms` و`send_chat_room_message_cannot_cross_groups` و`admin_can_post_to_each_room_independently` و`unclassified_legacy_messages_are_quarantined` و`reports_and_deletes_are_room_scoped`.
- [ ] طبّق الترحيل الأساسي في PGlite، أنشئ رسائل قديمة لمؤلفين من المجموعتين ورسالة غير قابلة للتصنيف، ثم طبّق ترحيل الغرف وتحقق من الإسناد/العزل.
- [ ] أضف `room_group` و`is_admin` بأمان وبشكل قابل لإعادة التطبيق؛ صنّف الرسائل القديمة القابلة للتحديد، واترك غير القابلة للتحديد غير مرئية.
- [ ] حدّث RLS وRPCs لتتحقق من `profiles.group_type`، واسمح للمشرف بالغرفتين، واحذف/عطّل توقيعات RPC القديمة التي تسمح بمسار إرسال مشترك.
- [ ] قيد البلاغات والحذف حسب الغرفة، مع الحفاظ على سقف 100 للبلاغات ومنع قراءة جداول هوية المؤلف والمبلّغ.
- [ ] شغّل `node --test tests/chatDatabase.test.js tests/chatPolicy.test.js` وتأكد من نجاح الحالات الجديدة والقديمة.

### المهمة 2: خدمة الدردشة وواجهة الطالب/المشرف

**الملفات:** تعديل `src/features/chat/chatService.js` و`src/features/chat/ChatPanel.jsx`؛ تعديل `tests/chatValidation.test.js` و`tests/chatRealtime.test.js`، وتعديل `src/features/student/StudentView.jsx`.

**العقود:** `isChatRoom(value)` يتحقق من الغرفتين؛ `checkChatRoomAccess(room)`؛ `listMessages(room,limit=100)`؛ `sendMessage(room,body)`؛ `subscribeToMessages(room,onMessage,onError,onSubscribed)`؛ `reportMessage(room,messageId,reason)` عبر RPC `report_student_chat_room_message` (تتحقق قاعدة البيانات من أن البلاغ ضمن مجموعة الطالب).

- [ ] أضف اختبارات `validates_chat_room_values` و`rejects_message_from_other_room` و`realtime_subscription_filters_by_room`.
- [ ] مرّر `profile.group_type` للطالب واعرض غرفة واحدة فقط بعنوانها؛ اعرض حالة واضحة عند غياب مجموعة صالحة.
- [ ] أعد استخدام `ChatPanel` مع `room` و`isAdmin`؛ امسح حالة السجل وألغِ Realtime والطلبات المتأخرة عند تغيير الغرفة أو فقد الإذن.
- [ ] أخفِ أزرار الإبلاغ في وضع المشرف، وميّز رسائل المشرف بوسم واضح؛ لا تغيّر حماية 30 ثانية، حد النص، أو وصول الطالب.
- [ ] شغّل اختبارات الدردشة و`npm run build`.

### المهمة 3: تبويبا المشرف، بلاغات منفصلة، ووثائق الإعداد

**الملفات:** تعديل `src/features/chat/ChatModeration.jsx` و`src/features/chat/chatModerationService.js` و`src/features/admin/AdminView.jsx` و`README.md`؛ تحديث مواصفات الدردشة الحالية.

**العقود:** `listReportedMessages(room,limit=100)`؛ `deleteReportedMessage(room,messageId)`؛ تُسقط الخدمة أي نتيجة بلاغ لا تطابق الغرفة المحددة، وتبطل الاستجابات القديمة عند تبديل الغرفة؛ غرفة المشرف الحالية واحدة فقط، وترتبط بها الدردشة والبلاغات.

- [ ] أضف مفتاح غرفة accessible بعنواني «الشباب» و«البنات»؛ اربط به سجل الرسائل والإرسال وقائمة البلاغات كلها.
- [ ] مرّر `room_group` لكل RPC إداري، واطلب تأكيد الحذف ثم حدّث بلاغات الغرفة نفسها.
- [ ] وثّق مصدر `profiles.group_type`، ترتيب الترحيلين، إعادة تصنيف الرسائل القديمة، وبقاء Supabase دون تعديل حتى موافقة المستخدم.
- [ ] شغّل `npm test` و`GITHUB_ACTIONS=true npm run build` و`git diff --check`.

### المهمة 4: مراجعة أمنية ونشر

- [ ] راجع SQL والسياسات والـRPCs وعقود Realtime ولاحظ عدم ظهور معرّفات المستخدمين.
- [ ] احصل على مراجعة مستقلة للتأكد من إغلاق قنوات الغرفة القديمة وعدم وجود وصول عابر للمجموعات.
- [ ] تأكد أن أي SQL لم يُطبّق، وأن الحزمة لا تحتوي service-role secrets.
- [ ] انشر إلى `publish` / `gharibg70/coaster-react-vite` فقط بعد نجاح الاختبارات والبناء.
- [ ] تحقق من نجاح GitHub Actions ومن الاستجابة الحية للصفحة وحزمة الدردشة.
- [ ] سلّم رابط الموقع، واذكر أن المجموعتين تحتاجان الترحيل اليدوي لتفعيل العزل خادميًا.
