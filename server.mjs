import { load } from 'cheerio';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

const manifestURL = 'https://raw.githubusercontent.com/kas021/AROKI-Connectors/refs/heads/main/connectors/animegg/connector.json';
const allowedHosts = new Set(['www.animegg.org']);
const maxBytes = 8 * 1024 * 1024;
const cache = new Map();
const mediaTokens = new Map();

function assertAllowed(urlString, allowManifestHost = false, streamHost = false) {
  const url = new URL(urlString);
  const manifestHosts = cache.get('manifest')?.allowedHosts || [];
  const hostListed = manifestHosts.some(host => host.startsWith('*.') ? url.hostname.endsWith(host.slice(1)) : host === url.hostname);
  const permitted = allowedHosts.has(url.hostname) || (allowManifestHost && url.hostname === 'raw.githubusercontent.com') || (streamHost && hostListed);
  if (url.protocol !== 'https:' || !permitted) throw new Error('El manifiesto apunta a un host no permitido.');
  return url;
}
async function readLimited(response) {
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error('La respuesta excede el límite configurado.'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
async function fetchText(urlString, accept = 'text/html', allowManifestHost = false) {
  const url = assertAllowed(urlString, allowManifestHost);
  const response = await fetch(url, { headers: { Accept: accept, Referer: 'https://www.animegg.org/' }, signal: AbortSignal.timeout(20000), redirect: 'manual' });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) throw new Error('Redirección sin destino.');
    const next = assertAllowed(new URL(location, url).href, allowManifestHost);
    return fetchText(next.href, accept, allowManifestHost);
  }
  if (!response.ok) throw new Error(`El proveedor respondió ${response.status}.`);
  return readLimited(response);
}
async function loadManifest() {
  if (cache.has('manifest')) return cache.get('manifest');
  const raw = await fetchText(manifestURL, 'application/json', true);
  const manifest = JSON.parse(raw);
  if (manifest.id !== 'animegg' || manifest.schemaVersion !== 1) throw new Error('Versión de manifiesto no compatible.');
  // The stream operation is handled separately and only through its declared host allowlist.
  cache.set('manifest', manifest);
  return manifest;
}
function applyTransforms(value, transforms = []) {
  let output = value;
  for (const transform of transforms) {
    if (transform.op === 'trim') output = String(output ?? '').trim();
    else if (transform.op === 'removePrefix' && String(output).startsWith(transform.value)) output = String(output).slice(transform.value.length);
    else if (transform.op === 'firstInteger') output = Number(String(output).match(/\d+/)?.[0] || 0);
    else if (transform.op === 'lowercased') output = String(output).toLowerCase();
    else if (transform.op === 'replaceFirst') output = String(output).replace(transform.find, transform.with);
  }
  return output;
}
function getPart($, root, spec) {
  const node = (root.is(spec.selector) ? root : root.find(spec.selector)).first();
  if (spec.part === 'text') return node.text().trim();
  if (spec.part === 'attr') return node.attr(spec.attr) || '';
  return '';
}
function extractItems(html, spec, baseURL) {
  const $ = load(html);
  return $(spec.collection).toArray().map((element) => {
    const root = $(element);
    const result = {};
    for (const [name, field] of Object.entries(spec.fields || {})) {
      if (field.collection) result[name] = root.find(field.collection).toArray().map(el => applyTransforms($(el).text(), field.transforms));
      else result[name] = applyTransforms(getPart($, root, field), field.transforms);
    }
    if (result.posterURL) result.posterURL = new URL(result.posterURL, baseURL).href;
    return result;
  }).filter(item => (item.sourceID || item.episodeID) && item.title);
}
function renderTemplate(template, values) {
  return template.replace(/\{([^}]+)\}/g, (_match, key) => encodeURIComponent(values[key] ?? ''));
}
async function requestHtml(request, values = {}) {
  const url = renderTemplate(request.urlTemplate, values);
  return { url: new URL(url, 'https://www.animegg.org/').href, html: await fetchText(new URL(url, 'https://www.animegg.org/').href) };
}
async function discoverySection(section) {
  const { url, html } = await requestHtml(section.request);
  return extractItems(html, section.items, url);
}
function normalizeItem(item) {
  return { id: `animegg:${item.sourceID}`, sourceID: item.sourceID, providerId: 'animegg', title: item.title, type: 'Anime', year: '', genres: [], synopsis: '', posterURL: item.posterURL || '', symbol: 'ア', colors: ['#6855a5','#24285d'], episodes: [] };
}
async function catalog() {
  const manifest = await loadManifest();
  const sections = manifest.operations.discovery.sections;
  const lists = await Promise.all(sections.map(discoverySection));
  const unique = new Map();
  lists.flat().forEach(item => unique.set(item.sourceID, item));
  return [...unique.values()].map(normalizeItem);
}
async function search(query) {
  if (!query.trim()) return catalog();
  const manifest = await loadManifest();
  const operation = manifest.operations.search;
  const { url, html } = await requestHtml(operation.request, { query: query.trim() });
  return extractItems(html, operation.items, url).map(normalizeItem);
}
async function details(sourceID) {
  const manifest = await loadManifest();
  const operation = manifest.operations.details;
  const { url, html } = await requestHtml(operation.request, { titleID: sourceID });
  const $ = load(html);
  const result = { id: `animegg:${sourceID}`, sourceID, providerId: 'animegg', type: 'Anime', genres: [], episodes: [] };
  for (const [name, field] of Object.entries(operation.extract)) {
    if (field.selector) result[name] = getPart($, $.root(), field);
    else if (field.collection) result[name] = $(field.collection).toArray().map(el => $(el).text().trim()).filter(Boolean);
  }
  if (result.posterURL) result.posterURL = new URL(result.posterURL, url).href;
  result.symbol = 'ア'; result.colors = ['#6855a5','#24285d'];
  return result;
}
async function episodes(sourceID) {
  const manifest = await loadManifest();
  const operation = manifest.operations.episodes;
  const { url, html } = await requestHtml(operation.request, { titleID: sourceID });
  return extractItems(html, operation.extract, url).map(item => ({ id: `animegg-episode:${item.episodeID}`, sourceEpisodeID: item.episodeID, title: item.title, number: item.episodeNumber, variants: item.availableVariants || [] }));
}
async function resolvePlayback(sourceEpisodeID, variant) {
  if (!['sub','dub'].includes(variant)) throw new Error('Elegí una variante disponible (sub o dub).');
  const manifest = await loadManifest();
  const streamOperation = manifest.operations.streams;
  if (!streamOperation.variants.includes(variant) || !manifest.capabilities.includes('streams')) throw new Error('Esta variante no está disponible.');
  const episodePage = await requestHtml(streamOperation.steps[0].request, { episodeID: sourceEpisodeID });
  const selectorSpec = streamOperation.steps[0].extract.context.embedID;
  const selector = selectorSpec.selector.replace('{variant}', variant);
  const embedID = load(episodePage.html)(selector).first().attr(selectorSpec.attr);
  if (!embedID) throw new Error(`No se encontró reproducción para la variante ${variant}.`);
  const embedPage = await requestHtml(streamOperation.steps[1].request, { embedID });
  const videoSpec = streamOperation.steps[1].extract.fields.url;
  const videoURL = load(embedPage.html)(videoSpec.selector).first().attr(videoSpec.attr);
  if (!videoURL) throw new Error('El proveedor no publicó una URL de video para este episodio.');
  const absoluteURL = new URL(videoURL, embedPage.url).href;
  assertAllowed(absoluteURL, false, true);
  const token = randomUUID();
  mediaTokens.set(token, { url: absoluteURL, expires: Date.now() + 10 * 60 * 1000, referer: streamOperation.playbackHeaders?.Referer || 'https://www.animegg.org/', redirects: 0 });
  return { authorized: true, url: `/api/media/${token}`, type: 'video/mp4' };
}
async function proxyMedia(token, request, response) {
  const entry = mediaTokens.get(token);
  if (!entry || entry.expires < Date.now()) { mediaTokens.delete(token); response.writeHead(404); response.end('El enlace venció. Volvé a seleccionar el episodio.'); return; }
  assertAllowed(entry.url, false, true);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let upstream;
  try {
    upstream = await fetch(entry.url, { headers: { Referer: entry.referer, ...(request.headers.range ? { Range: request.headers.range } : {}) }, signal: controller.signal, redirect: 'manual' });
  } finally { clearTimeout(timeout); }
  if (upstream.status >= 300 && upstream.status < 400) {
    const location = upstream.headers.get('location');
    if (!location) throw new Error('Redirección de video sin destino.');
    if (entry.redirects >= 4) throw new Error('Demasiadas redirecciones del servidor de video.');
    entry.redirects += 1;
    entry.url = assertAllowed(new URL(location, entry.url).href, false, true).href;
    return proxyMedia(token, request, response);
  }
  if (!upstream.ok && upstream.status !== 206) throw new Error(`El servidor de video respondió ${upstream.status}.`);
  const headers = { 'Content-Type': upstream.headers.get('content-type') || 'video/mp4', 'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes', 'Cache-Control': 'no-store' };
  for (const name of ['content-length','content-range']) if (upstream.headers.has(name)) headers[name] = upstream.headers.get(name);
  response.writeHead(upstream.status, headers);
  if (upstream.body) Readable.fromWeb(upstream.body).pipe(response); else response.end();
}

const { createServer } = await import('node:http');
const { createReadStream } = await import('node:fs');
const { readFile } = await import('node:fs/promises');
const { extname } = await import('node:path');
let localEnv = {};
let envFileFound = false;
try {
  const envText = await readFile(new URL('./.env', import.meta.url), 'utf8');
  envFileFound = true;
  localEnv = Object.fromEntries(envText.split(/\r?\n/).map(line => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(([,key,value]) => [key, value.replace(/^(['"])(.*)\1$/, '$2')]));
} catch {}
const tmdbToken = process.env.TMDB_API_READ_ACCESS_TOKEN || localEnv.TMDB_API_READ_ACCESS_TOKEN || '';
const tmdbApiKey = process.env.TMDB_API_KEY || localEnv.TMDB_API_KEY || '';
const tmdbBase = 'https://api.themoviedb.org/3';
const imageBase = 'https://image.tmdb.org/t/p';
const genreNames = {12:'Aventura',14:'Fantasía',16:'Animación',18:'Drama',27:'Terror',28:'Acción',35:'Comedia',36:'Historia',37:'Western',53:'Suspenso',80:'Crimen',99:'Documental',878:'Ciencia ficción',9648:'Misterio',10749:'Romance',10751:'Familia',10759:'Acción y aventura',10762:'Infantil',10763:'Noticias',10764:'Reality',10765:'Ciencia ficción y fantasía',10766:'Telenovela',10767:'Talk show',10768:'Guerra y política'};
let tmdbHomeCache=null, tmdbHomeCacheExpires=0;
const anilistMatchCache = new Map();
async function tmdb(path, params = {}) {
  if (!tmdbToken && !tmdbApiKey) { const error = new Error('No encuentro credenciales TMDB. Revisá el archivo .env junto a server.mjs, guardalo y reiniciá CineMax.'); error.status = 503; throw error; }
  const url = new URL(`${tmdbBase}${path}`);
  for (const [key,value] of Object.entries({language:'es-AR',...params})) url.searchParams.set(key, value);
  const headers = {Accept:'application/json'};
  if (tmdbToken) headers.Authorization = `Bearer ${tmdbToken}`;
  else url.searchParams.set('api_key', tmdbApiKey);
  const response = await fetch(url, {headers,signal:AbortSignal.timeout(20000)});
  if (!response.ok) {
    const reason = response.status === 401 ? 'TMDB rechazó la credencial (401). Si pegaste la API Key v3, guardala como TMDB_API_KEY; si pegaste el Read Access Token, usá TMDB_API_READ_ACCESS_TOKEN. Luego reiniciá el servidor.' : `TMDB respondió ${response.status}. ${response.status===403?'La cuenta o la API puede no tener permiso para esta solicitud.':'Revisá la conexión e intentá de nuevo.'}`;
    const error = new Error(reason); error.status = response.status; throw error;
  }
  return response.json();
}
function tmdbItem(item, forceType) {
  const mediaType = forceType || item.media_type || (item.title ? 'movie' : 'tv');
  return {id:`tmdb:${mediaType}:${item.id}`,sourceID:item.id,providerId:'tmdb',mediaType,type:mediaType==='movie'?'Película':'Serie',title:item.title || item.name || 'Sin título',originalTitle:item.original_title || item.original_name || '',year:(item.release_date || item.first_air_date || '').slice(0,4),genres:(item.genre_ids || item.genres?.map(genre=>genre.id) || []).map(id=>genreNames[id] || '').filter(Boolean),synopsis:item.overview || '',posterURL:item.poster_path ? `${imageBase}/w500${item.poster_path}` : '',backdropURL:item.backdrop_path ? `${imageBase}/w1280${item.backdrop_path}` : '',symbol:'C',colors:['#4b6488','#20294a'],rating:item.vote_average || 0,originalLanguage:item.original_language || '',episodes:[]};
}
async function tmdbHome() {
  if(tmdbHomeCache&&tmdbHomeCacheExpires>Date.now())return tmdbHomeCache;
  const [trending, movieProviders, tvProviders] = await Promise.all([
    tmdb('/trending/all/week',{include_adult:'false'}),
    tmdb('/watch/providers/movie',{watch_region:'AR'}).catch(()=>({results:[]})),
    tmdb('/watch/providers/tv',{watch_region:'AR'}).catch(()=>({results:[]}))
  ]);
  const featured=(trending.results||[]).map(item=>tmdbItem(item)).filter(item=>item.posterURL&&item.backdropURL).slice(0,8);
  const genres=[[28,'Acción'],[16,'Animación'],[12,'Aventura'],[35,'Comedia'],[18,'Drama'],[878,'Ciencia ficción'],[80,'Crimen'],[27,'Terror']];
  const sections=await Promise.all(genres.map(async([genreId,title])=>{
    const [movies,series]=await Promise.all([
      tmdb('/discover/movie',{with_genres:String(genreId),sort_by:'popularity.desc',region:'AR'}).catch(()=>({results:[]})),
      tmdb('/discover/tv',{with_genres:String(genreId),sort_by:'popularity.desc'}).catch(()=>({results:[]}))
    ]);
    const movieItems=(movies.results||[]).map(item=>tmdbItem(item,'movie'));
    const seriesItems=(series.results||[]).map(item=>tmdbItem(item,'tv')).map(item=>item.genres.includes('Animación')&&item.originalLanguage==='ja'?{...item,type:'Anime'}:item);
    const unique=new Map([...movieItems,...seriesItems].filter(item=>item.posterURL).map(item=>[item.id,item]));
    return {id:`genre-${genreId}`,genreId,title,items:[...unique.values()].slice(0,18)};
  }));
  const providerCatalog=new Map();
  for(const provider of [...(movieProviders.results||[]),...(tvProviders.results||[])])if(!providerCatalog.has(provider.provider_id))providerCatalog.set(provider.provider_id,{id:provider.provider_id,name:provider.provider_name,logoURL:provider.logo_path?`${imageBase}/w92${provider.logo_path}`:''});
  const preferredProviders=[/^netflix$/i,/amazon prime video|prime video/i,/disney\s*\+|disney plus/i,/^max$|hbo max/i,/apple tv/i,/paramount\s*\+/i,/crunchyroll/i];
  const providerList=[...providerCatalog.values()];
  const providers=preferredProviders.map(pattern=>providerList.find(provider=>pattern.test(provider.name))).filter(Boolean);
  tmdbHomeCache={featured,sections,providers};tmdbHomeCacheExpires=Date.now()+10*60*1000;return tmdbHomeCache;
}
async function tmdbBrowse(filters={}) {
  const genre=String(filters.genre||''),provider=String(filters.provider||''),type=String(filters.type||'all');
  const validGenres=new Set(['12','14','16','18','27','28','35','36','37','53','80','99','878','9648','10749','10751','10759','10762','10763','10764','10765','10766','10767','10768']);
  if(genre&&!validGenres.has(genre))throw new Error('Categoría no válida.');
  if(provider&&!/^\d{1,6}$/.test(provider))throw new Error('Plataforma no válida.');
  if(!['all','movie','tv'].includes(type))throw new Error('Tipo de contenido no válido.');
  const mediaTypes=type==='all'?['movie','tv']:[type];
  const results=await Promise.all(mediaTypes.map(async mediaType=>{
    const params={sort_by:'popularity.desc',include_adult:'false',...(mediaType==='movie'?{region:'AR'}:{}),...(genre?{with_genres:genre}:{}),...(provider?{with_watch_providers:provider,watch_region:'AR'}:{})};
    const response=await tmdb(`/discover/${mediaType}`,params);
    return (response.results||[]).map(item=>tmdbItem(item,mediaType)).map(item=>item.type==='Serie'&&item.genres.includes('Animación')&&item.originalLanguage==='ja'?{...item,type:'Anime'}:item);
  }));
  const unique=new Map(results.flat().filter(item=>item.posterURL).map(item=>[item.id,item]));
  return [...unique.values()].slice(0,36);
}
async function tmdbSearch(query) {
  const normalizedQuery=String(query||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const queries=[query];
  if(normalizedQuery.includes('rapido y furioso')&&(normalizedQuery.includes('reto tokyo')||normalizedQuery.includes('reto tokio')||normalizedQuery.includes('tokyo drift')))queries.push('The Fast and the Furious: Tokyo Drift');
  const requests=queries.flatMap(searchQuery=>['es-AR','en-US'].map(language=>tmdb('/search/multi',{query:searchQuery,language,include_adult:'false'})));
  const responses=await Promise.allSettled(requests),unique=new Map();
  for(const response of responses){if(response.status!=='fulfilled')continue;for(const item of response.value.results||[]){if(!['movie','tv'].includes(item.media_type))continue;const normalized=tmdbItem(item);if(item.origin_country?.includes('JP')&&item.genre_ids?.includes(16))normalized.type='Anime';if(normalized.posterURL&&!unique.has(normalized.id))unique.set(normalized.id,normalized)}}
  return [...unique.values()];
}
async function tmdbDetails(mediaType,id) {
  if (!['movie','tv'].includes(mediaType) || !/^\d+$/.test(id)) throw new Error('Título TMDB no válido.');
  const [detail,watchProviders] = await Promise.all([
    tmdb(`/${mediaType}/${id}`,{append_to_response:'credits,external_ids,videos,images,recommendations,similar,reviews',include_image_language:'es,en,null',include_video_language:'es,en,null'}),
    tmdb(`/${mediaType}/${id}/watch/providers`).catch(()=>({results:{}}))
  ]);
  const item = tmdbItem({...detail,media_type:mediaType});
  const languages = detail.spoken_languages || [];
  const cast=(detail.credits?.cast||[]).slice(0,18).map(person=>({id:person.id,name:person.name,character:person.character||'',profileURL:person.profile_path?`${imageBase}/w185${person.profile_path}`:''}));
  const crew=(detail.credits?.crew||[]).filter(person=>['Director','Writer','Screenplay','Story','Music','Director of Photography'].includes(person.job)).slice(0,12).map(person=>({name:person.name,job:person.job}));
  const imageURL=(path,size)=>path?`${imageBase}/${size}${path}`:'';
  const videoItems=(detail.videos?.results||[]).filter(video=>video.site==='YouTube'&&video.key).slice(0,16).map(video=>({key:video.key,name:video.name,type:video.type,official:video.official,language:video.iso_639_1||'',thumbnail:`https://img.youtube.com/vi/${encodeURIComponent(video.key)}/mqdefault.jpg`}));
  const providerResult=watchProviders.results?.AR||watchProviders.results?.US||null;
  const relatedItems=payload=>(payload.results||[]).filter(result=>result.poster_path).slice(0,12).map(result=>tmdbItem({...result,media_type:mediaType},mediaType));
  const about={releaseDate:detail.release_date||detail.first_air_date||'',status:detail.status||'',runtime:detail.runtime||null,episodeRuntime:detail.episode_run_time?.[0]||null,originalLanguage:item.originalLanguage,budget:detail.budget||0,revenue:detail.revenue||0,countries:(detail.production_countries||[]).map(country=>country.name),companies:(detail.production_companies||[]).map(company=>company.name),seasons:detail.number_of_seasons||0,episodes:detail.number_of_episodes||0};
  return {...item,imdbID:detail.external_ids?.imdb_id||detail.imdb_id||'',genres:(detail.genres || []).map(genre=>genre.name),synopsis:detail.overview || '',runtime:detail.runtime || null,numberOfSeasons:detail.number_of_seasons || 0,seasons:(detail.seasons || []).filter(season=>season.season_number>0).map(season=>({number:season.season_number,name:season.name,episodes:season.episode_count})),languages:languages.map(language=>language.name || language.english_name),originalLanguage:languages.find(language=>language.iso_639_1===item.originalLanguage)?.name || item.originalLanguage,cast,crew,rating:detail.vote_average||0,voteCount:detail.vote_count||0,trailer:videoItems.find(video=>video.type==='Trailer')?.key||'',videos:videoItems,images:{backdrops:(detail.images?.backdrops||[]).slice(0,18).map(image=>imageURL(image.file_path,'w780')),posters:(detail.images?.posters||[]).slice(0,18).map(image=>imageURL(image.file_path,'w500'))},availability:providerResult,reviews:(detail.reviews?.results||[]).slice(0,4).map(review=>({author:review.author,content:review.content,rating:review.author_details?.rating||null,createdAt:review.created_at})),reviewCount:detail.reviews?.total_results||0,recommendations:relatedItems(detail.recommendations||{}),similar:relatedItems(detail.similar||{}),about};
}
function normalizeAnimeTitle(value='') { return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
async function anilistMatch({title,originalTitle='',year=''}) {
  const searchTerms=[...new Set([title,originalTitle].map(value=>String(value||'').trim()).filter(Boolean))].slice(0,2);
  if(!searchTerms.length)return {match:null};
  const cacheKey=JSON.stringify([searchTerms,year]);
  const cached=anilistMatchCache.get(cacheKey);
  if(cached&&cached.expires>Date.now())return cached.value;
  const query='query ($search: String) { Media(search: $search, type: ANIME, sort: SEARCH_MATCH) { id title { romaji english native } synonyms startDate { year } episodes format } }';
  const responses=await Promise.all(searchTerms.map(async search=>{
    const response=await fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({query,variables:{search}}),signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('AniList respondió '+response.status+'.');
    const payload=await response.json();
    if(payload.errors?.length)throw new Error('AniList no pudo buscar este título.');
    return payload.data?.Media||null;
  }));
  const candidates=[...new Map(responses.flat().filter(Boolean).map(item=>[item.id,item])).values()];
  const wanted=searchTerms.map(normalizeAnimeTitle).filter(Boolean);
  const ranked=candidates.map(candidate=>{
    const names=[candidate.title?.english,candidate.title?.romaji,candidate.title?.native,...(candidate.synonyms||[])].map(normalizeAnimeTitle).filter(Boolean);
    let titleScore=0;
    for(const name of names)for(const term of wanted){if(name===term)titleScore=Math.max(titleScore,1);else if(name.includes(term)||term.includes(name))titleScore=Math.max(titleScore,0.78)}
    const candidateYear=Number(candidate.startDate?.year)||0, requestedYear=Number(year)||0;
    const yearDelta=requestedYear&&candidateYear?Math.abs(candidateYear-requestedYear):0;
    const yearAdjustment=requestedYear&&candidateYear?(yearDelta===0?0.06:yearDelta===1?0.02:yearDelta>2?-0.24:0):0;
    return {candidate,score:Math.max(0,Math.min(1,titleScore+yearAdjustment)),titleScore,candidateYear};
  }).sort((a,b)=>b.score-a.score);
  const best=ranked[0],runner=ranked[1];
  const match=best&&best.titleScore>=0.78&&best.score>=0.82&&(!runner||best.score-runner.score>=0.04)?{id:best.candidate.id,title:best.candidate.title?.english||best.candidate.title?.romaji||best.candidate.title?.native||'',year:best.candidate.startDate?.year||null,episodes:best.candidate.episodes||null,confidence:Number(best.score.toFixed(2))}:null;
  const value={match};anilistMatchCache.set(cacheKey,{value,expires:Date.now()+(match?30:1)*24*60*60*1000});
  return value;
}
async function tmdbSeason(id,seasonNumber) {
  if (!/^\d+$/.test(id) || !/^\d+$/.test(String(seasonNumber))) throw new Error('Temporada no válida.');
  const result = await tmdb(`/tv/${id}/season/${seasonNumber}`);
  return (result.episodes || []).map(episode=>({id:`tmdb-episode:${id}:${seasonNumber}:${episode.episode_number}`,providerId:'tmdb',season:Number(seasonNumber),number:episode.episode_number,title:episode.name,overview:episode.overview || '',stillURL:episode.still_path?`${imageBase}/w500${episode.still_path}`:'',runtime:episode.runtime,airDate:episode.air_date}));
}
const staticFiles = new Map([['/','index.html'],['/index.html','index.html'],['/style.css','style.css'],['/reference-theme.css','reference-theme.css'],['/blogspot-theme.css','blogspot-theme.css'],['/ui-fixes.js','ui-fixes.js'],['/account.js','account.js'],['/auth-config.js','auth-config.js'],['/app.js','app.js'],['/animegg-adapter.js','animegg-adapter.js'],['/playback-sources.js','playback-sources.js']]);
const mimeTypes = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8' };
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/auth-config.js' && process.env.SUPABASE_URL && (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY)) {
    const config = {
      url: process.env.SUPABASE_URL || '',
      anonKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || ''
    };
    response.writeHead(200, { 'Content-Type':'text/javascript; charset=utf-8', 'Cache-Control':'no-store' });
    response.end(`window.CINEMAX_AUTH_CONFIG = ${JSON.stringify(config)};`);
    return;
  }
  if (url.pathname.startsWith('/api/media/')) {
    try { await proxyMedia(url.pathname.slice('/api/media/'.length), request, response); }
    catch (error) { if (!response.headersSent) { response.writeHead(502, { 'Content-Type':'text/plain; charset=utf-8' }); response.end(error.message || 'No se pudo reproducir el video.'); } }
    return;
  }
  if (staticFiles.has(url.pathname)) {
    const file = staticFiles.get(url.pathname);
    response.writeHead(200, { 'Content-Type': mimeTypes[extname(file)] });
    createReadStream(new URL(`./${file}`, import.meta.url)).pipe(response);
    return;
  }
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    let data;
    if (url.pathname === '/api/tmdb/status') data = process.env.NODE_ENV === 'production'
      ? {configured:Boolean(tmdbToken||tmdbApiKey),authMode:tmdbToken?'read-access-token':tmdbApiKey?'api-key-v3':'missing'}
      : {configured:Boolean(tmdbToken||tmdbApiKey),authMode:tmdbToken?'read-access-token':tmdbApiKey?'api-key-v3':'missing',diagnostic:{serverFile:new URL('./server.mjs',import.meta.url).pathname,envFileFound,envHasReadAccessToken:Boolean(localEnv.TMDB_API_READ_ACCESS_TOKEN),envHasApiKey:Boolean(localEnv.TMDB_API_KEY),processHasReadAccessToken:Boolean(process.env.TMDB_API_READ_ACCESS_TOKEN),processHasApiKey:Boolean(process.env.TMDB_API_KEY)}};
    else if (url.pathname === '/api/tmdb/home') data = await tmdbHome();
    else if (url.pathname === '/api/tmdb/browse') data = {items:await tmdbBrowse({genre:url.searchParams.get('genre')||'',provider:url.searchParams.get('provider')||'',type:url.searchParams.get('type')||'all'})};
    else if (url.pathname === '/api/tmdb/search') data = await tmdbSearch(url.searchParams.get('query') || '');
    else if (url.pathname === '/api/anilist/match') data = await anilistMatch({title:url.searchParams.get('title')||'',originalTitle:url.searchParams.get('originalTitle')||'',year:url.searchParams.get('year')||''});
    else if (/^\/api\/tmdb\/details\/(movie|tv)\/\d+$/.test(url.pathname)) {
      const [,mediaType,id] = url.pathname.match(/^\/api\/tmdb\/details\/(movie|tv)\/(\d+)$/);
      data = await tmdbDetails(mediaType,id);
    }
    else if (/^\/api\/tmdb\/tv\/\d+\/season\/\d+$/.test(url.pathname)) {
      const [,id,season] = url.pathname.match(/^\/api\/tmdb\/tv\/(\d+)\/season\/(\d+)$/);
      data = await tmdbSeason(id,season);
    }
    else if (url.pathname === '/api/catalog') data = await catalog();
    else if (url.pathname === '/api/search') data = await search(url.searchParams.get('q') || '');
    else if (url.pathname.startsWith('/api/details/')) data = await details(decodeURIComponent(url.pathname.slice('/api/details/'.length)).replace(/^animegg:/, ''));
    else if (url.pathname.startsWith('/api/episodes/')) data = await episodes(decodeURIComponent(url.pathname.slice('/api/episodes/'.length)).replace(/^animegg:/, ''));
    else if (url.pathname.startsWith('/api/playback/')) {
      const sourceEpisodeID = decodeURIComponent(url.pathname.slice('/api/playback/'.length)).replace(/^animegg-episode:/, '');
      data = await resolvePlayback(sourceEpisodeID, url.searchParams.get('variant') || 'sub');
    }
    else { response.statusCode = 404; data = { error: 'Ruta inexistente.' }; }
    response.end(JSON.stringify(data));
  } catch (error) {
    response.statusCode = error.status || 502;
    response.end(JSON.stringify({ error: error.message || 'Error al consultar el proveedor.' }));
  }
});
const port = Number(process.env.PORT || 4173);
server.listen(port, '0.0.0.0', () => console.log(`CineMax escuchando en el puerto ${port}`));
