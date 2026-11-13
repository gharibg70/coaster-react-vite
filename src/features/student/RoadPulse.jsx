import { useEffect, useState } from 'react';
import { estimateRoadPulse, isRoadPulseSetupError, loadRoadPulse, weekdayForServiceDate } from './roadPulseService.js';

const labels = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function formatDuration(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} ساعة و${remainder} دقيقة` : `${hours} ساعة`;
}

export function DirectionEstimate({ direction, estimate, weekday }) {
  const label = direction === 'outbound' ? 'الذهاب' : 'العودة';
  return <div className="road-pulse-direction" aria-label={label}>
    <h3>{label}</h3>
    {estimate.status === 'estimate' ? <>
      <p>الوسيط التاريخي لرحلة يوم {labels[weekday]}: <b>{formatDuration(estimate.medianDurationSeconds)}</b>.</p>
      <p className="mu">وسيط جميع أيام الأسبوع لهذا الاتجاه: {formatDuration(estimate.allWeekMedianDurationSeconds)}. {estimate.differenceSeconds === 0 ? 'مطابق لوسيط الأسبوع.' : estimate.differenceSeconds > 0 ? `أطول بـ ${formatDuration(estimate.differenceSeconds)} من وسيط الأسبوع.` : `أقصر بـ ${formatDuration(-estimate.differenceSeconds)} من وسيط الأسبوع.`}</p>
      <p className="mu">من {estimate.sampleCount} رحلة مكتملة مماثلة. هذا نمط تاريخي فقط؛ لا يعكس حركة المرور الآن ولا يضمن وقت الوصول.</p>
    </> : <p className="mu" role="status" aria-live="polite">نجمع بيانات الرحلات{estimate.status === 'collecting' && Number.isFinite(estimate.sampleCount) && estimate.sampleCount > 0 ? ` · ${estimate.sampleCount}/4 رحلات مماثلة` : ''}.</p>}
  </div>;
}

export function RoadPulseDirections({ samples, weekday }) {
  return <div className="road-pulse-directions">{['outbound', 'return'].map((direction) => <DirectionEstimate key={direction} direction={direction} estimate={estimateRoadPulse(samples, direction, weekday)} weekday={weekday}/>)}</div>;
}

export default function RoadPulse({ serviceDate }) {
  const [samples, setSamples] = useState(null);
  const [loadState, setLoadState] = useState('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadState('loading');
    loadRoadPulse().then((data) => {
      if (active) { setSamples(data); setLoadState('ready'); }
    }).catch((error) => {
      if (active) { setSamples(null); setLoadState(isRoadPulseSetupError(error) ? 'setup' : 'error'); }
    });
    return () => { active = false; };
  }, [attempt]);

  const weekday = weekdayForServiceDate(serviceDate);
  return <section className="student-insight road-pulse" aria-labelledby="road-pulse-title">
    <h2 id="road-pulse-title">نبض الطريق · مدة الرحلة</h2>
    {loadState === 'loading' ? <p role="status">جاري تحميل سجل مدد الرحلات…</p>
      : loadState === 'setup' ? <p className="mu" role="status">نجمع بيانات الرحلات. يلزم تطبيق ملف ترحيل Road Pulse من SQL Editor في Supabase.</p>
        : loadState === 'error' ? <><p className="mu" role="status">تعذر تحميل سجل الرحلات الآن.</p><button type="button" className="sm ghost" onClick={() => setAttempt((value) => value + 1)}>إعادة المحاولة</button></>
          : <RoadPulseDirections samples={samples} weekday={weekday}/>}
  </section>;
}
