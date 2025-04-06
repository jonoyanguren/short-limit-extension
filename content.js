let domain = location.hostname.replace('www.', '');
let lastUrl = location.href;
let checking = false;
let redirectInProgress = false;
let extensionValid = true;
let countedContent = new Set(); // To avoid counting the same content multiple times
let videoObserverStarted = false;
let lastContextCheck = 0;
let stopPeriodicCheck = null; // Will store cleanup function for periodic checks

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

    // First check: URL-based detection (specific video pages)
    const isVideoURL = location.pathname.includes('/video/') ||
        location.pathname.includes('@') && /\d+/.test(location.pathname);

    // Second check: detect videos playing in the main feed
    let isVideoPlaying = false;
    if (isTikTok && !isVideoURL) {
        // On TikTok's main feed, check for active videos
        const videos = document.querySelectorAll('video');
        isVideoPlaying = Array.from(videos).some(video => {
            return isElementVisible(video) &&
                !video.paused &&
                video.currentTime > 0 &&
                video.readyState > 2 && // HAVE_CURRENT_DATA or better
                video.offsetWidth > 200; // Only count reasonably sized videos
        });

        if (isVideoPlaying) {
            console.log("[Extension] TikTok video detected in feed");
        }
    }

    // Add more logging for TikTok
    if (isTikTok) {
        console.log("[Extension] Checking TikTok:", location.href);
        console.log("[Extension] TikTok pathname:", location.pathname);
        console.log("[Extension] Is TikTok video URL?", isVideoURL);
        console.log("[Extension] Is TikTok video playing?", isVideoPlaying);
    }

    return isTikTok && (isVideoURL || isVideoPlaying);
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

        // New pattern for /reels/ format URLs
        const reelsUrlMatch = location.pathname.match(/\/reels\/([^/?]+)/);
        if (reelsUrlMatch && reelsUrlMatch[1]) {
            console.log("[Extension] Matched Instagram reels URL format:", reelsUrlMatch[1]);
            return `instagram-reel-${reelsUrlMatch[1]}`;
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

        // For the main feed, find the currently playing video and use its unique ID
        const videos = document.querySelectorAll('video');
        const playingVideos = Array.from(videos).filter(video =>
            isElementVisible(video) && !video.paused && video.currentTime > 0
        );

        if (playingVideos.length > 0) {
            const playingVideo = playingVideos[0];

            // First, try to use the video's dataset ID if we set one earlier
            if (playingVideo.dataset && playingVideo.dataset.videoId) {
                console.log("[Extension] Using dataset videoId:", playingVideo.dataset.videoId);
                return `tiktok-feed-video-${playingVideo.dataset.videoId}`;
            }

            // Then try to get an identifier from the source
            const videoSrc = playingVideo.src || playingVideo.currentSrc || '';
            if (videoSrc) {
                const srcMatch = videoSrc.match(/\/([a-zA-Z0-9_-]{6,})\./);
                if (srcMatch && srcMatch[1]) {
                    return `tiktok-feed-video-${srcMatch[1]}`;
                }
            }

            // Look for any username in the vicinity of the video
            const nearbyUsername = findNearbyUsername(playingVideo);
            if (nearbyUsername) {
                // Use a shorter time window for same-user videos (30 seconds)
                return `tiktok-feed-${nearbyUsername}-${Math.floor(Date.now() / 30000)}`;
            }

            // Use the video's position as part of the identifier as a last resort
            try {
                const rect = playingVideo.getBoundingClientRect();
                const posData = `${Math.round(rect.top)}-${Math.round(rect.left)}`;
                return `tiktok-feed-pos-${posData}-${Math.floor(Date.now() / 20000)}`;
            } catch (e) {
                // Fallback to time-based windows (15 seconds) if all else fails
                return `tiktok-feed-video-${Math.floor(Date.now() / 15000)}`;
            }
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
        // Log for debugging
        console.log("[Extension] Comprobando contenido de Instagram en:", location.pathname);

        // Check for Reels by URL pattern
        if (location.pathname.includes('/reels/') || location.pathname.includes('/reel/')) {
            console.log("[Extension] Detectado Instagram Reel por URL:", location.pathname);
            return true;
        }

        // Check for Stories by URL pattern
        if (location.pathname.includes('/stories/')) {
            console.log("[Extension] Detectada Instagram Story por URL:", location.pathname);
            return true;
        }

        // Check for specific section for Reels in the new interface
        if (document.querySelector('[aria-label*="Reels"]') ||
            document.querySelector('[data-visualcompletion="loading-state"]')) {
            console.log("[Extension] Detectada sección de Reels en Instagram");
            return true;
        }

        // Enhanced video detection - looking for ANY visible video elements
        const videos = document.querySelectorAll('video');
        console.log("[Extension] Elementos de video encontrados:", videos.length);

        // Check if ANY video is visible in the viewport
        for (const video of videos) {
            const isVisible = isElementVisible(video);
            const hasSize = video.offsetWidth > 100;
            const isPlaying = !video.paused && video.currentTime > 0;

            console.log("[Extension] Video Instagram:", {
                visible: isVisible,
                size: video.offsetWidth + 'x' + video.offsetHeight,
                playing: isPlaying
            });

            // Consider it multimedia content if the video is visible, has a reasonable size
            // or is playing or is about to play
            if ((isVisible && hasSize) || isPlaying) {
                console.log("[Extension] Detectado video activo en Instagram");
                return true;
            }
        }

        // Check for media viewing dialog (typical for Reels/Stories in feed)
        const mediaDialog = document.querySelector('[role="dialog"] video, [role="presentation"] video');
        if (mediaDialog) {
            console.log("[Extension] Detectado diálogo de visualización de medios en Instagram");
            return true;
        }

        // When all else fails, check for specific structural elements that might indicate a Reel/Story
        const reelIndicators = [
            '[aria-label*="reel"]',
            '[data-media-type="GraphVideo"]',
            'div._abl-',  // Instagram's internal class for video containers
            'section._aak3' // Common container for story/reel content
        ];

        for (const selector of reelIndicators) {
            if (document.querySelector(selector)) {
                console.log("[Extension] Detectado indicador de Reel/Story:", selector);
                return true;
            }
        }

        console.log("[Extension] No se detectó contenido multimedia en Instagram");
        return false;
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

    console.log("[Extension] Iniciando observador de reproducción de videos para Instagram");

    try {
        // Función mejorada para aplicar event listeners a videos
        const aplicarListeners = (video) => {
            if (!video.hasAttribute('data-extension-monitored')) {
                console.log("[Extension] Agregando listeners a video de Instagram:", video);

                // Marcar este video como ya monitoreado
                video.setAttribute('data-extension-monitored', 'true');

                // Monitorear eventos de reproducción
                video.addEventListener('play', handlePlaybackEvent);
                video.addEventListener('playing', handlePlaybackEvent);

                // Añadir también timeupdate para Instagram (detecta reproducción en curso)
                video.addEventListener('timeupdate', (event) => {
                    // Solo verificar si el video ha estado reproduciéndose por al menos 1 segundo
                    if (event.target.currentTime > 1 && !checking && !redirectInProgress) {
                        console.log("[Extension] Video de Instagram reproduciendo por más de 1 segundo");
                        setTimeout(checkContent, 50);
                    }
                });
            }
        };

        // Buscar y monitorear videos existentes
        const videos = document.querySelectorAll('video');
        console.log("[Extension] Videos encontrados inicialmente en Instagram:", videos.length);
        videos.forEach(aplicarListeners);

        // Crear una función para buscar periódicamente videos nuevos
        const buscarVideosPeriodicamente = () => {
            if (!checkContext() || !extensionValid) return;

            const nuevosVideos = document.querySelectorAll('video:not([data-extension-monitored])');
            if (nuevosVideos.length > 0) {
                console.log("[Extension] Encontrados nuevos videos en Instagram:", nuevosVideos.length);
                nuevosVideos.forEach(aplicarListeners);
            }
        };

        // Programar búsqueda periódica de videos
        const intervalId = setInterval(buscarVideosPeriodicamente, 1000);

        // Observar cambios en el DOM para detectar nuevos videos
        const videoObserver = new MutationObserver((mutations) => {
            if (!checkContext()) {
                videoObserver.disconnect();
                clearInterval(intervalId);
                return;
            }

            let hayNuevosVideos = false;

            mutations.forEach(mutation => {
                // Buscar videos añadidos directamente
                mutation.addedNodes.forEach(node => {
                    if (node.nodeName === 'VIDEO') {
                        hayNuevosVideos = true;
                        aplicarListeners(node);
                    } else if (node.nodeType === 1) {
                        // Buscar videos dentro de nodos añadidos
                        const nuevosVideos = node.querySelectorAll('video:not([data-extension-monitored])');
                        if (nuevosVideos.length > 0) {
                            hayNuevosVideos = true;
                            nuevosVideos.forEach(aplicarListeners);
                        }
                    }
                });
            });

            // Si se detectaron nuevos videos, verificar el contenido
            if (hayNuevosVideos && !checking && !redirectInProgress) {
                console.log("[Extension] Detectados nuevos videos en Instagram, verificando contenido");
                setTimeout(checkContent, 100);
            }
        });

        // Observar todo el body para cambios
        videoObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'style', 'class']
        });

        // También detectar cuando el usuario interactúa con la página
        document.addEventListener('click', (event) => {
            if (!checkContext() || checking || redirectInProgress) return;

            // Verificar si el clic fue en un elemento relacionado con Stories o Reels
            const esElementoRelevante =
                event.target.closest('a[href*="/stories/"]') ||
                event.target.closest('a[href*="/reel/"]') ||
                event.target.closest('a[href*="/reels/"]') ||
                event.target.closest('[role="button"]');

            if (esElementoRelevante) {
                console.log("[Extension] Detectado clic en elemento relevante de Instagram");
                // Dar tiempo para que se cargue el contenido
                setTimeout(checkContent, 500);
            }
        });

        // Almacenar el observer y el interval para poder limpiarlos si es necesario
        window._extensionVideoObserver = videoObserver;
        window._extensionVideoInterval = intervalId;
    } catch (error) {
        console.error("[Extension] Error al iniciar observador de videos para Instagram:", error);
        videoObserverStarted = false;
    }
}

// Send message to background script with improved error handling
function sendMessageSafely(message, callback) {
    // First, check if context is already known to be invalid
    if (!extensionValid || !checkContext()) {
        console.log("[Extension] Cannot send message: invalid context");
        if (typeof callback === 'function') callback(null);
        return;
    }

    try {
        chrome.runtime.sendMessage(message, response => {
            const error = chrome.runtime.lastError;
            if (error) {
                console.error("[Extension] Message error:", error.message);

                // Mark context as invalid if appropriate
                if (error.message.includes("Extension context invalidated") ||
                    error.message.includes("Invalid extension")) {
                    extensionValid = false;
                    cleanupResources(); // Clean up resources when context is invalidated
                }

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

        // Mark context as invalid if appropriate
        if (error.message && (
            error.message.includes("Extension context invalidated") ||
            error.message.includes("Invalid extension") ||
            error.message.includes("Extension context")
        )) {
            extensionValid = false;
            cleanupResources(); // Clean up resources when context is invalidated
        }

        if (typeof callback === 'function') {
            callback(null);
        }
    }
}

// Helper function to clean up resources when extension context is invalidated
function cleanupResources() {
    console.log("[Extension] Cleaning up resources due to invalid context");

    try {
        // Disconnect main observer
        if (observer) {
            try {
                observer.disconnect();
            } catch (e) {
                console.log("[Extension] Error disconnecting main observer:", e.message);
            }
        }

        // Remove video event listeners
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
            try {
                video.removeEventListener('play', handlePlaybackEvent);
                video.removeEventListener('playing', handlePlaybackEvent);
                video.removeEventListener('timeupdate', null);
            } catch (e) {
                // Ignore errors when removing listeners
            }
        });

        // Reset video observer flag
        videoObserverStarted = false;

        // Disconnect site-specific observers
        if (window._extensionTikTokObserver) {
            try {
                window._extensionTikTokObserver.disconnect();
            } catch (e) {
                console.log("[Extension] Error disconnecting TikTok observer:", e.message);
            }
        }

        if (window._extensionInstagramObserver) {
            try {
                window._extensionInstagramObserver.disconnect();
            } catch (e) {
                console.log("[Extension] Error disconnecting Instagram observer:", e.message);
            }
        }

        if (window._extensionYouTubeObserver) {
            try {
                window._extensionYouTubeObserver.disconnect();
            } catch (e) {
                console.log("[Extension] Error disconnecting YouTube observer:", e.message);
            }
        }

        if (window._extensionVideoObserver) {
            try {
                window._extensionVideoObserver.disconnect();
            } catch (e) {
                console.log("[Extension] Error disconnecting video observer:", e.message);
            }
        }

        // Limpiar intervalos específicos
        if (window._extensionVideoInterval) {
            try {
                clearInterval(window._extensionVideoInterval);
            } catch (e) {
                console.log("[Extension] Error clearing video interval:", e.message);
            }
        }

        // Clear any pending intervals or timeouts
        // This is a bit aggressive but helps prevent zombie callbacks
        const highestId = window.setTimeout(() => { }, 0);
        for (let i = 0; i < highestId; i++) {
            window.clearTimeout(i);
        }
    } catch (error) {
        console.error("[Extension] Error during cleanup:", error);
    }
}

// Check for limited content
function checkContent() {
    // Don't run if the extension context is invalid or there are ongoing checks
    if (!extensionValid || checking || redirectInProgress) return;

    checking = true;

    try {
        // Double-check context before expensive operations
        if (!checkContext()) {
            checking = false;
            return;
        }

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
                cleanupResources();
            }
            return;
        }

        console.log("[Extension] ¿Es contenido limitado?", esContenidoLimitado);

        if (esContenidoLimitado) {
            // Check context once more before sending message
            if (!extensionValid || !checkContext()) {
                checking = false;
                return;
            }

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
            // Call checkLimit only if context is still valid
            if (extensionValid) {
                checkLimit();
            }
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
            cleanupResources();
        }
    }
}

// Check if the limit has been reached
function checkLimit() {
    if (!extensionValid || !checkContext() || redirectInProgress) return;

    sendMessageSafely({ action: 'getStatus' }, (response) => {
        if (!response) return;

        const counters = response.counter || {};
        const limits = response.limits || {};

        if (counters[domain] > (limits[domain] || 10) && !redirectInProgress) {
            redirectInProgress = true;

            // Double-check context before sending message
            if (!extensionValid || !checkContext()) {
                return;
            }

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
    // Store interval ID so we can clear it if needed
    let checkIntervalId = null;

    // Function to actually perform the check
    const performCheck = () => {
        // If context is invalid, stop checking
        if (!extensionValid) {
            console.log("[Extension] Stopping periodic checks due to invalid context");
            if (checkIntervalId) {
                clearInterval(checkIntervalId);
            }
            return;
        }

        try {
            if (lastUrl !== location.href) {
                lastUrl = location.href;
                // Reset when URL changes
                redirectInProgress = false;
                countedContent = new Set();
                console.log("[Extension] URL changed, resetting state");
            }

            // Add special detection for TikTok feed
            if (domain.includes('tiktok.com') && !redirectInProgress) {
                // Track the last video we saw
                if (!window._extensionLastTikTokVideo) {
                    window._extensionLastTikTokVideo = {
                        id: null,
                        timestamp: 0,
                        videoCount: 0
                    };
                }

                // Check for active videos in the TikTok feed
                const videos = document.querySelectorAll('video');
                const playingVideos = Array.from(videos).filter(video =>
                    isElementVisible(video) &&
                    !video.paused &&
                    video.currentTime > 0 &&
                    video.readyState > 2
                );

                // If we found a playing video
                if (playingVideos.length > 0) {
                    const currentVideo = playingVideos[0];
                    const videoId = currentVideo.dataset.videoId || '';
                    const currentTimestamp = Date.now();

                    // Check if this is a different video or if enough time has passed
                    const isDifferentVideo = videoId && videoId !== window._extensionLastTikTokVideo.id;
                    const enoughTimePassed = (currentTimestamp - window._extensionLastTikTokVideo.timestamp) > 15000; // 15 seconds

                    // If we've moved to a new video or enough time has passed with same video
                    if (isDifferentVideo || enoughTimePassed) {
                        console.log(`[Extension] TikTok video change detected: ${isDifferentVideo ? 'New video ID' : 'Time threshold'}`);

                        // Update our tracking information
                        window._extensionLastTikTokVideo = {
                            id: videoId,
                            timestamp: currentTimestamp,
                            videoCount: window._extensionLastTikTokVideo.videoCount + 1
                        };

                        // Reset the checking flag to ensure we can trigger a check
                        checking = false;

                        // Force a content check
                        console.log("[Extension] TikTok playing video detected in periodic check - triggering count");
                        checkContent();
                    }
                }
            } else {
                // Regular checks for other sites
                checkContent();
            }

            // Only check limit if content check didn't already do it
            if (extensionValid && !redirectInProgress) {
                checkLimit();
            }
        } catch (error) {
            console.error("[Extension] Error in periodic check:", error);

            // Handle context invalidation
            if (error.message && (
                error.message.includes("Extension context invalidated") ||
                error.message.includes("Invalid extension")
            )) {
                extensionValid = false;
                if (checkIntervalId) {
                    clearInterval(checkIntervalId);
                }
            }
        }
    };

    // Start interval
    checkIntervalId = setInterval(performCheck, 500);

    // Return function to stop checking
    return () => {
        if (checkIntervalId) {
            clearInterval(checkIntervalId);
        }
    };
}

// Helper function to find a username near a video element
function findNearbyUsername(videoElement) {
    if (!videoElement || !document.contains(videoElement)) return null;

    try {
        // Look for parent elements up to 5 levels
        let parentEl = videoElement.parentElement;
        let searchLevel = 0;

        while (parentEl && searchLevel < 5) {
            // Look for username patterns in href attributes
            const links = parentEl.querySelectorAll('a[href*="/@"]');
            for (const link of links) {
                const href = link.getAttribute('href') || '';
                const usernameMatch = href.match(/\/@([a-zA-Z0-9_.]{3,30})/);
                if (usernameMatch && usernameMatch[1]) {
                    return usernameMatch[1];
                }

                // Also check link text content
                const text = link.textContent || '';
                const textMatch = text.match(/@([a-zA-Z0-9_.]{3,30})/);
                if (textMatch && textMatch[1]) {
                    return textMatch[1];
                }
            }

            // Check all text content in spans and divs for username patterns
            const textElements = parentEl.querySelectorAll('span, div, p, h1, h2, h3, h4, h5, h6');
            for (const el of textElements) {
                const text = el.textContent || '';
                if (text.includes('@')) {
                    const usernameMatch = text.match(/@([a-zA-Z0-9_.]{3,30})/);
                    if (usernameMatch && usernameMatch[1]) {
                        return usernameMatch[1];
                    }
                }
            }

            parentEl = parentEl.parentElement;
            searchLevel++;
        }
    } catch (error) {
        console.error("[Extension] Error finding username:", error);
    }

    return null;
}

// Initialization
try {
    // Verify context is valid before starting
    if (!checkContext()) {
        console.log("[Extension] Invalid context at startup, observers will not be initialized");
        throw new Error("Invalid extension context");
    }

    // Add event listener to handle page unload
    window.addEventListener('beforeunload', () => {
        // Stop periodic checks
        if (stopPeriodicCheck && typeof stopPeriodicCheck === 'function') {
            stopPeriodicCheck();
        }

        // Clean up resources
        cleanupResources();
    });

    // Add event listener for visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            console.log("[Extension] Page hidden, conserving resources");
            // Could pause intensive operations here
        } else {
            console.log("[Extension] Page visible again, resuming operations");
            if (extensionValid && !checking) {
                // Re-check context after page becomes visible again
                if (checkContext()) {
                    // Delay check to allow page to fully restore
                    setTimeout(checkContent, 500);
                }
            }
        }
    });

    // Main observer initialization
    observer.observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['src', 'style', 'class']
    });

    // Initial check with delay to allow page to load
    // Longer delay for sites with multiple counting issues
    const initialDelay =
        domain.includes('youtube.com') ? 1500 :
            domain.includes('tiktok.com') ? 1500 :
                domain.includes('instagram.com') ? 1500 : 800;

    // Only run initial check if context is still valid after delay
    const initialCheckTimeout = setTimeout(() => {
        if (extensionValid && checkContext()) {
            checkContent();
        }
    }, initialDelay);

    // Site-specific configurations
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
                event.target.closest('a[href*="/reels/"]') || // Nuevo formato de URL para reels
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
        console.log("[Extension] Initializing TikTok-specific handlers");

        // Add video-specific observers for TikTok
        // This is crucial for detecting videos in the feed
        const setupTikTokVideoListeners = () => {
            const videos = document.querySelectorAll('video');
            console.log(`[Extension] Setting up TikTok video listeners for ${videos.length} videos`);

            videos.forEach(video => {
                // Use a dataset property to avoid adding multiple listeners to the same video
                if (!video.dataset.extensionTracked) {
                    video.dataset.extensionTracked = 'true';

                    // Add a unique identifier to each video element
                    let videoIdentifier = '';
                    try {
                        if (video.src || video.currentSrc) {
                            const srcUrl = video.src || video.currentSrc;
                            const srcMatch = srcUrl.match(/\/([a-zA-Z0-9_-]{6,})\./);
                            if (srcMatch && srcMatch[1]) {
                                videoIdentifier = srcMatch[1];
                            }
                        }

                        if (!videoIdentifier) {
                            const rect = video.getBoundingClientRect();
                            videoIdentifier = `pos-${Math.round(rect.top)}-${Math.round(rect.left)}-${video.offsetWidth}x${video.offsetHeight}`;
                        }

                        video.dataset.videoId = videoIdentifier;
                    } catch (e) {
                        console.log("[Extension] Error creating video identifier:", e);
                        video.dataset.videoId = `video-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    }

                    video.addEventListener('play', () => {
                        console.log("[Extension] TikTok video play event", video.dataset.videoId);
                        video.dataset.playStarted = Date.now().toString();
                        setTimeout(() => {
                            if (!video.paused && video.currentTime > 0) {
                                checkContent();
                            }
                        }, 200);
                    });

                    video.addEventListener('timeupdate', (event) => {
                        const currentVideo = event.target;
                        const videoId = currentVideo.dataset.videoId;

                        if (currentVideo.currentTime > 2 && !redirectInProgress && !checking) {
                            const videoKey = `tiktok-${videoId || Math.random().toString(36).substr(2, 9)}`;

                            if (!countedContent.has(videoKey)) {
                                console.log("[Extension] New TikTok video detected:", videoKey);
                                countedContent.add(videoKey);

                                const username = findNearbyUsername(currentVideo) || 'unknown';
                                console.log("[Extension] TikTok video from user:", username);

                                checkContent();
                            }
                        }
                    });
                }
            });
        };

        // Set up initial listeners
        setTimeout(setupTikTokVideoListeners, 1000);

        // And refresh listeners periodically
        setInterval(setupTikTokVideoListeners, 2000);

        // Create a TikTok-specific mutation observer for videos
        const tiktokObserver = new MutationObserver((mutations) => {
            let shouldCheckForVideos = false;

            mutations.forEach(mutation => {
                // Check if any videos were added
                if (mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.tagName === 'VIDEO' ||
                            (node.nodeType === 1 && node.querySelector('video'))) {
                            shouldCheckForVideos = true;
                            break;
                        }
                    }
                }
            });

            if (shouldCheckForVideos) {
                setupTikTokVideoListeners();
            }
        });

        // Start observing the document for added videos
        tiktokObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Store the observer for cleanup
        window._extensionTikTokObserver = tiktokObserver;
    }

    // Start periodic checks
    stopPeriodicCheck = checkPeriodically();

    // Log successful initialization
    console.log("[Extension] Successfully initialized content script");
} catch (error) {
    console.error("[Extension] Error during initialization:", error);
    extensionValid = false;

    // Clean up any resources if initialization fails
    cleanupResources();

    // Clear any pending timeouts from initialization
    if (typeof initialCheckTimeout !== 'undefined') {
        clearTimeout(initialCheckTimeout);
    }
}
