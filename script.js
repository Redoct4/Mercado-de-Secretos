const $ = (id) => document.getElementById(id);

// ESTADO DE APP
const estado = {
    usuario: null,
    secretoLeyendo: null,
    secretoConsultado: null
}

// NAVEGACIÓN
function actualizarLeerSecretoBoton(){

    const secreto = secretoAleatorio();

    if(!puedeLeer() || secreto === null) {
        $('ir-leer-secreto').classList.add('desabilitado');
    } else {
        $('ir-leer-secreto').classList.remove('desabilitado');
    }
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
}

// DATOS
// Map es diccionario
const baseFalsa = {
    cuentas: new Map(),     // usuario -> contraseña
    secretos: [],           // { id, autor, texto, respuestas: [{ autor, texto }] }
    lecturas: new Map(),    // usuario -> [ ids ]
    siguienteId: 1
}

function cuentaExiste(usuario) {
    return baseFalsa.cuentas.has(usuario);
}

function contrasenaCorrecta() {
    const usuario = $('user').value.toLowerCase();
    const contrasena = $('password').value
    return baseFalsa.cuentas.get(usuario) === contrasena;
}

function confirmarContraseña() {
    return $('password').value === $('password-confirm').value
}

function crearCuentaDB(usuario, contrasena) {
    baseFalsa.cuentas.set(usuario, contrasena);
}

function guardarSecreto(usuario, texto) {
    baseFalsa.secretos.push({
        id: baseFalsa.siguienteId++,
        autor: usuario,
        texto: texto,
        respuestas: []
    })
}

function secretosDe(usuario) {
    return baseFalsa.secretos.filter(s => s.autor === usuario);
}

function normalizarTexto(texto) {
    const result = texto
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')               
        .replace(/[^\p{L}\p{N} ]/gu, '');  

    return result;
}

function secretoExiste(texto) {
    const nuevo = normalizarTexto(texto);
    return baseFalsa.secretos.some(s => normalizarTexto(s.texto) === nuevo);
}

// Regla 1 a 1: puedes leer mientras hayas publicado uno más de lo que has leido
function puedeLeer() {
    const usuario = estado.usuario;

    const leidos = baseFalsa.lecturas.get(usuario) ?? new Set();
    console.log(secretosDe(usuario).length)
    console.log(leidos.size)
    return secretosDe(usuario).length > leidos.size;
}

function secretoAleatorio() {
    const usuario = estado.usuario;

    // secretos de otros que este usuario aún no ha leído
    const leidos = baseFalsa.lecturas.get(usuario) ?? new Set();
    const disponibles = baseFalsa.secretos.filter(s =>
        s.autor !== usuario && !leidos.has(s.id)
    );

    if (disponibles.length === 0) return null;

    const elegido = disponibles[Math.floor(Math.random() * disponibles.length)];

    return elegido;
}

function secretoLeido(elegido) {
    if (elegido) {
        const usuario = estado.usuario;
        const leidos = baseFalsa.lecturas.get(usuario) ?? new Set();

        leidos.add(elegido.id);
        baseFalsa.lecturas.set(usuario, leidos);
    }

    return elegido;
}

function guardarRespuesta(secreto, autor, texto) {
    secreto.respuestas.push({ autor: autor, texto: texto });
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
function dibujarMisSecretos() {
    const lista = $('lista-mis-secretos');
    const plantilla = $('plantilla-mi-secreto');
    lista.innerHTML = '';

    secretosDe(estado.usuario).forEach(secreto => {
        const copia = plantilla.content.cloneNode(true);
        const button = copia.querySelector('button');

        button.querySelector('.mi-secreto-item-texto').textContent = secreto.texto;
        button.addEventListener('click', () => abrirMiSecreto(secreto));

        lista.appendChild(copia);
    });
}

function abrirMiSecreto(secreto) {
    estado.secretoConsultado = secreto;
    document.querySelector('.mi-secre-texto span').textContent = secreto.texto;

    const lista = document.querySelector('.lista-mi-secre-respuestas');
    const plantilla = $('plantilla-respuesta-mi-secre');

    lista.innerHTML = '';

    secreto.respuestas.forEach(respuesta => {
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
    irA('page-dashboard');
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

const acciones = {

    //----Inicio y cuenta----

    entrar() {

        const usuario = $('user').value.trim().toLowerCase();
        const contrasena = $('password').value;

        if (usuario === '' || contrasena === '') {
            Mensaje('Faltan datos', 'Escribe usuario y contraseña para continuar.');
            return;
        }

        if (baseFalsa.cuentas.has(usuario)) {
            if (!contrasenaCorrecta()) {
                Mensaje('Contraseña incorrecta', 'La contraseña ingresada no es correcta. Intenta de nuevo.');
                return;
            }
        }

        if (!$('tyc').checked) {
            Mensaje('Acepta TyC', 'Para continuar, debes marcar la casilla de términos y condiciones.');
            return;
        }

        if (!cuentaExiste(usuario)) {
            abrirCreandoCuenta();
            return;
        }

        iniciarSesion(usuario)

    },

    crearCuenta() {
        if(!confirmarContraseña()) {
            $('creando-cuenta-error').classList.remove('oculto');
            $('password-confirm').focus();
            return;
        }
        $('creando-cuenta-error').classList.add('oculto');
        
        cerrar('window-creando-cuenta');
        crearCuentaDB($('user').value.trim().toLowerCase(), $('password').value);
        
        iniciarSesion($('user').value.trim().toLowerCase());
        Mensaje('Recuerda tu cuenta', 'Debes recordar tu usuario y contraseña.<br> <b>No hay forma de recuperar tu cuenta si la olvidas.</b>', 'imgs/warning.png');
    },

    // ----Dashboard----

    cerrarSesion() {
        estado.usuario = null;
        estado.secretoConsultado = null;
        estado.secretoLeyendo = null;

        $('user').value = '';
        $('password').value = '';
        $('tyc').checked = false;
        irA('page-inicio');
    },

    irConsultarSecretos() {
        dibujarMisSecretos();
        irA('page-consultar-secretos');
    },

    irLeerSecreto() {
        if(!puedeLeer()) {
            abrir('window-lectura-bloqueada');
            return;
        }

        const secreto = secretoLeido(secretoAleatorio());

        if (secreto === null) {
            Mensaje('Sin secretos', 'No hay secretos de otras personas o ya has leído todos los disponibles. <br> Vuelve más tarde.', 'imgs/warning.png');
            return;
        }

        estado.secretoLeyendo = secreto;
        document.querySelector('.leer-secre-texto span').textContent = secreto.texto;

        //Reinicia zona de respuesta

        $('responder-secreto').classList.remove('oculto');
        $('respuesta-input').value = '';
        document.querySelector('.respuesta-texto-sec').classList.add('oculto');

        irA('page-leer-secreto');
    },

    // ----Publicar secreto----
    publicarSecreto() {
        const secre = $('pub-secre-input').value
        if (!publicacionValida(secre, 20, 3)) {
            Mensaje('Secreto no válido', 'Por favor, escribe más para que tu secreto pueda publicarse.');
            return;
        }

        if (secretoExiste(secre)) {
            Mensaje('Secreto ya publicado', 'Este secreto ya se había publicado. Intenta escribir otra cosa.');
            return;
        }

        abrir('window-publicando-secreto');
    },

    confirmarPublicar() {
        guardarSecreto(estado.usuario, $('pub-secre-input').value.trim());
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

    confirmarRespuesta() {
        guardarRespuesta(estado.secretoLeyendo, estado.usuario, $('respuesta-input').value.trim());
        
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

        irA('page-dashboard');
    },
}

// ------- Eventos ---------------

document.addEventListener('click', (evento) => {

    const close = evento.target.closest('.emergent-window .title-bar-controls button');
    if (close) {
        cerrar(close.closest('.emergent-window').id);
        return;
    }

    const button = evento.target.closest('button, a[data-abrir]');
    if(!button) return;
    if(button.tagName === 'A') evento.preventDefault();

    const data = button.dataset;

    if('cerrar' in data)    cerrar(button.closest('.emergent-window').id);
    if(data.ir)             irA(data.ir);
    if(data.abrir)          abrir(data.abrir);
    if(data.accion)         acciones[data.accion]();
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
$('pub-secre-input-limit').textContent = "0 / " + $('pub-secre-input').maxLength;

document.querySelectorAll('.page', '.emergent-window').forEach(el => el.classList.add('oculto'));
irA('page-inicio');