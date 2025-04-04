document.addEventListener('DOMContentLoaded', () => {
    const limiteInput = document.getElementById('limite');
    const guardarBtn = document.getElementById('guardar');
    const estado = document.getElementById('estado');
    const contador = document.getElementById('contador');
    const limiteDiarioSpan = document.getElementById('limiteDiario');
    const cerrarBtn = document.getElementById('cerrar');
    const siteCards = document.querySelectorAll('.site-card');
    const sitioActualLabel = document.getElementById('sitio-actual');

    // Para debug
    const debugInfo = document.createElement('div');
    debugInfo.style.fontSize = '10px';
    debugInfo.style.color = '#888';
    debugInfo.style.marginTop = '10px';
    document.querySelector('.container').appendChild(debugInfo);

    // Obtener el dominio de los parámetros URL si existe (caso de apertura desde limit-reached.html)
    const urlParams = new URLSearchParams(window.location.search);
    let dominioActual = urlParams.get('sitio') || 'youtube.com';

    // Función para obtener el nombre amigable del sitio
    function getNombreSitio(dominio) {
        switch (dominio) {
            case 'youtube.com': return 'YouTube';
            case 'instagram.com': return 'Instagram';
            case 'tiktok.com': return 'TikTok';
            default: return dominio;
        }
    }

    // Función para actualizar la interfaz visual según el sitio seleccionado
    function actualizarSitioSeleccionado() {
        // Quitar la clase active de todas las tarjetas
        siteCards.forEach(card => {
            card.classList.remove('active');
        });

        // Añadir la clase active a la tarjeta seleccionada
        const tarjetaSeleccionada = document.querySelector(`.site-card[data-site="${dominioActual}"]`);
        if (tarjetaSeleccionada) {
            tarjetaSeleccionada.classList.add('active');
        }

        // Actualizar el texto del sitio actual
        sitioActualLabel.textContent = `Configurar ${getNombreSitio(dominioActual)}:`;

        // Actualizar el contador para el sitio seleccionado
        actualizarContador();
    }

    // Configurar los manejadores de eventos para las tarjetas de sitios
    siteCards.forEach(card => {
        card.addEventListener('click', () => {
            dominioActual = card.getAttribute('data-site');
            actualizarSitioSeleccionado();
        });
    });

    function actualizarContador() {
        // Mostrar mensaje de carga
        contador.textContent = "...";
        limiteDiarioSpan.textContent = "...";

        chrome.runtime.sendMessage({ action: 'obtenerEstado' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("[Extension] Error:", chrome.runtime.lastError);
                debugInfo.textContent = `Error: ${chrome.runtime.lastError.message}`;
                return;
            }

            // Debug info
            debugInfo.textContent = `Data: ${JSON.stringify(response)}`;
            console.log("Respuesta de obtenerEstado:", response);

            if (!response) {
                debugInfo.textContent += " | ¡Respuesta vacía!";
                return;
            }

            const contadores = response.contador || {};
            const limites = response.limites || {};

            // Debug contadores específicos
            debugInfo.textContent += ` | Dominio: ${dominioActual} | Contador: ${contadores[dominioActual]} | Límite: ${limites[dominioActual]}`;

            // Verificar explícitamente si el contador existe para este dominio
            const contadorValor = typeof contadores[dominioActual] !== 'undefined' ? contadores[dominioActual] : 0;
            const limiteValor = typeof limites[dominioActual] !== 'undefined' ? limites[dominioActual] : 10;

            contador.textContent = contadorValor;
            limiteDiarioSpan.textContent = limiteValor;
            limiteInput.value = limiteValor;

            // Actualizar también los contadores en las tarjetas de sitios
            siteCards.forEach(card => {
                const sitio = card.getAttribute('data-site');
                const contadorSitio = typeof contadores[sitio] !== 'undefined' ? contadores[sitio] : 0;
                const limiteSitio = typeof limites[sitio] !== 'undefined' ? limites[sitio] : 10;

                // Actualizar el contador en la tarjeta
                const infoContador = card.querySelector('.site-counter');
                if (infoContador) {
                    infoContador.textContent = `${contadorSitio}/${limiteSitio}`;

                    // Destacar visualmente si está cerca del límite
                    if (contadorSitio >= limiteSitio) {
                        infoContador.style.color = 'red';
                        infoContador.style.fontWeight = 'bold';
                        infoContador.style.backgroundColor = 'rgba(255,200,200,0.6)';
                    } else if (contadorSitio >= limiteSitio * 0.8) {
                        infoContador.style.color = 'darkorange';
                        infoContador.style.fontWeight = 'bold';
                        infoContador.style.backgroundColor = 'rgba(255,230,200,0.6)';
                    } else {
                        infoContador.style.color = 'green';
                        infoContador.style.fontWeight = 'normal';
                        infoContador.style.backgroundColor = 'rgba(200,255,200,0.6)';
                    }
                }
            });
        });
    }

    guardarBtn.addEventListener('click', () => {
        const nuevoLimite = parseInt(limiteInput.value, 10);
        if (isNaN(nuevoLimite) || nuevoLimite < 1) {
            estado.textContent = "❌ El límite debe ser un número mayor a 0";
            return;
        }

        // Mostrar estado de guardado
        estado.textContent = "Guardando...";

        chrome.runtime.sendMessage({
            action: 'actualizarLimite',
            sitio: dominioActual,
            nuevoLimite: nuevoLimite
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("[Extension] Error al guardar:", chrome.runtime.lastError);
                estado.textContent = "❌ Error al guardar límite";
                return;
            }

            estado.textContent = `✅ Límite guardado: ${nuevoLimite}`;
            actualizarContador();
        });
    });

    // Manejar el botón de cerrar (solo si estamos en un popup abierto como pestaña)
    if (cerrarBtn) {
        cerrarBtn.addEventListener('click', () => {
            // Si estamos en un popup como pestaña
            if (window.history.length > 1) {
                window.history.back(); // Volver a la página anterior
            } else {
                window.close(); // Intentar cerrar la pestaña
            }
        });
    }

    // Añadir botón para reiniciar contadores
    const resetBtn = document.createElement('button');
    resetBtn.classList.add('full-width');
    resetBtn.style.marginTop = '10px';
    resetBtn.style.backgroundColor = '#f44336';
    resetBtn.textContent = 'Reiniciar contadores';
    resetBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'reiniciarContadores' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("[Extension] Error al reiniciar:", chrome.runtime.lastError);
                estado.textContent = "❌ Error al reiniciar contadores";
                return;
            }

            estado.textContent = "✅ Contadores reiniciados";
            actualizarContador();
        });
    });
    document.querySelector('.container').appendChild(resetBtn);

    // Inicializar la interfaz 
    actualizarSitioSeleccionado();
});
