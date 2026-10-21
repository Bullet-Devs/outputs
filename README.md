# CineMax: catálogo y fichas

## Diseño adaptado de la plantilla anterior

La apariencia de CineMax se adaptó desde la plantilla Blogger “Butaca TV”, publicada por [Plantillas Plus](https://www.plantillasplus.com/) bajo la licencia [Creative Commons Atribución-NoComercial 4.0 Internacional](https://creativecommons.org/licenses/by-nc/4.0/). Los estilos fueron modificados para integrarse con CineMax. El crédito y el enlace a la licencia aparecen en el pie de la web. Esta licencia permite compartir y adaptar el diseño con atribución para usos no comerciales; para monetizar el sitio hace falta autorización adicional del titular.

La portada reúne películas, series y anime en un mismo catálogo, con filas por género y filtros combinables por categoría y plataforma. Al elegir una tarjeta se abre una ficha a página completa con trailer de fondo, reparto, videos, fotos, datos, reseñas, disponibilidad y recomendaciones cuando TMDB dispone de ellos. El botón Volver y el historial del navegador regresan al catálogo. En series se muestran temporadas y episodios. Las opciones de video se agregan mediante adaptadores de proveedores autorizados.

## Configurar TMDB sin confundir las claves

El servidor acepta uno de estos valores:

- `TMDB_API_READ_ACCESS_TOKEN`: el token largo que TMDB llama **API Read Access Token** (Bearer).
- `TMDB_API_KEY`: la clave corta llamada **API Key (v3 auth)**.

1. En la carpeta donde está `server.mjs`, copiá `.env.example` y nombrá la copia exactamente `.env`.
2. Abrí `.env` con el Bloc de notas y pegá la credencial en la variable que corresponde. No la pongas en `app.js`, `index.html` ni en una web pública.
3. Guardá el archivo. En la ventana donde corre CineMax, presioná **Ctrl+C** y ejecutá de nuevo `npm start` desde esa misma carpeta.
4. Abrí `http://localhost:4173/api/tmdb/status`. Debe mostrar `"configured":true`. Ese estado no revela la clave. Si muestra `false`, revisá que el archivo se llame `.env` y esté junto a `server.mjs`; Windows a veces lo guarda como `.env.txt`.
5. Recargá `http://localhost:4173`. Si la pantalla muestra un error HTTP de TMDB, la credencial fue leída pero TMDB la rechazó; revisá que copiaste el tipo correcto y que la cuenta/API estén habilitadas.

Si el puerto 4173 está ocupado, detené la instancia anterior con Ctrl+C. Como alternativa, en PowerShell ejecutá `$env:PORT=4174` y luego `npm start`; usá entonces `http://localhost:4174`.

## Cuentas, perfiles, favoritos y opiniones

CineMax incluye registro e inicio de sesión por correo y contraseña (no requiere Google), hasta cinco perfiles por cuenta y sincronización de favoritos, “Ver más tarde” y opiniones privadas de cada perfil. Para activar la sincronización:

1. Creá un proyecto gratuito en [Supabase](https://supabase.com/).
2. En el proyecto, abrí **SQL Editor**, pegá y ejecutá `supabase/schema.sql`. Las políticas de seguridad limitan cada perfil y sus datos a la cuenta propietaria.
3. En **Authentication → Providers**, habilitá Email. Si querés invitar únicamente a familiares, podés desactivar el registro público después de crear sus cuentas desde el panel de Authentication.
4. En **Project Settings → API**, copiá la URL del proyecto y la clave pública `publishable` (o `anon` heredada). Abrí `auth-config.js` junto a `server.mjs` y completá `url` y `anonKey`. No pongas ahí la clave `service_role` o `secret`.
5. En **Authentication → URL Configuration**, agregá las direcciones desde las que se usará la web, por ejemplo `http://localhost:4173` y el dominio HTTPS del sitio publicado.
6. Reiniciá CineMax. En la barra superior aparecerá **Iniciar sesión**. Creá una cuenta con correo y contraseña, confirmá el correo si Supabase lo solicita y agregá los perfiles.

Sin configurar Supabase, favoritos y opiniones siguen guardándose localmente en ese navegador, y el resto del catálogo continúa funcionando. Esta primera versión usa correo como identificador de acceso; el nombre de usuario se guarda como nombre visible. Un inicio de sesión exclusivamente con nombre de usuario, sin correo, necesita una pequeña función segura del lado del servidor para buscar la cuenta sin exponer datos.

`auth-config.js` está excluido de Git porque contiene la configuración propia del proyecto. Para otra copia o el alojamiento publicado, creá ese archivo a partir de `auth-config.example.js` y usá la misma URL y clave pública. La clave pública está diseñada para estar en el cliente; la protección de los datos depende de las políticas RLS incluidas en el SQL.

## Anime y reproducción

TMDB aporta metadatos y portadas para títulos que tiene catalogados. El anime usa esos registros de películas y series, así que puede faltar información específica de episodios. Los conectores se integran con adaptadores que convierten sus datos a la estructura común de CineMax. Un adaptador de reproducción autorizado debe entregar opciones de idioma/calidad y una URL de video válida; no se puede deducir el idioma solo desde TMDB.

Para AnimeGG u otro conector, el archivo JSON describe el conector y sus operaciones, pero no es por sí mismo un reproductor de video estándar. El adaptador debe documentar cómo obtiene catálogo y episodios y, para reproducir, integrarse con una API oficial/permitida del proveedor que devuelva una fuente autorizada. Este proyecto no extrae ni descifra streams del manifiesto AnimeGG. Si el proveedor te ofrece documentación de API de reproducción autorizada, se puede conectar esa API al contrato `getPlaybackOptions()` / `getPlayback()` de `animegg-adapter.js`.

### Fuentes por ID de TMDB

CineMax agrega automáticamente las opciones CineSrc, VidSrc.sh, VidLink y VidSrc.to a películas y episodios de series catalogados por TMDB. Los reproductores se abren en iframes dentro de la ficha. PlayLatinSrc se ofrece en películas cuando TMDB devuelve un ID de IMDb; su ejemplo documentado usa la ruta `/movie/{imdb_id}` y el selector interno del reproductor muestra sus variantes de audio/subtítulos. Para habilitar PlayLatinSrc en episodios de series hace falta confirmar la ruta oficial de serie que acepta temporada y episodio.

CineMax intenta encontrar también el ID de AniList al abrir una ficha marcada como anime. Consulta la API GraphQL pública de AniList con el título, el título original y el año; usa el ID solo si el título y el año ofrecen una coincidencia suficientemente clara. Si hay títulos parecidos o no hay coincidencia segura, omite las opciones que necesitan AniList. La búsqueda se hace en el servidor y se guarda en caché para reducir consultas.

VidNest está agregado para películas y episodios de TV por ID TMDB. Para animes, CineMax usa el ID de AniList encontrado automáticamente y ofrece las rutas Anime y AnimePahe en subtitulado y doblaje. Estas rutas AniList se muestran para la temporada 1, porque la documentación de VidNest y SupaPlay recibe un número absoluto de episodio sin temporada; no siempre coincide con la numeración de TMDB en temporadas posteriores.
VidRift usa inserciones directas documentadas: /embed/movie/{tmdb_id} y /embed/tv/{tmdb_id}/{season}/{episode}. CineMax arma esas direcciones automáticamente y conserva el video dentro de la ficha. También envía el título, la marca CineMax y el póster para la tarjeta de carga. El botón de salida del reproductor vuelve al selector de fuentes.

SupaPlay puede usar automáticamente el ID de AniList encontrado por CineMax. Para su reproductor MW o el endpoint clásico también podés configurar un detailPath o los ID de embed específicos de cada episodio. Para configurarlo, abrí playback-sources.js y completá CINEMAX_SUPAPLAY_MAP con la clave del ID TMDB de la serie. Podés usar anilistId como alternativa manual, detailPath, o episodeEmbedIds con claves como '1:1' para temporada 1, episodio 1. El selector ofrece subtitulado y doblaje si está configurado AniList o un ID de episodio. El formato detailPath abre el reproductor que maneja sus propias opciones. No hace falta tocar app.js.

Ejemplo de configuración:

window.CINEMAX_SUPAPLAY_MAP = {
  '1429': {
    anilistId: '16498',
    detailPath: 'attack-on-titan-english-IDENTIFICADOR',
    episodeEmbedIds: {
      '1:1': 'ID_EMBED_EPISODIO_1'
    }
  }
};

Usá solo los valores que el proveedor te haya asignado. En particular, los IDs de episodeEmbedIds no se calculan desde TMDB y AniList; los números de episodio también pueden diferir entre temporadas/cours. El endpoint clásico /stream/s-2/{episode_embed_id}/{sub|dub} se habilita cuando anotás ese ID concreto.
TonPlayer se agregó usando las rutas que compartiste: `/play/movie/{tmdb_id}`, `/play/tv/{tmdb_id}` y `/play/tv/{tmdb_id}/{season}/{episode}`. Aparece como opción adicional en películas y episodios.

VideoAPI usa `/e/movie/{tmdb_id}` para películas y `/e/tv/{tmdb_id}/{season}/{episode}` para episodios. Para anime se usa `/e/anime/{tmdb_id}/{season}/{episode}`. FacilitoPlay usa `/e/pelicula/{tmdb_id}` y `/e/serie/{tmdb_id}/{season}/{episode}`. Ambos se abren dentro de la ficha como reproductores iframe.

Los reproductores externos pueden cambiar sus rutas o impedir la inserción desde otros dominios. Si un iframe queda en blanco, revisá la documentación vigente del proveedor y probá la URL de inserción directamente en el navegador.

UnlimPlay tampoco se agregó. Su propia página se describe como scraper que recopila reproductores embebidos disponibles públicamente y además anuncia prerolls VAST/VPAID dentro del reproductor. Eso no coincide con la confirmación de licencia que recibiste; antes de incorporarlo hace falta una aclaración oficial sobre los derechos de redistribución de esas fuentes. Los anuncios de un iframe externo no se pueden quitar desde CineMax; solo el proveedor puede ofrecer un reproductor o una modalidad sin anuncios.
### Agregar otro reproductor autorizado

CineSrc genera su inserción a partir del ID TMDB. Otros hosts pueden usar enlaces con identificadores opacos (por ejemplo, `embed-...` o `/e/...`), así que CineMax no puede deducir a qué película, temporada o episodio pertenece cada enlace. Para esos casos, agregá una entrada manual en `playback-sources.js`: completá `tmdbId`, `mediaType`, temporada, episodio, URL del iframe y solo el idioma/calidad que hayas verificado. Podés incluir varias opciones para un mismo episodio. Se muestran junto a CineSrc en la ficha. El reproductor acepta HTTPS de los hosts configurados, incluido VidRift (embed.vidrift.net) y SupaPlay (supaplay.fun); si un host no permite iframes, no podrá abrirse dentro de CineMax. No se extraen enlaces del reproductor ni se adivinan fuentes.
### Reproductor integrado de CineSrc

Para títulos de TMDB, CineMax ofrece CineSrc como un reproductor incrustado: usa el ID TMDB para películas y, para series, el ID más número de temporada y episodio. Se abre dentro de CineMax mediante un iframe; no se extrae el enlace de video. La opción CineSrc aparece etiquetada como inglés según el uso que confirmaste; TMDB por sí solo no verifica qué pistas aparecen dentro del reproductor. Consultá la [documentación de inserción de CineSrc](https://cinesrc.st/docs) y confirmá que tu uso respete sus condiciones y las autorizaciones de los titulares.

## Publicar la web

Blogger no ejecuta Node.js. Para publicarla, alojá el servidor en un servicio compatible con Node.js y configurá la página para consultar esa API mediante HTTPS. No publiques el archivo `.env`. Revisá además los [requisitos de atribución y uso de TMDB](https://developer.themoviedb.org/docs/faq); su API gratuita tiene condiciones de uso.

### Despliegue inicial en Render

El archivo `render.yaml` prepara un servicio web de Node en el plan gratuito. Para desplegarlo, subí el contenido de esta carpeta a un repositorio Git, conectá ese repositorio en Render y elegí **New → Blueprint**. Render te pedirá los valores marcados como `sync: false`; completá `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y una de las dos credenciales TMDB (`TMDB_API_READ_ACCESS_TOKEN` o `TMDB_API_KEY`). La clave publishable de Supabase está diseñada para el navegador y las tablas siguen protegidas por RLS; nunca uses `service_role` ni una clave `secret`.

En el proyecto de Supabase, agregá la dirección HTTPS `https://TU-SERVICIO.onrender.com` en **Authentication → URL Configuration → Site URL** y también en **Redirect URLs**. Reemplazá `TU-SERVICIO` por el nombre que Render asigne. Luego, en Render, confirmá que el despliegue terminó y abrí la URL pública. El servicio gratuito se duerme tras 15 minutos sin visitas y tarda alrededor de un minuto en despertar; sus archivos locales son temporales, por eso las claves se cargan como variables del servicio y los datos de cuenta viven en Supabase.

`auth-config.js` queda fuera del repositorio. En el alojamiento, CineMax genera ese archivo desde las variables de entorno de Supabase; en el uso local continúa leyendo tu `auth-config.js` habitual. En producción, el endpoint de estado de TMDB no muestra diagnósticos de rutas ni variables del servidor.

### Anime: StreamFliz y Re:Anime

Para series de anime identificadas por TMDB, CineMax ofrece StreamFliz en los episodios como inserción directa del reproductor: las opciones son subtitulado (`/sub`), doblaje (`/dub`) y multi-audio (`/multi`). El idioma exacto y las pistas disponibles dependen del proveedor. La integración usa un iframe HTTPS y no extrae la URL HLS. La documentación de StreamFliz muestra ese formato de inserción en `/stream/tmdb/{id}/{season}/{episode}/{lang}`.

No conecté Re:Anime todavía. Las rutas que compartiste no indican el dominio/base URL de la API para `/search` y `/servers`. Además, `/stream/from-link` está descrita como una ruta que desencripta la URL de video de FlixCloud; CineMax no llama ni reproduce esa URL directa. Si Re:Anime ofrece una URL oficial de reproductor que se pueda insertar en iframe, se puede sumar sin pasar por extracción/desencriptado.
