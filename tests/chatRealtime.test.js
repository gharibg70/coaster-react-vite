import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeToMessages } from '../src/features/chat/chatService.js';

function fakeChannel() {
  return {
    changeHandler: null,
    statusHandler: null,
    on(_event, _config, handler) { this.changeHandler = handler; return this; },
    subscribe(handler) { this.statusHandler = handler; return this; },
  };
}

test('cancelled_realtime_channel_cannot_deliver_after_reauthorization', async () => {
  const channels = [fakeChannel(), fakeChannel()];
  let channelIndex = 0;
  const removed = [];
  const client = {
    channel() { return channels[channelIndex++]; },
    removeChannel(channel) { removed.push(channel); },
  };
  const loadClient = async () => client;
  const received = [];
  const errors = [];
  let oldSubscribed = 0;
  let currentSubscribed = 0;

  const stopOld = subscribeToMessages(
    (message) => received.push(message),
    (error) => errors.push(error),
    () => { oldSubscribed += 1; },
    loadClient,
  );
  await new Promise((resolve) => setImmediate(resolve));
  const oldChange = channels[0].changeHandler;
  const oldStatus = channels[0].statusHandler;
  oldStatus('SUBSCRIBED');
  assert.equal(oldSubscribed, 1);
  stopOld();

  const stopCurrent = subscribeToMessages(
    (message) => received.push(message),
    (error) => errors.push(error),
    () => { currentSubscribed += 1; },
    loadClient,
  );
  await new Promise((resolve) => setImmediate(resolve));
  const currentMessage = { id: 'new', display_name: 'Student', body: 'current channel', created_at: '2026-11-13T08:00:00Z' };
  const lateMessage = { id: 'old', display_name: 'Student', body: 'stale channel', created_at: '2026-11-13T07:59:00Z' };
  channels[1].statusHandler('SUBSCRIBED');
  channels[1].changeHandler({ new: currentMessage });
  oldStatus('CLOSED');
  oldChange({ new: lateMessage });

  assert.equal(currentSubscribed, 1);
  assert.deepEqual(received.map((message) => message.body), ['current channel']);
  assert.deepEqual(errors, []);
  assert.deepEqual(removed, [channels[0]]);
  stopCurrent();
});
