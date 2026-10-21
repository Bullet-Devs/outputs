(() => {
  const menu = document.querySelector('#categories-menu');
  const toggle = document.querySelector('#categories-toggle');
  const appDialog = document.querySelector('#app-dialog');
  const appLink = document.querySelector('#open-app-dialog');

  // The menu is hidden with the HTML hidden state, so it cannot expand the navbar.
  const syncMenuVisibility = () => {
    if (!menu || !toggle) return;
    const open = menu.classList.contains('is-open') && toggle.getAttribute('aria-expanded') === 'true';
    menu.hidden = !open;
  };
  toggle?.addEventListener('click', () => requestAnimationFrame(syncMenuVisibility));
  document.addEventListener('click', event => {
    if (!event.target.closest('.nav-category')) requestAnimationFrame(syncMenuVisibility);
    if (event.target.closest('#categories-menu [data-genre]')) requestAnimationFrame(syncMenuVisibility);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') requestAnimationFrame(syncMenuVisibility);
  });

  appLink?.addEventListener('click', event => {
    event.preventDefault();
    if (!appDialog) return;
    document.querySelector('#close-detail')?.click();
    appDialog.showModal();
  });
  appDialog?.querySelector('.app-dialog-close')?.addEventListener('click', () => appDialog.close());
  appDialog?.addEventListener('click', event => {
    if (event.target === appDialog) appDialog.close();
  });

  // Detail-page actions: saved locally in this browser, plus a private review form.
  const detailHero = document.querySelector('.detail-hero');
  const detailActions = document.querySelector('.detail-actions');
  const detailPage = document.querySelector('#detail-dialog');
  // Keep Volver out of the detail page's stacking/transform context so it can
  // sit reliably at the top-right beside the fixed navigation bar.
  const detailBack = document.querySelector('#close-detail');
  if (detailBack) document.body.append(detailBack);
  if (detailActions && detailHero && detailPage) {
    detailActions.insertAdjacentHTML('beforeend', '<button class="button detail-list-toggle" type="button" data-list="favorites">♡ Favoritos</button><button class="button detail-list-toggle" type="button" data-list="later">＋ Ver más tarde</button>');
    document.querySelector('#player')?.insertAdjacentHTML('afterend', '<section class="user-review-section"><div><p class="eyebrow">TU OPINIÓN</p><h3>¿Qué te pareció?</h3></div><form id="user-review-form"><div class="review-stars" role="group" aria-label="Tu puntuación">' + [1,2,3,4,5].map(n => `<button type="button" data-rating="${n}" aria-label="${n} de 5 estrellas">★</button>`).join('') + '</div><label class="sr-only" for="user-review-text">Escribe tu opinión</label><textarea id="user-review-text" maxlength="800" placeholder="Comparte tu opinión sobre esta película o serie…" required></textarea><button class="button button-primary" type="submit">Guardar opinión</button><small class="review-local-note">Tu opinión se guarda solo en este navegador.</small></form><div id="user-review-saved" class="user-review-saved" hidden></div></section>');
  }

  const listDialog = document.createElement('dialog');
  listDialog.className = 'app-dialog saved-dialog';
  listDialog.id = 'saved-dialog';
  listDialog.innerHTML = '<div class="app-dialog-card"><button class="app-dialog-close" type="button" aria-label="Cerrar">×</button><p class="eyebrow">TU CINEMAX</p><h2>Mi lista</h2><div class="saved-tabs"><button type="button" data-list-tab="favorites" aria-pressed="true">Favoritos</button><button type="button" data-list-tab="later" aria-pressed="false">Ver más tarde</button></div><div class="saved-items" id="saved-items"></div></div>';
  document.body.append(listDialog);
  const listButton = document.createElement('button');
  listButton.type = 'button'; listButton.id = 'open-my-list'; listButton.className = 'nav-my-list'; listButton.textContent = 'Mi lista';
  document.querySelector('.nav-category')?.after(listButton);

  const account = () => window.CINEMAX_ACCOUNT;
  const readList = name => {
    const cloud = account()?.getCachedList(name); if (cloud) return cloud;
    try { return JSON.parse(localStorage.getItem(`cinemax-${name}`) || '[]'); } catch { return []; }
  };
  const writeList = (name, value) => {
    if (account()?.currentProfile) account().saveList(name, value);
    else localStorage.setItem(`cinemax-${name}`, JSON.stringify(value));
  };
  const readReviews = () => {
    const cloud = account()?.getCachedReviews(); if (cloud) return cloud;
    try { return JSON.parse(localStorage.getItem('cinemax-user-reviews') || '{}'); } catch { return {}; }
  };
  let activeSavedTab = 'favorites';
  let selectedRating = 0;
  const currentRecord = () => {
    const [, type, id] = location.hash.match(/^#detalle\/(movie|tv)\/(\d+)$/) || [];
    const title = document.querySelector('#detail-title')?.textContent?.trim();
    if (!type || !id || !title || title === 'Cargando título…') return null;
    const poster = document.querySelector('#detail-poster img')?.src || '';
    return { key: `${type}:${id}`, type, id, title, poster };
  };
  const updateDetailControls = () => {
    const record = currentRecord(); if (!record) return;
    detailActions?.querySelectorAll('[data-list]').forEach(button => {
      const saved = readList(button.dataset.list).some(item => item.key === record.key);
      button.classList.toggle('is-saved', saved);
      button.textContent = button.dataset.list === 'favorites' ? (saved ? '♥ En favoritos' : '♡ Favoritos') : (saved ? '✓ En Ver más tarde' : '＋ Ver más tarde');
    });
    selectedRating = 0;
    document.querySelectorAll('#user-review-form [data-rating]').forEach(star => star.setAttribute('aria-pressed', 'false'));
    const savedReview = readReviews()[record.key];
    const reviewCard = document.querySelector('#user-review-saved');
    if (reviewCard) { reviewCard.hidden = !savedReview; reviewCard.innerHTML = savedReview ? `<strong>Tu opinión · ${'★'.repeat(savedReview.rating)}</strong><p>${savedReview.text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</p>` : ''; }
  };
  const renderSavedItems = () => {
    const root = document.querySelector('#saved-items'); if (!root) return;
    const entries = readList(activeSavedTab);
    root.innerHTML = entries.length ? entries.map(item => `<button class="saved-item" type="button" data-saved-key="${item.key}">${item.poster ? `<img src="${item.poster}" alt="">` : '<span class="saved-poster-fallback">C</span>'}<span><strong>${item.title.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</strong><small>${item.type === 'movie' ? 'Película' : 'Serie'}</small></span><span class="saved-remove" data-remove="${item.key}" aria-label="Quitar">×</span></button>`).join('') : '<p class="tmdb-message">Todavía no guardaste títulos en esta lista.</p>';
  };
  detailActions?.addEventListener('click', event => {
    const button = event.target.closest('[data-list]'); if (!button) return;
    const record = currentRecord(); if (!record) return;
    const entries = readList(button.dataset.list);
    const next = entries.some(item => item.key === record.key) ? entries.filter(item => item.key !== record.key) : [record, ...entries];
    writeList(button.dataset.list, next); updateDetailControls();
  });
  document.querySelector('#user-review-form')?.addEventListener('click', event => {
    const star = event.target.closest('[data-rating]'); if (!star) return;
    selectedRating = Number(star.dataset.rating);
    document.querySelectorAll('#user-review-form [data-rating]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.rating) <= selectedRating)));
  });
  document.querySelector('#user-review-form')?.addEventListener('submit', event => {
    event.preventDefault(); const record = currentRecord(); const text = document.querySelector('#user-review-text').value.trim();
    if (!record || !text || !selectedRating) { if (!selectedRating) document.querySelector('.review-local-note').textContent = 'Elige una puntuación y escribe tu opinión.'; return; }
    const reviews = readReviews(); reviews[record.key] = { rating: selectedRating, text };
    if (account()?.currentProfile) account().saveReview(record.key, reviews[record.key]);
    else localStorage.setItem('cinemax-user-reviews', JSON.stringify(reviews));
    document.querySelector('#user-review-text').value = ''; updateDetailControls(); document.querySelector('.review-local-note').textContent = account()?.currentProfile ? 'Opinión guardada en tu perfil.' : 'Opinión guardada en este navegador.';
  });
  const detailTitle = document.querySelector('#detail-title');
  if (detailTitle) new MutationObserver(updateDetailControls).observe(detailTitle, { childList: true, characterData: true, subtree: true });
  window.addEventListener('hashchange', updateDetailControls);
  window.addEventListener('cinemax:profile-changed', () => { updateDetailControls(); renderSavedItems(); });

  // Present source cards with clear, numbered audio/subtitle labels while
  // retaining the connector name underneath for people who want to compare.
  const sourceRoot = document.querySelector('#source-list');
  const sourceName = option => {
    let host = '';
    try { host = new URL(option.url).hostname.replace(/^www\./, ''); } catch {}
    return ({ 'cinesrc.st':'CineSrc', 'embed.vidrift.net':'VidRift', 'vidnest.fun':'VidNest', 'vidsrc.sh':'VidSrc.sh', 'vidlink.pro':'VidLink', 'vidsrc.to':'VidSrc.to', 'playlatinsrc.co':'PlayLatinSrc', 'player.tonplayer.space':'TonPlayer', 'videoapi.la':'VideoAPI', 'facilitoplay.com':'FacilitoPlay', 'supaplay.fun':'SupaPlay', 'streamflizoapi.top':'StreamFliz' })[host] || option.provider || 'Fuente';
  };
  const optionLanguage = option => {
    const host = sourceName(option);
    const original = `${option.label || ''} ${option.audioLanguage || ''} ${option.subtitleLanguage || ''}`.toLowerCase();
    if (host === 'PlayLatinSrc') return 'ESP Latino / Castellano / Subtitulado';
    if (/japon[eé]s/.test(original) && /sub|subtitul/.test(original)) return 'Japonés Sub';
    if (/latino|espa[nñ]ol/.test(original)) return /castellano/.test(original) ? 'ESP Latino / Castellano' : 'ESP Latino';
    if (/multi.audio|multi-audio/.test(original)) return 'Multi-audio';
    if (/ingl[eé]s|english/.test(original)) return 'Inglés Sub';
    if (/doblaje|dub/.test(original)) return /ingl[eé]s|english/.test(original) ? 'Inglés Dub' : 'Doblaje';
    if (/selector|integrado/.test(original)) return 'Idiomas del reproductor';
    if (/no confirmado/.test(original)) return 'Idioma sin confirmar';
    return 'Idioma según la fuente';
  };
  const formatSourceCards = () => sourceRoot?.querySelectorAll('.source-option').forEach((button, index) => {
    const option = sourceRoot._options?.[Number(button.dataset.sourceIndex)];
    if (!option) return;
    const title = button.querySelector('strong'); const detail = button.querySelector('span');
    if (title) title.textContent = `OP ${index + 1} · ${optionLanguage(option)}`;
    if (detail) detail.textContent = `${sourceName(option)}${option.quality && option.quality !== 'No informado' ? ` · ${option.quality}` : ''}`;
  });
  if (sourceRoot) new MutationObserver(formatSourceCards).observe(sourceRoot, { childList: true });
  listButton.addEventListener('click', () => { activeSavedTab = 'favorites'; renderSavedItems(); listDialog.showModal(); });
  listDialog.querySelector('.app-dialog-close').addEventListener('click', () => listDialog.close());
  listDialog.addEventListener('click', event => {
    const tab = event.target.closest('[data-list-tab]');
    if (tab) { activeSavedTab = tab.dataset.listTab; listDialog.querySelectorAll('[data-list-tab]').forEach(button => button.setAttribute('aria-pressed', String(button === tab))); renderSavedItems(); return; }
    const remove = event.target.closest('[data-remove]');
    if (remove) { writeList(activeSavedTab, readList(activeSavedTab).filter(item => item.key !== remove.dataset.remove)); renderSavedItems(); updateDetailControls(); return; }
    const itemButton = event.target.closest('[data-saved-key]');
    if (itemButton) { const [, type, id] = itemButton.dataset.savedKey.match(/^(movie|tv):(\d+)$/) || []; if (type && id) { listDialog.close(); history.pushState({}, '', `#detalle/${type}/${id}`); window.dispatchEvent(new PopStateEvent('popstate', { state: { cinemaxDetail: { item: { id: `tmdb:${type}:${id}`, sourceID: id, providerId: 'tmdb', mediaType: type, type: type === 'movie' ? 'Película' : 'Serie', title: itemButton.querySelector('strong')?.textContent || 'Título' } } } })); } }
  });

  // Let the featured artwork follow the pointer while the user drags it.
  const hero = document.querySelector('#featured-carousel');
  if (hero) {
    let dragStart = null;
    hero.addEventListener('pointerdown', event => { if (event.button !== 0 || event.target.closest('button,a,input,select')) return; dragStart = event.clientX; hero.classList.add('is-pointer-dragging'); });
    hero.addEventListener('pointermove', event => {
      if (dragStart === null) return;
      const dx = event.clientX - dragStart;
      hero.querySelectorAll('.hero-backdrop').forEach(layer => { layer.style.transform = `translateX(${dx}px)`; layer.style.transition = 'none'; });
      hero.querySelector('.hero-copy').style.transform = `translateX(${dx * .22}px)`;
    });
    const resetHeroDrag = () => { dragStart = null; hero.classList.remove('is-pointer-dragging'); hero.querySelectorAll('.hero-backdrop').forEach(layer => { layer.style.transform = ''; layer.style.transition = ''; }); const copy = hero.querySelector('.hero-copy'); if (copy) copy.style.transform = ''; };
    window.addEventListener('pointerup', resetHeroDrag); window.addEventListener('pointercancel', resetHeroDrag);
  }
})();
