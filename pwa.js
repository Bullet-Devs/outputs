(() => {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch(() => {}), { once: true });
  }

  let installPrompt = null;
  const installButton = document.querySelector('#install-app');
  const installHelp = document.querySelector('#app-install-help');

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    if (installButton) installButton.hidden = false;
  });

  installButton?.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    installButton.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    if (installButton) installButton.hidden = true;
    if (installHelp) installHelp.hidden = true;
  });

  const dialog = document.querySelector('#app-dialog');
  const appLink = document.querySelector('#open-app-dialog');
  appLink?.addEventListener('click', () => {
    if (!installHelp) return;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isAndroid = /android/i.test(navigator.userAgent);
    if (installPrompt) {
      installHelp.textContent = 'Elegí “Instalar CineMax” para agregarla a tus aplicaciones.';
      installHelp.hidden = false;
    } else if (isIOS) {
      installHelp.textContent = 'En Safari, tocá Compartir y después “Agregar a pantalla de inicio”.';
      installHelp.hidden = false;
    } else if (isAndroid) {
      installHelp.textContent = 'En Chrome, abrí el menú ⋮ y elegí “Instalar aplicación” o “Agregar a pantalla principal”.';
      installHelp.hidden = false;
    } else {
      installHelp.textContent = 'En Edge o Chrome, abrí el menú del navegador y elegí “Instalar CineMax”.';
      installHelp.hidden = false;
    }
  });
  dialog?.addEventListener('close', () => { if (installHelp) installHelp.hidden = true; });
})();
