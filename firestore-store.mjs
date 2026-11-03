// Adaptador compartido por el navegador y las pruebas del emulador.
export function createFirestoreStore(sdk, db, comparePractice) {
  return {
    watch: (uid, next, fail) => sdk.onSnapshot(sdk.query(
      sdk.collection(db, 'users', uid, 'attempts'), sdk.orderBy('date', 'desc'), sdk.limit(100)),
    snap => next(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))), fail),
    save: (uid, id, data) => sdk.runTransaction(db, async transaction => {
      const ref = sdk.doc(db, 'users', uid, 'attempts', id);
      const existing = await transaction.get(ref);
      if (!existing.exists()) transaction.set(ref, { ...data, createdAt: sdk.serverTimestamp() });
    }),
    watchPractice: (uid, next, fail) => sdk.onSnapshot(sdk.collection(db, 'users', uid, 'practice'),
      snap => next(Object.fromEntries(snap.docs.map(doc => [doc.id, doc.data()]))), fail),
    savePractice: (uid, id, data) => sdk.runTransaction(db, async transaction => {
      const ref = sdk.doc(db, 'users', uid, 'practice', id);
      const existing = await transaction.get(ref);
      if (!existing.exists() || comparePractice(data, existing.data()) > 0) {
        transaction.set(ref, { ...data, updatedAt: sdk.serverTimestamp() });
      }
    })
  };
}
