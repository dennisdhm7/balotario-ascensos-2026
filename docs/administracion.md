# Administración de cuentas

La cuenta Google verificada `dark815@gmail.com` conserva el acceso de estudio y tiene el botón **Administrar usuarios** dentro de **Mi cuenta**. El servidor comprueba su identidad en cada operación. No se otorgan permisos administrativos a otros clientes ni se abren las reglas de lectura de Firestore.

El panel lista todas las cuentas de Firebase Authentication, incluidas las anteriores a esta mejora, en páginas de 50. Muestra registro, estado y notas sincronizadas (páginas de 50). Los resultados que solo estén en un navegador no están disponibles para el administrador.

## Activación

El despliegue estático al VPS no despliega Cloud Functions. Desde una sesión con Firebase CLI autenticada y permisos sobre el proyecto:

```powershell
npm --prefix functions install
npx firebase-tools deploy --only functions:admin,firestore:rules --project balotario-ascensos-2026
```

Cloud Functions requiere un proyecto con facturación habilitada (plan Blaze). Las funciones se alojan en `us-central1` y utilizan la identidad de servicio del entorno; no se deben copiar credenciales Admin al navegador. Después publicar los archivos estáticos mediante el flujo habitual del VPS.

## Eliminación

La confirmación del panel elimina la cuenta de Authentication y sus colecciones `attempts` y `practice`. Primero se deshabilita la cuenta y se revocan sus sesiones. Se conserva únicamente `users/{uid}` con `deleting: true`, sin correo ni notas, para que un token todavía vigente no pueda recrear datos. Las reglas nuevas deben desplegarse antes de usar la eliminación. Si falla la limpieza, la cuenta puede quedar deshabilitada: reintentar desde el panel completa el proceso. La cuenta administradora está protegida contra eliminación.

Eliminar no borra datos de los navegadores ni impide que la persona vuelva a registrarse con Google con un UID nuevo. No es una prohibición permanente de acceso.

## Validación

`npm test` incluye pruebas de autorización, protección del administrador, orden de eliminación y reintentos con dependencias simuladas. `npm run test:rules` comprueba las reglas en el emulador. La validación completa requiere desplegar, entrar con la cuenta administradora, consultar una cuenta de prueba con notas y eliminarla después de confirmar. Revisar también que otra cuenta no pueda invocar las funciones ni leer datos ajenos.

Referencias: [funciones invocables](https://firebase.google.com/docs/functions/callable), [administración de usuarios](https://firebase.google.com/docs/auth/admin/manage-users).
