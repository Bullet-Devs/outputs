const { app, BrowserWindow, Menu, session, shell } = require('electron');
const path = require('path');

// Dirección de tu sitio en Render. Si algún día cambia, editá solo esta línea.
const SITE_URL = 'https://cinemax-vlgd.onrender.com/';
const SITE_ORIGIN = new URL(SITE_URL).origin;

let win = null;

function isInternal(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin === SITE_ORIGIN || parsed.protocol === 'file:';
  } catch {
    return false;
  }
}

function goBack() {
  if (!win) return;
  const history = win.webContents.navigationHistory;
  if (history.canGoBack()) history.goBack();
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'CineMax',
      submenu: [
        { label: 'Atrás', accelerator: 'Alt+Left', click: goBack },
        { role: 'reload', label: 'Recargar' },
        { role: 'forceReload', label: 'Recargar sin caché' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
        { role: 'zoomIn', label: 'Acercar' },
        { role: 'zoomOut', label: 'Alejar' },
        { role: 'resetZoom', label: 'Zoom normal' },
        { type: 'separator' },
        { role: 'quit', label: 'Salir' }
      ]
    }
  ]));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#080d20',
    title: 'CineMax',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Los enlaces externos se abren en el navegador; las ventanas emergentes se bloquean.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url) && url.startsWith('http')) win.loadURL(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (isInternal(url)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });

  // Sin conexión: pantalla de reintento (ignora cancelaciones normales).
  win.webContents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    win.loadFile(path.join(__dirname, 'offline.html'), { query: { retry: SITE_URL } });
  });

  // Botón "atrás" del mouse y teclas multimedia de Windows.
  win.on('app-command', (_event, command) => {
    if (command === 'browser-backward') goBack();
  });

  win.on('closed', () => { win = null; });

  // Pantalla de carga mientras Render despierta; luego se carga el sitio.
  win.loadFile(path.join(__dirname, 'loading.html'));
  win.webContents.once('did-finish-load', () => win.loadURL(SITE_URL));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.cinemax.family');

    // Que los reproductores vean un navegador común y no "Electron".
    const defaultSession = session.defaultSession;
    const userAgent = defaultSession.getUserAgent()
      .replace(/\sElectron\/\S+/, '')
      .replace(/\scinemax-windows\/\S+/i, '')
      .replace(/\sCineMax\/\S+/i, '');
    defaultSession.setUserAgent(userAgent);

    // Solo se permiten pantalla completa y copiar al portapapeles.
    const allowed = new Set(['fullscreen', 'clipboard-sanitized-write']);
    defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(allowed.has(permission)));

    buildMenu();
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
