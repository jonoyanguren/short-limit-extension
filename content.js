let dominio = location.hostname.replace('www.', '');
let lastUrl = location.href;
let checking = false;
let redirectInProgress = false;
let extensionValid = true;
let countedContent = new Set(); // Para evitar contar el mismo contenido varias veces
let videoObserverStarted = false;
let lastContextCheck = 0;

// Verificar si el contexto de la extensión sigue siendo válido
function verificarContexto() {
    // Limitar la frecuencia de verificación (máximo una vez cada 2 segundos)
    const ahora = Date.now();
    if (ahora - lastContextCheck < 2000) return extensionValid;

    lastContextCheck = ahora;

    try {
        // Una forma más robusta de verificar si el contexto sigue siendo válido
        // usando un método que lanzará una excepción si el contexto no es válido
        chrome.runtime.getURL('');
        extensionValid = true;
        return true;
    } catch (e) {
        console.log("[Extension] Error al verificar contexto:", e.message);
        extensionValid = false;

        // Intentar liberar recursos
        try {
            if (observer) {
                observer.disconnect();
            }

            // Eliminar otros event listeners
            const videos = document.querySelectorAll('video');
            videos.forEach(video => {
                video.removeEventListener('play', manejarEventoReproduccion);
                video.removeEventListener('playing', manejarEventoReproduccion);
            });

            if (videoObserverStarted) {
                videoObserverStarted = false;
            }

            // Limpiar el observer de TikTok si existe
            if (window._extensionTikTokObserver) {
                try {
                    window._extensionTikTokObserver.disconnect();
                } catch (e) {
                    console.log("[Extension] Error al desconectar observer de TikTok:", e.message);
                }
            }

            // Limpiar el observer de Instagram si existe
            if (window._extensionInstagramObserver) {
                try {
                    window._extensionInstagramObserver.disconnect();
                } catch (e) {
                    console.log("[Extension] Error al desconectar observer de Instagram:", e.message);
                }
            }
        } catch (cleanupError) {
            console.log("[Extension] Error al liberar recursos:", cleanupError.message);
        }

        return false;
    }
}

// Loguear información de debug
function logDebugInfo() {
    if (!verificarContexto()) return;

    try {
        if (dominio.includes('instagram.com')) {
            console.log("[Extension] Debug URL Instagram:", location.href);
            console.log("[Extension] Pathname:", location.pathname);

            try {
                const videos = document.querySelectorAll('video');
                console.log("[Extension] Videos encontrados:", videos.length);

                // Usar Array.from con seguridad adicional
                Array.from(videos).forEach((video, index) => {
                    try {
                        if (!document.contains(video)) return;

                        console.log(`[Extension] Video ${index + 1}:`, {
                            visible: isElementVisible(video),
                            src: video.src || video.currentSrc || 'sin-src',
                            parentClass: video.parentElement ? video.parentElement.className : 'sin-padre',
                            width: video.offsetWidth,
                            height: video.offsetHeight
                        });
                    } catch (videoError) {
                        console.log(`[Extension] Error al analizar video ${index + 1}:`, videoError.message);
                    }
                });
            } catch (videosError) {
                console.log("[Extension] Error al obtener videos:", videosError.message);
            }

            // Log elementos de UI de Instagram con seguridad adicional
            try {
                console.log("[Extension] Diálogos:", document.querySelectorAll('[role="dialog"]').length);
            } catch (dialogError) {
                console.log("[Extension] Error al obtener diálogos:", dialogError.message);
            }

            try {
                console.log("[Extension] Botones de navegación:", document.querySelectorAll('[role="button"]').length);
            } catch (buttonError) {
                console.log("[Extension] Error al obtener botones:", buttonError.message);
            }
        }
    } catch (error) {
        console.error("[Extension] Error en logDebugInfo:", error.message);

        if (error.message && (
            error.message.includes("Extension context invalidated") ||
            error.message.includes("Invalid extension") ||
            error.message.includes("Extension context")
        )) {
            extensionValid = false;
        }
    }
}

// Verifica si un elemento es visible en la pantalla
function isElementVisible(element) {
    if (!element) return false;

    try {
        // Verificar que el elemento siga en el DOM
        if (!document.contains(element)) return false;

        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth) &&
            rect.width > 10 && // Ignorar elementos muy pequeños
            rect.height > 10 &&
            window.getComputedStyle(element).display !== 'none' &&
            window.getComputedStyle(element).visibility !== 'hidden'
        );
    } catch (error) {
        // Posible error si el elemento fue eliminado del DOM durante la verificación
        console.error("[Extension] Error al verificar visibilidad:", error.message);
        return false;
    }
}

// Simplificar la verificación para TikTok
function esTikTokVideo() {
    const esTikTok = dominio.includes('tiktok.com');
    const esVideo = location.pathname.includes('/video/') ||
        location.pathname.includes('@') && /\d+/.test(location.pathname);

    // Agregar más logging para TikTok
    if (esTikTok) {
        console.log("[Extension] Verificando TikTok:", location.href);
        console.log("[Extension] Pathname TikTok:", location.pathname);
        console.log("[Extension] ¿Es video de TikTok?", esVideo);
    }

    return esTikTok && esVideo;
}

// Obtener un identificador único para el video o imagen actual
function getContentId() {
    // Tratamiento especial para YouTube Shorts para evitar conteo múltiple
    if (dominio.includes('youtube.com') && location.href.includes('/shorts/')) {
        // Extraer solo el ID del short de la URL para evitar múltiples conteos
        const shortMatch = location.pathname.match(/\/shorts\/([^?/]+)/);
        if (shortMatch && shortMatch[1]) {
            return `youtube-short-${shortMatch[1]}`;
        }
    }

    // Tratamiento especial para Instagram para evitar conteo múltiple
    if (dominio.includes('instagram.com')) {
        // 1. Patrón para Reels individuales
        const reelMatch = location.pathname.match(/\/reel\/([^/?]+)/);
        if (reelMatch && reelMatch[1]) {
            return `instagram-reel-${reelMatch[1]}`;
        }

        // 2. Patrón para Stories de usuarios
        const storiesMatch = location.pathname.match(/\/stories\/([^/?]+)/);
        if (storiesMatch && storiesMatch[1]) {
            // Agrupar stories por usuario y ventanas de tiempo de 30 segundos
            // para evitar contar cada slide como contenido separado
            return `instagram-story-${storiesMatch[1]}-${Math.floor(Date.now() / 30000)}`;
        }

        // 3. Patrón para posts que pueden contener videos
        const postMatch = location.pathname.match(/\/p\/([^/?]+)/);
        if (postMatch && postMatch[1]) {
            return `instagram-post-${postMatch[1]}`;
        }

        // 4. Sección de reels en feed o perfil
        if (location.pathname.includes('/reels')) {
            // Para contenido en la sección de reels, agrupar por intervalos de tiempo
            // para evitar contar cada scroll como contenido nuevo
            return `instagram-reels-section-${Math.floor(Date.now() / 60000)}`;
        }

        // 5. Contenido en feed o página de exploración con videos
        const videos = document.querySelectorAll('video');
        if (videos.length > 0) {
            const hayVideoVisible = Array.from(videos).some(video =>
                isElementVisible(video) && video.offsetWidth > 100
            );

            if (hayVideoVisible) {
                // Para videos en feed, usar ventanas de tiempo más largas (2 minutos)
                return `instagram-feed-video-${location.pathname}-${Math.floor(Date.now() / 120000)}`;
            }
        }
    }

    // Tratamiento especial para TikTok para evitar conteo múltiple
    if (dominio.includes('tiktok.com')) {
        // Primer patrón: URLs de video estándar
        const tiktokVideoMatch = location.pathname.match(/\/video\/(\d+)/);
        if (tiktokVideoMatch && tiktokVideoMatch[1]) {
            return `tiktok-video-${tiktokVideoMatch[1]}`;
        }

        // Segundo patrón: URLs de perfil con video
        // Formato: /@usuario/video/1234567890
        const tiktokProfileMatch = location.pathname.match(/\/@[^/]+\/(?:video\/)?(\d+)/);
        if (tiktokProfileMatch && tiktokProfileMatch[1]) {
            return `tiktok-video-${tiktokProfileMatch[1]}`;
        }

        // Si no podemos extraer un ID específico, usar la URL completa
        if (location.pathname.includes('@') || location.pathname.includes('/video/')) {
            console.log("[Extension] Usando pathname completo para TikTok:", location.pathname);
            return `tiktok-${location.pathname}`;
        }
    }

    // Si no tenemos un patrón claro de URL, usar combinación de URL + timestamp agrupado
    return `content-${location.pathname}-${Math.floor(Date.now() / 60000)}`;
}

// Simplificar la verificación para YouTube
function esYoutubeShort() {
    return dominio.includes('youtube.com') && location.pathname.includes('/shorts/');
}

// Detecta cualquier contenido multimedia en Instagram
function detectarMultimediaInstagram() {
    if (!dominio.includes('instagram.com')) return false;

    try {
        // 1. Verificar por URLs específicas primero (forma más segura)
        const esURLMultimedia =
            location.pathname.includes('/reel/') ||
            location.pathname.includes('/reels') ||
            location.pathname.includes('/stories/') ||
            location.pathname.includes('/explore');

        if (esURLMultimedia) {
            console.log("[Extension] Detectado por URL:", location.pathname);
            return true;
        }

        // 2. Verificar videos visibles
        const videos = Array.from(document.querySelectorAll('video'));
        const hayVideoVisible = videos.some(video => isElementVisible(video));

        if (hayVideoVisible) {
            console.log("[Extension] Detectado video visible");
            return true;
        }

        // 3. Verificar diálogos con imágenes (típico de stories)
        const dialogos = document.querySelectorAll('[role="dialog"]');
        if (dialogos.length > 0) {
            for (const dialogo of dialogos) {
                // Verificar que el dialogo siga existiendo en el DOM (puede ser removido dinámicamente)
                if (!document.contains(dialogo)) continue;

                const tieneImagenVisible = Array.from(dialogo.querySelectorAll('img')).some(img =>
                    document.contains(img) && isElementVisible(img) && img.offsetWidth > 100 && img.offsetHeight > 100
                );

                if (tieneImagenVisible) {
                    console.log("[Extension] Detectado diálogo con imagen");
                    return true;
                }
            }
        }

        // 4. Verificar elementos de UI específicos de reels/stories
        const elementosUI = [
            document.querySelector('[aria-label*="Me gusta"]'),
            document.querySelector('[aria-label*="Like"]'),
            document.querySelector('[aria-label*="siguiente"],[aria-label*="Next"]'),
            document.querySelector('[aria-label*="Pausar"],[aria-label*="Pause"]'),
            document.querySelector('[aria-label*="Play"]'),
            document.querySelector('[aria-label*="Reel"]')
        ];

        if (elementosUI.some(elem => elem !== null && document.contains(elem) && isElementVisible(elem))) {
            console.log("[Extension] Detectados controles de reproducción");
            return true;
        }
    } catch (error) {
        console.error("[Extension] Error en detectarMultimediaInstagram:", error.message);
        if (error.message && (
            error.message.includes("Extension context invalidated") ||
            error.message.includes("Invalid extension") ||
            error.message.includes("Extension context")
        )) {
            extensionValid = false;
        }
        return false;
    }

    return false;
}

// Crear una referencia global a la función para poder eliminarla después
let manejarEventoReproduccion = function (event) {
    if (!verificarContexto()) return;

    console.log("[Extension] Video iniciado/reproduciendo", event.target);
    // Al detectar que un video comienza a reproducirse, verificar contenido
    setTimeout(verificarContenido, 50);
};

// Monitorear todos los videos de la página 
function iniciarObservadorDeVideos() {
    if (videoObserverStarted || !dominio.includes('instagram.com') || !verificarContexto()) return;
    videoObserverStarted = true;

    console.log("[Extension] Iniciando observador de reproducción de videos");

    try {
        // Observar videos existentes
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
            video.addEventListener('play', manejarEventoReproduccion);
            video.addEventListener('playing', manejarEventoReproduccion);
        });

        // Observar nuevos videos
        const videoObserver = new MutationObserver(mutations => {
            if (!verificarContexto()) {
                videoObserver.disconnect();
                return;
            }

            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeName === 'VIDEO') {
                        node.addEventListener('play', manejarEventoReproduccion);
                        node.addEventListener('playing', manejarEventoReproduccion);
                    } else if (node.nodeType === 1) {
                        const nuevosVideos = node.querySelectorAll('video');
                        nuevosVideos.forEach(video => {
                            video.addEventListener('play', manejarEventoReproduccion);
                            video.addEventListener('playing', manejarEventoReproduccion);
                        });
                    }
                });
            });
        });

        videoObserver.observe(document.body, { childList: true, subtree: true });

        // Almacenar el observer para poder desconectarlo si es necesario
        window._extensionVideoObserver = videoObserver;
    } catch (error) {
        console.error("[Extension] Error al iniciar observador de videos:", error);
        videoObserverStarted = false;
    }
}

// Enviar mensaje al background script con manejo de errores mejorado
function enviarMensajeSeguro(mensaje, callback) {
    if (!verificarContexto()) {
        console.log("[Extension] No se puede enviar mensaje: contexto inválido");
        if (typeof callback === 'function') callback(null);
        return false;
    }

    try {
        chrome.runtime.sendMessage(mensaje, function (response) {
            // Capturamos el error inmediatamente después de la llamada
            const runtimeError = chrome.runtime.lastError;

            if (runtimeError) {
                console.error("[Extension] Error al enviar mensaje:", runtimeError.message);
                extensionValid = false;

                if (typeof callback === 'function') callback(null);
                return;
            }

            if (typeof callback === 'function') callback(response);
        });
        return true;
    } catch (error) {
        console.error("[Extension] Error al enviar mensaje:", error.message);
        extensionValid = false;

        if (typeof callback === 'function') callback(null);
        return false;
    }
}

function verificarContenido() {
    // No ejecutar si el contexto de la extensión no es válido o hay verificaciones en curso
    if (!verificarContexto() || checking || redirectInProgress) return;
    checking = true;

    try {
        logDebugInfo();

        // Debug especial para TikTok
        if (dominio.includes('tiktok.com')) {
            console.log("[Extension] Verificando TikTok - URL:", location.href);
            const videos = document.querySelectorAll('video');
            console.log("[Extension] Videos en TikTok:", videos.length);
            videos.forEach((video, idx) => {
                console.log(`[Extension] Video TikTok ${idx}:`, {
                    src: video.src || video.currentSrc || 'sin-src',
                    visible: isElementVisible(video),
                    width: video.offsetWidth,
                    height: video.offsetHeight
                });
            });
        }

        // Debug especial para Instagram
        if (dominio.includes('instagram.com')) {
            console.log("[Extension] Verificando Instagram - URL:", location.href);
            const videos = document.querySelectorAll('video');
            console.log("[Extension] Videos en Instagram:", videos.length);
            videos.forEach((video, idx) => {
                console.log(`[Extension] Video Instagram ${idx}:`, {
                    src: video.src || video.currentSrc || 'sin-src',
                    visible: isElementVisible(video),
                    width: video.offsetWidth,
                    height: video.offsetHeight
                });
            });
        }

        // Identificador único para este contenido
        const contentId = getContentId();
        console.log("[Extension] ID de contenido generado:", contentId);

        // Si ya hemos contabilizado este contenido (para evitar duplicados)
        if (countedContent.has(contentId)) {
            console.log("[Extension] Contenido ya contabilizado:", contentId);
            checking = false;
            return;
        }

        // Simplificar la detección de contenido limitado
        let esContenidoLimitado = false;
        try {
            // Simplificación para reducir falsos positivos
            if (esYoutubeShort()) {
                console.log("[Extension] Detectado YouTube Short:", contentId);
                esContenidoLimitado = true;
            } else if (esTikTokVideo()) {
                console.log("[Extension] Detectado TikTok video:", contentId);
                // Verificar si hay videos visibles para mejorar la detección en TikTok
                const hayVideoVisible = Array.from(document.querySelectorAll('video')).some(video =>
                    isElementVisible(video) && video.offsetWidth > 100
                );
                if (hayVideoVisible) {
                    console.log("[Extension] Confirmado video visible de TikTok");
                    esContenidoLimitado = true;
                } else {
                    console.log("[Extension] URL de TikTok pero sin video visible");
                    // Aún así contar videos de TikTok basados en la URL
                    esContenidoLimitado = true;
                }
            } else if (dominio.includes('instagram.com') && detectarMultimediaInstagram()) {
                console.log("[Extension] Detectado contenido multimedia de Instagram:", contentId);
                esContenidoLimitado = true;
            }
        } catch (detectionError) {
            console.error("[Extension] Error en detección de contenido:", detectionError);
            checking = false;

            if (detectionError.message && detectionError.message.includes("Extension context")) {
                extensionValid = false;
            }
            return;
        }

        console.log("[Extension] ¿Es contenido limitado?", esContenidoLimitado);

        if (esContenidoLimitado) {
            enviarMensajeSeguro({ action: 'incrementarContador', sitio: dominio }, (response) => {
                checking = false;

                if (!response) return; // Error o contexto inválido

                // Marcar el contenido como contabilizado
                countedContent.add(contentId);
                console.log("[Extension] Contenido contabilizado:", contentId);

                // Limitar el tamaño del conjunto para evitar uso excesivo de memoria
                if (countedContent.size > 150) {
                    const iterator = countedContent.values();
                    countedContent.delete(iterator.next().value); // Eliminar el más antiguo
                }

                // El background script maneja la redirección si es necesario
                if (response && response.alcanzado) {
                    redirectInProgress = true;
                } else if (response && response.contadorHoy === response.limite - 1) {
                    alert(`⚠️ Te queda solo 1 contenido más hoy en ${dominio}`);
                }
            });
        } else {
            checking = false;
            // Verificar si ya se ha superado el límite
            verificarLimite();
        }
    } catch (error) {
        console.error("[Extension] Error inesperado en verificarContenido:", error);
        checking = false;

        if (error.message && (
            error.message.includes("Extension context invalidated") ||
            error.message.includes("Invalid extension") ||
            error.message.includes("Extension context")
        )) {
            extensionValid = false;
            // Limpiar recursos
            if (observer) {
                try {
                    observer.disconnect();
                } catch (e) {
                    // Ignorar errores al desconectar
                }
            }

            if (window._extensionVideoObserver) {
                try {
                    window._extensionVideoObserver.disconnect();
                } catch (e) {
                    // Ignorar errores al desconectar
                }
            }

            if (window._extensionTikTokObserver) {
                try {
                    window._extensionTikTokObserver.disconnect();
                } catch (e) {
                    // Ignorar errores al desconectar
                }
            }

            if (window._extensionInstagramObserver) {
                try {
                    window._extensionInstagramObserver.disconnect();
                } catch (e) {
                    // Ignorar errores al desconectar
                }
            }
        }
    }
}

function verificarLimite() {
    if (!verificarContexto() || redirectInProgress) return;

    enviarMensajeSeguro({ action: 'obtenerEstado' }, (response) => {
        if (!response) return; // Error o contexto inválido

        const contadores = response.contador || {};
        const limites = response.limites || {};

        if (contadores[dominio] >= (limites[dominio] || 10) && !redirectInProgress) {
            redirectInProgress = true;
            enviarMensajeSeguro({
                action: 'abrirPaginaLimite',
                sitio: dominio
            });
        }
    });
}

// Observador principal de la página
const observer = new MutationObserver(mutations => {
    if (!verificarContexto()) {
        observer.disconnect();
        return;
    }

    // Verificar cambios de URL
    const urlActual = location.href;
    if (urlActual !== lastUrl) {
        console.log("[Extension] Cambio de URL detectado:", urlActual);
        lastUrl = urlActual;
        redirectInProgress = false;

        // Usar un timeout más largo para sitios que tienen problemas con múltiples conteos
        let delay = 300;
        if (dominio.includes('youtube.com')) delay = 1000;
        if (dominio.includes('tiktok.com')) delay = 1000;

        setTimeout(verificarContenido, delay);
        return;
    }

    // Para YouTube y TikTok, ser más conservador con las verificaciones para evitar múltiples conteos
    if (dominio.includes('youtube.com') || dominio.includes('tiktok.com')) {
        // Solo verificar si hay cambios muy específicos en la URL que indican cambio de contenido
        const esContenidoLimitado =
            (dominio.includes('youtube.com') && urlActual.includes('/shorts/')) ||
            (dominio.includes('tiktok.com') && urlActual.includes('/video/'));

        if (esContenidoLimitado && !checking && !redirectInProgress) {
            setTimeout(verificarContenido, 1000);
        }
        return;
    }

    // Para otros sitios, seguir con la lógica normal
    // Detectar cambios significativos en el DOM
    let debeVerificar = false;

    // Comprobar si hay nodos nuevos relevantes
    const hayNodosRelevantes = mutations.some(mutation =>
        Array.from(mutation.addedNodes).some(node => {
            if (node.nodeName === 'VIDEO' || node.nodeName === 'IMG') return true;

            if (node.nodeType === 1) {
                if (node.querySelector('video') ||
                    node.querySelector('img') ||
                    node.getAttribute('role') === 'dialog' ||
                    node.querySelector('[role="dialog"]')) {
                    return true;
                }
            }
            return false;
        })
    );

    if (hayNodosRelevantes) {
        console.log("[Extension] Detectados nuevos elementos multimedia");
        debeVerificar = true;
    }

    // Verificar si alguna de las mutaciones afecta a atributos de elementos relevantes
    const hayAtributosRelevantes = mutations.some(mutation => {
        if (mutation.type === 'attributes') {
            const target = mutation.target;
            if (target.nodeName === 'VIDEO' || target.nodeName === 'IMG' ||
                target.getAttribute('role') === 'dialog') {
                return true;
            }
        }
        return false;
    });

    if (hayAtributosRelevantes) {
        console.log("[Extension] Detectados cambios en atributos de elementos multimedia");
        debeVerificar = true;
    }

    if (debeVerificar && !checking && !redirectInProgress) {
        setTimeout(verificarContenido, 300);
    }
});

// Comprobar periódicamente, con lógica específica por sitio
function verificarPeriodicamente() {
    if (!verificarContexto() || redirectInProgress) return;

    // Para YouTube, reducir la frecuencia de verificación para evitar múltiples conteos
    if (dominio.includes('youtube.com')) {
        // Sólo verificar si estamos en un short
        if (esYoutubeShort() && !checking) {
            verificarContenido();
        }
        // Usar un intervalo más largo para YouTube
        setTimeout(verificarPeriodicamente, 5000);
        return;
    }

    // Para Instagram, reducir frecuencia para evitar múltiples conteos
    if (dominio.includes('instagram.com')) {
        // Solo verificar si no se está verificando ya
        if (!checking) {
            verificarContenido();
        }
        // Usar un intervalo más largo para Instagram
        setTimeout(verificarPeriodicamente, 6000);
        return;
    }

    // Para TikTok, reducir frecuencia para evitar múltiples conteos
    if (dominio.includes('tiktok.com')) {
        // Solo verificar si estamos en un video y no se está verificando ya
        if (esTikTokVideo() && !checking) {
            verificarContenido();
        }
        // Usar un intervalo más largo para TikTok
        setTimeout(verificarPeriodicamente, 5000);
        return;
    }

    // Para cualquier otro sitio
    setTimeout(verificarPeriodicamente, 2000);
}

// Inicialización
try {
    // Verificar si el contexto es válido antes de iniciar
    if (!verificarContexto()) {
        console.log("[Extension] Contexto no válido al iniciar, no se inicializan observadores");
        throw new Error("Contexto de extensión no válido");
    }

    // Añadir un evento para manejar cuando la extensión se actualiza o desactiva
    window.addEventListener('beforeunload', () => {
        // Limpiar recursos
        if (observer) {
            try {
                observer.disconnect();
            } catch (e) { }
        }

        if (window._extensionVideoObserver) {
            try {
                window._extensionVideoObserver.disconnect();
            } catch (e) { }
        }

        if (window._extensionTikTokObserver) {
            try {
                window._extensionTikTokObserver.disconnect();
            } catch (e) { }
        }

        if (window._extensionInstagramObserver) {
            try {
                window._extensionInstagramObserver.disconnect();
            } catch (e) { }
        }
    });

    // Iniciar observador principal
    observer.observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['src', 'style', 'class']
    });

    // Verificación inicial con un pequeño retraso para permitir que la página cargue
    // Más tiempo para sitios que tienen problemas con múltiples conteos
    const initialDelay =
        dominio.includes('youtube.com') ? 1500 :
            dominio.includes('tiktok.com') ? 1500 :
                dominio.includes('instagram.com') ? 1500 : 800;
    setTimeout(verificarContenido, initialDelay);

    // Configuraciones específicas por sitio
    if (dominio.includes('instagram.com')) {
        console.log("[Extension] Inicializando manejadores específicos para Instagram");

        // Iniciar observador específico de videos
        iniciarObservadorDeVideos();

        // Verificar cuando el usuario interactúa con elementos de navegación en Instagram
        document.addEventListener('click', (event) => {
            if (!verificarContexto() || checking || redirectInProgress) return;

            // Buscar elementos de navegación específicos de Instagram
            const esNavegacion =
                event.target.closest('[role="button"]') ||
                event.target.closest('a[href*="/reel/"]') ||
                event.target.closest('a[href*="/p/"]') ||
                event.target.closest('svg') || // Muchos botones en Instagram son SVGs
                event.target.closest('[aria-label*="Next"]') ||
                event.target.closest('[aria-label*="Previous"]');

            if (esNavegacion) {
                console.log("[Extension] Detectado clic en navegación de Instagram");

                // Dar tiempo para que el contenido se cargue
                setTimeout(() => {
                    // No verificar inmediatamente, esperar a ver si cambia la URL
                    const urlAnterior = location.href;

                    setTimeout(() => {
                        if (location.href !== urlAnterior) {
                            console.log("[Extension] URL cambió después de clic en Instagram");
                            verificarContenido();
                        } else {
                            console.log("[Extension] Verificando después de clic en Instagram (sin cambio de URL)");
                            verificarContenido();
                        }
                    }, 1000);
                }, 500);
            }
        }, true);

        // Para Instagram, añadir observador específico de Reels
        const instagramReelObserver = new MutationObserver(mutations => {
            if (!verificarContexto() || checking || redirectInProgress) {
                instagramReelObserver.disconnect();
                return;
            }

            // Buscar sólo cambios significativos en videos, no cualquier cambio en el DOM
            let tieneVideosNuevos = false;
            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    const nuevosVideos = Array.from(mutation.addedNodes).filter(node =>
                        node.nodeName === 'VIDEO' ||
                        (node.nodeType === 1 && node.querySelector('video'))
                    );

                    if (nuevosVideos.length > 0) {
                        tieneVideosNuevos = true;
                        console.log("[Extension] Detectados nuevos videos en Instagram");
                    }
                }
            });

            if (tieneVideosNuevos) {
                // Dar tiempo para que el video se cargue completamente
                setTimeout(verificarContenido, 1000);
            }
        });

        // Observar cambios en elementos que suelen contener videos en Instagram
        const contenedoresVideo = document.querySelectorAll('article, main, [role="dialog"]');
        contenedoresVideo.forEach(contenedor => {
            instagramReelObserver.observe(contenedor, {
                childList: true,
                subtree: true
            });
        });

        // Si no hay contenedores específicos, observar el body
        if (contenedoresVideo.length === 0) {
            instagramReelObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        // Almacenar el observer para limpieza
        window._extensionInstagramObserver = instagramReelObserver;
    }

    // Para YouTube, agregar manejadores específicos para botones de navegación
    if (dominio.includes('youtube.com')) {
        // Verificar cuando se hace clic en botones de navegación de shorts
        document.addEventListener('click', (event) => {
            if (!verificarContexto() || checking || redirectInProgress) return;

            // Buscar botones de navegación de shorts (siguiente, anterior)
            const esBotonNavegacion =
                event.target.closest('button[aria-label*="Next"]') ||
                event.target.closest('button[aria-label*="Previous"]') ||
                event.target.closest('ytd-reel-video-renderer');

            if (esBotonNavegacion) {
                // Dar tiempo para que cambie la URL
                setTimeout(() => {
                    if (esYoutubeShort()) {
                        console.log("[Extension] Detectada navegación entre shorts");
                        verificarContenido();
                    }
                }, 1000);
            }
        }, true);
    }

    // Para TikTok, agregar manejadores específicos para controles de navegación
    if (dominio.includes('tiktok.com')) {
        // Verificar cuando se hace clic en botones de navegación entre videos
        document.addEventListener('click', (event) => {
            if (!verificarContexto() || checking || redirectInProgress) return;

            // Log para cualquier clic en TikTok
            console.log("[Extension] Clic en TikTok en elemento:", event.target.tagName);

            // Buscar botones de navegación típicos de TikTok
            const esBotonNavegacion =
                event.target.closest('[data-e2e="arrow-right"]') ||
                event.target.closest('[data-e2e="arrow-left"]') ||
                event.target.closest('.video-card') ||  // Contenedor común de videos
                event.target.closest('.video-feed-item') ||  // Otro contenedor común
                event.target.closest('button') ||  // Cualquier botón
                event.target.closest('a[href*="video"]');  // Enlaces a videos

            if (esBotonNavegacion) {
                console.log("[Extension] Detectado clic en navegación TikTok");
                // Dar tiempo para que cambie la URL
                setTimeout(() => {
                    console.log("[Extension] Verificando después de navegación en TikTok:", location.href);
                    verificarContenido();
                }, 1000);
            } else {
                // Verificar de todos modos después de cualquier clic en TikTok
                // ya que la interfaz varía considerablemente
                setTimeout(() => {
                    if (esTikTokVideo()) {
                        console.log("[Extension] Verificando después de clic general en TikTok");
                        verificarContenido();
                    }
                }, 1000);
            }
        }, true);

        // También verificar cuando el usuario hace scroll en TikTok (para For You Page)
        let ultimoScroll = Date.now();
        window.addEventListener('scroll', () => {
            // Limitar la frecuencia de verificación (máximo una vez cada 1 segundo en scroll)
            const ahora = Date.now();
            if (ahora - ultimoScroll < 1000 || !verificarContexto() || checking || redirectInProgress) return;

            ultimoScroll = ahora;
            console.log("[Extension] Detectado scroll en TikTok");

            setTimeout(() => {
                if (esTikTokVideo()) {
                    console.log("[Extension] Verificando después de scroll en TikTok");
                    verificarContenido();
                }
            }, 500);
        }, { passive: true });

        // Escuchar eventos de reproducción de video específicos para TikTok
        document.addEventListener('play', (event) => {
            if (event.target.tagName === 'VIDEO' && !checking && !redirectInProgress) {
                console.log("[Extension] Video de TikTok iniciado");
                setTimeout(verificarContenido, 500);
            }
        }, true);

        // Observar cambios en video específicos para TikTok
        const tiktokVideoObserver = new MutationObserver(mutations => {
            if (!verificarContexto() || checking || redirectInProgress) {
                tiktokVideoObserver.disconnect();
                return;
            }

            const hayVideos = document.querySelectorAll('video').length > 0;
            if (hayVideos && esTikTokVideo()) {
                console.log("[Extension] Cambios detectados en videos de TikTok");
                setTimeout(verificarContenido, 800);
            }
        });

        // Observar cambios en el body para detectar nuevos videos
        tiktokVideoObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src']
        });

        // Almacenar el observer
        window._extensionTikTokObserver = tiktokVideoObserver;

        // Verificación inicial específica para TikTok
        setTimeout(() => {
            if (esTikTokVideo()) {
                console.log("[Extension] Verificación inicial de TikTok");
                verificarContenido();
            }
        }, 1000);
    }

    // Iniciar verificación periódica para todos los sitios soportados
    setTimeout(verificarPeriodicamente, 1500);

    // Verificar cada vez que la ventana cambia de tamaño
    window.addEventListener('resize', () => {
        if (verificarContexto() && !checking && !redirectInProgress) {
            // Más retraso para sitios con problemas de múltiples conteos
            const resizeDelay =
                dominio.includes('youtube.com') ? 1000 :
                    dominio.includes('tiktok.com') ? 1000 :
                        dominio.includes('instagram.com') ? 1000 : 500;
            setTimeout(verificarContenido, resizeDelay);
        }
    });
} catch (error) {
    console.error("[Extension] Error al inicializar:", error);
    extensionValid = false;
}
