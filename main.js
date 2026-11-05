// =====================================================
//  PROCESO PRINCIPAL - MERCADO DE SECRETOS
//  Ventana en modo quiosco, base de datos y código secreto de salida.
// =====================================================
const { app, BrowserWindow, ipcMain, dialog, powerSaveBlocker } = require('electron');
const path = require('path');
const db = require('./database');


// ---------- CONFIGURACIÓN ----------
const CODIGO_SECRETO = 'k7q2x9';       // ← CÁMBIALO por uno propio (6 caracteres o más)
const MINUTOS_RESPALDO = 30;

// Al desarrollar (npm start) la ventana es normal, para que no te encierres.
// Empaquetada, o con KIOSCO=1, entra en modo quiosco.
const MODO_KIOSCO = app.isPackaged || process.env.KIOSCO === '1';

let ventana = null;
let salirPermitido = false;
let menuAbierto = false;
const sesion = { usuario: null };   // quién tiene la sesión: vive aquí, no en la pantalla

const esLaPrimeraInstancia = app.requestSingleInstanceLock();
if (!esLaPrimeraInstancia) {
    salirPermitido = true;
    app.quit();
}


// ---------- TECLAS ----------
// AltGr = Ctrl+Alt en Windows y se necesita para escribir @, \, | etc.,
// por eso nunca se bloquea.
const TECLAS_PERMITIDAS_CON_CTRL = [
    'a', 'c', 'v', 'x', 'z', 'y', 'backspace', 'delete',
    'arrowleft', 'arrowright', 'home', 'end'
];
const SOLO_MODIFICADORAS = ['control', 'alt', 'shift', 'meta', 'altgraph'];

function teclaBloqueada(entrada) {
    const tecla = entrada.key.toLowerCase();
    if (SOLO_MODIFICADORAS.includes(tecla)) return false;
    if (entrada.control && entrada.alt) return false;                      // AltGr

    if (/^f\d{1,2}$/.test(tecla)) return true;                             // F1 a F12
    if (entrada.alt && ['arrowleft', 'arrowright', 'home'].includes(tecla)) return true;
    if ((entrada.control || entrada.meta) && !TECLAS_PERMITIDAS_CON_CTRL.includes(tecla)) {
        return true;                                                       // Ctrl+R, Ctrl+W, Ctrl+Shift+I, zoom...
    }
    return false;
}

// Código secreto: se escribe en cualquier momento, sin pausas largas
let bufferCodigo = '';
let ultimaTecla = 0;

function revisarCodigo(entrada) {
    if (entrada.key.length !== 1) return;            // solo caracteres, no Shift, Enter, etc.

    const ahora = Date.now();
    if (ahora - ultimaTecla > 3000) bufferCodigo = '';   // más de 3 s sin teclear: reinicia
    ultimaTecla = ahora;

    bufferCodigo = (bufferCodigo + entrada.key.toLowerCase()).slice(-CODIGO_SECRETO.length);
    if (bufferCodigo === CODIGO_SECRETO.toLowerCase()) {
        bufferCodigo = '';
        setImmediate(mostrarMenuAdmin);
    }
}


// ---------- MENÚ DE ADMINISTRACIÓN ----------
async function mostrarMenuAdmin() {
    if (menuAbierto) return;
    menuAbierto = true;

    try {
        const { response } = await dialog.showMessageBox(ventana, {
            type: 'question',
            title: 'Administración',
            message: 'Mercado de Secretos',
            detail: 'Elige una opción.',
            buttons: ['Cancelar', 'Exportar a Excel', 'Respaldar ahora', 'Salir de la aplicación', 'DevTools'],
            defaultId: 0,
            cancelId: 0,
            noLink: true
        });

        if (response === 1) {
            const ruta = await db.exportarExcel();
            await dialog.showMessageBox(ventana, {
                type: 'info', title: 'Exportado', message: 'Archivo guardado en:', detail: ruta
            });
        } else if (response === 2) {
            await db.respaldar();
            await dialog.showMessageBox(ventana, {
                type: 'info', title: 'Respaldo', message: 'Respaldo creado.'
            });
        } else if (response === 3) {
            salirPermitido = true;
            app.quit();
        } else if (response === 4) {
            ventana.webContents.openDevTools();
        }
    } catch (error) {
        console.error(error);
    } finally {
        menuAbierto = false;
    }
}


// ---------- VENTANA ----------
function crearVentana() {
    ventana = new BrowserWindow({
        fullscreen: MODO_KIOSCO,
        kiosk: MODO_KIOSCO,
        frame: !MODO_KIOSCO,
        width: 1280,
        height: 720,
        backgroundColor: '#008080',
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            devTools: !MODO_KIOSCO,
            spellcheck: false
        }
    });

    ventana.setMenu(null);
    ventana.loadFile('index.html');
    ventana.once('ready-to-show', () => ventana.show());

    // Nada de abrir ventanas nuevas, navegar a otras páginas ni hacer zoom
    ventana.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    ventana.webContents.on('will-navigate', (evento) => evento.preventDefault());
    ventana.webContents.setVisualZoomLevelLimits(1, 1);

    // Si la pantalla se cae, se recarga sola
    ventana.webContents.on('render-process-gone', () => ventana.reload());

    ventana.webContents.on('before-input-event', (evento, entrada) => {
        if (entrada.type !== 'keyDown') return;
        revisarCodigo(entrada);
        if (MODO_KIOSCO && teclaBloqueada(entrada)) evento.preventDefault();
    });

    // Alt+F4 y cualquier otro intento de cerrar la ventana
    ventana.on('close', (evento) => {
        // Si estamos en quiosco, protegemos el cierre; en desarrollo (npm start), dejamos cerrar libremente
        if (MODO_KIOSCO && !salirPermitido) {
            evento.preventDefault();
        }
    });

    // Si Windows se apaga o se cierra la sesión, no se estorba
    ventana.on('session-end', () => { salirPermitido = true; });

    if (MODO_KIOSCO) {
        ventana.setAlwaysOnTop(true, 'screen-saver');
        ventana.on('blur', () => {
            if (!salirPermitido && !menuAbierto) ventana.focus();
        });
        ventana.on('minimize', () => ventana.restore());
        ventana.on('leave-full-screen', () => ventana.setFullScreen(true));
    }
}


// ---------- COMUNICACIÓN CON LA PANTALLA (IPC) ----------
ipcMain.handle('sesion:entrar', (_evento, nombre, clave) => {
    const r = db.verificarEntrada(nombre, clave);
    if (r.ok) sesion.usuario = r.usuario;
    return { ok: r.ok, motivo: r.motivo };
});

ipcMain.handle('sesion:registrar', (_evento, nombre, clave) => {
    const r = db.registrar(nombre, clave);
    if (r.ok) sesion.usuario = r.usuario;
    return { ok: r.ok, motivo: r.motivo };
});

ipcMain.handle('sesion:salir', () => {
    sesion.usuario = null;
    return true;
});

ipcMain.handle('secretos:existe', (_evento, texto) => db.secretoExiste(texto));

// Los demás canales exigen sesión iniciada y reciben el usuario automáticamente
function conSesion(canal, funcion, sinSesion = { ok: false, motivo: 'sesion' }) {
    ipcMain.handle(canal, (_evento, ...argumentos) => {
        if (!sesion.usuario) return sinSesion;
        return funcion(sesion.usuario, ...argumentos);
    });
}

conSesion('lectura:estado',      db.estadoLectura, { puedeLeer: false, hayDisponibles: false });
conSesion('lectura:tomar',       db.tomarSecreto);
conSesion('secretos:publicar',   db.publicarSecreto);
conSesion('secretos:propios',    db.secretosDe, []);
conSesion('secretos:respuestas', db.respuestasDe, []);
conSesion('respuestas:publicar', db.guardarRespuesta);


// ---------- CICLO DE VIDA ----------
app.on('second-instance', () => {
    if (ventana) {
        ventana.show();
        ventana.focus();
    }
});

app.on('before-quit', (evento) => {
    if (!salirPermitido) {
        evento.preventDefault();
        return;
    }
    db.cerrar();
});

app.on('window-all-closed', () => {
    if (salirPermitido) app.quit();
});

app.whenReady().then(() => {
    if (!esLaPrimeraInstancia) return;

    db.iniciar();
    crearVentana();

    // La pantalla no se apaga mientras la obra está encendida
    powerSaveBlocker.start('prevent-display-sleep');

    // Respaldo al arrancar y cada cierto tiempo
    db.respaldar().catch(console.error);
    setInterval(() => db.respaldar().catch(console.error), MINUTOS_RESPALDO * 60 * 1000);

    // Que la app abra sola al iniciar sesión en Windows (solo ya empaquetada)
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });
});