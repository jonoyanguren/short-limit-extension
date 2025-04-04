chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.set({
        limites: {
            "youtube.com": 10,
            "instagram.com": 15,
            "tiktok.com": 20
        },
        contador: {},
        ultimoDia: new Date().toLocaleDateString()
    }, () => {
        console.log("[Extension] Instalación completada. Datos iniciales configurados.");
    });
});

// Log del estado actual para debuggear
function logEstadoActual() {
    chrome.storage.sync.get(['limites', 'contador', 'ultimoDia'], (data) => {
        console.log("[Extension] Estado actual:", {
            limites: data.limites || {},
            contador: data.contador || {},
            ultimoDia: data.ultimoDia || new Date().toLocaleDateString()
        });
    });
}

// Ejecutar log al inicio
logEstadoActual();

// Función para abrir una página de la extensión
function abrirPaginaExtension(pagina, parametros = {}, tabId = null) {
    try {
        const url = chrome.runtime.getURL(pagina);
        const searchParams = new URLSearchParams();

        // Añadir parámetros al URL si existen
        for (const [key, value] of Object.entries(parametros)) {
            searchParams.append(key, value);
        }

        const urlCompleta = `${url}${searchParams.toString() ? '?' + searchParams.toString() : ''}`;

        // Si hay un tabId, actualizar esa pestaña, de lo contrario crear una nueva
        if (tabId) {
            chrome.tabs.update(tabId, { url: urlCompleta });
        } else {
            chrome.tabs.create({ url: urlCompleta });
        }
    } catch (error) {
        console.error("[Extension] Error al abrir página:", error);
    }
}

// Función para verificar si una URL es de una plataforma social y cerrarla si es necesario
function verificarYCerrarPestana(url, tabId) {
    try {
        const esPaginaSocial =
            url.includes('youtube.com') ||
            url.includes('instagram.com') ||
            url.includes('tiktok.com');

        if (esPaginaSocial) {
            // Si es una pestaña de una plataforma social, la cerramos
            chrome.tabs.remove(tabId);
        }
    } catch (error) {
        console.error("[Extension] Error al cerrar pestaña:", error);
    }
}

// Manejo seguro de respuesta para evitar errores de conexión
function responderSeguro(sendResponse, data) {
    try {
        sendResponse(data);
    } catch (error) {
        console.error("[Extension] Error al enviar respuesta:", error);
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("[Extension] Mensaje recibido:", request.action, request);

    if (request.action === 'incrementarContador') {
        chrome.storage.sync.get(['limites', 'contador', 'ultimoDia'], (data) => {
            try {
                let hoy = new Date().toLocaleDateString();
                let sitio = request.sitio;

                // Inicializar objetos si no existen
                if (!data.limites) data.limites = {
                    "youtube.com": 10,
                    "instagram.com": 15,
                    "tiktok.com": 20
                };
                if (!data.contador) data.contador = {};

                // Reiniciar contadores si es un nuevo día
                if (data.ultimoDia !== hoy) {
                    console.log("[Extension] Nuevo día detectado, reiniciando contadores.");
                    data.contador = {};
                    data.ultimoDia = hoy;
                }

                // Incrementar contador para el sitio específico
                data.contador[sitio] = (data.contador[sitio] || 0) + 1;
                let limiteActual = data.limites[sitio] || 10; // Por defecto 10 si no definido

                console.log("[Extension] Contador incrementado:", sitio, data.contador[sitio], "/", limiteActual);

                chrome.storage.sync.set(data, () => {
                    try {
                        const alcanzado = data.contador[sitio] >= limiteActual;

                        // Si se alcanzó el límite, abrir página de límite alcanzado en una nueva pestaña y cerrar la original
                        if (alcanzado && sender && sender.tab && sender.tab.id) {
                            console.log("[Extension] Límite alcanzado para:", sitio);
                            // Guardar el tabId original para poder cerrarlo después
                            const originalTabId = sender.tab.id;

                            // Crear una nueva pestaña con la página de límite alcanzado
                            chrome.tabs.create({ url: chrome.runtime.getURL(`limit-reached.html?sitio=${sitio}`) }, () => {
                                // Después de crear la nueva pestaña, cerrar la original
                                try {
                                    chrome.tabs.remove(originalTabId);
                                } catch (error) {
                                    console.error("[Extension] Error al cerrar pestaña original:", error);
                                }
                            });
                        }

                        responderSeguro(sendResponse, {
                            alcanzado: alcanzado,
                            contadorHoy: data.contador[sitio],
                            limite: limiteActual
                        });
                    } catch (error) {
                        console.error("[Extension] Error después de guardar contador:", error);
                        responderSeguro(sendResponse, { error: "Error interno" });
                    }
                });
            } catch (error) {
                console.error("[Extension] Error procesando incremento de contador:", error);
                responderSeguro(sendResponse, { error: "Error interno" });
            }
        });
        return true; // Importante para respuestas asíncronas
    } else if (request.action === 'obtenerEstado') {
        chrome.storage.sync.get(['limites', 'contador', 'ultimoDia'], (data) => {
            try {
                let hoy = new Date().toLocaleDateString();

                // Inicializar objetos si no existen
                if (!data.limites) data.limites = {
                    "youtube.com": 10,
                    "instagram.com": 15,
                    "tiktok.com": 20
                };
                if (!data.contador) data.contador = {};

                // Reiniciar contadores si es un nuevo día
                if (data.ultimoDia !== hoy) {
                    console.log("[Extension] Nuevo día detectado, reiniciando contadores.");
                    data.contador = {};
                    data.ultimoDia = hoy;
                    chrome.storage.sync.set({ contador: {}, ultimoDia: hoy });
                }

                console.log("[Extension] Estado actual:", {
                    contador: data.contador,
                    limites: data.limites
                });

                responderSeguro(sendResponse, {
                    contador: data.contador,
                    limites: data.limites
                });
            } catch (error) {
                console.error("[Extension] Error al obtener estado:", error);
                responderSeguro(sendResponse, { error: "Error interno" });
            }
        });
        return true; // Importante para respuestas asíncronas
    } else if (request.action === 'actualizarLimite') {
        chrome.storage.sync.get(['limites'], (data) => {
            try {
                if (!data.limites) data.limites = {};
                data.limites[request.sitio] = request.nuevoLimite;

                console.log("[Extension] Límite actualizado:", request.sitio, request.nuevoLimite);

                chrome.storage.sync.set({ limites: data.limites }, () => {
                    responderSeguro(sendResponse, { success: true });
                });
            } catch (error) {
                console.error("[Extension] Error al actualizar límite:", error);
                responderSeguro(sendResponse, { error: "Error interno" });
            }
        });
        return true; // Importante para respuestas asíncronas
    } else if (request.action === 'reiniciarContadores') {
        try {
            chrome.storage.sync.get(['limites'], (data) => {
                const limites = data.limites || {
                    "youtube.com": 10,
                    "instagram.com": 15,
                    "tiktok.com": 20
                };

                // Reiniciar solo los contadores, mantener los límites
                chrome.storage.sync.set({
                    limites: limites,
                    contador: {},
                    ultimoDia: new Date().toLocaleDateString()
                }, () => {
                    console.log("[Extension] Contadores reiniciados manualmente.");
                    responderSeguro(sendResponse, { success: true });
                });
            });
        } catch (error) {
            console.error("[Extension] Error al reiniciar contadores:", error);
            responderSeguro(sendResponse, { error: "Error interno" });
        }
        return true; // Importante para respuestas asíncronas
    } else if (request.action === 'abrirPaginaLimite') {
        try {
            // Abrir página límite en una nueva pestaña y cerrar la original
            if (sender && sender.tab && sender.tab.id) {
                const originalTabId = sender.tab.id;

                // Crear una nueva pestaña con la página de límite alcanzado
                chrome.tabs.create({ url: chrome.runtime.getURL(`limit-reached.html?sitio=${request.sitio}`) }, () => {
                    // Después de crear la nueva pestaña, cerrar la original
                    try {
                        chrome.tabs.remove(originalTabId);
                    } catch (error) {
                        console.error("[Extension] Error al cerrar pestaña original:", error);
                    }
                });
            }
            responderSeguro(sendResponse, { success: true });
        } catch (error) {
            console.error("[Extension] Error al abrir página de límite:", error);
            responderSeguro(sendResponse, { error: "Error interno" });
        }
        return true;
    } else if (request.action === 'abrirPopup') {
        try {
            // Intentar abrir el popup directamente
            chrome.action.openPopup();
            responderSeguro(sendResponse, { success: true });
        } catch (error) {
            console.error("[Extension] Error al abrir popup:", error);
            responderSeguro(sendResponse, { error: "Error interno" });
        }
        return true;
    }
});
