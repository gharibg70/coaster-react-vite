import { useEffect, useState } from 'react';
import { estimateSeatAvailability } from './forecastUtils.js';
import { loadSeatHistory } from './forecastService.js';

/** Historical fill frequency plus the live aggregate free-seat count for tomorrow. */
export default function ForecastCard({ routeId, targetDate, currentSeats }) {
  const [state, setState] = useState({ loading: true, samples: [], error: false });
  useEffect(() => {
    let active = true;
    if (!routeId || !targetDate) { setState({ loading: false, samples: [], error: false }); return () => { active = false; }; }
    setState({ loading: true, samples: [], error: false });
    loadSeatHistory(routeId, targetDate, 6)
      .then((samples) => { if (active) setState({ loading: false, samples, error: false }); })
      .catch(() => { if (active) setState({ loading: false, samples: [], error: true }); });
    return () => { active = false; };
  }, [routeId, targetDate]);

  return <section className="card" aria-labelledby="seat-forecast-title">
    <h2 id="seat-forecast-title">تكرار امتلاء المقاعد</h2>
    {state.loading ? <p role="status">جاري تحميل البيانات المجمعة…</p> : state.error ? <p role="status">تعذر تحميل التوقع التاريخي الآن.</p> : <div>
      {['outbound', 'return'].map((direction) => {
        const result = estimateSeatAvailability(state.samples, direction);
        const taken = currentSeats?.[`${direction}_taken`];
        const capacity = currentSeats?.capacity;
        const hasCurrentCounts = taken !== null && taken !== undefined && capacity !== null && capacity !== undefined
          && Number.isFinite(Number(taken)) && Number.isFinite(Number(capacity));
        const available = hasCurrentCounts
          ? Math.max(0, Number(capacity) - Number(taken)) : null;
        return <p key={direction}>
          <b>{direction === 'outbound' ? 'الذهاب' : 'العودة'}:</b> {result.label}
          {available !== null && <span className="mu"> · المتاح الآن للغد: {available} من {capacity}</span>}
        </p>;
      })}
      <p className="mu">{state.samples.length ? 'استناداً إلى آخر ستة أيام مماثلة.' : 'بيانات غير كافية'}</p>
      <p className="mu">هذا تكرار تاريخي فقط، وليس احتمالاً معايراً أو ضماناً للتوفر.</p>
    </div>}
  </section>;
}
