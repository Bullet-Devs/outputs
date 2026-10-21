// Configuración opcional de SupaPlay para títulos de anime.
// Agregá una entrada por cada serie y completá SOLO los datos que te entregue
// el proveedor o una API oficial autorizada. La clave es el ID de serie TMDB.
window.CINEMAX_SUPAPLAY_MAP = {
  /*
  '1429': {
    anilistId: '16498', // Si el ID de AniList coincide episodio a episodio
    detailPath: 'attack-on-titan-english-IDENTIFICADOR',
    episodeEmbedIds: {
      '1:1': 'ID_EMBED_DEL_EPISODIO_1',
      '1:2': 'ID_EMBED_DEL_EPISODIO_2'
    }
  }
  */
};

// Otras fuentes de inserción que el proveedor te autorice a usar.
// Cada entrada se vincula al ID TMDB y al episodio correspondiente.
window.CINEMAX_CUSTOM_EMBEDS = [
  /* Ejemplo:
  {
    tmdbId: '1396',
    mediaType: 'tv',
    season: 1,
    episode: 1,
    options: [{
      label: 'Servidor · Español latino · HD',
      audioLanguage: 'Español latino',
      quality: 'HD',
      url: 'https://proveedor-autorizado.example/embed/ID'
    }]
  }
  */
];