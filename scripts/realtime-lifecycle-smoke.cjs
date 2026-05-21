const { io } = require('../frontend/node_modules/socket.io-client');

const API_URL = process.env.REALTIME_API_URL ?? 'http://localhost:3000/api';
const WS_URL = process.env.REALTIME_WS_URL ?? 'http://localhost:3000';
const stamp = `${Date.now()}${Math.floor(Math.random() * 10000)}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition, message, details) {
  if (condition) return;
  const error = new Error(message);
  error.details = details;
  throw error;
}

function unique(items) {
  return Array.from(new Set(items));
}

function duplicates(items) {
  return items.filter((item, index) => items.indexOf(item) !== index);
}

async function request(method, path, token, body, attempt = 0) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);

  if (response.status === 429 && attempt < 3) {
    await sleep(1200 * (attempt + 1));
    return request(method, path, token, body, attempt + 1);
  }

  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload?.data;
}

async function rawRequest(method, path, token, body) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

async function expectTooManyRequests(method, path, token, body) {
  const response = await rawRequest(method, path, token, body);
  assert(response.status === 429, `${method} ${path} should be rate limited`, response);
  return response;
}

async function register(label) {
  return request('POST', '/auth/register', null, {
    email: `rt-${label}-${stamp}@test.local`,
    username: `rt${label}${stamp}`,
    displayName: `RT ${label}`,
    password: 'Password123!',
  });
}

function connectSocket(token, label, events) {
  const socket = io(WS_URL, {
    autoConnect: false,
    auth: { token },
    transports: ['websocket'],
  });

  [
    'connect',
    'disconnect',
    'presence.snapshot',
    'auth.error',
    'user.online',
    'user.offline',
    'message.sent',
    'message.new',
    'message.read',
  ].forEach((event) => {
    socket.on(event, (payload) => events.push({ label, event, payload }));
  });
  socket.connect();
  return socket;
}

async function connectRejectedSocket(token) {
  const events = [];
  const socket = io(WS_URL, {
    autoConnect: false,
    auth: { token },
    reconnection: false,
    timeout: 1000,
    transports: ['websocket'],
  });
  socket.on('connect', () => events.push({ event: 'connect' }));
  socket.on('auth.error', (payload) => events.push({ event: 'auth.error', payload }));
  socket.on('disconnect', (reason) => events.push({ event: 'disconnect', reason }));
  socket.on('connect_error', (error) => events.push({ event: 'connect_error', message: error.message }));
  socket.connect();
  await sleep(120);
  socket.disconnect();
  return events;
}


async function waitConnect(socket) {
  if (socket.connected) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 5000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function createDirectConversation(a, b) {
  const friendship = await request('POST', `/friends/${b.user.id}/request`, a.accessToken);
  await request('POST', `/friend-requests/${friendship.id}/accept`, b.accessToken);
  return request('POST', '/conversations/direct', a.accessToken, { participantId: b.user.id });
}

async function createFriendship(a, b) {
  const friendship = await request('POST', `/friends/${b.user.id}/request`, a.accessToken);
  await request('POST', `/friend-requests/${friendship.id}/accept`, b.accessToken);
}

async function listMessages(token, conversationId) {
  return request('GET', `/conversations/${conversationId}/messages`, token);
}

async function unreadCount(token, conversationId) {
  const conversations = await request('GET', '/conversations', token);
  return conversations.find((conversation) => conversation.id === conversationId)?.unreadCount;
}

async function sendMessage(token, conversationId, body, clientMessageId) {
  return request('POST', `/conversations/${conversationId}/messages`, token, { body, clientMessageId });
}

async function markRead(token, conversationId) {
  return request('POST', `/conversations/${conversationId}/read-all`, token);
}

async function updatePrivacy(token, allowGroupInvite) {
  return request('PUT', '/me/profile', token, { allowGroupInvite });
}

async function expectForbidden(method, path, token, body) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  assert(response.status === 403, `${method} ${path} should be forbidden`, { status: response.status });
}

async function runPresenceTest(users, directConversation) {
  const events = [];
  const unrelated = connectSocket(users.d.accessToken, 'D', events);
  await waitConnect(unrelated);
  await sleep(200);

  const a = connectSocket(users.a.accessToken, 'A', events);
  await waitConnect(a);
  await sleep(300);

  const b1 = connectSocket(users.b.accessToken, 'B1', events);
  await waitConnect(b1);
  await sleep(500);

  const b2 = connectSocket(users.b.accessToken, 'B2', events);
  await waitConnect(b2);
  await sleep(500);

  b1.disconnect();
  await sleep(3500);
  const offlineAfterOneTab = events.filter((event) => event.label === 'A' && event.event === 'user.offline');

  b2.disconnect();
  await sleep(3500);
  const offlineAfterAllTabs = events.filter((event) => event.label === 'A' && event.event === 'user.offline');
  const snapshot = events.find((event) => event.label === 'A' && event.event === 'presence.snapshot')?.payload?.userIds ?? [];
  const onlineEvents = events.filter((event) => event.label === 'A' && event.event === 'user.online').map((event) => event.payload.userId);

  unrelated.disconnect();
  a.disconnect();

  assert(!snapshot.includes(users.d.user.id), 'presence snapshot leaked unrelated online user', { snapshot });
  assert(onlineEvents.filter((userId) => userId === users.b.user.id).length === 1, 'presence online event duplicated', { onlineEvents });
  assert(!offlineAfterOneTab.some((event) => event.payload.userId === users.b.user.id), 'closing one tab caused false offline', { offlineAfterOneTab });
  assert(offlineAfterAllTabs.filter((event) => event.payload.userId === users.b.user.id).length === 1, 'closing all tabs did not emit exactly one offline', { offlineAfterAllTabs });

  return {
    conversationId: directConversation.id,
    snapshot,
    onlineEvents,
    offlineAfterOneTab: offlineAfterOneTab.map((event) => event.payload.userId),
    offlineAfterAllTabs: offlineAfterAllTabs.map((event) => event.payload.userId),
  };
}

async function runDuplicateAndReconnectTest(users, directConversation) {
  const events = [];
  const a = connectSocket(users.a.accessToken, 'A', events);
  const b = connectSocket(users.b.accessToken, 'B', events);
  await Promise.all([waitConnect(a), waitConnect(b)]);
  a.emit('conversation.join', { conversationId: directConversation.id });
  b.emit('conversation.join', { conversationId: directConversation.id });
  await sleep(300);

  const fastMessages = [];
  for (let index = 0; index < 5; index += 1) {
    fastMessages.push(
      await sendMessage(users.a.accessToken, directConversation.id, `fast ${stamp} ${index}`, `fast-${stamp}-${index}`),
    );
  }
  await sleep(800);

  const beforeReadUnread = await unreadCount(users.b.accessToken, directConversation.id);
  const messagesAfterFastSend = await listMessages(users.b.accessToken, directConversation.id);
  await markRead(users.b.accessToken, directConversation.id);
  const afterReadUnread = await unreadCount(users.b.accessToken, directConversation.id);

  b.disconnect();
  await sleep(300);
  const offlineMessages = [];
  for (let index = 0; index < 3; index += 1) {
    offlineMessages.push(
      await sendMessage(users.a.accessToken, directConversation.id, `offline ${stamp} ${index}`, `offline-${stamp}-${index}`),
    );
  }
  await sleep(500);
  const offlineUnread = await unreadCount(users.b.accessToken, directConversation.id);

  b.connect();
  await waitConnect(b);
  b.emit('conversation.join', { conversationId: directConversation.id });
  await sleep(300);
  const messagesAfterReconnect = await listMessages(users.b.accessToken, directConversation.id);
  await markRead(users.b.accessToken, directConversation.id);
  const finalUnread = await unreadCount(users.b.accessToken, directConversation.id);

  a.disconnect();
  b.disconnect();

  const fastIds = fastMessages.map((message) => message.id);
  const offlineIds = offlineMessages.map((message) => message.id);
  const reconnectIds = messagesAfterReconnect.map((message) => message.id);
  const allRelevantIds = [...fastIds, ...offlineIds];

  assert(duplicates(messagesAfterFastSend.map((message) => message.id)).length === 0, 'duplicate message IDs after fast send');
  assert(duplicates(reconnectIds).length === 0, 'duplicate message IDs after reconnect');
  assert(allRelevantIds.every((id) => reconnectIds.includes(id)), 'reconnect reload missed messages', { allRelevantIds, reconnectIds });
  assert(beforeReadUnread === 5, 'unread count was not equal to fast message count', { beforeReadUnread });
  assert(afterReadUnread === 0, 'unread count did not clear after read-all', { afterReadUnread });
  assert(offlineUnread === 3, 'offline unread count did not match missed messages', { offlineUnread });
  assert(finalUnread === 0, 'final unread count did not clear after reconnect read-all', { finalUnread });

  return {
    fastMessageCount: fastMessages.length,
    offlineMessageCount: offlineMessages.length,
    uniqueMessagesAfterReconnect: unique(reconnectIds).length,
    beforeReadUnread,
    afterReadUnread,
    offlineUnread,
    finalUnread,
    socketMessageSentCountForB: events.filter((event) => event.label === 'B' && event.event === 'message.sent').length,
    socketMessageNewCountForB: events.filter((event) => event.label === 'B' && event.event === 'message.new').length,
  };
}

async function runReadReceiptTest(users, directConversation) {
  const directMessage = await sendMessage(users.a.accessToken, directConversation.id, `direct read ${stamp}`, `direct-read-${stamp}`);
  await markRead(users.b.accessToken, directConversation.id);
  const directMessages = await listMessages(users.a.accessToken, directConversation.id);
  const directReloaded = directMessages.find((message) => message.id === directMessage.id);

  const group = await request('POST', '/conversations/group', users.a.accessToken, {
    name: `group-${stamp}`,
    memberIds: [users.b.user.id, users.c.user.id],
  });
  const groupMessage = await sendMessage(users.a.accessToken, group.id, `group read ${stamp}`, `group-read-${stamp}`);
  await markRead(users.b.accessToken, group.id);
  const afterBRead = await listMessages(users.a.accessToken, group.id);
  await markRead(users.c.accessToken, group.id);
  const afterCRead = await listMessages(users.a.accessToken, group.id);

  const partialReadCount = afterBRead.find((message) => message.id === groupMessage.id)?.reads?.length ?? 0;
  const fullReadCount = afterCRead.find((message) => message.id === groupMessage.id)?.reads?.length ?? 0;

  assert(directReloaded?.reads?.some((read) => read.userId === users.b.user.id), 'direct read receipt missing after reload', { directReloaded });
  assert(partialReadCount === 1, 'group partial read was not preserved as partial', { partialReadCount });
  assert(fullReadCount === 2, 'group full read did not include both non-sender participants', { fullReadCount });

  return {
    directReadUserIds: directReloaded.reads.map((read) => read.userId),
    groupId: group.id,
    partialReadCount,
    fullReadCount,
  };
}

async function runGroupMembershipFoundationTest(users) {
  const events = [];
  const a = connectSocket(users.a.accessToken, 'A', events);
  const b = connectSocket(users.b.accessToken, 'B', events);
  const c = connectSocket(users.c.accessToken, 'C', events);
  await Promise.all([waitConnect(a), waitConnect(b), waitConnect(c)]);

  const group = await request('POST', '/conversations/group', users.a.accessToken, {
    name: `foundation-${stamp}`,
    memberIds: [users.b.user.id],
  });

  a.emit('conversation.join', { conversationId: group.id });
  b.emit('conversation.join', { conversationId: group.id });
  await sleep(300);
  const initialMessage = await sendMessage(users.a.accessToken, group.id, `group initial ${stamp}`, `group-initial-${stamp}`);
  await sleep(500);
  const bInitialEvents = events.filter((event) => event.label === 'B' && event.event === 'message.sent' && event.payload.id === initialMessage.id);

  await request('POST', `/conversations/group/${group.id}/members`, users.a.accessToken, { userId: users.c.user.id });
  c.emit('conversation.join', { conversationId: group.id });
  await sleep(300);
  const afterAddMessage = await sendMessage(users.a.accessToken, group.id, `group after add ${stamp}`, `group-after-add-${stamp}`);
  await sleep(500);
  const cAfterAddEvents = events.filter((event) => event.label === 'C' && event.event === 'message.sent' && event.payload.id === afterAddMessage.id);

  await createFriendship(users.a, users.d);
  await updatePrivacy(users.d.accessToken, 'nobody');
  await expectForbidden('POST', `/conversations/group/${group.id}/members`, users.a.accessToken, { userId: users.d.user.id });
  await updatePrivacy(users.d.accessToken, 'friends_only');

  await request('DELETE', `/conversations/group/${group.id}/members/${users.b.user.id}`, users.a.accessToken);
  await sleep(300);
  const beforeRemovedMessageEvents = events.length;
  const afterRemoveMessage = await sendMessage(users.a.accessToken, group.id, `group after remove ${stamp}`, `group-after-remove-${stamp}`);
  await sleep(600);
  const bEventsAfterRemove = events
    .slice(beforeRemovedMessageEvents)
    .filter((event) => event.label === 'B' && ['message.sent', 'message.new'].includes(event.event));

  await expectForbidden('GET', `/conversations/${group.id}/messages`, users.b.accessToken);

  await request('POST', `/conversations/group/${group.id}/leave`, users.c.accessToken);
  await expectForbidden('GET', `/conversations/${group.id}/messages`, users.c.accessToken);
  const cConversations = await request('GET', '/conversations', users.c.accessToken);

  a.disconnect();
  b.disconnect();
  c.disconnect();

  assert(group.participants.length === 2, 'group with one initial member should include creator and member', { participants: group.participants });
  assert(bInitialEvents.length === 1, 'initial group member did not receive realtime message', { bInitialEvents });
  assert(cAfterAddEvents.length === 1, 'added group member did not receive realtime message after join', { cAfterAddEvents });
  assert(bEventsAfterRemove.length === 0, 'removed member received realtime event after removal', { bEventsAfterRemove });
  assert(!cConversations.some((conversation) => conversation.id === group.id), 'left member still sees group in conversation list', { cConversations });

  return {
    groupId: group.id,
    initialParticipantCount: group.participants.length,
    initialRealtimeEventsForB: bInitialEvents.length,
    afterAddRealtimeEventsForC: cAfterAddEvents.length,
    removedMemberEventsAfterRemove: bEventsAfterRemove.length,
    leftMemberCanSeeGroup: cConversations.some((conversation) => conversation.id === group.id),
    lastMessageId: afterRemoveMessage.id,
  };
}

async function runGroupOwnershipLifecycleTest(users) {
  const transferGroup = await request('POST', '/conversations/group', users.a.accessToken, {
    name: `ownership-${stamp}`,
    memberIds: [users.b.user.id],
  });
  assert(transferGroup.ownerId === users.a.user.id, 'new group owner was not creator', { ownerId: transferGroup.ownerId });

  await expectForbidden('POST', `/conversations/group/${transferGroup.id}/owner`, users.a.accessToken, { userId: users.d.user.id });
  const transferred = await request('POST', `/conversations/group/${transferGroup.id}/owner`, users.a.accessToken, { userId: users.b.user.id });
  assert(transferred.ownerId === users.b.user.id, 'owner transfer did not update ownerId', { ownerId: transferred.ownerId });

  await request('POST', `/conversations/group/${transferGroup.id}/leave`, users.a.accessToken);
  await expectForbidden('GET', `/conversations/${transferGroup.id}/messages`, users.a.accessToken);
  const bConversations = await request('GET', '/conversations', users.b.accessToken);
  const bTransferGroup = bConversations.find((conversation) => conversation.id === transferGroup.id);
  assert(bTransferGroup?.ownerId === users.b.user.id, 'new owner cannot see transferred group', { bTransferGroup });

  const soloGroup = await request('POST', '/conversations/group', users.a.accessToken, {
    name: `solo-${stamp}`,
    memberIds: [users.c.user.id],
  });
  await request('DELETE', `/conversations/group/${soloGroup.id}/members/${users.c.user.id}`, users.a.accessToken);
  await request('POST', `/conversations/group/${soloGroup.id}/leave`, users.a.accessToken);
  await expectForbidden('GET', `/conversations/${soloGroup.id}/messages`, users.a.accessToken);
  const aConversations = await request('GET', '/conversations', users.a.accessToken);

  assert(!aConversations.some((conversation) => conversation.id === soloGroup.id), 'solo owner leave left ghost conversation', { aConversations });

  return {
    transferGroupId: transferGroup.id,
    initialOwnerId: transferGroup.ownerId,
    transferredOwnerId: transferred.ownerId,
    oldOwnerCanSeeAfterLeave: false,
    newOwnerCanSeeAfterTransfer: Boolean(bTransferGroup),
    soloGroupId: soloGroup.id,
    soloOwnerCanSeeAfterLeave: aConversations.some((conversation) => conversation.id === soloGroup.id),
  };
}

async function runAbuseHardeningTest() {
  const messageUsers = {
    a: await register('spam-a'),
    b: await register('spam-b'),
  };
  const spamConversation = await createDirectConversation(messageUsers.a, messageUsers.b);
  const normalMessage = await sendMessage(messageUsers.a.accessToken, spamConversation.id, `normal ${stamp}`, `normal-${stamp}`);
  const spamResponses = [];
  for (let index = 0; index < 12; index += 1) {
    spamResponses.push(
      await rawRequest('POST', `/conversations/${spamConversation.id}/messages`, messageUsers.a.accessToken, {
        body: `spam ${stamp} ${index}`,
        clientMessageId: `spam-${stamp}-${index}`,
      }),
    );
  }
  const spamBlocked = spamResponses.some((response) => response.status === 429);

  const groupUsers = {
    a: await register('abuse-a'),
    b: await register('abuse-b'),
    c: await register('abuse-c'),
  };
  await createFriendship(groupUsers.a, groupUsers.b);
  await createFriendship(groupUsers.a, groupUsers.c);
  const createStatuses = [];
  for (let index = 0; index < 6; index += 1) {
    createStatuses.push(
      (await rawRequest('POST', '/conversations/group', groupUsers.a.accessToken, {
        name: `abuse-create-${stamp}-${index}`,
        memberIds: [groupUsers.b.user.id],
      })).status,
    );
  }
  const groupForAdd = await request('POST', '/conversations/group', groupUsers.b.accessToken, {
    name: `abuse-add-${stamp}`,
    memberIds: [groupUsers.a.user.id],
  });
  const addStatuses = [];
  for (let index = 0; index < 11; index += 1) {
    addStatuses.push(
      (await rawRequest('POST', `/conversations/group/${groupForAdd.id}/members`, groupUsers.b.accessToken, { userId: groupUsers.c.user.id })).status,
    );
  }

  const reconnectEvents = [];
  for (let index = 0; index < 22; index += 1) {
    reconnectEvents.push(...(await connectRejectedSocket(`invalid-reconnect-${stamp}`)));
  }
  const reconnectRateLimited = reconnectEvents.some((event) => event.event === 'auth.error' && event.payload?.reason === 'reconnect_rate_limited');

  assert(normalMessage.id, 'normal message before spam failed', { normalMessage });
  assert(spamBlocked, 'message spam burst was not rate limited', { spamResponses: spamResponses.map((response) => response.status) });
  assert(createStatuses.includes(429), 'group create burst was not rate limited', { createStatuses });
  assert(addStatuses.includes(429), 'group add-member burst was not rate limited', { addStatuses });
  assert(reconnectRateLimited, 'reconnect spam was not rate limited', { reconnectEvents });

  return {
    normalMessageId: normalMessage.id,
    messageStatuses: spamResponses.map((response) => response.status),
    groupCreateStatuses: createStatuses,
    groupAddStatuses: addStatuses,
    reconnectRateLimited,
  };
}

async function runSessionManagementTest() {
  const registered = await register('session');
  const loginTwo = await request('POST', '/auth/login', null, {
    email: registered.user.email,
    password: 'Password123!',
  });

  const initialSessions = await request('POST', '/auth/sessions', loginTwo.accessToken, { refreshToken: loginTwo.refreshToken });
  const currentSession = initialSessions.find((session) => session.current);
  const firstSession = initialSessions.find((session) => !session.current);
  assert(currentSession, 'session list did not mark current session', { initialSessions });
  assert(firstSession, 'session list did not include other active session', { initialSessions });

  const events = [];
  const firstSocket = connectSocket(registered.accessToken, 'revoked', events);
  await waitConnect(firstSocket);
  await request('POST', '/auth/sessions/revoke', loginTwo.accessToken, { sessionId: firstSession.id });
  await sleep(900);
  const revokedMe = await rawRequest('GET', '/me', registered.accessToken);
  firstSocket.disconnect();

  const loginThree = await request('POST', '/auth/login', null, {
    email: registered.user.email,
    password: 'Password123!',
  });
  const beforeOthers = await request('POST', '/auth/sessions', loginTwo.accessToken, { refreshToken: loginTwo.refreshToken });
  await request('POST', '/auth/sessions/revoke-others', loginTwo.accessToken, { refreshToken: loginTwo.refreshToken });
  const currentMe = await rawRequest('GET', '/me', loginTwo.accessToken);
  const otherMe = await rawRequest('GET', '/me', loginThree.accessToken);
  const afterOthers = await request('POST', '/auth/sessions', loginTwo.accessToken, { refreshToken: loginTwo.refreshToken });

  assert(revokedMe.status === 401, 'revoked session still had API access', { status: revokedMe.status });
  assert(events.some((event) => event.label === 'revoked' && event.event === 'auth.error' && event.payload?.reason === 'session_revoked'), 'revoked socket did not receive session_revoked', { events });
  assert(currentMe.status === 200, 'current session did not survive revoke-others', { status: currentMe.status });
  assert(otherMe.status === 401, 'other session survived revoke-others', { status: otherMe.status });
  assert(beforeOthers.length >= 2, 'test did not create multiple sessions before revoke-others', { beforeOthers });
  assert(afterOthers.length === 1 && afterOthers[0].current, 'revoke-others did not leave only current session', { afterOthers });

  return {
    initialSessionCount: initialSessions.length,
    currentSessionMarked: Boolean(currentSession),
    revokedSessionApiStatus: revokedMe.status,
    revokedSocketEvent: events.some((event) => event.event === 'auth.error' && event.payload?.reason === 'session_revoked'),
    currentAfterRevokeOthersStatus: currentMe.status,
    otherAfterRevokeOthersStatus: otherMe.status,
    finalSessionCount: afterOthers.length,
  };
}

async function main() {
  const users = {
    a: await register('a'),
    b: await register('b'),
    c: await register('c'),
    d: await register('d'),
  };
  const directConversation = await createDirectConversation(users.a, users.b);
  await createFriendship(users.a, users.c);

  const results = {
    presence: await runPresenceTest(users, directConversation),
    duplicateAndReconnect: await runDuplicateAndReconnectTest(users, directConversation),
    readReceipt: await runReadReceiptTest(users, directConversation),
    groupMembership: await runGroupMembershipFoundationTest(users),
    groupOwnership: await runGroupOwnershipLifecycleTest(users),
    abuseHardening: await runAbuseHardeningTest(),
    sessionManagement: await runSessionManagementTest(),
  };

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    message: error.message,
    details: error.details,
  }, null, 2));
  process.exit(1);
});
