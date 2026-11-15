import test from 'node:test';
import assert from 'node:assert/strict';
import { submitAnnouncement } from '../src/features/admin/announcementSubmission.js';

test('resets the captured form and sends push after React clears event.currentTarget', async () => {
  let finishCreate;
  const createPending = new Promise((resolve) => { finishCreate = resolve; });
  const calls = { reset: 0, push: 0, errors: [], notices: [] };
  const formElement = { reset() { calls.reset += 1; } };
  const event = {
    currentTarget: formElement,
    preventDefault() { this.prevented = true; },
  };

  const pendingSubmit = submitAnnouncement(event, {
    profileId: 'admin-id',
    readValues(form) {
      assert.equal(form, formElement);
      return { title: 'تذكير', message: 'نص التنبيه', targetGroup: '' };
    },
    createAnnouncement: async (...args) => {
      assert.deepEqual(args, ['تذكير', 'نص التنبيه', '', 'admin-id']);
      return createPending;
    },
    refreshTools: async () => {},
    sendPush: async () => { calls.push += 1; return { sent: 2 }; },
    showToast: (message, isError = false) => calls.notices.push({ message, isError }),
    reportError: (error) => calls.errors.push(error),
  });

  assert.equal(event.prevented, true);
  event.currentTarget = null;
  finishCreate({ id: 'announcement-id' });
  await pendingSubmit;

  assert.equal(calls.reset, 1);
  assert.equal(calls.push, 1);
  assert.deepEqual(calls.errors, []);
  assert.ok(calls.notices.some(({ message }) => message === 'تم الإرسال إلى 2 جهاز.'));
});
