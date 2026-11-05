// =====================================================
//  BASE DE DATOS - MERCADO DE SECRETOS (SQLite)
//  Este archivo solo lo usa main.js (nunca el renderer).
// =====================================================
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const LIMITES = {
    usuario:   { max: 15 },
    secreto:   { min: 20, max: 1400, palabras: 3 },
    respuesta: { min: 5,  max: 800 }
};

let db = null;
let carpetaDatos = null;


// ---------- ARRANQUE ----------
function iniciar() {
    // Documentos/MercadoDeSecretos/  (fácil de encontrar y respaldar)
    carpetaDatos = path.join(app.getPath('documents'), 'MercadoDeSecretos');
    fs.mkdirSync(path.join(carpetaDatos, 'respaldos'), { recursive: true });
    fs.mkdirSync(path.join(carpetaDatos, 'exportaciones'), { recursive: true });

    db = new Database(path.join(carpetaDatos, 'secretos.db'));
    db.pragma('foreign_keys = ON');   // activa borrado en cascada y relaciones
    db.pragma('synchronous = FULL');  // seguro ante apagones; todo en un solo archivo

    db.exec(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre     TEXT NOT NULL UNIQUE,
            clave_hash TEXT NOT NULL,
            creado     TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS secretos (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            autor_id          INTEGER NOT NULL REFERENCES usuarios(id),
            texto             TEXT NOT NULL,
            texto_normalizado TEXT NOT NULL UNIQUE,
            creado            TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS respuestas (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            secreto_id INTEGER NOT NULL REFERENCES secretos(id) ON DELETE CASCADE,
            autor_id   INTEGER NOT NULL REFERENCES usuarios(id),
            texto      TEXT NOT NULL,
            creado     TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS lecturas (
            usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
            secreto_id INTEGER NOT NULL REFERENCES secretos(id) ON DELETE CASCADE,
            PRIMARY KEY (usuario_id, secreto_id)
        );
    `);
}

function cerrar() {
    if (db) db.close();
    db = null;
}


// ---------- UTILIDADES ----------
function normalizarUsuario(nombre) {
    return String(nombre ?? '').trim().toLowerCase();
}

function normalizarTexto(texto) {
    return String(texto ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^\p{L}\p{N} ]/gu, '');
}

function textoValido(texto, { min, max, palabras }) {
    const limpio = String(texto ?? '').trim();
    if (limpio.length < min || limpio.length > max) return false;
    if (palabras && limpio.split(/\s+/).length < palabras) return false;
    return true;
}

function fechaSello() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}

function usuarioPorNombre(nombre) {
    return db.prepare('SELECT * FROM usuarios WHERE nombre = ?').get(normalizarUsuario(nombre));
}


// ---------- CUENTAS ----------
function verificarEntrada(nombre, clave) {
    const usuario = usuarioPorNombre(nombre);
    if (!usuario) return { ok: false, motivo: 'no-existe' };
    if (!bcrypt.compareSync(String(clave ?? ''), usuario.clave_hash)) {
        return { ok: false, motivo: 'clave' };
    }
    return { ok: true, usuario: usuario.nombre };
}

function registrar(nombre, clave) {
    const limpio = normalizarUsuario(nombre);
    if (limpio === '' || limpio.length > LIMITES.usuario.max || !clave) {
        return { ok: false, motivo: 'invalido' };
    }
    if (usuarioPorNombre(limpio)) return { ok: false, motivo: 'existe' };

    // Nunca se guarda la contraseña: solo su "hash"
    const hash = bcrypt.hashSync(String(clave), 10);
    db.prepare('INSERT INTO usuarios (nombre, clave_hash) VALUES (?, ?)').run(limpio, hash);
    return { ok: true, usuario: limpio };
}


// ---------- SECRETOS ----------
function secretoExiste(texto) {
    const fila = db
        .prepare('SELECT 1 FROM secretos WHERE texto_normalizado = ?')
        .get(normalizarTexto(texto));
    return fila !== undefined;
}

function publicarSecreto(nombre, texto) {
    const usuario = usuarioPorNombre(nombre);
    if (!usuario) return { ok: false, motivo: 'sesion' };
    if (!textoValido(texto, LIMITES.secreto)) return { ok: false, motivo: 'invalido' };

    const limpio = String(texto).trim();
    try {
        db.prepare(
            'INSERT INTO secretos (autor_id, texto, texto_normalizado) VALUES (?, ?, ?)'
        ).run(usuario.id, limpio, normalizarTexto(limpio));
        return { ok: true };
    } catch (error) {
        // La columna texto_normalizado es UNIQUE: la base misma evita duplicados
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return { ok: false, motivo: 'repetido' };
        throw error;
    }
}

function secretosDe(nombre) {
    return db.prepare(`
        SELECT s.id, s.texto, s.creado,
            (SELECT COUNT(*) FROM respuestas r WHERE r.secreto_id = s.id) AS respuestas
        FROM secretos s
        JOIN usuarios u ON u.id = s.autor_id
        WHERE u.nombre = ?
        ORDER BY s.id DESC
    `).all(normalizarUsuario(nombre));
}

// Solo devuelve respuestas de secretos que pertenecen a ese usuario
function respuestasDe(nombre, secretoId) {
    return db.prepare(`
        SELECT r.id, r.texto, r.creado
        FROM respuestas r
        JOIN secretos s ON s.id = r.secreto_id
        JOIN usuarios u ON u.id = s.autor_id
        WHERE u.nombre = ? AND s.id = ?
        ORDER BY r.id
    `).all(normalizarUsuario(nombre), Number(secretoId));
}


// ---------- LECTURA (regla 1 a 1) ----------
function estadoLectura(nombre) {
    const usuario = usuarioPorNombre(nombre);
    if (!usuario) return { puedeLeer: false, hayDisponibles: false };

    const publicados = db.prepare('SELECT COUNT(*) AS n FROM secretos WHERE autor_id = ?').get(usuario.id).n;
    const leidos = db.prepare('SELECT COUNT(*) AS n FROM lecturas WHERE usuario_id = ?').get(usuario.id).n;
    const disponibles = db.prepare(`
        SELECT COUNT(*) AS n FROM secretos
        WHERE autor_id != ?
        AND id NOT IN (SELECT secreto_id FROM lecturas WHERE usuario_id = ?)
    `).get(usuario.id, usuario.id).n;

    return { puedeLeer: publicados > leidos, hayDisponibles: disponibles > 0 };
}

// Elige un secreto al azar y lo marca como leído en un solo paso
function tomarSecreto(nombre) {
    const usuario = usuarioPorNombre(nombre);
    if (!usuario) return { ok: false, motivo: 'sesion' };

    const { puedeLeer, hayDisponibles } = estadoLectura(nombre);
    if (!puedeLeer) return { ok: false, motivo: 'bloqueado' };
    if (!hayDisponibles) return { ok: false, motivo: 'vacio' };

    const elegir = db.transaction(() => {
        const secreto = db.prepare(`
            SELECT id, texto FROM secretos
            WHERE autor_id != ?
            AND id NOT IN (SELECT secreto_id FROM lecturas WHERE usuario_id = ?)
            ORDER BY RANDOM() LIMIT 1
        `).get(usuario.id, usuario.id);

        db.prepare('INSERT INTO lecturas (usuario_id, secreto_id) VALUES (?, ?)')
            .run(usuario.id, secreto.id);
        return secreto;
    });

    return { ok: true, secreto: elegir() };
}


// ---------- RESPUESTAS ----------
function guardarRespuesta(nombre, secretoId, texto) {
    const usuario = usuarioPorNombre(nombre);
    if (!usuario) return { ok: false, motivo: 'sesion' };
    if (!textoValido(texto, LIMITES.respuesta)) return { ok: false, motivo: 'invalido' };

    // Solo se puede responder un secreto que esa persona ya leyó
    const leido = db
        .prepare('SELECT 1 FROM lecturas WHERE usuario_id = ? AND secreto_id = ?')
        .get(usuario.id, Number(secretoId));
    if (!leido) return { ok: false, motivo: 'no-leido' };

    db.prepare('INSERT INTO respuestas (secreto_id, autor_id, texto) VALUES (?, ?, ?)')
        .run(Number(secretoId), usuario.id, String(texto).trim());
    return { ok: true };
}


// ---------- RESPALDOS ----------
async function respaldar() {
    const carpeta = path.join(carpetaDatos, 'respaldos');
    await db.backup(path.join(carpeta, `secretos-${fechaSello()}.db`));

    // Conserva solo los 20 más recientes
    const archivos = fs.readdirSync(carpeta).filter(f => f.endsWith('.db')).sort();
    archivos
        .slice(0, Math.max(0, archivos.length - 20))
        .forEach(f => fs.unlinkSync(path.join(carpeta, f)));
}


// ---------- EXPORTAR A EXCEL ----------
function agregarHoja(libro, nombre, columnas, filas) {
    const hoja = libro.addWorksheet(nombre);
    hoja.columns = columnas;
    hoja.addRows(filas);
    hoja.getRow(1).font = { bold: true };
    hoja.views = [{ state: 'frozen', ySplit: 1 }];
    hoja.eachRow((fila) => {
        fila.alignment = { wrapText: true, vertical: 'top' };
    });
}

async function exportarExcel() {
    const ExcelJS = require('exceljs');
    const libro = new ExcelJS.Workbook();

    agregarHoja(libro, 'Secretos', [
        { header: 'ID',          key: 'id',         width: 6 },
        { header: 'Autor',       key: 'autor',      width: 16 },
        { header: 'Fecha',       key: 'fecha',      width: 20 },
        { header: 'Secreto',     key: 'texto',      width: 90 },
        { header: 'Respuestas',  key: 'respuestas', width: 12 },
        { header: 'Lecturas',    key: 'lecturas',   width: 10 }
    ], db.prepare(`
        SELECT s.id, u.nombre AS autor, s.creado AS fecha, s.texto,
            (SELECT COUNT(*) FROM respuestas r WHERE r.secreto_id = s.id) AS respuestas,
            (SELECT COUNT(*) FROM lecturas l WHERE l.secreto_id = s.id) AS lecturas
        FROM secretos s JOIN usuarios u ON u.id = s.autor_id
        ORDER BY s.id
    `).all());

    agregarHoja(libro, 'Respuestas', [
        { header: 'ID',         key: 'id',         width: 6 },
        { header: 'ID secreto', key: 'secreto_id', width: 11 },
        { header: 'Autor',      key: 'autor',      width: 16 },
        { header: 'Fecha',      key: 'fecha',      width: 20 },
        { header: 'Respuesta',  key: 'texto',      width: 90 }
    ], db.prepare(`
        SELECT r.id, r.secreto_id, u.nombre AS autor, r.creado AS fecha, r.texto
        FROM respuestas r JOIN usuarios u ON u.id = r.autor_id
        ORDER BY r.id
    `).all());

    // Sin contraseñas ni hashes
    agregarHoja(libro, 'Usuarios', [
        { header: 'ID',      key: 'id',     width: 6 },
        { header: 'Usuario', key: 'nombre', width: 16 },
        { header: 'Creado',  key: 'creado', width: 20 }
    ], db.prepare('SELECT id, nombre, creado FROM usuarios ORDER BY id').all());

    const ruta = path.join(carpetaDatos, 'exportaciones', `mercado-de-secretos_${fechaSello()}.xlsx`);
    await libro.xlsx.writeFile(ruta);
    return ruta;
}


module.exports = {
    iniciar, cerrar,
    verificarEntrada, registrar,
    secretoExiste, publicarSecreto, secretosDe, respuestasDe,
    estadoLectura, tomarSecreto,
    guardarRespuesta,
    respaldar, exportarExcel
};