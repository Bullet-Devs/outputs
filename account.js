(() => {
  const config = window.CINEMAX_AUTH_CONFIG || {};
  const configured = Boolean(config.url && config.anonKey && window.supabase?.createClient);
  const client = configured ? window.supabase.createClient(config.url, config.anonKey, { auth: { storage: window.sessionStorage } }) : null;
  let user = null;
  let profile = null;
  let profiles = [];
  let library = { favorites: [], later: [] };
  let reviews = {};
  let entryGateActive = configured;

  document.body.classList.remove('auth-pending');
  document.body.classList.toggle('auth-required', entryGateActive);

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const authEmailFromLogin = value => {
    const login = String(value || '').trim().toLowerCase();
    if (login.includes('@')) return login;
    if (!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(login)) throw new Error('El usuario debe tener entre 3 y 24 caracteres: letras sin tilde, números, punto, guion o guion bajo.');
    return `${login}@users.cinemax.invalid`;
  };
  const dialog = document.createElement('dialog');
  dialog.className = 'account-dialog';
  dialog.id = 'account-dialog';
  document.body.append(dialog);
  const say = message => { const node = dialog.querySelector('.account-message'); if (node) { node.textContent = message; node.hidden = !message; } };
  const setView = html => { dialog.innerHTML = `<div class="account-card"><button class="account-close" type="button" aria-label="Cerrar"${entryGateActive ? ' hidden' : ''}>×</button>${html}</div>`; dialog.querySelector('.account-close').onclick = () => dialog.close(); };
  const showEntryLogin = message => {
    if (!configured) return;
    entryGateActive = true;
    document.body.classList.add('auth-required');
    renderAuth();
    if (message) say(message);
    if (!dialog.open) dialog.showModal();
  };
  dialog.addEventListener('cancel', event => { if (entryGateActive) event.preventDefault(); });
  const showAccount = () => {
    if (!configured) {
      setView('<p class="eyebrow">CINEMAX</p><h2>Cuenta y perfiles</h2><p>Para sincronizar usuarios y perfiles, configurá la URL y la clave pública de Supabase en <code>auth-config.js</code>.</p><p class="account-hint">La web sigue funcionando localmente mientras tanto.</p>');
      dialog.showModal(); return;
    }
    if (user && profile) renderProfilePicker();
    else if (user) renderProfiles();
    else renderAuth();
    if (!dialog.open) dialog.showModal();
  };
  const renderAuth = () => {
    setView('<p class="eyebrow">CINEMAX · TU CUENTA</p><h2>Iniciar sesión</h2><p class="account-lead">Ingresá el nombre de usuario y la contraseña que te dieron.</p><form id="account-auth-form"><label>Nombre de usuario<input name="username" autocomplete="username" minlength="3" maxlength="254" required></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" minlength="8" required></label><button class="button button-primary" type="submit">Entrar</button><p class="account-message" role="status" hidden></p></form>');
    dialog.querySelector('#account-auth-form').onsubmit = async event => {
      event.preventDefault();
      if (entryGateActive && dialog.querySelector('#account-auth-form button[type="submit"]')?.disabled) return;
      say('Conectando…');
      const data = new FormData(event.currentTarget); const password = String(data.get('password'));
      let email;
      try { email = authEmailFromLogin(data.get('username')); } catch (error) { say(error.message); return; }
      try {
        const result = await client.auth.signInWithPassword({ email, password });
        if (result.error) { say(result.error.message); return; }
        await syncSession();
      } catch (error) {
        say(error.message || 'No se pudo conectar con Supabase. Revisá tu conexión e intentá de nuevo.');
      }
    };
  };
  const renderProfiles = () => {
    setView(`<p class="eyebrow">¿QUIÉN ESTÁ MIRANDO?</p><h2>Elegí un perfil</h2><div class="profile-grid">${profiles.map(item => `<button class="profile-choice" type="button" data-profile="${esc(item.id)}"><span>${esc((item.name || '?').slice(0,1).toUpperCase())}</span><strong>${esc(item.name)}</strong></button>`).join('')}<button class="profile-choice add-profile" type="button" data-create-profile><span>＋</span><strong>Agregar perfil</strong></button></div><button class="account-switch" type="button" data-signout>Cerrar sesión</button><p class="account-message" role="status" hidden></p>`);
    dialog.querySelectorAll('[data-profile]').forEach(button => button.onclick = () => activateProfile(button.dataset.profile));
    dialog.querySelector('[data-create-profile]').onclick = renderCreateProfile;
    dialog.querySelector('[data-signout]').onclick = async () => { await client.auth.signOut({ scope: 'local' }); profile = null; user = null; syncNav(); showEntryLogin(); };
  };
  const renderCreateProfile = () => {
    if (profiles.length >= 5) { renderProfiles(); say('Cada cuenta puede tener hasta 5 perfiles.'); return; }
    setView(`<p class="eyebrow">NUEVO PERFIL</p><h2>¿Cómo se llama?</h2><form id="profile-form"><label>Nombre del perfil<input name="name" maxlength="24" required autofocus></label><button class="button button-primary" type="submit">Crear perfil</button><p class="account-message" role="status" hidden></p></form><button class="account-switch" type="button">Volver a perfiles</button>`);
    dialog.querySelector('.account-switch').onclick = renderProfiles;
    dialog.querySelector('#profile-form').onsubmit = async event => {
      event.preventDefault(); const name = String(new FormData(event.currentTarget).get('name')).trim();
      const { data, error } = await client.from('cinemax_profiles').insert({ user_id: user.id, name }).select().single();
      if (error) { say(error.message); return; }
      profiles.push(data); await activateProfile(data.id);
    };
  };
  const renderProfilePicker = () => {
    setView(`<p class="eyebrow">PERFIL ACTIVO</p><h2>${esc(profile.name)}</h2><p class="account-lead">Favoritos, lista y opiniones se sincronizan en este perfil.</p><div class="account-actions"><button class="button button-secondary" type="button" data-switch>← Cambiar perfil</button><button class="button button-secondary" type="button" data-password>Cambiar contraseña</button><button class="button button-secondary" type="button" data-signout>Cerrar sesión</button></div>`);
    dialog.querySelector('[data-switch]').onclick = renderProfiles;
    dialog.querySelector('[data-password]').onclick = renderChangePassword;
    dialog.querySelector('[data-signout]').onclick = async () => { await client.auth.signOut({ scope: 'local' }); profile = null; user = null; syncNav(); showEntryLogin(); };
  };
  const renderChangePassword = () => {
    setView('<p class="eyebrow">SEGURIDAD DE LA CUENTA</p><h2>Cambiar contraseña</h2><p class="account-lead">Elegí una contraseña nueva de al menos 8 caracteres.</p><form id="password-form"><label>Nueva contraseña<input name="password" type="password" autocomplete="new-password" minlength="8" required></label><label>Repetir contraseña<input name="confirmation" type="password" autocomplete="new-password" minlength="8" required></label><button class="button button-primary" type="submit">Guardar contraseña</button><p class="account-message" role="status" hidden></p></form><button class="account-switch" type="button">Volver</button>');
    dialog.querySelector('.account-switch').onclick = renderProfilePicker;
    dialog.querySelector('#password-form').onsubmit = async event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget), password = String(data.get('password'));
      if (password !== String(data.get('confirmation'))) { say('Las contraseñas no coinciden.'); return; }
      const submit = dialog.querySelector('#password-form button[type="submit"]'); submit.disabled = true; submit.textContent = 'Guardando…';
      const { error } = await client.auth.updateUser({ password });
      if (error) { say(error.message); submit.disabled = false; submit.textContent = 'Guardar contraseña'; return; }
      setView('<p class="eyebrow">SEGURIDAD DE LA CUENTA</p><h2>Contraseña actualizada</h2><p class="account-lead">La próxima vez, iniciá sesión con tu nueva contraseña.</p><button class="button button-primary" type="button" data-done>Listo</button>');
      dialog.querySelector('[data-done]').onclick = renderProfilePicker;
    };
  };
  const syncNav = () => {
    let button = document.querySelector('#account-button');
    if (!button) { button = document.createElement('button'); button.id = 'account-button'; button.className = 'nav-account'; button.type = 'button'; document.querySelector('.navbar-search')?.before(button); button.onclick = showAccount; }
    button.textContent = profile ? `Perfil · ${profile.name}` : user ? 'Elegir perfil' : 'Iniciar sesión';
    button.title = user?.email || 'Cuenta CineMax';
  };
  const loadProfileData = async () => {
    if (!profile) return;
    const [{ data: rows, error: libraryError }, { data: reviewRows, error: reviewError }] = await Promise.all([
      client.from('cinemax_library').select('*').eq('profile_id', profile.id),
      client.from('cinemax_reviews').select('*').eq('profile_id', profile.id)
    ]);
    if (!libraryError) {
      library = { favorites: [], later: [] };
      for (const row of rows || []) library[row.list_type].push({ key: `${row.media_type}:${row.tmdb_id}`, type: row.media_type, id: String(row.tmdb_id), title: row.title, poster: row.poster_url || '' });
    }
    if (!reviewError) {
      reviews = {};
      for (const row of reviewRows || []) reviews[`${row.media_type}:${row.tmdb_id}`] = { rating: row.rating, text: row.body };
    }
    window.dispatchEvent(new CustomEvent('cinemax:profile-changed'));
  };
  const activateProfile = async id => {
    profile = profiles.find(item => item.id === id) || null;
    if (!profile) return;
    const enteringSite = entryGateActive;
    const selectedButton = [...dialog.querySelectorAll('[data-profile]')].find(button => button.dataset.profile === String(id));
    const selectedCard = selectedButton?.closest('.account-card');
    const profileLoad = loadProfileData();
    if (enteringSite) {
      document.body.classList.add('auth-transition');
      selectedButton?.classList.add('is-selected');
      const cardFade = selectedCard?.animate([
        { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0)' },
        { opacity: 0, transform: 'translateY(-12px) scale(.96)', filter: 'blur(12px)' }
      ], { duration: 620, easing: 'cubic-bezier(.22,.72,.18,1)', fill: 'forwards' });
      await Promise.all([profileLoad, cardFade?.finished.catch(() => {})]);
      syncNav();
      entryGateActive = false;
      dialog.close();
      window.dispatchEvent(new CustomEvent('cinemax:authenticated'));
      return;
    }
    await profileLoad; syncNav(); renderProfilePicker();
  };
  const syncSession = async () => {
    if (!client) return;
    const { data } = await client.auth.getSession();
    user = data.session?.user || null;
    if (!user) { profile = null; profiles = []; syncNav(); showEntryLogin(); return; }
    const result = await client.from('cinemax_profiles').select('*').eq('user_id', user.id).order('created_at');
    if (result.error) { syncNav(); setView(`<p class="eyebrow">CONFIGURACIÓN</p><h2>Falta preparar la base de datos</h2><p>Ejecutá el archivo <code>supabase/schema.sql</code> en el SQL Editor del proyecto.</p><p class="account-message">${esc(result.error.message)}</p>`); if (!dialog.open) dialog.showModal(); return; }
    profiles = result.data || []; profile = null; syncNav();
    if (profiles.length) renderProfiles(); else renderCreateProfile();
    if (!dialog.open) dialog.showModal();
  };
  if (configured) {
    window.addEventListener('cinemax:catalog-ready', () => {
      document.body.classList.remove('auth-required', 'auth-transition');
      document.body.classList.add('catalog-reveal');
      window.setTimeout(() => document.body.classList.remove('catalog-reveal'), 1100);
    }, { once: true });
    client.auth.onAuthStateChange((_event, session) => {
      user = session?.user || null;
      if (!user) { profile = null; profiles = []; library = { favorites: [], later: [] }; reviews = {}; syncNav(); window.dispatchEvent(new CustomEvent('cinemax:profile-changed')); if (entryGateActive) showEntryLogin(); }
    });
    showEntryLogin();
  } else {
    document.body.classList.remove('auth-required');
  }
  syncNav();

  window.CINEMAX_ACCOUNT = {
    configured, client,
    get entryGateActive() { return entryGateActive; },
    get currentProfile() { return profile; },
    getCachedList(name) { return profile ? (library[name] || []) : null; },
    async saveList(name, entries) {
      if (!profile) return;
      library[name] = entries;
      const { error: deleteError } = await client.from('cinemax_library').delete().eq('profile_id', profile.id).eq('list_type', name);
      if (deleteError) return console.warn('No se pudo sincronizar la lista', deleteError.message);
      if (entries.length) {
        const rows = entries.map(item => ({ profile_id: profile.id, list_type: name, media_type: item.type, tmdb_id: Number(item.id), title: item.title, poster_url: item.poster || null }));
        const { error } = await client.from('cinemax_library').insert(rows); if (error) console.warn('No se pudo sincronizar la lista', error.message);
      }
    },
    getCachedReviews() { return profile ? reviews : null; },
    async saveReview(key, review) {
      if (!profile) return;
      const match = key.match(/^(movie|tv):(\d+)$/); if (!match) return;
      const [media_type, tmdb_id] = [match[1], Number(match[2])]; reviews[key] = review;
      const { error } = await client.from('cinemax_reviews').upsert({ profile_id: profile.id, media_type, tmdb_id, rating: review.rating, body: review.text, updated_at: new Date().toISOString() });
      if (error) console.warn('No se pudo sincronizar la opinión', error.message);
    }
  };
})();
