// Lógica independiente del DOM; el adaptador Firebase se inyecta para las pruebas.
export function attemptData(item) {
  const fields = ['date', 'score', 'correct', 'wrong', 'blank', 'seconds'];
  if (!item || !fields.every(k => Number.isFinite(item[k])) ||
      !['correct', 'wrong', 'blank', 'seconds', 'date'].every(k => Number.isInteger(item[k])) ||
      item.date < 0 || item.seconds < 0 || item.seconds > 7200 ||
      item.correct < 0 || item.wrong < 0 || item.blank < 0 ||
      item.correct + item.wrong + item.blank !== 100 || item.score !== item.correct - item.wrong * .25) return null;
  const data = Object.fromEntries(fields.map(k => [k, item[k]]));
  if (item.details !== undefined) {
    const d = item.details;
    const letters = ['A', 'B', 'C', 'D'];
    const map = value => value && typeof value === 'object' && !Array.isArray(value);
    if (!d || typeof d.bankVersion !== 'string' || !d.bankVersion.length || d.bankVersion.length > 80 ||
        !Array.isArray(d.questionIds) || d.questionIds.length !== 100 || new Set(d.questionIds).size !== 100 ||
        !d.questionIds.every(id => typeof id === 'string' && /^([1-9]|[1-9][0-9]|1[0-9]{2}|200)$/.test(id)) ||
        !map(d.answers) || !map(d.answerKey) || Object.keys(d.answerKey).length !== 100 ||
        !d.questionIds.every(id => letters.includes(d.answerKey[id])) ||
        !Object.entries(d.answers).every(([id, letter]) => d.questionIds.includes(id) && letters.includes(letter))) return null;
    const correct = d.questionIds.filter(id => d.answers[id] === d.answerKey[id]).length;
    const wrong = Object.keys(d.answers).length - correct;
    if (correct !== data.correct || wrong !== data.wrong || 100 - correct - wrong !== data.blank) return null;
    data.details = { bankVersion: d.bankVersion, questionIds: [...d.questionIds], answers: { ...d.answers }, answerKey: { ...d.answerKey } };
  }
  return data;
}

export function practiceData(value) {
  if (!value || typeof value.correct !== 'boolean' || !Number.isInteger(value.date) || value.date < 0) return null;
  const data = { correct: value.correct, date: value.date };
  if (value.selected !== undefined || value.answer !== undefined) {
    if (!['A','B','C','D'].includes(value.selected) || !['A','B','C','D'].includes(value.answer) ||
        value.correct !== (value.selected === value.answer)) return null;
    Object.assign(data, { selected: value.selected, answer: value.answer });
  }
  return data;
}

export function createCloudService(api, view) {
  let current = null, generation = 0, unsubscribe = () => {}, stopPractice = () => {};
  let running = false, requested = false;
  const sentAttempts = new Set(), sentPractice = new Map();
  function authorized() { return current && current.emailVerified; }
  function change(user) {
    generation++;
    sentAttempts.clear(); sentPractice.clear();
    unsubscribe(); unsubscribe = () => {};
    stopPractice(); stopPractice = () => {};
    current = user;
    view.identity(user);
    view.history([]);
    if (authorized()) {
      const token = generation;
      unsubscribe = api.watch(user.uid, rows => { if (token === generation) view.history(rows); },
        error => { if (token === generation) view.error(error); });
      stopPractice = api.watchPractice(user.uid, rows => { if (token === generation) view.practice(rows); },
        error => { if (token === generation) view.error(error); });
      void sync();
    }
  }
  async function sync() {
    requested = true;
    if (running) return;
    running = true;
    try {
      while (requested) {
        requested = false;
        if (!authorized()) continue;
        const uid = current.uid, token = generation;
        let invalid = 0;
        for (const item of view.localHistory()) {
          if (token !== generation) break;
          const data = attemptData(item);
          if (!data || typeof item.id !== 'string' || !/^[\w-]{1,160}$/.test(item.id)) { invalid++; continue; }
          if (sentAttempts.has(item.id)) continue;
          try { await api.save(uid, item.id, data); if (token === generation) sentAttempts.add(item.id); }
          catch (error) { if (token === generation) view.error(error); break; }
        }
        if (invalid && token === generation) view.error({ code: 'local/invalid-history' });
        for (const [id, value] of Object.entries(view.localPractice())) {
          if (token !== generation) break;
          const data = practiceData(value);
          if (!data || !/^([1-9]|[1-9][0-9]|1[0-9]{2}|200)$/.test(id)) continue;
          const signature = JSON.stringify(data);
          if (sentPractice.get(id) === signature) continue;
          try { await api.savePractice(uid, id, data); if (token === generation) sentPractice.set(id, signature); }
          catch (error) { if (token === generation) view.error(error); break; }
        }
      }
    } finally { running = false; }
  }
  return {
    change, sync,
    async register(email, password) {
      const user = await api.register(email, password);
      await api.verify(user);
    },
    login: (email, password) => api.login(email, password),
    logout: () => api.logout(),
    reset: email => api.reset(email),
    async verify() { if (current) await api.verify(current); },
    async refresh() {
      const user = current;
      if (!user) return;
      const token = generation;
      await api.reload(user);
      await api.refreshToken(user);
      if (token === generation) change(user);
    },
    dispose() { generation++; unsubscribe(); stopPractice(); current = null; }
  };
}
