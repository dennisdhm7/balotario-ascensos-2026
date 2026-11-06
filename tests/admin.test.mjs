import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAdminService } from '../functions/admin-service.mjs';

function setup() {
  const calls = [];
  const users = {
    admin: { uid: 'admin', email: 'dark815@gmail.com', emailVerified: true },
    normal: { uid: 'normal', email: 'user@example.com', emailVerified: true }
  };
  const auth = {
    async getUser(uid) { if (!users[uid]) throw { code: 'auth/user-not-found' }; return users[uid]; },
    async listUsers() { calls.push('list'); return { users: Object.values(users).map(u => ({ ...u, metadata: { creationTime: '2026-01-01' } })) }; },
    async updateUser(uid) { calls.push(`disable:${uid}`); },
    async revokeRefreshTokens(uid) { calls.push(`revoke:${uid}`); },
    async deleteUser(uid) { calls.push(`delete:${uid}`); }
  };
  const ref = { async set() { calls.push('marker'); }, collection: name => name };
  const db = { collection: () => ({ doc: () => ref }), async recursiveDelete(name) { calls.push(`clear:${name}`); } };
  const service = createAdminService(auth, db, (code, message) => Object.assign(new Error(message), { code }));
  const request = { auth: { uid: 'admin', token: { email: 'dark815@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } } }, data: {} };
  return { calls, users, auth, db, service, request };
}

test('solo la cuenta administradora verificada con Google puede administrar', async () => {
  for (const operation of ['list', 'grades', 'remove']) {
    const { service, request, calls } = setup();
    await assert.rejects(service[operation]({ data: {} }), { code: 'unauthenticated' });
    await assert.rejects(service[operation]({ ...request, auth: { ...request.auth, uid: 'normal' } }), { code: 'permission-denied' });
    request.auth.token.firebase.sign_in_provider = 'password';
    await assert.rejects(service[operation](request), { code: 'permission-denied' });
    assert.deepEqual(calls, []);
  }
});
test('rechaza administrador deshabilitado y correo no verificado', async () => {
  const { service, request, users } = setup();
  users.admin.disabled = true;
  await assert.rejects(service.list(request), { code: 'permission-denied' });
  users.admin.disabled = false; users.admin.emailVerified = false;
  await assert.rejects(service.list(request), { code: 'permission-denied' });
});
test('lista cuentas sin exponer datos sensibles y protege la cuenta administradora', async () => {
  const { service, request } = setup();
  const result = await service.list(request);
  assert.equal(result.users.length, 2);
  assert.equal(result.users[0].metadata, undefined);
  await assert.rejects(service.remove({ ...request, data: { uid: 'admin' } }), { code: 'failed-precondition' });
  await assert.rejects(service.remove({ ...request, data: { uid: '../other' } }), { code: 'invalid-argument' });
});
test('elimina autenticación y progreso después de bloquear las escrituras', async () => {
  const { service, request, calls } = setup();
  await service.remove({ ...request, data: { uid: 'normal' } });
  assert.deepEqual(calls, ['disable:normal', 'revoke:normal', 'marker', 'clear:attempts', 'clear:practice', 'delete:normal']);
});
test('un fallo de limpieza conserva la cuenta deshabilitada y permite reintentar', async () => {
  const { service, request, calls, db } = setup();
  db.recursiveDelete = async () => { throw new Error('offline'); };
  await assert.rejects(service.remove({ ...request, data: { uid: 'normal' } }), /offline/);
  assert.deepEqual(calls, ['disable:normal', 'revoke:normal', 'marker']);
});
test('el reintento limpia los datos aunque Authentication ya no tenga la cuenta', async () => {
  const { service, request, calls } = setup();
  await service.remove({ ...request, data: { uid: 'missing' } });
  assert.deepEqual(calls, ['marker', 'clear:attempts', 'clear:practice']);
});

test('notas paginadas muestran puntajes sobre 20 y 100 sin exponer respuestas', async () => {
  const { service, request, db } = setup();
  const visited = [];
  const query = {
    orderBy(field) { visited.push(field); return this; },
    startAfter(cursor) { visited.push(cursor); return this; },
    limit(count) { visited.push(count); return this; },
    async get() { return { docs: Array.from({ length: 51 }, (_, i) => ({
      id: `attempt-${i}`, data: () => ({ date: 1000, score: 14, correct: 14, wrong: 0, blank: 6,
        seconds: 100, ...(i === 0 ? { kind: 'block' } : {}), details: { answers: {} } })
    })) }; }
  };
  db.collection = name => {
    assert.equal(name, 'users');
    return { doc: uid => { assert.equal(uid, 'normal'); return {
      collection: sub => { assert.equal(sub, 'attempts'); return query; }
    }; } };
  };
  const result = await service.grades({ ...request, data: { uid: 'normal', before: 'previous' } });
  assert.deepEqual(visited, ['__name__', 'previous', 51]);
  assert.equal(result.attempts.length, 50);
  assert.equal(result.before, 'attempt-49');
  assert.equal(result.attempts[0].count, 20);
  assert.equal(result.attempts[1].count, 100);
  assert.equal(result.attempts[0].details, undefined);
});
