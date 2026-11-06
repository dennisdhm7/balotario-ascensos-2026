import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import * as sdk from 'firebase/firestore';
import Core from '../quiz-core.js';
import { createFirestoreStore } from '../firestore-store.mjs';

let env;
const data = () => ({ date: 1000, correct: 76, wrong: 24, blank: 0, score: 70, seconds: 7200, createdAt: serverTimestamp() });
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-balotario-2026', firestore: {
    rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
  } });
});
after(async () => { await env?.cleanup(); });
const db = (uid, verified = true) => env.authenticatedContext(uid, { email_verified: verified }).firestore();

test('el marcador de eliminación bloquea tokens anteriores y no lo puede retirar el usuario', async () => {
  const uid = 'deleted-account', client = db(uid);
  await assertSucceeds(setDoc(doc(client, `users/${uid}/attempts/old`), data()));
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), `users/${uid}`), { deleting: true });
  });
  await assertFails(getDoc(doc(client, `users/${uid}/attempts/old`)));
  await assertFails(setDoc(doc(client, `users/${uid}/attempts/new`), data()));
  await assertFails(setDoc(doc(client, `users/${uid}/practice/1`), { correct: true, date: 1000, updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(client, `users/${uid}`)));
});

test('solo el propietario verificado crea y consulta su historial', async () => {
  const a = db('A'), b = db('B');
  const path = 'users/A/attempts/valid';
  await assertSucceeds(setDoc(doc(a, path), data()));
  await assertSucceeds(getDoc(doc(a, path)));
  assert.equal((await assertSucceeds(getDocs(collection(a, 'users/A/attempts')))).size, 1);
  await assertFails(getDoc(doc(b, path)));
  await assertFails(getDocs(collection(b, 'users/A/attempts')));
  await assertFails(setDoc(doc(b, 'users/A/attempts/foreign'), data()));
  const anon = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon, path)));
  await assertFails(setDoc(doc(anon, 'users/A/attempts/anon'), data()));
  await assertFails(getDoc(doc(db('A', false), path)));
  await assertFails(setDoc(doc(db('A', false), 'users/A/attempts/unverified'), data()));
});

test('resultados inmutables y rutas no previstas denegadas', async () => {
  const a = db('A');
  await assertSucceeds(setDoc(doc(a, 'users/A/attempts/immutable'), data()));
  await assertFails(updateDoc(doc(a, 'users/A/attempts/immutable'), { score: 100 }));
  await assertFails(deleteDoc(doc(a, 'users/A/attempts/immutable')));
  await assertFails(setDoc(doc(a, 'users/A'), { role: 'admin' }));
  await assertFails(setDoc(doc(a, 'public/test'), { value: true }));
  await assertFails(setDoc(doc(a, 'users/A/attempts/bad.id'), data()));
});

test('validación rechaza campos extra, ausentes, tipos y puntuación inválidos', async () => {
  const a = db('A');
  const missing = data(); delete missing.seconds;
  const invalid = [
    { ...data(), role: 'admin' }, missing, { ...data(), score: 71 },
    { ...data(), seconds: 7201 }, { ...data(), seconds: -1 },
    { ...data(), correct: '76' }, { ...data(), date: 'ayer' },
    { ...data(), wrong: 25 }, { ...data(), blank: -1 },
    { ...data(), createdAt: new Date(0) }
  ];
  for (const [i, value] of invalid.entries()) await assertFails(setDoc(doc(a, `users/A/attempts/invalid-${i}`), value));
});

test('acepta puntajes negativos y preguntas en blanco', async () => {
  const a = db('A');
  await assertSucceeds(setDoc(doc(a, 'users/A/attempts/negative'), { ...data(), correct: 0, wrong: 100, score: -25 }));
  await assertSucceeds(setDoc(doc(a, 'users/A/attempts/blank'), { ...data(), correct: 0, wrong: 0, blank: 100, score: 0, seconds: 0 }));
});

const details = () => ({ bankVersion: 'cgbvp-2026-v1', questionIds: Array.from({ length: 100 }, (_, i) => String(i + 1)),
  answers: { 1: 'A', 2: 'B' }, answerKey: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [String(i + 1), 'A'])) });

test('guarda detalles privados y rechaza estructuras inválidas', async () => {
  const a = db('detail-owner');
  await assertSucceeds(setDoc(doc(a, 'users/detail-owner/attempts/detail'), { ...data(), details: details() }));
  await assertFails(getDoc(doc(db('B'), 'users/detail-owner/attempts/detail')));
  const invalid = [
    { ...details(), answers: { 101: 'A' } }, { ...details(), answerKey: {} },
    { ...details(), questionIds: Array(100).fill('1') }, { ...details(), answers: { 1: 'Z' } },
    { ...details(), answerKey: { ...details().answerKey, 1: 1 } },
    { ...details(), extra: true }, { ...details(), bankVersion: 1 },
    { questionIds: details().questionIds }, 'invalid'
  ];
  for (const [i, value] of invalid.entries()) await assertFails(setDoc(doc(a, `users/detail-owner/attempts/bad-${i}`), { ...data(), details: value }));
});

test('progreso privado y verificado admite formatos antiguos y respuestas nuevas', async () => {
  const a = db('progress-owner'), path = 'users/progress-owner/practice/1';
  const progress = { correct: false, date: 100, selected: 'A', answer: 'B', updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(a, path), progress));
  await assertSucceeds(getDocs(collection(a, 'users/progress-owner/practice')));
  await assertFails(getDoc(doc(db('B'), path)));
  await assertFails(getDocs(collection(db('B'), 'users/progress-owner/practice')));
  await assertFails(setDoc(doc(db('B'), path), progress));
  await assertFails(getDoc(doc(db('progress-owner', false), path)));
  await assertFails(setDoc(doc(db('progress-owner', false), path), progress));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), path)));
  await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), path), progress));
  await assertSucceeds(setDoc(doc(a, path), { correct: true, date: 200, selected: 'B', answer: 'B', updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(a, path), { ...progress, date: 100 }));
  await assertSucceeds(setDoc(doc(a, 'users/progress-owner/practice/2'), { correct: false, date: 1, updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(a, path)));
});

test('rechaza progreso inválido y campos ajenos', async () => {
  const a = db('progress-invalid'), path = 'users/progress-invalid/practice/1';
  const progress = { correct: false, date: 100, selected: 'A', answer: 'B', updatedAt: serverTimestamp() };
  const invalid = [
    { ...progress, role: 'admin' }, { ...progress, correct: 'false' },
    { ...progress, correct: true }, { ...progress, selected: 'Z' },
    { ...progress, date: -1 }, { ...progress, updatedAt: new Date(0) },
    { correct: false, date: 1, selected: 'A', updatedAt: serverTimestamp() },
    { correct: false, date: 1, answer: 'B', updatedAt: serverTimestamp() }
  ];
  for (const value of invalid) await assertFails(setDoc(doc(a, path), value));
  for (const id of ['0', '201', '01', 'question']) await assertFails(setDoc(doc(a, `users/progress-invalid/practice/${id}`), progress));
});

test('adaptador real: reintentos idempotentes y progreso convergente entre dispositivos', async () => {
  const a = db('devices'), b = db('devices');
  const first = createFirestoreStore(sdk, a, Core.comparePractice);
  const second = createFirestoreStore(sdk, b, Core.comparePractice);
  const summary = { date: 1000, correct: 1, wrong: 1, blank: 98, score: .75, seconds: 60, details: details() };
  await first.save('devices', 'attempt', summary);
  await second.save('devices', 'attempt', summary);
  const result = (await getDoc(doc(b, 'users/devices/attempts/attempt'))).data();
  assert.deepEqual(result.details, summary.details);
  assert.equal((await getDocs(collection(b, 'users/devices/attempts'))).size, 1);
  await first.savePractice('devices', '1', { correct: false, date: 100, selected: 'A', answer: 'B' });
  await second.savePractice('devices', '1', { correct: true, date: 200, selected: 'B', answer: 'B' });
  // Un dispositivo que vuelve sin conexión actualizada no revierte el acierto.
  await first.savePractice('devices', '1', { correct: false, date: 100, selected: 'A', answer: 'B' });
  const saved = (await getDoc(doc(a, 'users/devices/practice/1'))).data();
  assert.equal(saved.correct, true);
  assert.equal(saved.date, 200);
  await Promise.all([
    first.savePractice('devices', '2', { correct: false, date: 300, selected: 'A', answer: 'B' }),
    second.savePractice('devices', '2', { correct: true, date: 300, selected: 'B', answer: 'B' })
  ]);
  assert.equal((await getDoc(doc(a, 'users/devices/practice/2'))).data().correct, true);
});

test('historial de bloques admite 20 preguntas, mantiene el aislamiento y rechaza reglas incoherentes', async () => {
  const a = db('blocks');
  const questions = Array.from({ length: 20 }, (_, i) => ({ id: i + 21, answer: 'B' }));
  const value = { ...data(), kind: 'block', questionCount: 20, correct: 1, wrong: 1, blank: 18, score: .75,
    seconds: 1440, details: Core.attemptDetails(questions, { 21: 'B', 22: 'A' }) };
  await assertSucceeds(setDoc(doc(a, 'users/blocks/attempts/valid'), value));
  await assertFails(getDoc(doc(db('B'), 'users/blocks/attempts/valid')));
  const invalid = [
    { ...value, seconds: 1441 }, { ...value, questionCount: 100 }, { ...value, blank: 98 },
    { ...value, kind: 'unknown' }, { ...value, details: details() },
    { ...data(), questionCount: 20 }, { ...data(), kind: 'block' }
  ];
  for (const [i, row] of invalid.entries()) await assertFails(setDoc(doc(a, `users/blocks/attempts/invalid-${i}`), row));
  const summary = { ...value }; delete summary.details;
  await assertFails(setDoc(doc(a, 'users/blocks/attempts/no-detail'), summary));
});
