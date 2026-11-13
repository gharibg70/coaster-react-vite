import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

let server;
let StudentInsights;
let RoadPulseDirections;
test('server-rendered student insights contain unique summary headings and both Road Pulse directions', async (t) => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, plugins: [react()] });
  t.after(async () => { await server.close(); });
  ({ default: StudentInsights } = await server.ssrLoadModule('/src/features/student/StudentInsights.jsx'));
  ({ RoadPulseDirections } = await server.ssrLoadModule('/src/features/student/RoadPulse.jsx'));

  const markup = renderToString(React.createElement(StudentInsights, { routeId: 'route-1', serviceDate: '2026-11-13' }));
  for (const heading of ['تكرار امتلاء المقاعد', 'حكاية الأسبوع', 'نبض الطريق · مدة الرحلة']) {
    assert.equal(markup.split(heading).length - 1, 1, `expected one heading: ${heading}`);
  }
  assert.equal((markup.match(/class="card student-insights"/g) || []).length, 1);
  assert.equal((markup.match(/road-pulse"/g) || []).length, 1);
  assert.match(markup, /جاري تحميل سجل مدد الرحلات/);
  assert.doesNotMatch(markup, /المتاح الآن للغد/);

  const directions = renderToString(React.createElement(RoadPulseDirections, { samples: [], weekday: 5 }));
  assert.match(directions, /aria-label="الذهاب"/);
  assert.match(directions, /aria-label="العودة"/);
  assert.equal((directions.match(/class="road-pulse-direction"/g) || []).length, 2);
});
