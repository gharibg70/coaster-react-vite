import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeToMessages } from '../src/features/chat/chatService.js';

function fakeChannel() {
  return {
    config: null,
    changeHandler: null,
    statusHandler: null,
    on(_event, config, handler) { this.config = config; this.changeHandler = handler; return this; },
    subscribe(handler) { this.statusHandler = handler; return this; },
  };
}
const row = (id, room, body = 'message') => ({ room_group: room, is_admin: false, id, display_name: 'Student', body, created_at: '2026-11-13T08:00:00Z' });

 test('realtime_subscription_filters_by_room', async () => {
  const channel = fakeChannel();
  const client = { channel(name) { assert.equal(name, 'student-chat-messages-girls'); return channel; }, removeChannel() {} };
  const received = [];
  const errors = [];
  const stop = subscribeToMessages('girls', (message) => received.push(message), (error) => errors.push(error), undefined, async () => client);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(channel.config, { event: 'INSERT', schema: 'public', table: 'student_chat_messages', filter: 'room_group=eq.girls' });
  channel.changeHandler({ new: row('1', 'girls') });
  channel.changeHandler({ new: row('2', 'boys', 'cross-room') });
  assert.deepEqual(received.map((message) => message.body), ['message']);
  assert.equal(errors.length, 1);
  assert.deepEqual(Object.keys(received[0]), ['room_group', 'is_admin', 'id', 'display_name', 'body', 'created_at']);
  stop();
});

test('cancelled_realtime_channel_cannot_deliver_after_room_change', async () => {
  const channels = [fakeChannel(), fakeChannel()];
  let channelIndex = 0;
  const removed = [];
  const client = { channel() { return channels[channelIndex++]; }, removeChannel(channel) { removed.push(channel); } };
  const loadClient = async () => client;
  const received = [];
  const errors = [];
  let oldSubscribed = 0;
  let currentSubscribed = 0;
  const stopOld = subscribeToMessages('boys', (message) => received.push(message), (error) => errors.push(error), () => { oldSubscribed += 1; }, loadClient);
  await new Promise((resolve) => setImmediate(resolve));
  const oldChange = channels[0].changeHandler;
  const oldStatus = channels[0].statusHandler;
  oldStatus('SUBSCRIBED');
  assert.equal(oldSubscribed, 1);
  stopOld();
  const stopCurrent = subscribeToMessages('girls', (message) => received.push(message), (error) => errors.push(error), () => { currentSubscribed += 1; }, loadClient);
  await new Promise((resolve) => setImmediate(resolve));
  channels[1].statusHandler('SUBSCRIBED');
  channels[1].changeHandler({ new: row('new', 'girls', 'current channel') });
  oldStatus('CLOSED');
  oldChange({ new: row('old', 'boys', 'stale channel') });
  assert.equal(currentSubscribed, 1);
  assert.deepEqual(received.map((message) => message.body), ['current channel']);
  assert.deepEqual(errors, []);
  assert.deepEqual(removed, [channels[0]]);
  stopCurrent();
});

test('invalid_room_subscription_fails_closed', () => {
  assert.throws(() => subscribeToMessages('other', () => {}), /غير صالحة/);
});
