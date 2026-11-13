import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { loadDestinations, saveDestination } from './destinationService.js';
import { isValidCoordinates } from '../student/geofenceUtils.js';

const DIRECTIONS = [
  { key: 'outbound', title: 'وجهة الذهاب' },
  { key: 'return', title: 'وجهة الإياب' },
];
const blank = () => ({ lat: '', lng: '', radiusMeters: '300' });

function DestinationMapPicker({ value, onSelect }) {
  const node = useRef(null);
  const marker = useRef(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    if (!node.current) return undefined;
    const hasPoint = isValidCoordinates(value);
    const center = hasPoint ? [Number(value.lat), Number(value.lng)] : [36.62, 43.05];
    const map = L.map(node.current).setView(center, hasPoint ? 14 : 8);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    if (hasPoint) marker.current = L.circleMarker(center, { radius: 9, color: '#047857', fillColor: '#10b981', fillOpacity: 0.9 }).addTo(map);
    map.on('click', (event) => {
      const point = { lat: Number(event.latlng.lat.toFixed(6)), lng: Number(event.latlng.lng.toFixed(6)) };
      if (marker.current) marker.current.setLatLng([point.lat, point.lng]);
      else marker.current = L.circleMarker([point.lat, point.lng], { radius: 9, color: '#047857', fillColor: '#10b981', fillOpacity: 0.9 }).addTo(map);
      selectRef.current(point);
    });
    return () => { map.remove(); marker.current = null; };
  }, []);

  return <div>
    <p className="mu">اضغط على الخريطة لتحديد نقطة الوصول، أو أدخل الإحداثيات يدويًا أدناه.</p>
    <div ref={node} role="application" aria-label="خريطة اختيار نقطة الوصول" style={{ height: 280, borderRadius: 12, marginBottom: 12 }}/>
  </div>;
}

export default function DestinationSettings({ showToast, reportError }) {
  const [values, setValues] = useState({ outbound: blank(), return: blank() });
  const [busy, setBusy] = useState(false);
  const [pickerFor, setPickerFor] = useState(null);

  useEffect(() => {
    let alive = true;
    loadDestinations().then((destinations) => {
      if (!alive) return;
      setValues(Object.fromEntries(DIRECTIONS.map(({ key }) => [key, destinations[key] || blank()])));
    }).catch((error) => { if (alive) reportError?.(error); });
    return () => { alive = false; };
  }, [reportError]);

  const change = (direction, field, value) => setValues((current) => ({
    ...current,
    [direction]: { ...current[direction], [field]: value },
  }));

  const choosePoint = (direction, point) => setValues((current) => ({
    ...current,
    [direction]: { ...current[direction], lat: String(point.lat), lng: String(point.lng) },
  }));

  async function submit(event, direction) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await saveDestination(direction, values[direction]);
      setValues((current) => ({ ...current, [direction]: saved }));
      showToast?.(`تم حفظ ${DIRECTIONS.find((item) => item.key === direction).title}.`);
    } catch (error) {
      if (reportError) reportError(error);
      else showToast?.(error.message || 'تعذر حفظ الوجهة.', true);
    } finally { setBusy(false); }
  }

  return <section className="card" aria-labelledby="destination-settings-title">
    <h2 id="destination-settings-title">وجهات تذكير الوصول</h2>
    <p className="mu">اختر نقطتي الوصول ونطاق التنبيه. يعتمد التذكير على موقع الكوستر المشترك فقط، ولا يجمع موقع الطالب.</p>
    {DIRECTIONS.map(({ key, title }) => <form key={key} onSubmit={(event) => submit(event, key)} aria-label={title}>
      <h3>{title}</h3>
      <button type="button" className="sm ghost full" aria-expanded={pickerFor === key} onClick={() => setPickerFor((current) => current === key ? null : key)}>{pickerFor === key ? 'إخفاء الخريطة' : 'تحديد على الخريطة'}</button>
      {pickerFor === key && <DestinationMapPicker value={values[key]} onSelect={(point) => choosePoint(key, point)}/>}
      <label htmlFor={`${key}-lat`}>خط العرض</label>
      <input id={`${key}-lat`} name="lat" type="number" min="-90" max="90" step="any" required value={values[key].lat} onChange={(event) => change(key, 'lat', event.target.value)}/>
      <label htmlFor={`${key}-lng`}>خط الطول</label>
      <input id={`${key}-lng`} name="lng" type="number" min="-180" max="180" step="any" required value={values[key].lng} onChange={(event) => change(key, 'lng', event.target.value)}/>
      <label htmlFor={`${key}-radius`}>نطاق التنبيه بالمتر (10–50000)</label>
      <input id={`${key}-radius`} name="radiusMeters" type="number" min="10" max="50000" step="1" required value={values[key].radiusMeters} onChange={(event) => change(key, 'radiusMeters', event.target.value)}/>
      <button type="submit" disabled={busy}>حفظ {title}</button>
    </form>)}
  </section>;
}
