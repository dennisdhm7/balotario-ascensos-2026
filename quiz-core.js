'use strict';

// Compartido por la página estática y las pruebas de Node, sin dependencias.
(function (root) {
  const RULES = Object.freeze({ count: 100, seconds: 7200, penalty: 0.25, pass: 70 });
  const BANK_VERSION = 'cgbvp-2026-v1';
  const BLOCK_COUNT = 20;
  function blocks(bank) {
    const ordered = [...bank].sort((a, b) => a.id - b.id);
    const result = [];
    for (let i = 0; i + BLOCK_COUNT <= ordered.length; i += BLOCK_COUNT) result.push(ordered.slice(i, i + BLOCK_COUNT));
    return result;
  }
  function remaining(deadline, now = Date.now(), seconds = RULES.seconds) {
    return Math.max(0, Math.min(seconds, Math.ceil((deadline - now) / 1000)));
  }
  function grade(questions, answers) {
    const correct = questions.filter(q => answers[q.id] === q.answer).length;
    const wrong = questions.filter(q => answers[q.id] !== undefined && answers[q.id] !== q.answer).length;
    const blank = questions.length - correct - wrong;
    const score = correct - wrong * RULES.penalty;
    return { correct, wrong, blank, score, passed: score >= questions.length * RULES.pass / RULES.count };
  }
  function normalizeStore(value) {
    const s = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return { ...s, history: Array.isArray(s.history) ? s.history : [],
      practice: s.practice && typeof s.practice === 'object' && !Array.isArray(s.practice) ? s.practice : {} };
  }
  function restore(saved, bank) {
    const count = saved?.kind === 'block' ? BLOCK_COUNT : RULES.count;
    if (!saved || typeof saved.id !== 'string' || !Number.isFinite(saved.deadline) ||
        ![undefined, 'full', 'block'].includes(saved.kind) ||
        !Array.isArray(saved.questionIds) || saved.questionIds.length !== count ||
        new Set(saved.questionIds).size !== count) return null;
    const questions = saved.questionIds.map(id => bank.find(q => q.id === id));
    if (questions.some(q => !q)) return null;
    if (saved.kind === 'block' && !blocks(bank).some(group => group.every((q, i) => q.id === saved.questionIds[i]))) return null;
    const answers = {};
    for (const q of questions) {
      const selected = saved.answers?.[q.id];
      if (selected !== undefined && Object.hasOwn(q.options, selected)) answers[q.id] = selected;
    }
    return { ...saved, questions, answers,
      index: Number.isInteger(saved.index) ? Math.max(0, Math.min(count - 1, saved.index)) : 0 };
  }
  function updateMistakes(practice, questions, answers, date = Date.now()) {
    const result = { ...practice };
    for (const q of questions) {
      // Una omisión no borra un error pendiente ni se convierte en un error nuevo.
      if (answers[q.id] !== undefined) result[q.id] = { correct: answers[q.id] === q.answer, date, selected: answers[q.id], answer: q.answer };
    }
    return result;
  }
  function attemptDetails(questions, answers) {
    return { bankVersion: BANK_VERSION, questionIds: questions.map(q => String(q.id)),
      answers: Object.fromEntries(questions.filter(q => answers[q.id] !== undefined).map(q => [q.id, answers[q.id]])),
      answerKey: Object.fromEntries(questions.map(q => [q.id, q.answer])) };
  }
  function validPractice(value) {
    if (!value || typeof value.correct !== 'boolean' || !Number.isInteger(value.date) || value.date < 0) return false;
    if (value.selected === undefined && value.answer === undefined) return true; // Progreso anterior.
    return ['A','B','C','D'].includes(value.selected) && ['A','B','C','D'].includes(value.answer) &&
      value.correct === (value.selected === value.answer);
  }
  function comparePractice(a, b) {
    if (!validPractice(b)) return 1;
    if (a.date !== b.date) return a.date - b.date;
    // Desempate estable para que dos dispositivos converjan incluso con la misma fecha.
    const key = p => JSON.stringify([p.correct ? 1 : 0, p.selected || '', p.answer || '']);
    return key(a) === key(b) ? 0 : key(a) > key(b) ? 1 : -1;
  }
  function mergePractice(local, remote) {
    const result = { ...local };
    for (const [id, value] of Object.entries(remote)) {
      if (/^([1-9]|[1-9][0-9]|1[0-9]{2}|200)$/.test(id) && validPractice(value) && comparePractice(value, result[id]) > 0) {
        result[id] = { correct: value.correct, date: value.date };
        if (value.selected !== undefined) Object.assign(result[id], { selected: value.selected, answer: value.answer });
      }
    }
    return result;
  }
  const api = { RULES, BANK_VERSION, BLOCK_COUNT, blocks, remaining, grade, normalizeStore, restore, updateMistakes,
    attemptDetails, validPractice, comparePractice, mergePractice };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QuizCore = api;
})(globalThis);
