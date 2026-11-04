# Publicación automática en el VPS

Cada push a `main` ejecuta las pruebas y publica nueve archivos estáticos mediante SSH/rsync en `/var/www/balotario2026`. No copia `.git`, pruebas ni dependencias, no borra archivos remotos y no modifica Nginx ni el sitio bomberos123. No necesita recargar Nginx. El primer despliegue requiere completar la configuración siguiente.

## 1. Preparar el acceso en el VPS

Ejecutar como root. El usuario de despliegue no recibe permisos sudo.

```bash
adduser --disabled-password --gecos "" deploy-balotario
install -d -m 700 -o deploy-balotario -g deploy-balotario /home/deploy-balotario/.ssh
ssh-keygen -t ed25519 -C "github-balotario-deploy" -f /root/balotario-deploy-key -N ""
printf 'restrict ' > /home/deploy-balotario/.ssh/authorized_keys
cat /root/balotario-deploy-key.pub >> /home/deploy-balotario/.ssh/authorized_keys
chown deploy-balotario:deploy-balotario /home/deploy-balotario/.ssh/authorized_keys
chmod 600 /home/deploy-balotario/.ssh/authorized_keys
chown deploy-balotario:deploy-balotario /var/www/balotario2026
```

El usuario puede crear y reemplazar archivos del balotario; los archivos antiguos pertenecientes a root se reemplazan mediante rsync. No usar después `git pull` en esa carpeta: Git y Actions quedarían como dos mecanismos de actualización distintos. Para volver temporalmente a Git, detener primero el workflow y revisar los cambios locales del VPS.

Si SSH escucha en un puerto diferente, guardar ese puerto en `VPS_PORT`. Si el firewall limita SSH por IP, debe permitir la conexión desde el runner de GitHub antes de probar el workflow; no cambiar reglas sin revisar la configuración existente.

## 2. Configurar secretos del repositorio

En GitHub → repositorio → Settings → Secrets and variables → Actions → New repository secret:

| Nombre | Valor |
| --- | --- |
| `VPS_HOST` | `200.141.25.13` |
| `VPS_USER` | `deploy-balotario` |
| `VPS_PORT` | Puerto SSH, normalmente `22` |
| `VPS_SSH_KEY` | Contenido completo de `/root/balotario-deploy-key` |
| `VPS_KNOWN_HOSTS` | Línea generada con el comando de abajo |

Obtener la identidad del servidor directamente en la sesión SSH ya verificada:

```bash
awk '{print "200.141.25.13 " $1 " " $2}' /etc/ssh/ssh_host_ed25519_key.pub
```

Para un puerto diferente de 22, sustituir el primer campo por `[200.141.25.13]:PUERTO`.

La clave privada se copia únicamente al secreto de GitHub, nunca al chat ni al repositorio. Para verla en la terminal: `cat /root/balotario-deploy-key`. Conservarla protegida o retirarla del VPS una vez guardada y probada en GitHub. La clave dedicada permite escribir como deploy-balotario; no habilita acceso root.

## 3. Probar

GitHub → Actions → Publicar balotario en VPS → Run workflow → main. Confirmar que todos los pasos quedan verdes y abrir https://balotario2026.ddns.net/. Un fallo de autenticación indica revisar usuario, clave, puerto y configuración de SSH. Un fallo de permisos requiere revisar la propiedad de la carpeta de destino.

La publicación usa archivos temporales y reemplazos al terminar la transferencia. No es una publicación atómica de toda la web ni revierte automáticamente un despliegue. Para restaurar una versión, revertir el commit en Git y hacer push a main.
