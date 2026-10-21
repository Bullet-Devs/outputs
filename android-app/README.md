# CineMax para Android y Android TV

Esta app es una envoltura Android ligera que carga el CineMax publicado por HTTPS. El catálogo, los inicios de sesión, los perfiles y las actualizaciones siguen viniendo del sitio; el APK no contiene credenciales de TMDB ni de Supabase.

## Preparar la dirección del sitio

La app ya está configurada con la dirección publicada: `https://cinemax-vlgd.onrender.com/`. No uses `localhost`. Si cambia el dominio en Render, pasalo como `-PcinemaxUrl=https://TU-DOMINIO.onrender.com/` al compilar.

## Compilar desde Android Studio

1. Instalá Android Studio con Android SDK 35 y JDK 17.
2. Abrí la carpeta `android-app` como proyecto existente y dejá que Gradle sincronice los componentes.
3. En Android Studio, abrí **Build > Generate App Bundles or APKs > Build APKs**. Para indicar el dominio exacto, ejecutá desde una terminal con Gradle instalado:

   ```text
   gradle :app:assembleDebug -PcinemaxUrl=https://cinemax-vlgd.onrender.com/
   ```

4. El APK de instalación de prueba queda en `app/build/outputs/apk/debug/app-debug.apk`.

El manifiesto declara la pantalla de inicio para Android TV y permite controles sin pantalla táctil. En TV, la selección usa el control direccional y el botón central; el botón Atrás vuelve a la pantalla anterior.

## Crear el APK en GitHub Actions

En el repositorio, abrí **Actions > Build Android APK > Run workflow**. El dominio ya aparece como valor sugerido. Al terminar, descargá el artefacto `CineMax-Android-APK` desde esa ejecución. Ese artefacto sirve para instalarlo manualmente; Downloader necesita una URL pública directa al archivo APK. La publicación de ese enlace queda para cuando el APK esté compilado y revisado.

La compilación inicial es `debug`, suficiente para instalación familiar directa. Antes de distribuir actualizaciones repetidas conviene firmar una versión `release` con una clave privada guardada fuera del repositorio.
