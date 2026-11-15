# Publicación automática del Apps Script (se hace una sola vez)

Después de esto, cada vez que se suba un cambio a la carpeta `apps-script/` del repo, GitHub:
1. corre las pruebas (si alguna falla, no publica nada),
2. sube el código a tu proyecto de Apps Script, y
3. publica una nueva versión en la misma URL `/exec`.

Todo con tu cuenta personal **cristobal.munoz198@gmail.com**. Tiempo: ~10 minutos.

---

## 1. Activar la API de Apps Script

1. Abre **https://script.google.com/home/usersettings** (con tu cuenta personal; si estás con la de LATAM, cámbiala arriba a la derecha).
2. En **"API de Google Apps Script"**, ponlo en **Activado**.

## 2. Copiar el ID de tu script

1. Abre tu proyecto de Apps Script (desde la planilla: Extensiones → Apps Script).
2. **⚙️ Configuración del proyecto** → sección **IDs** → **ID de la secuencia de comandos** → **Copiar**.
3. Guárdalo en una nota: es tu `SCRIPT_ID`.

## 3. Copiar el ID de la implementación

Es lo que va entre `/s/` y `/exec` en la URL de tu app web:

```
https://script.google.com/macros/s/ ESTE-TEXTO-LARGO /exec
```

Guárdalo: es tu `DEPLOYMENT_ID`.

## 4. Iniciar sesión de clasp (la herramienta oficial de Google)

Lo haremos en **Google Cloud Shell**, una terminal gratis en el navegador (no instalas nada).

1. Abre **https://shell.cloud.google.com** con tu cuenta personal. Si pregunta, acepta las condiciones. Espera a que aparezca la terminal (texto negro abajo).
2. Copia y pega este comando y presiona Enter:
   ```
   npx -y @google/clasp@2.4.2 login
   ```
3. Aparece un link largo que empieza con `https://accounts.google.com/...`. Ábrelo (Ctrl/Cmd + clic).
4. Elige **cristobal.munoz198@gmail.com** → **Permitir**.
5. Al final el navegador muestra un **error de "no se puede acceder a localhost"**. **Es normal.** Copia la dirección completa de esa pestaña (empieza con `http://localhost:...`).
6. Vuelve a Cloud Shell, abre una **segunda pestaña de terminal** (botón **＋** arriba de la terminal) y escribe:
   ```
   curl "PEGA-AQUÍ-LA-DIRECCIÓN-DE-LOCALHOST"
   ```
   (con las comillas). Presiona Enter.
7. Vuelve a la primera pestaña: debe decir **"Logged in"** (o "Authorization successful").
8. En esa misma terminal escribe:
   ```
   cat ~/.clasprc.json
   ```
   Copia **todo** el texto que aparece (empieza con `{` y termina con `}`).

> ⚠️ Ese texto es una llave de acceso a tus scripts. **No lo pegues en el chat ni en ningún archivo.** Solo va en el paso 5.

## 5. Guardar los 3 secretos en GitHub

1. Entra a **github.com/cristobalmunoz198/Gastos** → **Settings** (arriba a la derecha del repo) → menú izquierdo **Secrets and variables** → **Actions**.
2. Botón verde **New repository secret**, tres veces:

| Name | Secret |
|---|---|
| `CLASPRC_JSON` | el texto completo del paso 4.8 |
| `SCRIPT_ID` | el ID del paso 2 |
| `DEPLOYMENT_ID` | el ID del paso 3 |

Los secretos quedan cifrados: nadie los puede ver, ni siquiera tú después de guardarlos (el repo puede seguir siendo público).

## 6. Probar

1. En el repo → pestaña **Actions** → **Publicar Apps Script** → **Run workflow** → **Run workflow**.
2. En 1–2 minutos debe aparecer con ✅ verde.
3. En tu Apps Script → **Implementar → Gestionar implementaciones**: verás una versión nueva con descripción "Auto …".

Si sale ❌ rojo, abre la ejecución, copia el mensaje de error y mándamelo.

---

**Importante:** desde ahora, el código de Apps Script "oficial" es el del repo. Si editas algo directamente en el editor de Apps Script, la próxima publicación automática lo reemplazará.
