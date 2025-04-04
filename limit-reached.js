document.addEventListener('DOMContentLoaded', () => {
    const sitioElement = document.getElementById('sitio');
    const contadorHoyElement = document.getElementById('contadorHoy');
    const limiteElement = document.getElementById('limite');
    const tiempoRestanteElement = document.getElementById('tiempoRestante');
    const configurarBtn = document.getElementById('configurar');
    const irGoogleBtn = document.getElementById('irGoogle');

    // Obtener información del sitio desde el URL (pasado como parámetro)
    const urlParams = new URLSearchParams(window.location.search);
    const sitio = urlParams.get('sitio') || 'desconocido';

    // Función para formatear el tiempo restante
    function formatearTiempoRestante(milisegundos) {
        const segundos = Math.floor(milisegundos / 1000);
        const minutos = Math.floor(segundos / 60);
        const horas = Math.floor(minutos / 60);

        if (horas > 0) {
            return `${horas} h ${minutos % 60} min`;
        } else if (minutos > 0) {
            return `${minutos} min ${segundos % 60} s`;
        } else {
            return `${segundos} segundos`;
        }
    }

    // Actualizar información de límites
    function actualizarInfo() {
        chrome.runtime.sendMessage({ action: 'obtenerEstado' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("[Extension] Error:", chrome.runtime.lastError);
                return;
            }

            if (response) {
                const contadores = response.contador || {};
                const limites = response.limites || {};
                const contador = contadores[sitio] || 0;
                const limite = limites[sitio] || 10;

                // Mostrar el nombre del sitio de manera amigable
                let sitioMostrar = sitio;
                if (sitio === 'youtube.com') sitioMostrar = 'YouTube';
                if (sitio === 'instagram.com') sitioMostrar = 'Instagram';
                if (sitio === 'tiktok.com') sitioMostrar = 'TikTok';

                sitioElement.textContent = sitioMostrar;
                contadorHoyElement.textContent = contador;
                limiteElement.textContent = limite;

                // Calcular tiempo restante hasta medianoche
                const ahora = new Date();
                const medianoche = new Date();
                medianoche.setHours(24, 0, 0, 0);
                const tiempoRestante = medianoche - ahora;

                tiempoRestanteElement.textContent = formatearTiempoRestante(tiempoRestante);

                // Actualizar el botón para ir a Google o a la página principal
                irGoogleBtn.textContent = 'Ir a Google';
            }
        });
    }

    // Configurar botones
    configurarBtn.addEventListener('click', () => {
        // Abrir el popup directamente como página con el parámetro del sitio
        const popupUrl = chrome.runtime.getURL(`popup.html?sitio=${sitio}`);
        window.location.href = popupUrl;
    });

    irGoogleBtn.addEventListener('click', () => {
        window.location.href = 'https://google.com';
    });

    // Añadir botón para volver a la página principal (sin los contenidos limitados)
    const container = document.querySelector('.buttons');
    if (container) {
        const volverBtn = document.createElement('button');
        volverBtn.classList.add('secondary');
        volverBtn.textContent = 'Volver a ' + (sitio === 'youtube.com' ? 'YouTube' :
            sitio === 'instagram.com' ? 'Instagram' :
                sitio === 'tiktok.com' ? 'TikTok' : sitio);

        volverBtn.addEventListener('click', () => {
            // Volver a la página principal del sitio (sin entrar a contenido limitado)
            window.location.href = `https://${sitio}`;
        });

        container.appendChild(volverBtn);
    }

    // Actualizar información inicial
    actualizarInfo();

    // Actualizar cada minuto
    setInterval(actualizarInfo, 60000);
});
