export const ADMIN_EMAIL = 'dark815@gmail.com';

export function createAdminService(auth, db, fail) {
  async function authorize(request) {
    if (!request.auth) throw fail('unauthenticated', 'Inicia sesión.');
    // Consultar la cuenta actual impide usar tokens de una cuenta eliminada o deshabilitada.
    const user = await auth.getUser(request.auth.uid);
    if (user.disabled || !user.emailVerified || user.email?.toLowerCase() !== ADMIN_EMAIL ||
        request.auth.token.email !== user.email || !request.auth.token.email_verified ||
        request.auth.token.firebase?.sign_in_provider !== 'google.com') {
      throw fail('permission-denied', 'Se requiere la cuenta administradora de Google.');
    }
    return user;
  }
  function uidOf(data) {
    if (typeof data?.uid !== 'string' || !data.uid.length || data.uid.length > 128 || data.uid.includes('/')) {
      throw fail('invalid-argument', 'Cuenta inválida.');
    }
    return data.uid;
  }
  return {
    async list(request) {
      await authorize(request);
      const pageToken = request.data?.pageToken;
      if (pageToken !== undefined && (typeof pageToken !== 'string' || pageToken.length > 4096)) {
        throw fail('invalid-argument', 'Página inválida.');
      }
      const page = await auth.listUsers(50, pageToken);
      return { users: page.users.map(user => ({
        uid: user.uid, email: user.email || '', name: user.displayName || '', disabled: user.disabled,
        createdAt: user.metadata.creationTime, lastSignIn: user.metadata.lastSignInTime || null
      })), pageToken: page.pageToken || null };
    },
    async grades(request) {
      await authorize(request);
      const uid = uidOf(request.data);
      const before = request.data?.before;
      if (before !== undefined && (typeof before !== 'string' || !before.length || before.includes('/'))) {
        throw fail('invalid-argument', 'Página inválida.');
      }
      let query = db.collection('users').doc(uid).collection('attempts').orderBy('__name__');
      if (before) query = query.startAfter(before);
      const snapshot = await query.limit(51).get();
      const docs = snapshot.docs.slice(0, 50);
      return { attempts: docs.map(doc => {
        const d = doc.data();
        return { id: doc.id, date: d.date, score: d.score, correct: d.correct,
          wrong: d.wrong, blank: d.blank, seconds: d.seconds, count: d.kind === 'block' ? 20 : 100 };
      }), before: snapshot.docs.length > 50 ? docs.at(-1).id : null };
    },
    async remove(request) {
      const admin = await authorize(request);
      const uid = uidOf(request.data);
      if (uid === admin.uid) throw fail('failed-precondition', 'No puedes eliminar tu cuenta administradora.');
      let target;
      try { target = await auth.getUser(uid); }
      catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
      if (target?.email?.toLowerCase() === ADMIN_EMAIL) throw fail('failed-precondition', 'Cuenta protegida.');
      // Bloquear primero; si la limpieza falla se puede reintentar sin permitir nuevas escrituras.
      if (target) {
        await auth.updateUser(uid, { disabled: true });
        await auth.revokeRefreshTokens(uid);
      }
      const ref = db.collection('users').doc(uid);
      await ref.set({ deleting: true }, { merge: true });
      await db.recursiveDelete(ref.collection('attempts'));
      await db.recursiveDelete(ref.collection('practice'));
      if (target) await auth.deleteUser(uid);
      // Conservar marcador: tokens emitidos antes del borrado no pueden volver a escribir.
      return { deleted: true };
    }
  };
}
