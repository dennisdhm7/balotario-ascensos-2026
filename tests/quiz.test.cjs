const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../quiz-core.js');
const bank = JSON.parse(fs.readFileSync(require.resolve('../questions.json'), 'utf8'));

test('reglas, umbral de aprobación y puntuaciones extremas', () => {
  const qs = bank.slice(0, 100);
  const answers = Object.fromEntries(qs.map((q, i) => [q.id, i < 76 ? q.answer : Object.keys(q.options).find(k => k !== q.answer)]));
  assert.deepEqual(Core.grade(qs, answers), { correct: 76, wrong: 24, blank: 0, score: 70, passed: true });
  answers[qs[0].id] = Object.keys(qs[0].options).find(k => k !== qs[0].answer);
  assert.equal(Core.grade(qs, answers).passed, false);
  assert.equal(Core.grade(qs, {}).score, 0);
  assert.equal(Core.grade(qs, Object.fromEntries(qs.map(q => [q.id, q.answer]))).score, 100);
  assert.equal(Core.grade(qs, Object.fromEntries(qs.map(q => [q.id, Object.keys(q.options).find(k => k !== q.answer)]))).score, -25);
  assert.deepEqual(Core.RULES, { count: 100, seconds: 7200, penalty: .25, pass: 70 });
});

test('fecha límite independiente de intervalos y pestañas suspendidas', () => {
  assert.equal(Core.remaining(7200000, 0), 7200);
  assert.equal(Core.remaining(7200000, 3600000), 3600);
  assert.equal(Core.remaining(7200000, 7199999), 1);
  assert.equal(Core.remaining(7200000, 9000000), 0);
});

test('restauración valida preguntas y limpia respuestas inválidas', () => {
  const saved = { id: 'test', deadline: 12345, questionIds: bank.slice(0, 100).map(q => q.id), answers: { 1: 'Z', 2: 'A' }, index: 500 };
  const restored = Core.restore(saved, bank);
  assert.equal(restored.index, 99);
  assert.deepEqual(restored.answers, { 2: 'A' });
  assert.equal(Core.restore({ ...saved, questionIds: Array(100).fill(1) }, bank), null);
  assert.equal(Core.restore({ ...saved, deadline: null }, bank), null);
});

test('repaso conserva errores omitidos y retira los corregidos sin perder datos anteriores', () => {
  const old = { 1: { correct: false, date: 1 }, 2: { correct: false, date: 1 }, 200: { correct: true, date: 1 } };
  const next = Core.updateMistakes(old, bank.slice(0, 3), { 1: bank[0].answer, 3: 'Z' }, 2);
  assert.equal(next[1].correct, true);
  assert.deepEqual(next[2], old[2]);
  assert.equal(next[3].correct, false);
  assert.deepEqual(next[200], old[200]);
  assert.equal(old[1].correct, false);
});

// Ejecuta app.js con DOM y reloj controlados, usando el banco real.
async function browser(storage = new Map(), initialTime = 1000000) {
  let now = initialTime;
  const elements = new Map();
  function element() { return { hidden: false, disabled: false, style: {}, children: [], textContent: '', append(...xs) { this.children.push(...xs); }, replaceChildren() { this.children = []; }, scrollIntoView() {} }; }
  const buttons = ['practice', 'exam', 'mistakes'].map(mode => ({ ...element(), dataset: { mode } }));
  const context = vm.createContext({ QuizCore: Core, console, Math, JSON, Date: class extends Date { static now() { return now; } },
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element,
      querySelectorAll() { return buttons; }, addEventListener() {} },
    window: { scrollTo() {}, addEventListener() {} },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    alert() {}, confirm: () => true, setInterval: () => 1, clearInterval() {},
    fetch: async () => ({ ok: true, json: async () => bank }) });
  vm.runInContext(fs.readFileSync(require.resolve('../app.js'), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  return { run: code => vm.runInContext(code, context), elements, storage, advance: ms => { now += ms; } };
}

test('flujo completo: borrar respuesta, recargar, expirar y conservar historial local', async () => {
  const key = 'cgbvp-ascensos-2026-v2';
  const old = { history: [{ date: 1, score: 80, correct: 80, wrong: 0, blank: 20, seconds: 20 }], practice: { 200: { correct: false, date: 1 } } };
  const storage = new Map([[key, JSON.stringify(old)]]);
  const first = await browser(storage);
  first.run("start('exam'); choose(session[0].answer)");
  assert.equal(first.run('session.length'), 100);
  assert.equal(first.run('new Set(session.map(q=>q.id)).size'), 100);
  first.elements.get('clearAnswer').onclick();
  assert.equal(first.run('countAnswered()'), 0);
  first.run("choose(Object.keys(session[0].options).find(k=>k!==session[0].answer)); index=7; render()");
  const snapshot = JSON.parse(storage.get(key)).activeExam;
  const resumed = await browser(storage, 1060000);
  assert.equal(resumed.run('index'), 7);
  assert.equal(resumed.run('countAnswered()'), 1);
  assert.equal(resumed.run('remaining'), 7140);
  assert.deepEqual(Array.from(resumed.run('session.map(q=>q.id)')), snapshot.questionIds);
  // No se ejecuta ningún intervalo durante el salto de tiempo.
  const expired = await browser(storage, snapshot.deadline + 10000);
  const saved = JSON.parse(storage.get(key));
  assert.equal(saved.activeExam, undefined);
  assert.equal(saved.history.length, 2);
  assert.deepEqual(saved.history[0], old.history[0]);
  assert.equal(saved.history[1].score, -.25);
  assert.equal(saved.history[1].blank, 99);
  assert.equal(saved.history[1].seconds, 7200);
  assert.equal(saved.practice[snapshot.questionIds[0]].correct, false);
  if(snapshot.questionIds[0]!==200)assert.deepEqual(saved.practice[200], old.practice[200]);
  expired.run('finish(true)');
  assert.equal(JSON.parse(storage.get(key)).history.length, 2);
  const again = await browser(storage, snapshot.deadline + 20000);
  assert.equal(again.run('getStore().history.length'), 2);
});

test('una respuesta después del vencimiento se rechaza y finaliza el intento', async () => {
  const app = await browser();
  app.run("start('exam')");
  app.advance(7200001);
  app.run('choose(session[0].answer)');
  assert.equal(app.run('getStore().history[0].blank'), 100);
  assert.equal(app.run('finished'), true);
});

test('salir no pausa el plazo y volver recupera el mismo intento', async () => {
  const app = await browser();
  app.run("start('exam'); choose(session[0].answer)");
  const id = app.run('attemptId');
  app.elements.get('back').onclick();
  app.advance(120000);
  app.run("start('practice')");
  assert.equal(app.run('mode'), 'exam');
  assert.equal(app.run('attemptId'), id);
  assert.equal(app.run('remaining'), 7080);
  assert.equal(app.run('countAnswered()'), 1);
});

test('errores del simulacro se repasan y desaparecen después de acertar', async () => {
  const app = await browser();
  app.run("start('exam'); choose(Object.keys(session[0].options).find(k=>k!==session[0].answer)); finish(true); start('mistakes')");
  assert.equal(app.run('session.length'), 1);
  assert.equal(app.run('mode'), 'mistakes');
  app.run('choose(session[0].answer)');
  assert.equal(app.run('getStore().practice[session[0].id].correct'), true);
  assert.equal(app.run('getStore().history.length'), 1);
  assert.equal(app.elements.get('clearAnswer').hidden, true);
});

test('fallo de almacenamiento visible y datos locales malformados recuperables', async () => {
  const app = await browser(new Map([['cgbvp-ascensos-2026-v2', '{broken']]));
  assert.equal(app.run('getStore().history.length'), 0);
  app.run("localStorage.setItem=()=>{throw Error('quota')}; start('exam')");
  assert.equal(app.elements.get('storageWarning').hidden, false);
});

test('cuentas aíslan historial, respuestas y recuperación; invitado conserva sus datos', async () => {
  const app = await browser();
  app.run("start('exam'); choose(session[0].answer)");
  const guestId = app.run('attemptId');
  app.run("window.QuizLocal.switchUser('A')");
  assert.equal(app.run('window.QuizLocal.history().length'), 0);
  assert.equal(app.run('session.length'), 0);
  app.run("start('exam'); choose(session[0].answer); finish(true)");
  assert.equal(app.run('window.QuizLocal.history().length'), 1);
  app.run("window.QuizLocal.switchUser('B')");
  assert.equal(app.run('window.QuizLocal.history().length'), 0);
  assert.equal(app.elements.get('score').textContent, '');
  app.run("window.QuizLocal.switchUser('A')");
  assert.equal(app.run('window.QuizLocal.history().length'), 1);
  app.run('window.QuizLocal.switchUser(null)');
  assert.equal(app.run('attemptId'), guestId);
  assert.equal(app.run('countAnswered()'), 1);
});

test('importación explícita conserva el historial antiguo y es idempotente', async () => {
  const legacy = { date: 1000, correct: 76, wrong: 24, blank: 0, score: 70, seconds: 7200 };
  const storage = new Map([['cgbvp-ascensos-2026-v2', JSON.stringify({ history: [legacy], practice: {} })]]);
  const app = await browser(storage);
  app.run("window.QuizLocal.switchUser('A')");
  assert.equal(app.run('getStore().history.length'), 0);
  app.run('window.QuizLocal.importGuest(); window.QuizLocal.importGuest()');
  assert.equal(app.run('getStore().history.length'), 1);
  assert.equal(app.run('getStore().history[0].score'), 70);
  assert.deepEqual(JSON.parse(storage.get('cgbvp-ascensos-2026-v2')).history, [legacy]);
});

test('el detalle de un simulacro sigue disponible para revisión después de recargar', async () => {
  const app = await browser();
  app.run("start('exam'); choose(session[0].answer); index=1; choose(Object.keys(session[1].options).find(k=>k!==session[1].answer)); finish(true)");
  const saved = app.run('getStore().history[0]');
  assert.equal(saved.details.questionIds.length, 100);
  assert.equal(Object.keys(saved.details.answers).length, 2);
  const again = await browser(app.storage);
  again.run("window.QuizLocal.reviewAttempt(getStore().history[0], $('reviewList'))");
  const cards = again.elements.get('reviewList').children;
  assert.equal(cards.length, 100);
  assert.equal(cards[0].children[1].className, 'good');
  assert.equal(cards[1].children[1].className, 'bad');
  assert.equal(cards[2].children[1].textContent, 'Tu respuesta: Sin responder');
  again.run("window.QuizLocal.reviewAttempt({score:80}, $('reviewList'))");
  assert.match(again.elements.get('reviewList').textContent, /solo se conserva el resumen/);
});

test('progreso de otro dispositivo actualiza repaso, conserva datos locales y no cruza cuentas', async () => {
  const app = await browser();
  app.run("window.QuizLocal.switchUser('A'); window.QuizLocal.mergePractice({1:{correct:false,date:1000,selected:'A',answer:'B'}}); start('mistakes')");
  assert.equal(app.run('session.length'), 1);
  assert.equal(app.run('session[0].id'), 1);
  app.run('choose(session[0].answer)');
  app.run('window.QuizLocal.mergePractice({1:{correct:false,date:1000,selected:"A",answer:"B"}})');
  assert.equal(app.run('getStore().practice[1].correct'), true);
  assert.equal(app.run('getStore().practice[1].selected'), app.run('session[0].answer'));
  app.run("window.QuizLocal.switchUser('B')");
  assert.equal(app.run('Object.keys(getStore().practice).length'), 0);
});

test('conflictos de progreso con la misma fecha convergen independientemente del orden', () => {
  const a = { 1: { correct: false, date: 100, selected: 'B', answer: 'A' } };
  const b = { 1: { correct: true, date: 100, selected: 'A', answer: 'A' } };
  assert.deepEqual(Core.mergePractice(a, b), Core.mergePractice(b, a));
  assert.deepEqual(Core.mergePractice(a, { 201: { correct: false, date: 100 }, 1: { correct: 'false', date: 101 } }), a);
});
