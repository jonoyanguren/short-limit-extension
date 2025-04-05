let domain = location.hostname.replace('www.', '');
let lastUrl = location.href;
let checking = false;
let redirectInProgress = false;
let extensionValid = true;
let countedContent = new Set(); // To avoid counting the same content multiple times
let videoObserverStarted = false;
let lastContextCheck = 0;

// Check if the extension context is still valid
function checkContext() {
    // Limit check frequency (maximum once every 2 seconds)
    const now = Date.now();
    if (now - lastContextCheck < 2000) return extensionValid;

    lastContextCheck = now;

    try {
        // A more robust way to check if the context is still valid
        // using a method that will throw an exception if the context is invalid
        chrome.runtime.getURL('');
        extensionValid = true;
        return true;
    } catch (e) {
        console.log("[Extension] Error checking context:", e.message);
        extensionValid = false;

        // Try to free resources
        try {
            if (observer) {
                observer.disconnect();
            }

            // Remove other event listeners
            const videos = document.querySelectorAll('video');
            videos.forEach(video => {
                video.removeEventListener('play', handlePlaybackEvent);
                video.removeEventListener('playing', handlePlaybackEvent);
            });

            if (videoObserverStarted) {
                videoObserverStarted = false;
            }

            // Clean up TikTok observer if it exists
            if (window._extensionTikTokObserver) {
                try {
                    window._extensionTikTokObserver.disconnect();
                } catch (e) {
                    console.log("[Extension] Error disconnecting TikTok observer:", e.message);
                }
            }

            // Clean up Instagram observer if it exists
            if (window._extensionInstagramObserver) {
                try {
                    window._extensionInstagramObserver.disconnect();
                } catch (e) {
                    console.log("[Extension] Error disconnecting Instagram observer:", e.message);
                }
            }

            // Clean up YouTube observer if it exists
            if (window._extensionYouTubeObserver) {
                try {
                    window._extensionYouTubeObserver.disconnect();
                } catch (e) {
                    console.log("[Extension] Error disconnecting YouTube observer:", e.message);
                }
            }
        } catch (cleanupError) {
            console.log("[Extension] Error freeing resources:", cleanupError.message);
        }

        return false;
    }
}

// Log debug information
function logDebugInfo() {
    if (!checkContext()) return;

    try {
        if (domain.includes('instagram.com')) {
            console.log("[Extension] Debug URL Instagram:", location.href);
            console.log("[Extension] Pathname:", location.pathname);

            try {
                const videos = document.querySelectorAll('video');
                console.log("[Extension] Videos found:", videos.length);

                // Use Array.from with extra safety
                Array.from(videos).forEach((video, index) => {
                    try {
                        if (!document.contains(video)) return;

                        console.log(`[Extension] Video ${index + 1}:`, {
                            visible: isElementVisible(video),
                            src: video.src || video.currentSrc || 'no-src',
                            parentClass: video.parentElement ? video.parentElement.className : 'no-parent',
                            width: video.offsetWidth,
                            height: video.offsetHeight
                        });
                    } catch (videoError) {
                        console.log(`[Extension] Error analyzing video ${index + 1}:`, videoError.message);
                    }
                });
            } catch (videosError) {
                console.log("[Extension] Error getting videos:", videosError.message);
            }

            // Log Instagram UI elements with extra safety
            try {
                console.log("[Extension] Dialogs:", document.querySelectorAll('[role="dialog"]').length);
            } catch (dialogError) {
                console.log("[Extension] Error getting dialogs:", dialogError.message);
            }

            try {
                console.log("[Extension] Navigation buttons:", document.querySelectorAll('[role="button"]').length);
            } catch (buttonError) {
                console.log("[Extension] Error getting buttons:", buttonError.message);
            }
        }
    } catch (error) {
        console.error("[Extension] Error in logDebugInfo:", error.message);

        if (error.message && (
            error.message.includes("Extension context invalidated") ||
            error.message.includes("Invalid extension") ||
            error.message.includes("Extension context")
        )) {
            extensionValid = false;
        }
    }
}

// Check if an element is visible on screen
function isElementVisible(element) {
    if (!element) return false;

    try {
        // Check that the element is still in the DOM
        if (!document.contains(element)) return false;

        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth) &&
            rect.width > 10 && // Ignore very small elements
            rect.height > 10 &&
            window.getComputedStyle(element).display !== 'none' &&
            window.getComputedStyle(element).visibility !== 'hidden'
        );
    } catch (error) {
        // Possible error if the element was removed from the DOM during the check
        console.error("[Extension] Error checking visibility:", error.message);
        return false;
    }
}

// Simplify TikTok verification
function isTikTokVideo() {
    const isTikTok = domain.includes('tiktok.com');
    const isVideo = location.pathname.includes('/video/') ||
        location.pathname.includes('@') && /\d+/.test(location.pathname);

    // Add more logging for TikTok
    if (isTikTok) {
        console.log("[Extension] Checking TikTok:", location.href);
        console.log("[Extension] TikTok pathname:", location.pathname);
        console.log("[Extension] Is TikTok video?", isVideo);
    }

    return isTikTok && isVideo;
}

// Get a unique identifier for the current video or image
function getContentId() {
    // Special handling for YouTube Shorts to avoid multiple counting
    if (domain.includes('youtube.com') && location.href.includes('/shorts/')) {
        // Extract only the short ID from the URL to avoid multiple counts
        const shortMatch = location.pathname.match(/\/shorts\/([^?/]+)/);
        if (shortMatch && shortMatch[1]) {
            return `youtube-short-${shortMatch[1]}`;
        }
    }

    // Special handling for Instagram to avoid multiple counting
    if (domain.includes('instagram.com')) {
        // 1. Pattern for individual Reels
        const reelMatch = location.pathname.match(/\/reel\/([^/?]+)/);
        if (reelMatch && reelMatch[1]) {
            return `instagram-reel-${reelMatch[1]}`;
        }

        // 2. Pattern for user Stories
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

        // 4. Sección de reels en feed or profile
        if (location.pathname.includes('/reels')) {
            // Para contenido en la sección de reels, agrupar por intervalos de tiempo
            // para evitar contar cada scroll como contenido nuevo
            return `instagram-reels-section-${Math.floor(Date.now() / 60000)}`;
        }

        // 5. Contenido en feed or página de exploración con videos
        const videos = document.querySelectorAll('video');
        if (videos.length > 0) {
            const hayVideoVisible = Array.from(videos).some(video =>
                isElementVisible(video) && video.offsetWidth > 100
            );

            if (hayVideoVisible) {
                // Para videos en feed, usar ventanas de tiempo más largas (2 minutes)
                return `instagram-feed-video-${location.pathname}-${Math.floor(Date.now() / 120000)}`;
            }
        }
    }

    // Tratamiento especial para TikTok para evitar conteo múltiple
    if (domain.includes('tiktok.com')) {
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

// Check if YouTube content is a Short
function isYoutubeShort() {
    // Direct URL-based verification
    const isShortURL = domain.includes('youtube.com') && location.pathname.includes('/shorts/');

    // If we're on YouTube, log debug information
    if (domain.includes('youtube.com')) {
        console.log("[Extension] Checking YouTube:", location.href);
        console.log("[Extension] YouTube pathname:", location.pathname);
        console.log("[Extension] Is YouTube Short?", isShortURL);
    }

    return isShortURL;
}

// Detect any multimedia content on Instagram
function detectInstagramMultimedia() {
    if (!domain.includes('instagram.com')) return false;

    try {
        // Check for Reels
        if (location.pathname.includes('/reel/')) {
            return true;
        }

        // Check for Stories
        if (location.pathname.includes('/stories/')) {
            return true;
        }

        // Check if we're in the feed and there are videos playing
        const videos = Array.from(document.querySelectorAll('video'));
        return videos.some(video => {
            return isElementVisible(video) && !video.paused;
        });
    } catch (error) {
        console.error("[Extension] Error detecting Instagram multimedia:", error);
        return false;
    }
}

// Crear una referencia global a la función para poder eliminarla después
let handlePlaybackEvent = function (event) {
    if (!checkContext()) return;

    console.log("[Extension] Video iniciado/reproduciendo", event.target);
    // Al detectar que un video comienza a reproducirse, verificar contenido
    setTimeout(checkContent, 50);
};

// Monitorear todos los videos de la página 
function iniciarObservadorDeVideos() {
    if (videoObserverStarted || !domain.includes('instagram.com') || !checkContext()) return;
    videoObserverStarted = true;

    console.log("[Extension] Iniciando observador de reproducción de videos");

    try {
        // Observar videos existentes
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
            video.addEventListener('play', handlePlaybackEvent);
            video.addEventListener('playing', handlePlaybackEvent);
        });

        // Observar nuevos videos
        const videoObserver = new MutationObserver(mutations => {
            if (!checkContext()) {
                videoObserver.disconnect();
                return;
            }

            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeName === 'VIDEO') {
                        node.addEventListener('play', handlePlaybackEvent);
                        node.addEventListener('playing', handlePlaybackEvent);
                    } else if (node.nodeType === 1) {
                        const nuevosVideos = node.querySelectorAll('video');
                        nuevosVideos.forEach(video => {
                            video.addEventListener('play', handlePlaybackEvent);
                            video.addEventListener('playing', handlePlaybackEvent);
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

// Send message to background script with improved error handling
function sendMessageSafely(message, callback) {
    if (!checkContext()) {
        console.log("[Extension] Cannot send message: invalid context");
        if (typeof callback === 'function') callback(null);
        return;
    }

    try {
        chrome.runtime.sendMessage(message, response => {
            if (chrome.runtime.lastError) {
                console.error("[Extension] Message error:", chrome.runtime.lastError);
                if (typeof callback === 'function') {
                    callback(null);
                }
                return;
            }

            if (typeof callback === 'function') {
                callback(response);
            }
        });
    } catch (error) {
        console.error("[Extension] Error sending message:", error);
        if (typeof callback === 'function') {
            callback(null);
        }

        if (error.message && (
            error.message.includes("Extension context invalidated") ||
            error.message.includes("Invalid extension") ||
            error.message.includes("Extension context")
        )) {
            extensionValid = false;
        }
    }
}

// Check for limited content
function checkContent() {
    // Don't run if the extension context is invalid or there are ongoing checks
    if (!checkContext() || checking || redirectInProgress) return;
    checking = true;

    try {
        logDebugInfo();

        // Debug especial para TikTok
        if (domain.includes('tiktok.com')) {
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
        if (domain.includes('instagram.com')) {
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

        // Debug especial para YouTube
        if (domain.includes('youtube.com')) {
            console.log("[Extension] Verificando YouTube - URL:", location.href);
            const videos = document.querySelectorAll('video');
            console.log("[Extension] Videos en YouTube:", videos.length);
            videos.forEach((video, idx) => {
                console.log(`[Extension] Video YouTube ${idx}:`, {
                    src: video.src || video.currentSrc || 'sin-src',
                    visible: isElementVisible(video),
                    width: video.offsetWidth,
                    height: video.offsetHeight,
                    esVertical: video.offsetHeight > video.offsetWidth
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
            if (isYoutubeShort()) {
                console.log("[Extension] Detectado YouTube Short:", contentId);
                esContenidoLimitado = true;
            } else if (isTikTokVideo()) {
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
            } else if (domain.includes('instagram.com') && detectInstagramMultimedia()) {
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
            console.log("[Extension] Enviando mensaje para incrementar contador de: " + domain);
            sendMessageSafely({ action: 'incrementCounter', site: domain }, (response) => {
                checking = false;

                if (!response) {
                    console.log("[Extension] No se recibió respuesta al incrementar contador");
                    return; // Error o contexto inválido
                }

                // Marcar el contenido como contabilizado
                countedContent.add(contentId);
                console.log("[Extension] Contenido contabilizado:", contentId);

                // Limitar el tamaño del conjunto para evitar uso excesivo de memoria
                if (countedContent.size > 150) {
                    const iterator = countedContent.values();
                    countedContent.delete(iterator.next().value); // Eliminar el más antiguo
                }

                // El background script maneja la redirección si es necesario
                if (response && response.reached) {
                    redirectInProgress = true;
                } else if (response && response.todayCounter === response.limit - 1) {
                    alert(`⚠️ Te queda solo 1 contenido más hoy en ${domain}`);
                }
            });
        } else {
            checking = false;
            // Verificar si ya se ha superado el límite
            checkLimit();
        }
    } catch (error) {
        console.error("[Extension] Error inesperado en checkContent:", error);
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

            if (window._extensionYouTubeObserver) {
                try {
                    window._extensionYouTubeObserver.disconnect();
                } catch (e) {
                    // Ignorar errores al desconectar
                }
            }
        }
    }
}

// Check if the limit has been reached
function checkLimit() {
    if (!checkContext() || redirectInProgress) return;

    sendMessageSafely({ action: 'getStatus' }, (response) => {
        if (!response) return;

        const counters = response.counter || {};
        const limits = response.limits || {};

        if (counters[domain] >= (limits[domain] || 10) && !redirectInProgress) {
            redirectInProgress = true;
            sendMessageSafely({
                action: 'openLimitPage',
                site: domain
            });
        }
    });
}

// Observador principal de la página
const observer = new MutationObserver(mutations => {
    if (!checkContext()) {
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
        if (domain.includes('youtube.com')) delay = 1000;
        if (domain.includes('tiktok.com')) delay = 1000;

        setTimeout(checkContent, delay);
        return;
    }

    // Para YouTube y TikTok, ser más conservador con las verificaciones para evitar múltiples conteos
    if (domain.includes('youtube.com') || domain.includes('tiktok.com')) {
        // Solo verificar si hay cambios muy específicos en la URL que indican cambio de contenido
        const esContenidoLimitado =
            (domain.includes('youtube.com') && urlActual.includes('/shorts/')) ||
            (domain.includes('tiktok.com') && urlActual.includes('/video/'));

        if (esContenidoLimitado && !checking && !redirectInProgress) {
            setTimeout(checkContent, 1000);
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
        setTimeout(checkContent, 300);
    }
});

// Check periodically
function checkPeriodically() {
    setInterval(() => {
        if (lastUrl !== location.href) {
            lastUrl = location.href;
            // Reset when URL changes
            redirectInProgress = false;
            countedContent = new Set();
            console.log("[Extension] URL changed, resetting state");
        }

        checkContent();
        checkLimit();
    }, 500);
}

// Inicialización
try {
    // Verificar si el contexto es válido antes de iniciar
    if (!checkContext()) {
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

        if (window._extensionYouTubeObserver) {
            try {
                window._extensionYouTubeObserver.disconnect();
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
        domain.includes('youtube.com') ? 1500 :
            domain.includes('tiktok.com') ? 1500 :
                domain.includes('instagram.com') ? 1500 : 800;
    setTimeout(checkContent, initialDelay);

    // Configuraciones específicas por sitio
    if (domain.includes('instagram.com')) {
        console.log("[Extension] Inicializando manejadores específicos para Instagram");

        // Iniciar observador específico de videos
        iniciarObservadorDeVideos();

        // Verificar cuando el usuario interactúa con elementos de navegación en Instagram
        document.addEventListener('click', (event) => {
            if (!checkContext() || checking || redirectInProgress) return;

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
                            checkContent();
                        } else {
                            console.log("[Extension] Verificando después de clic en Instagram (sin cambio de URL)");
                            checkContent();
                        }
                    }, 1000);
                }, 500);
            }
        }, true);

        // Para Instagram, añadir observador específico de Reels
        const instagramReelObserver = new MutationObserver(mutations => {
            if (!checkContext() || checking || redirectInProgress) {
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
                setTimeout(checkContent, 1000);
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
    if (domain.includes('youtube.com')) {
        console.log("[Extension] Inicializando manejadores específicos para YouTube");

        // Verificación inicial de YouTube Shorts - verificar inmediatamente
        setTimeout(() => {
            if (isYoutubeShort()) {
                console.log("[Extension] Verificación inicial de YouTube Short");
                checkContent();
            }
        }, 1000);

        // Verificar cuando se hace clic en botones de navegación de shorts
        document.addEventListener('click', (event) => {
            if (!checkContext() || redirectInProgress) return;

            // Log para cualquier clic en YouTube
            console.log("[Extension] Clic en YouTube en elemento:", event.target.tagName);

            // Buscar botones de navegación de shorts (siguiente, anterior)
            const esBotonNavegacion =
                event.target.closest('button[aria-label*="Next"]') ||
                event.target.closest('button[aria-label*="Previous"]') ||
                event.target.closest('ytd-shorts-compact-video-renderer') ||  // Miniatura de Short
                event.target.closest('ytd-reel-video-renderer') ||          // Video de Short
                event.target.closest('a[href*="/shorts/"]') ||              // Enlaces a Shorts
                event.target.closest('ytd-shorts-video-renderer');          // Renderer de Short

            if (esBotonNavegacion) {
                console.log("[Extension] Detectado clic en navegación de YouTube");
                // Dar tiempo para que cambie la URL
                setTimeout(() => {
                    // Verificar después de dar tiempo al cambio de URL
                    console.log("[Extension] Verificando después de clic en navegación");
                    checkContent();
                }, 800);
            }
        }, true);

        // También monitorear las actualizaciones de la URL (YouTube usa mucho history.pushState)
        let lastYoutubeURL = location.href;
        setInterval(() => {
            if (!checkContext()) return;

            if (lastYoutubeURL !== location.href) {
                console.log("[Extension] Cambio de URL en YouTube detectado:");
                console.log("  Anterior: " + lastYoutubeURL);
                console.log("  Nueva: " + location.href);

                lastYoutubeURL = location.href;

                // Verificar después de un breve retraso para cualquier cambio de URL
                setTimeout(checkContent, 800);
            }
        }, 500);

        // Monitorear la reproducción de videos
        document.addEventListener('play', (event) => {
            if (event.target.tagName === 'VIDEO' && !redirectInProgress) {
                console.log("[Extension] Video de YouTube iniciado");
                setTimeout(checkContent, 500);
            }
        }, true);

        // Observador simplificado para YouTube - enfocado en videos
        const youtubeObserver = new MutationObserver(() => {
            if (!checkContext() || redirectInProgress) return;

            // Verificar en shorts
            if (isYoutubeShort()) {
                console.log("[Extension] Cambios detectados en YouTube, verificando contenido");
                setTimeout(checkContent, 800);
            }
        });

        // Observar el body para detectar cualquier cambio
        youtubeObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Almacenar el observer para limpieza
        window._extensionYouTubeObserver = youtubeObserver;

        // Verificar regularmente en shorts - solución alternativa por si fallan los otros métodos
        setInterval(() => {
            if (!checkContext() || redirectInProgress) return;

            if (isYoutubeShort() && !checking) {
                console.log("[Extension] Verificación periódica de shorts");
                checkContent();
            }
        }, 3000);
    }

    // Para TikTok, agregar manejadores específicos para controles de navegación
    if (domain.includes('tiktok.com')) {
        // Verificar cuando se hace clic en botones de navegación entre videos
        document.addEventListener('click', (event) => {
            if (!checkContext() || checking || redirectInProgress) return;

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
                    checkContent();
                }, 1000);
            } else {
                // Verificar de todos modos después de cualquier clic en TikTok
                // ya que la interfaz varía considerablemente
                setTimeout(() => {
                    if (isTikTokVideo()) {
                        console.log("[Extension] Verificando después de clic general en TikTok");
                        checkContent();
                    }
                }, 1000);
            }
        }, true);

        // También verificar cuando el usuario hace scroll en TikTok (para For You Page)
        let ultimoScroll = Date.now();
        window.addEventListener('scroll', () => {
            // Limitar la frecuencia de verificación (máximo una vez cada 1 segundo en scroll)
            const ahora = Date.now();
            if (ahora - ultimoScroll < 1000 || !checkContext() || checking || redirectInProgress) return;

            ultimoScroll = ahora;
            console.log("[Extension] Detectado scroll en TikTok");

            setTimeout(() => {
                if (isTikTokVideo()) {
                    console.log("[Extension] Verificando después de scroll en TikTok");
                    checkContent();
                }
            }, 500);
        }, { passive: true });

        // Escuchar eventos de reproducción de video específicos para TikTok
        document.addEventListener('play', (event) => {
            if (event.target.tagName === 'VIDEO' && !checking && !redirectInProgress) {
                console.log("[Extension] Video de TikTok iniciado");
                setTimeout(checkContent, 500);
            }
        }, true);

        // Observar cambios en video específicos para TikTok
        const tiktokVideoObserver = new MutationObserver(mutations => {
            if (!checkContext() || checking || redirectInProgress) {
                tiktokVideoObserver.disconnect();
                return;
            }

            const hayVideos = document.querySelectorAll('video').length > 0;
            if (hayVideos && isTikTokVideo()) {
                console.log("[Extension] Cambios detectados en videos de TikTok");
                setTimeout(checkContent, 800);
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
            if (isTikTokVideo()) {
                console.log("[Extension] Verificación inicial de TikTok");
                checkContent();
            }
        }, 1000);
    }

    // Iniciar verificación periódica para todos los sitios soportados
    setTimeout(checkPeriodically, 1500);

    // Verificar cada vez que la ventana cambia de tamaño
    window.addEventListener('resize', () => {
        if (checkContext() && !checking && !redirectInProgress) {
            // Más retraso para sitios con problemas de múltiples conteos
            const resizeDelay =
                domain.includes('youtube.com') ? 1000 :
                    domain.includes('tiktok.com') ? 1000 :
                        domain.includes('instagram.com') ? 1000 : 500;
            setTimeout(checkContent, resizeDelay);
        }
    });
} catch (error) {
    console.error("[Extension] Error al inicializar:", error);
    extensionValid = false;
}
