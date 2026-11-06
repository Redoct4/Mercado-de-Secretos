// =====================================================
//  PUENTE ENTRE LA PANTALLA Y EL PROCESO PRINCIPAL
//  La pantalla solo puede usar lo que se expone aquí, como window.api
// =====================================================
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Sesión
    entrar:            (nombre, clave) => ipcRenderer.invoke('sesion:entrar', nombre, clave),
    registrar:         (nombre, clave) => ipcRenderer.invoke('sesion:registrar', nombre, clave),
    salir:             ()              => ipcRenderer.invoke('sesion:salir'),

    // Secretos
    secretoExiste:     (texto)         => ipcRenderer.invoke('secretos:existe', texto),
    publicarSecreto:   (texto)         => ipcRenderer.invoke('secretos:publicar', texto),
    secretosPropios:   ()              => ipcRenderer.invoke('secretos:propios'),
    respuestasDe:      (secretoId)     => ipcRenderer.invoke('secretos:respuestas', secretoId),

    // Lectura
    estadoLectura:     ()              => ipcRenderer.invoke('lectura:estado'),
    tomarSecreto:      ()              => ipcRenderer.invoke('lectura:tomar'),

    // Respuestas
    publicarRespuesta: (secretoId, texto) => ipcRenderer.invoke('respuestas:publicar', secretoId, texto)
});