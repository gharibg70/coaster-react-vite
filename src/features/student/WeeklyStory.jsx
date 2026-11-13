import { useEffect, useState } from 'react';
import { loadWeeklySeatHistory } from './forecastService.js';
import { baghdadDateString, summarizeWeek } from './forecastUtils.js';

/** Seven-day identity-free story derived only from get_seats aggregate results. */
export default function WeeklyStory({ routeId }) {
  const [state, setState] = useState({ loading: true, records: [], error: false });
  useEffect(() => {
    let active = true;
    if (!routeId) { setState({ loading: false, records: [], error: false }); return () => { active = false; }; }
    setState({ loading: true, records: [], error: false });
    loadWeeklySeatHistory(routeId)
      .then((records) => { if (active) setState({ loading: false, records, error: false }); })
      .catch(() => { if (active) setState({ loading: false, records: [], error: true }); });
    return () => { active = false; };
  }, [routeId]);

  const summary = summarizeWeek(state.records, baghdadDateString());
  const total = summary.totals.outbound + summary.totals.return;
  const hasData = state.records.some((row) => Number.isFinite(row.capacity) && row.capacity > 0);
  let story = 'بيانات غير كافية';
  if (hasData && total === 0) story = 'لم تُسجّل حجوزات للرحلات خلال الأيام السبعة الأخيرة.';
  else if (total > 0) {
    const direction = summary.busiestDirection === 'outbound' ? 'الذهاب' : summary.busiestDirection === 'return' ? 'العودة' : 'الذهاب والعودة بالتساوي';
    story = `خلال الأيام السبعة الأخيرة، سُجّلت ${total} مقاعد مشغولة إجمالاً. كان ${direction} الأكثر إشغالاً، وبلغ أعلى يوم ${summary.busiestDay?.total || 0} مقاعد.`;
  }

  return <section className="card" aria-labelledby="weekly-story-title">
    <h2 id="weekly-story-title">حكاية الأسبوع</h2>
    {state.loading ? <p role="status">جاري إعداد ملخص الأسبوع…</p> : state.error ? <p role="status">تعذر تحميل الملخص الأسبوعي الآن.</p> : <>
      <p>{story}</p>
      <p className="mu">ملخص مجهول لمجاميع المقاعد خلال {summary.startDate} إلى {summary.endDate} (توقيت بغداد)، دون بيانات أو هويات طلاب.</p>
    </>}
  </section>;
}
