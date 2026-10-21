// AnimeGG connector: metadata plus manifest-declared sub/dub variants.
const episodeSourceMap = new Map();
const normalizeTitle = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(19|20)\d{2}\b/g,'').replace(/[^a-z0-9]+/g,'');
window.CINEMAX_ADAPTERS = [{
  id: 'animegg',
  async listCatalog() { return fetch('/api/catalog').then(readJSON); },
  async getDetails(id) { return fetch(`/api/details/${encodeURIComponent(id)}`).then(readJSON); },
  async getEpisodes(id) { return fetch(`/api/episodes/${encodeURIComponent(id)}`).then(readJSON); },
  async search(query) { return fetch(`/api/search?q=${encodeURIComponent(query)}`).then(readJSON); },
  canPlay(item, episode) {
    return (item.providerId === 'animegg' && Boolean(episode.sourceEpisodeID)) || (item.providerId === 'tmdb' && item.mediaType === 'tv' && item.type === 'Anime' && episode.season === 1);
  },
  async getPlaybackOptions(item, episode) {
    let sourceEpisode = episode;
    if (item.providerId === 'tmdb') {
      const names = [item.originalTitle,item.title].filter(Boolean);
      let match = null;
      for (const name of names) {
        const candidates = await this.search(name);
        match = candidates.find(candidate => normalizeTitle(candidate.title) === normalizeTitle(name));
        if (match) break;
      }
      if (!match) return [];
      const sourceEpisodes = await this.getEpisodes(match.id);
      sourceEpisode = sourceEpisodes.find(candidate => Number(candidate.number) === Number(episode.number));
      if (!sourceEpisode) return [];
      episodeSourceMap.set(`${item.id}:${episode.id}`, sourceEpisode.sourceEpisodeID);
    }
    return (sourceEpisode.variants || []).map(variant => ({
      id: variant,
      variant,
      sourceEpisodeID: sourceEpisode.sourceEpisodeID,
      label: variant === 'dub' ? 'Doblado · AnimeGG' : 'Subtitulado · AnimeGG',
      audioLanguage: 'No informado por el conector',
      subtitleLanguage: variant === 'sub' ? 'Subtítulos · idioma no especificado' : '',
      quality: 'Calidad no informada'
    }));
  },
  async getPlayback(item, episode, option) {
    const episodeID = option.sourceEpisodeID || episode.sourceEpisodeID || episodeSourceMap.get(`${item.id}:${episode.id}`);
    if (!episodeID) throw new Error('No se encontró el episodio correspondiente en AnimeGG.');
    const response = await fetch(`/api/playback/${encodeURIComponent(episodeID)}?variant=${encodeURIComponent(option.variant)}`);
    return readJSON(response);
  }
}];

async function readJSON(response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'El proveedor no respondió correctamente.');
  return data;
}
