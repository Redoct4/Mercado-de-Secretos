const $ = (id) => document.getElementById(id);

// SONIDO
const sonidos = {
    clic:  new Audio('sound/clic.WAV'),
    error: new Audio('sound/error.WAV'),
    arrive:    new Audio('sound/arrive.WAV'),
    ding: new Audio('sound/ding.WAV'),
    logoff: new Audio('sound/logoff.WAV'),
    notif: new Audio('sound/notif.WAV'),
    tada: new Audio('sound/tada.WAV'),
    trash: new Audio('sound/trash.WAV'),
};

const sonidoPorIcono = {
    'imgs/v.png': 'tada',
    'imgs/warning.png': 'ding',
    'imgs/x.png': 'error'
}

let volumen = 1;

function sonar(name) {

    const sonido = sonidos[name];
    if (!sonido) return;

    const clone = sonido.cloneNode();
    clone.volume = volumen;
    clone.play().catch(()=>{});
}

function sonarVentana(idVentana) {

    if(idVentana === 'window-mensaje') return;

    if($(idVentana)) {
        if ($(idVentana).querySelector('img')) {
            const icono = $(idVentana).querySelector('img').getAttribute('src');
            const nombre = sonidoPorIcono[icono];

            if (nombre) {
                sonar(nombre);
            } else {
                sonar('notif');
            }
        }
    } else {
        if (sonidoPorIcono[idVentana]) {
            sonar(sonidoPorIcono[idVentana]);
        } else {
            sonar('notif');
        }
    }
    
}

// ESTADO DE APP
const estado = {
    usuario: null,
    secretoLeyendo: null,
    secretoConsultado: null
};

// NAVEGACIÓN
async function actualizarLeerSecretoBoton(){

    const {puedeLeer, hayDisponibles} = await api.estadoLectura();
    $('ir-leer-secreto').classList.toggle('desabilitado', !(puedeLeer && hayDisponibles));
}

function irA(idPagina) {
    document.querySelectorAll('.page').forEach(pagina => {
        pagina.classList.add('oculto');
    });

    if (idPagina === 'page-dashboard') {
        actualizarLeerSecretoBoton();
    }

    $(idPagina).classList.remove('oculto');
}

function abrir(idVentana) {
    $(idVentana).classList.remove('oculto');

    sonarVentana(idVentana);
}

function cerrar(idVentana) {
    $(idVentana).classList.add('oculto');
}

// Ventana emergente reutilizable
function Mensaje(titulo, textoHtml, icono = 'imgs/x.png') {
    $('mensaje-titulo').textContent = titulo;
    $('mensaje-icono').src = icono;
    $('mensaje-texto').innerHTML = textoHtml;

    abrir('window-mensaje')

    sonarVentana(icono);
}

// DATOS
// Map es diccionario

function confirmarContraseña() {
    return $('password').value === $('password-confirm').value
}

function normalizarTexto(texto) {
    const result = texto
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')               
        .replace(/[^\p{L}\p{N} ]/gu, '');  

    return result;
}

// Filtro de longitud publicación y respuesta
function publicacionValida(texto, minCharacters, minWords) {
    const limpio = texto.trim();
    if (limpio.length < minCharacters) return false;

    if (minWords) {
        if (limpio.split(/\s+/).length < minWords) return false;
    }

    return true;
}

// DIBUJAR LISTAS
async function dibujarMisSecretos() {

    const secretos = await api.secretosPropios();
    const lista = $('lista-mis-secretos');
    const plantilla = $('plantilla-mi-secreto');
    lista.innerHTML = '';

    secretos.forEach(secreto => {
        const copia = plantilla.content.cloneNode(true);
        const button = copia.querySelector('button');

        button.querySelector('.mi-secreto-item-texto').textContent = secreto.texto;
        button.addEventListener('click', () => abrirMiSecreto(secreto));

        lista.appendChild(copia);
    });
}

async function abrirMiSecreto(secreto) {
    estado.secretoConsultado = secreto;
    document.querySelector('.mi-secre-texto span').textContent = secreto.texto;

    const lista = document.querySelector('.lista-mi-secre-respuestas');
    const plantilla = $('plantilla-respuesta-mi-secre');

    lista.innerHTML = '';

    const respuestas = await api.respuestasDe(secreto.id);

    respuestas.forEach(respuesta => {
        const copia = plantilla.content.cloneNode(true);
        copia.querySelector('.respuesta-mi-secre-item-texto').textContent = respuesta.texto;

        lista.appendChild(copia);
    });

    irA('page-respuestas-mi-secreto')
}

//ACCIONES
//data-acciones repository

function iniciarSesion(usuario) {
    estado.usuario = usuario;
    $('password').value = '';
    $('user').value = '';
    $('tyc').checked = false;

    sonar('arrive');

    irA('page-dashboard');
    reiniciarInactividad();
}

function abrirCreandoCuenta() {
    $('password-confirm').value = '';                    
    $('creando-cuenta-error').classList.add('oculto');     
    abrir('window-creando-cuenta');
    $('password-confirm').focus();
}

function reiniciarPubSecreInput(){
    $('pub-secre-input').value = '';
    $('pub-secre-input-limit').textContent = "0 / " + $('pub-secre-input').maxLength;
}

function comprobarTyC() {
    if (!$('tyc').checked) {
        Mensaje('Acepta TyC', 'Para continuar, debes marcar la casilla de términos y condiciones.');
        return false;
    }
    return true;
}


const acciones = {

    //----Inicio y cuenta----

    async entrar() {

        const usuario = $('user').value.trim().toLowerCase();
        const contrasena = $('password').value;

        if (usuario === '' || contrasena === '') {
            Mensaje('Faltan datos', 'Escribe usuario y contraseña para continuar.');
            return;
        }

        

        const r = await api.entrar(usuario, contrasena);

        if (r.ok && comprobarTyC()) {  
            iniciarSesion(usuario); 
            return; 
        }
        if (r.motivo === 'clave') { 
            Mensaje('Contraseña incorrecta', 'La contraseña ingresada no es correcta. Intenta de nuevo.');
            return; 
        }
        if (r.motivo === 'no-existe' && comprobarTyC()) {
            abrirCreandoCuenta();
        }
    },

    async crearCuenta() {
        if(!confirmarContraseña()) {
            $('creando-cuenta-error').classList.remove('oculto');
            $('password-confirm').focus();
            return;
        }
        $('creando-cuenta-error').classList.add('oculto');

        const usuario = $('user').value.trim().toLowerCase();
        const contrasena = $('password').value;

        const r = await api.registrar(usuario, contrasena);
        if(!r.ok) {
            Mensaje('Error al crear cuenta', 'No se pudo crear la cuenta. Inténtalo de nuevo.', 'imgs/x.png');
            return;
        }

        cerrar('window-creando-cuenta');
        iniciarSesion($('user').value.trim().toLowerCase());
        Mensaje('Recuerda tu cuenta', 'Debes recordar tu usuario y contraseña.<br> <b>No hay forma de recuperar tu cuenta si la olvidas.</b>', 'imgs/warning.png');
    },

    // ----Dashboard----

    async cerrarSesion() {
        await api.salir();

        estado.usuario = null;
        estado.secretoConsultado = null;
        estado.secretoLeyendo = null;

        $('user').value = '';
        $('password').value = '';
        $('tyc').checked = false;

        sonar('logoff');
        iniciarApp();

        irA('page-inicio');
    },

    irConsultarSecretos() {
        dibujarMisSecretos();
        irA('page-consultar-secretos');
    },

    async irLeerSecreto() {

        const r = await api.tomarSecreto();
        if(!r.ok && r.motivo === 'bloqueado') {
            abrir('window-lectura-bloqueada');
            return;
        }
        if(!r.ok) {
            Mensaje('Sin secretos', 'No hay secretos de otras personas o ya has leído todos los disponibles. <br> Vuelve más tarde.', 'imgs/warning.png');
            return;
        }

        estado.secretoLeyendo = r.secreto;
        document.querySelector('.leer-secre-texto span').textContent = r.secreto.texto;

        //Reinicia zona de respuesta

        $('responder-secreto').classList.remove('oculto');
        $('respuesta-input').value = '';
        document.querySelector('.respuesta-texto-sec').classList.add('oculto');

        irA('page-leer-secreto');
    },

    // ----Publicar secreto----
    async publicarSecreto() {

        const secre = $('pub-secre-input').value
        if (!publicacionValida(secre, 20, 3)) {
            Mensaje('Secreto no válido', 'Por favor, escribe más para que tu secreto pueda publicarse.');
            return;
        }

        if (await api.secretoExiste(secre)) {
            Mensaje('Secreto ya publicado', 'Este secreto ya se había publicado. Intenta escribir otra cosa.');
            return;
        }

        abrir('window-publicando-secreto');
    },

    async confirmarPublicar() {

        const r = await api.publicarSecreto($('pub-secre-input').value);
        if(!r.ok) {
            Mensaje('Error al publicar', 'No se pudo publicar el secreto. Inténtalo de nuevo.', 'imgs/x.png');
            return;
        }

        reiniciarPubSecreInput();

        irA('page-dashboard');

        Mensaje('Secreto publicado', 'Secreto publicado exitosamente. <br>Ya puedes leer el secreto de otra persona.', 'imgs/v.png');
    },

    regresarPublicar() {
        if ($('pub-secre-input').value.trim() !== '') {
            abrir('window-regresar-dashboard-publicar');
            return;
        }

        irA('page-dashboard');
    },

    salirPublicar() {
        reiniciarPubSecreInput();

        sonar('trash');

        irA('page-dashboard');
    },

    // ----- Leer secreto ------

    mostrarRespuesta() {
        $('responder-secreto').classList.add('oculto');
        $('respuesta-input').value = '';
        $('responder-secreto-texto').classList.remove('oculto');

        $('respuesta-input').focus();
    },

    publicarRespuesta() {
        if (!publicacionValida($('respuesta-input').value, 5, null)) {
            Mensaje('Respuesta no válida', 'Por favor, escribe más para que tu respuesta pueda publicarse.');
            return;
        }

        abrir('window-publicando-respuesta');
    },

    async confirmarRespuesta() {

        const r = await api.publicarRespuesta(estado.secretoLeyendo.id, $('respuesta-input').value);
        if(!r.ok) {
            Mensaje('Error al publicar', 'No se pudo publicar la respuesta. Inténtalo de nuevo.', 'imgs/x.png');
            return;
        }

        $('responder-secreto').classList.remove('oculto');
        $('respuesta-input').value = '';
        $('responder-secreto-texto').classList.add('oculto');

        irA('page-dashboard');

        Mensaje('Respuesta publicada', 'Respuesta publicada exitosamente.', 'imgs/v.png');
    },

    salirLeer() {
        $('responder-secreto').classList.remove('oculto');
        $('respuesta-input').value = '';
        $('responder-secreto-texto').classList.add('oculto');

        sonar('trash');

        irA('page-dashboard');
    },
}

// ------- Eventos ---------------

document.addEventListener('click', async (evento) => {

    const button = evento.target.closest('button, a[data-abrir]');
    if(!button) return;

    sonar('clic');

    const close = evento.target.closest('.emergent-window .title-bar-controls button');
    if (close) {
        cerrar(close.closest('.emergent-window').id);
        return;
    }

    if(button.tagName === 'A') evento.preventDefault();

    const data = button.dataset;

    if('cerrar' in data)    cerrar(button.closest('.emergent-window').id);
    if(data.ir)             irA(data.ir);
    if(data.abrir)          abrir(data.abrir);

    if(data.accion) {
        try {
            await acciones[data.accion]();
        } catch (error) {
            console.error('Error al ejecutar acción: ', error);
            Mensaje('Error', 'Ocurrió un problema. Intenta de nuevo.', 'imgs/x.png');
        }
    }
});

const enterKeyAction = document.querySelectorAll('#user, #password, #password-confirm');

enterKeyAction.forEach(el => {
    el.addEventListener('keydown', (evento) => {
        if (evento.key !== 'Enter') return;
        

        if (el.id === 'user') {
            evento.preventDefault();
            $('password').focus();
        } else if (el.id === 'password') {
            evento.preventDefault();
            acciones.entrar();
        } else if (el.id === 'password-confirm') {
            evento.preventDefault();
            acciones.crearCuenta();
        }
    });
});

$('pub-secre-input').addEventListener('input', (evento) => {
    $('pub-secre-input-limit').textContent = $('pub-secre-input').value.trim().length + " / " + $('pub-secre-input').maxLength;
})

// ------------ Arranque ---------------
function iniciarApp() {
    reiniciarPubSecreInput();

    document.querySelectorAll('.page, .emergent-window').forEach(el => el.classList.add('oculto'));
    irA('page-inicio');

    document.querySelectorAll('textarea, input').forEach(el => {
        el.value = '';
    });
}

iniciarApp();

// ------- Inactividad ------
const SEGUNDOS_INACTIVIDAD = 180;
let temporizador;

function reiniciarInactividad() {
    clearTimeout(temporizador);
    if (!estado.usuario) return;
    temporizador = setTimeout(() => acciones.cerrarSesion(), SEGUNDOS_INACTIVIDAD * 1000);
}

['pointerdown', 'keydown', 'pointermove'].forEach(tipo =>
    document.addEventListener(tipo, reiniciarInactividad));