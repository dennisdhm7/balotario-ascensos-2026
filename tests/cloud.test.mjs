import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCloudService, attemptData, practiceData } from '../cloud-service.mjs';
import Core from '../quiz-core.js';

const attempt = { id: 'attempt-1', date: 1000, correct: 76, wrong: 24, blank: 0, score: 70, seconds: 7200 };
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const calls = [], histories = [], errors = [], watchers = [], progressWatchers = [];
  let local = [attempt], practice = {};
  const api = {
    watch(uid, next) { const w = { uid, next, stopped: false }; watchers.push(w); return () => { w.stopped = true; }; },
    watchPractice(uid, next) { const w = { uid, next, stopped: false }; progressWatchers.push(w); return () => { w.stopped = true; }; },
    async save(...args) { calls.push(['save', ...args]); },
    async savePractice(...args) { calls.push(['savePractice', ...args]); },
    async register(...args) { calls.push(['register', ...args]); return { uid: 'new' }; },
    async verify(user) { calls.push(['verify', user.uid]); },
    async login(...args) { calls.push(['login', ...args]); },
    async logout() { calls.push(['logout']); },
    async reset(email) { calls.push(['reset', email]); },
    async reload(user) { user.emailVerified = true; },
    async refreshToken(user) { calls.push(['refreshToken', user.uid]); }
  };
  const service = createCloudService(api, {
    identity(user) { calls.push(['identity', user?.uid]); },
    history(rows) { histories.push(rows); },
    error(error) { errors.push(error); }, localHistory: () => local,
    localPractice: () => practice, practice: remote => { practice = Core.mergePractice(practice, remote); }
  });
  return { service, api, calls, histories, errors, watchers, progressWatchers,
    setLocal: value => { local = value; }, setPractice: value => { practice = value; }, getPractice: () => practice };
}

test('registro envía verificación, login, recuperación y cierre delegan al SDK', async () => {
  const { service, calls } = setup();
  await service.register('test@example.com', 'password');
  await service.login('test@example.com', 'password');
  await service.reset('test@example.com');
  await service.logout();
  assert.deepEqual(calls.map(c => c[0]), ['register', 'verify', 'login', 'reset', 'logout']);
});

test('invitados y cuentas sin verificar no leen ni escriben Firestore', async () => {
  const x = setup();
  x.service.change(null); await x.service.sync();
  x.service.change({ uid: 'A', emailVerified: false }); await x.service.sync();
  assert.equal(x.watchers.length, 0);
  assert.equal(x.calls.some(c => c[0] === 'save'), false);
  await x.service.refresh(); await tick();
  assert.equal(x.watchers[0].uid, 'A');
  assert.equal(x.calls.find(c => c[0] === 'save')[1], 'A');
});

test('cambiar de cuenta cancela suscripciones e ignora respuestas antiguas', async () => {
  const x = setup();
  x.service.change({ uid: 'A', emailVerified: true }); await tick();
  x.setLocal([]);
  x.service.change({ uid: 'B', emailVerified: true });
  assert.equal(x.watchers[0].stopped, true);
  x.watchers[0].next([attempt]);
  assert.deepEqual(x.histories.at(-1), []);
  x.watchers[1].next([{ ...attempt, id: 'B' }]);
  assert.equal(x.histories.at(-1)[0].id, 'B');
  x.service.change(null);
  assert.equal(x.watchers[1].stopped, true);
  assert.deepEqual(x.histories.at(-1), []);
});

test('sincronización captura UID, no sube resultados pendientes a otra cuenta', async () => {
  const x = setup();
  let release;
  x.api.save = async (...args) => { x.calls.push(['save', ...args]); await new Promise(resolve => { release = resolve; }); };
  x.setLocal([attempt, { ...attempt, id: 'attempt-2' }]);
  x.service.change({ uid: 'A', emailVerified: true });
  x.setLocal([]);
  x.service.change({ uid: 'B', emailVerified: true });
  release(); await tick();
  assert.deepEqual(x.calls.filter(c => c[0] === 'save').map(c => [c[1], c[2]]), [['A', 'attempt-1']]);
});

test('fallos de red se notifican y el reintento conserva el identificador', async () => {
  const x = setup();
  x.api.save = async () => { throw { code: 'unavailable' }; };
  x.service.change({ uid: 'A', emailVerified: true }); await tick();
  assert.equal(x.errors[0].code, 'unavailable');
  x.api.save = async (...args) => x.calls.push(['save', ...args]);
  await x.service.sync();
  assert.equal(x.calls.find(c => c[0] === 'save')[2], attempt.id);
});

test('solo se envían campos válidos y nunca credenciales o campos arbitrarios', () => {
  assert.deepEqual(Object.keys(attemptData({ ...attempt, password: 'secret', role: 'admin' })), ['date', 'score', 'correct', 'wrong', 'blank', 'seconds']);
  assert.equal(attemptData({ ...attempt, score: 100 }), null);
  assert.equal(attemptData({ ...attempt, seconds: 7201 }), null);
  assert.equal(attemptData({ ...attempt, blank: -1 }), null);
});

test('detalle del simulacro conserva orden, clave, respuestas y omisiones', () => {
  const qs = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, answer: 'B' }));
  const answers = { 1: 'B', 2: 'A' };
  const item = { ...attempt, correct: 1, wrong: 1, blank: 98, score: .75, details: Core.attemptDetails(qs, answers) };
  const stored = attemptData(item);
  assert.equal(stored.details.questionIds.length, 100);
  assert.equal(stored.details.answers['1'], 'B');
  assert.equal(stored.details.answers['3'], undefined);
  assert.equal(stored.details.answerKey['2'], 'B');
  assert.equal(attemptData({ ...item, correct: 2, wrong: 0, score: 2 }), null);
  assert.equal(attemptData({ ...item, details: { ...item.details, answers: { 101: 'A' } } }), null);
  assert.equal(attemptData({ ...item, details: { ...item.details, questionIds: Array(100).fill('1') } }), null);
  assert.equal(attemptData({ ...item, details: { ...item.details, answerKey: {} } }), null);
});

test('el progreso remoto alimenta el repaso sin pisar respuestas locales más recientes', async () => {
  const x = setup();
  x.setPractice({ 1: { correct: true, selected: 'A', answer: 'A', date: 200 } });
  x.service.change({ uid: 'A', emailVerified: true }); await tick();
  x.progressWatchers[0].next({ 1: { correct: false, date: 100 }, 2: { correct: false, date: 100 } });
  assert.equal(x.getPractice()[1].correct, true);
  assert.equal(x.getPractice()[2].correct, false);
  await x.service.sync();
  assert.equal(x.calls.find(c => c[0] === 'savePractice')[1], 'A');
  x.service.change({ uid: 'B', emailVerified: true });
  assert.equal(x.progressWatchers[0].stopped, true);
  x.setPractice({});
  x.progressWatchers[0].next({ 3: { correct: false, date: 100 } });
  assert.deepEqual(x.getPractice(), {});
  x.service.dispose();
  assert.equal(x.progressWatchers[1].stopped, true);
});

test('el progreso conserva formatos antiguos y valida nuevas respuestas', () => {
  assert.deepEqual(practiceData({ correct: false, date: 100 }), { correct: false, date: 100 });
  assert.equal(practiceData({ correct: true, date: 100, selected: 'A', answer: 'B' }), null);
  assert.equal(practiceData({ correct: false, date: 100, selected: 'A' }), null);
  assert.deepEqual(practiceData({ correct: false, date: 100, selected: 'A', answer: 'B', role: 'admin' }),
    { correct: false, date: 100, selected: 'A', answer: 'B' });
});

test('errores de progreso se notifican y se reintentan sin cambiar de usuario', async () => {
  const x = setup();
  x.setPractice({ 1: { correct: false, date: 100 } });
  x.api.savePractice = async () => { throw { code: 'unavailable' }; };
  x.service.change({ uid: 'A', emailVerified: true }); await tick();
  assert.equal(x.errors[0].code, 'unavailable');
  x.api.savePractice = async (...args) => x.calls.push(['savePractice', ...args]);
  await x.service.sync();
  assert.equal(x.calls.find(c => c[0] === 'savePractice')[1], 'A');
});

test('cada respuesta nueva sincroniza solo el progreso modificado en la sesión', async () => {
  const x = setup();
  x.setPractice({ 1: { correct: false, date: 100 }, 2: { correct: false, date: 100 } });
  x.service.change({ uid: 'A', emailVerified: true }); await tick();
  await x.service.sync();
  assert.equal(x.calls.filter(c => c[0] === 'save').length, 1);
  assert.equal(x.calls.filter(c => c[0] === 'savePractice').length, 2);
  x.setPractice({ ...x.getPractice(), 1: { correct: true, date: 200 } });
  await x.service.sync();
  const changes = x.calls.filter(c => c[0] === 'savePractice');
  assert.equal(changes.length, 3);
  assert.equal(changes.at(-1)[2], '1');
});
