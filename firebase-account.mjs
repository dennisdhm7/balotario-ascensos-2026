import { createCloudService } from './cloud-service.mjs';
import { createFirestoreStore } from './firestore-store.mjs';

const $ = id => document.getElementById(id);
const message = text => { $('accountMessage').textContent = text; };
const errors = {
  'auth/popup-blocked': 'El navegador bloqueó la ventana de Google. Permite ventanas emergentes para este sitio y vuelve a intentarlo.',
  'auth/popup-closed-by-user': 'Se cerró la ventana de Google. Puedes volver a intentarlo.',
  'auth/cancelled-popup-request': 'Ya hay una solicitud de acceso con Google. Vuelve a intentarlo.',
  'auth/operation-not-allowed': 'El acceso con este proveedor no está habilitado en Firebase Authentication.',
  'auth/unauthorized-domain': 'Este dominio no está autorizado en Firebase Authentication. Para la prueba local, añade localhost a los dominios autorizados.',
  'auth/account-exists-with-different-credential': 'Este correo tiene una cuenta con otro método de acceso. Contacta al administrador para habilitar el acceso con Google.',
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/invalid-email': 'Introduce un correo válido.',
  'auth/email-already-in-use': 'No se pudo registrar este correo. Prueba iniciar sesión o recuperar tu contraseña.',
  'auth/weak-password': 'La contraseña no cumple la política del proyecto.',
  'auth/password-does-not-meet-requirements': 'La contraseña no cumple la política del proyecto.',
  'auth/too-many-requests': 'Demasiados intentos. Espera antes de volver a probar.',
  'auth/network-request-failed': 'No hay conexión. Revisa tu conexión e intenta iniciar sesión de nuevo.',
  'permission-denied': 'Acceso rechazado. Verifica tu correo y que hayas aplicado la versión actual de firestore.rules.',
  'unavailable': 'No se pudo conectar. El historial local se conserva; vuelve a sincronizar.',
  'local/invalid-history': 'Algunos resultados locales no tienen un formato válido y no se sincronizaron.'
};
const report = error => message(errors[error.code] || 'No se pudo completar la operación. Revisa tu conexión o inténtalo más tarde.');

async function initialize() {
  const config = window.FIREBASE_CONFIG;
  if (!config?.enabled) { message('El acceso requiere iniciar sesión. Falta configurar Firebase.'); return; }
  if (!['apiKey', 'authDomain', 'projectId', 'appId'].every(k => typeof config[k] === 'string' && config[k])) {
    message('Falta completar la configuración de Firebase para poder iniciar sesión.'); return;
  }
  const version = '12.0.0';
  const [appSDK, authSDK, dbSDK] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${version}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${version}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${version}/firebase-firestore.js`)
  ]);
  const { enabled, ...options } = config;
  const app = appSDK.initializeApp(options);
  const auth = authSDK.getAuth(app), db = dbSDK.getFirestore(app);
  auth.languageCode = 'es';
  // Memoria en Firestore y sesión por pestaña: no dejar una caché remota en equipos compartidos.
  await authSDK.setPersistence(auth, authSDK.browserSessionPersistence);
  const googleProvider = new authSDK.GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  const api = {
    loginGoogle: () => authSDK.signInWithPopup(auth, googleProvider),
    logout: () => authSDK.signOut(auth),
    ...createFirestoreStore(dbSDK, db, window.QuizCore.comparePractice)
  };
  let busy = false;
  const service = createCloudService(api, {
    identity(user) {
      window.QuizLocal.switchUser(user?.uid || null);
      $('accountLoggedOut').hidden = !!user;
      $('accountLoggedIn').hidden = !user;
      $('accountIdentity').textContent = user ? `${user.email} · ${user.emailVerified ? 'Correo verificado' : 'Correo pendiente de verificación'}` : '';
      $('syncHistory').disabled = !user?.emailVerified;
      $('importHistory').disabled = !user?.emailVerified;
      message(user ? (user.emailVerified ? 'Cuenta lista. Los simulacros finalizados se sincronizan automáticamente.' : 'La sincronización requiere un correo verificado por Google.') : 'Inicia sesión para resolver el balotario. Tus datos locales anteriores se conservan.');
    },
    localHistory: () => window.QuizLocal.history(),
    localPractice: () => window.QuizLocal.practice(),
    practice: rows => window.QuizLocal.mergePractice(rows),
    history(rows) {
      const area = $('individualHistory'); area.replaceChildren();
      if (!rows.length) { area.textContent = 'No hay resultados sincronizados para mostrar.'; return; }
      const list = document.createElement('ol');
      for (const row of rows) {
        const item = document.createElement('li');
        const title = row.kind === 'block' ? `Bloque ${row.details.questionIds[0]}–${row.details.questionIds.at(-1)}` : 'Simulacro de 100';
        item.textContent = `${new Date(row.date).toLocaleString('es-PE')} · ${title} · ${row.score.toFixed(2)} / ${row.kind === 'block' ? 20 : 100} puntos · ${row.correct} correctas, ${row.wrong} incorrectas, ${row.blank} en blanco · ${Math.floor(row.seconds / 60)} min`;
        if (row.details) {
          const button = document.createElement('button'), detail = document.createElement('div');
          button.type = 'button'; button.className = 'outline'; button.textContent = 'Revisar respuestas';
          button.setAttribute('aria-expanded', 'false'); detail.hidden = true;
          button.onclick = () => {
            detail.hidden = !detail.hidden;
            button.setAttribute('aria-expanded', String(!detail.hidden));
            if (!detail.hidden) window.QuizLocal.reviewAttempt(row, detail);
          };
          item.append(button, detail);
        } else {
          const note = document.createElement('p'); note.textContent = 'Intento antiguo: solo se conserva el resumen.'; item.append(note);
        }
        list.append(item);
      }
      area.append(list);
    },
    error: report
  });
  async function action(operation, success) {
    if (busy) return;
    busy = true;
    $('accountActions').disabled = true;
    try { await operation(); if (success) message(success); }
    catch (error) { report(error); }
    finally { busy = false; $('accountActions').disabled = false; }
  }
  $('googleLogin').onclick = () => void action(() => service.loginGoogle());
  $('logoutAccount').onclick = () => void action(() => service.logout());
  $('syncHistory').onclick = () => void service.sync();
  $('importHistory').onclick = () => {
    if (!confirm('¿Confirmas que el historial de invitado de este dispositivo te pertenece y deseas copiarlo a tu cuenta?')) return;
    window.QuizLocal.importGuest(); void service.sync();
  };
  window.addEventListener('quiz-history-changed', () => void service.sync());
  window.addEventListener('quiz-practice-changed', () => void service.sync());
  window.addEventListener('online', () => void service.sync());
  authSDK.onAuthStateChanged(auth, user => service.change(user), report);
  $('accountActions').disabled = false;
}
initialize().catch(() => message('No se pudo iniciar Firebase. Para resolver el balotario necesitas iniciar sesión. Revisa la configuración y la conexión.'));
