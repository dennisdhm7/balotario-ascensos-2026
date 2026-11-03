# Balotario de Ascensos CGBVP 2026

Aplicación web de práctica y simulacros basada en el PDF de 200 preguntas aportado por el usuario.

## Publicación

Los archivos necesarios para GitHub Pages son `index.html`, `style.css`, `quiz-core.js`, `app.js`, `questions.json`, `firebase-config.js`, `firebase-account.mjs`, `cloud-service.mjs` y `firestore-store.mjs`. Se sirven como archivos estáticos, sin compilación ni dependencias de producción.

La clave de respuestas procede del balotario proporcionado y no ha sido verificada independientemente. El progreso se conserva localmente y, con una cuenta verificada, también se sincroniza con Firestore.

## Funcionamiento

Herramienta de autoestudio no oficial. El modo invitado funciona sin configurar Firebase; las cuentas e historial en línea son opcionales.

- Simulacro de 100 preguntas distintas, elegidas aleatoriamente, con 120 minutos de duración.
- Puntaje: +1 por correcta, −0.25 por incorrecta y 0 por pregunta en blanco. Aprobación desde 70; el puntaje puede ser negativo.
- En el simulacro puedes cambiar una respuesta o usar «Dejar en blanco». En práctica, la corrección inmediata mantiene bloqueada la respuesta.
- El intento se guarda con su orden, respuestas, posición y fecha límite. Se recupera automáticamente al recargar. Salir o cerrar la página no pausa el tiempo; si venció, se finaliza al recuperarlo.
- Los errores de práctica y simulacro alimentan el repaso. Acertar retira el error; una omisión conserva el estado previo.
- Se conserva la clave local `cgbvp-ascensos-2026-v2`, el historial anterior y el progreso existente. Los intentos antiguos no contienen respuestas detalladas, por lo que no se pueden reconstruir sus errores.
- Si falla el almacenamiento, aparece un aviso. Borrar los datos del navegador elimina lo que todavía no se haya sincronizado y los borradores. La recuperación del simulacro en curso requiere el mismo navegador y origen; utiliza una sola pestaña para cada intento.
- El reloj usa la fecha del dispositivo y no certifica resultados ni impide su manipulación.

## Pruebas

Con Node.js 22 o posterior, sin instalar dependencias:

```sh
node --test tests/quiz.test.cjs
node --check app.js
node --check quiz-core.js
```

Las pruebas cubren puntuación, aprobación, vencimiento, recuperación tras recarga, respuestas en blanco, repaso, conservación de datos anteriores y fallos de almacenamiento. La integración se ejecuta con un DOM y reloj simulados; no sustituye una revisión visual en navegador.


## Configuración de Firebase (sin cambiar el alojamiento)

La aplicación sigue siendo estática y usa rutas relativas, compatibles con GitHub Pages bajo `/nombre-del-repositorio/`. Firebase proporciona Authentication y Firestore; no se necesita Firebase Hosting ni un servidor propio. No hay compilación para producción. El SDK modular web se carga desde el CDN oficial, fijado en la versión 12.0.0.

1. Crea o selecciona un proyecto en Firebase Console y registra una aplicación web.
2. En Authentication → Sign-in method, activa **Email/Password**. Configura una política de contraseñas y activa protección contra enumeración de correos. No hace falta activar enlaces de acceso sin contraseña.
3. En Authentication → Settings → Authorized domains, añade el dominio de GitHub Pages (`tuusuario.github.io`) o tu dominio personalizado. Añade `localhost` para desarrollo si lo necesitas. El dominio se escribe sin la ruta del repositorio.
4. Revisa las plantillas de verificación y recuperación en Authentication → Templates. Esta implementación usa el manejador de acciones alojado por Firebase: el usuario abre el correo, completa la acción allí y vuelve a la página. Tras verificar, pulsa **Ya verifiqué mi correo**, que recarga el usuario y renueva el token.
5. Crea una base **Cloud Firestore Standard**, base `(default)`, eligiendo conscientemente su región. Usa modo producción; no habilites reglas abiertas.
6. Copia `apiKey`, `authDomain`, `projectId` y `appId` de la configuración de la aplicación web a `firebase-config.js`. Cambia `enabled` a `true`. La configuración web es pública; nunca incluyas contraseñas, claves privadas ni archivos de cuenta de servicio. Usa un proyecto de desarrollo para probar antes de producción.
7. Antes de utilizar datos reales, configura las reglas de `firestore.rules` en el proyecto correcto. `firebase.json` apunta a ellas. La aplicación puede probarse localmente sin publicar la página. **Esta entrega no despliega reglas ni publica cambios.** Cuando autorices el despliegue, podrás aplicar únicamente las reglas con Firebase CLI o copiarlas a la consola; comprueba primero el ID del proyecto.

Fuentes oficiales: [SDK web mediante CDN](https://firebase.google.com/docs/web/alt-setup), [correo y contraseña](https://firebase.google.com/docs/auth/web/password-auth), [verificación y recuperación](https://firebase.google.com/docs/auth/web/manage-users), [validación en reglas](https://firebase.google.com/docs/firestore/security/rules-fields).

### Cuentas y datos

- Registro, inicio/cierre de sesión, reenvío de verificación y recuperación de contraseña están disponibles en el panel de cuenta. Solo un correo verificado puede consultar o guardar historial remoto.
- La sesión de Authentication dura la sesión de la pestaña. Firestore utiliza caché en memoria; no se activa su persistencia en disco. Cierra sesión al terminar en un equipo compartido.
- El progreso de invitado permanece en `cgbvp-ascensos-2026-v2`. Cada usuario usa una clave local separada por UID para práctica, borradores e historial pendiente. Al cambiar de cuenta se limpian los datos visibles y se detiene el temporizador anterior; su fecha límite permanece intacta.
- Un simulacro empezado como invitado permanece como invitado. Iniciar sesión no transfiere ese borrador. Al cerrar sesión se recupera el borrador del invitado, si existe.
- Los resultados de cuentas se escriben en `users/{uid}/attempts/{attemptId}`: fecha local de finalización en milisegundos, puntaje, correctas, incorrectas, en blanco, segundos utilizados, `createdAt` generado por el servidor y el detalle de los intentos nuevos (ver esquema debajo). No se guarda contraseña ni se duplica el correo en Firestore.
- Los resultados son inmutables desde el cliente. Una transacción consulta el ID antes de crear para que un reintento no duplique el resultado. La sincronización de historial y progreso se intenta al iniciar sesión verificada, responder en práctica o repaso, finalizar un simulacro, recuperar conectividad o pulsar **Sincronizar historial**. En una sesión solo se vuelven a enviar las preguntas modificadas; un cambio de cuenta limpia ese registro. Si falla, los resultados locales siguen disponibles para reintentar.
- El panel muestra en tiempo real hasta los 100 resultados remotos más recientes. El historial remoto ofrece **Revisar respuestas** para los intentos nuevos. Las tarjetas de cantidad y último resultado siguen contando los simulacros locales; el progreso por pregunta y **Repasar errores** sí incorporan los datos sincronizados de la cuenta. Los borradores no se sincronizan.
- **Importar historial de invitado** requiere confirmar que te pertenece. Copia los intentos a la cuenta (incluido su detalle cuando existe), sin borrar el original y sin duplicarlos al repetir. No importa borradores ni práctica de invitado. Los registros antiguos inválidos se conservan localmente pero no se envían.
- Las reglas deniegan invitados, correos sin verificar, acceso entre usuarios, campos extra, puntajes incoherentes, tipos inválidos, modificaciones de intentos finalizados y borrados. El progreso por pregunta admite actualizaciones del propietario con fecha igual o posterior. Ninguna otra colección está habilitada. Un correo verificado no acredita pertenencia al CGBVP.
- Las notas se calculan en el navegador y son de autoestudio; las reglas comprueban coherencia, no autenticidad académica. Los datos locales siguen siendo accesibles a quien tenga acceso al perfil del navegador. Usa una sola pestaña por intento y evita guardar datos personales adicionales.

### Pruebas de cuentas y reglas

Con Node.js 22 y Java 21 o posterior:

```sh
npm ci
npm test
npm run test:rules
```

`npm test` no usa la red ni un proyecto real. Cubre los simulacros, el aislamiento de progreso local, importación, registro, verificación, recuperación, cambio de cuenta, respuestas asíncronas antiguas, detalle de intentos, repaso entre dispositivos, conflictos y reintentos. El SDK se sustituye por un adaptador simulado en estas pruebas.

`npm run test:rules` inicia solamente el emulador local de Firestore con el proyecto ficticio `demo-balotario-2026` y prueba las reglas reales con identidades simuladas, además del adaptador de transacciones real (reintentos, aislamiento y conflictos entre dispositivos). La primera ejecución descarga el emulador. No despliega recursos ni usa credenciales de producción. Véase [pruebas de reglas con Emulator Suite](https://firebase.google.com/docs/rules/unit-tests).

Para revisión manual sirve la carpeta por HTTP (por ejemplo, `python -m http.server 8000`) y abre `http://localhost:8000`. Con un proyecto de desarrollo configurado, comprueba registro y recepción de los correos, verificación, recuperación, cierre de sesión, consulta desde otro dispositivo, modo sin conexión y dos usuarios diferentes. Estas pruebas de entrega de correo requieren un proyecto real y no se sustituyen por pruebas unitarias.


### Detalle de respuestas y repaso sincronizado

**Tras instalar esta mejora hay que reemplazar las reglas de Firebase Console por la nueva versión de `firestore.rules`.** Las reglas anteriores rechazan el campo `details` y la colección `practice`. No se han desplegado reglas ni cambiado datos de producción desde estas pruebas.

Los intentos nuevos contienen, además del resumen, un mapa `details`:

- `bankVersion`: `cgbvp-2026-v1`.
- `questionIds`: 100 identificadores como cadenas, en el orden del intento.
- `answers`: mapa de identificador a opción elegida (`A`, `B`, `C`, `D`). Las preguntas sin responder no tienen entrada.
- `answerKey`: mapa de identificador a opción correcta al finalizar, conservado para futuras revisiones.

Ejemplo de ubicación: `users/TU_UID/attempts/ID_DEL_INTENTO/details` (es un campo del documento, no una subcolección). Puedes desplegar ese mapa en Firebase Console para ver las respuestas. Los enunciados y las opciones se muestran desde `questions.json`; no se duplica todo el banco por intento. Si cambias el contenido del banco, actualiza también `BANK_VERSION` en `quiz-core.js`. La revisión avisa si la versión difiere y conserva la clave guardada, aunque muestra el texto del banco actual.

El progreso se guarda en documentos separados: `users/TU_UID/practice/ID_DE_PREGUNTA`, con `correct` (verdadero/falso), `selected` (opción elegida), `answer` (clave), `date` (fecha de la respuesta) y `updatedAt` (marca del servidor). El progreso local antiguo, que solo tiene `correct` y `date`, también se conserva y sincroniza; no se inventa la opción elegida que no se guardó.

Cada respuesta de práctica/repaso actualiza esa pregunta; finalizar el simulacro actualiza únicamente sus preguntas respondidas. Las omisiones no borran errores anteriores. La colección se escucha en tiempo real para alimentar **Repasar errores** en otros dispositivos con la misma cuenta. Una transacción conserva la respuesta de fecha más reciente; en un empate se utiliza un orden estable del contenido para que ambos dispositivos converjan. Las fechas proceden del dispositivo: mantén su reloj correcto. Una respuesta antigua pendiente de subir no revierte una más reciente.

Los intentos antiguos conservan solo sus resúmenes y siguen siendo legibles. No es posible reconstruir sus respuestas ni modificar esos documentos inmutables. El detalle empieza con los simulacros nuevos finalizados tras esta mejora. El historial local también incluye revisión de los últimos 10 intentos del dispositivo.

Comprobación manual sugerida, después de actualizar las reglas:

1. Inicia sesión con correo verificado, termina un simulacro con una correcta, una incorrecta y alguna en blanco.
2. En Firestore abre el documento del intento y su campo `details`; revisa también `users/TU_UID/practice`.
3. Recarga y usa **Revisar respuestas** en el historial; debe mantener el orden y las omisiones.
4. Abre la misma cuenta en otro dispositivo, consulta el intento y entra en **Repasar errores**.
5. Corrige un error allí y vuelve al primer dispositivo: al iniciar un nuevo repaso ya no debe aparecer ese error.
6. Prueba perder y recuperar conexión; el progreso local pendiente debe sincronizarse. Con otra cuenta, ninguno de estos datos debe aparecer.
