document.addEventListener('DOMContentLoaded', () => {
    const limitInput = document.getElementById('limit');
    const saveBtn = document.getElementById('save');
    const status = document.getElementById('status');
    const counter = document.getElementById('counter');
    const dailyLimitSpan = document.getElementById('dailyLimit');
    const closeBtn = document.getElementById('close');
    const siteCards = document.querySelectorAll('.site-card');
    const currentSiteLabel = document.getElementById('current-site');

    // For debug
    const debugInfo = document.createElement('div');
    debugInfo.style.fontSize = '10px';
    debugInfo.style.color = '#888';
    debugInfo.style.marginTop = '10px';
    document.querySelector('.container').appendChild(debugInfo);

    // Get domain from URL parameters if exists (when opened from limit-reached.html)
    const urlParams = new URLSearchParams(window.location.search);
    let currentDomain = urlParams.get('site') || 'youtube.com';

    // Function to get friendly name of the site
    function getSiteName(domain) {
        switch (domain) {
            case 'youtube.com': return 'YouTube';
            case 'instagram.com': return 'Instagram';
            case 'tiktok.com': return 'TikTok';
            default: return domain;
        }
    }

    // Function to update visual interface based on selected site
    function updateSelectedSite() {
        // Remove active class from all cards
        siteCards.forEach(card => {
            card.classList.remove('active');
        });

        // Add active class to selected card
        const selectedCard = document.querySelector(`.site-card[data-site="${currentDomain}"]`);
        if (selectedCard) {
            selectedCard.classList.add('active');
        }

        // Update current site text
        currentSiteLabel.textContent = `Configure ${getSiteName(currentDomain)}:`;

        // Update counter for selected site
        updateCounter();
    }

    // Set up event handlers for site cards
    siteCards.forEach(card => {
        card.addEventListener('click', () => {
            currentDomain = card.getAttribute('data-site');
            updateSelectedSite();
        });
    });

    function updateCounter() {
        // Show loading message
        counter.textContent = "...";
        dailyLimitSpan.textContent = "...";

        chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("[Extension] Error:", chrome.runtime.lastError);
                debugInfo.textContent = `Error: ${chrome.runtime.lastError.message}`;
                return;
            }

            // Debug info
            debugInfo.textContent = `Data: ${JSON.stringify(response)}`;
            console.log("Response from getStatus:", response);

            if (!response) {
                debugInfo.textContent += " | Empty response!";
                return;
            }

            const counters = response.counter || {};
            const limits = response.limits || {};

            // Debug specific counters
            debugInfo.textContent += ` | Domain: ${currentDomain} | Counter: ${counters[currentDomain]} | Limit: ${limits[currentDomain]}`;

            // Explicitly check if counter exists for this domain
            const counterValue = typeof counters[currentDomain] !== 'undefined' ? counters[currentDomain] : 0;
            const limitValue = typeof limits[currentDomain] !== 'undefined' ? limits[currentDomain] : 10;

            counter.textContent = counterValue;
            dailyLimitSpan.textContent = limitValue;
            limitInput.value = limitValue;

            // Also update counters in site cards
            siteCards.forEach(card => {
                const site = card.getAttribute('data-site');
                const sitecounter = typeof counters[site] !== 'undefined' ? counters[site] : 0;
                const siteLimit = typeof limits[site] !== 'undefined' ? limits[site] : 10;

                // Update counter in the card
                const counterInfo = card.querySelector('.site-counter');
                if (counterInfo) {
                    counterInfo.textContent = `${sitecounter}/${siteLimit}`;

                    // Visually highlight if close to limit
                    if (sitecounter >= siteLimit) {
                        counterInfo.style.color = 'red';
                        counterInfo.style.fontWeight = 'bold';
                        counterInfo.style.backgroundColor = 'rgba(255,200,200,0.6)';
                    } else if (sitecounter >= siteLimit * 0.8) {
                        counterInfo.style.color = 'darkorange';
                        counterInfo.style.fontWeight = 'bold';
                        counterInfo.style.backgroundColor = 'rgba(255,230,200,0.6)';
                    } else {
                        counterInfo.style.color = 'green';
                        counterInfo.style.fontWeight = 'normal';
                        counterInfo.style.backgroundColor = 'rgba(200,255,200,0.6)';
                    }
                }
            });
        });
    }

    saveBtn.addEventListener('click', () => {
        const newLimit = parseInt(limitInput.value, 10);
        if (isNaN(newLimit) || newLimit < 1) {
            status.textContent = "❌ Limit must be a number greater than 0";
            return;
        }

        // Show save status
        status.textContent = "Saving...";

        chrome.runtime.sendMessage({
            action: 'updateLimit',
            site: currentDomain,
            newLimit: newLimit
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("[Extension] Error saving:", chrome.runtime.lastError);
                status.textContent = "❌ Error saving limit";
                return;
            }

            status.textContent = `✅ Limit saved: ${newLimit}`;
            updateCounter();
        });
    });

    // Handle close button (only if we're in a popup opened as a tab)
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            // If we're in a popup as a tab
            if (window.history.length > 1) {
                window.history.back(); // Go back to previous page
            } else {
                window.close(); // Try to close the tab
            }
        });
    }

    // Add button to reset counters
    const resetBtn = document.createElement('button');
    resetBtn.classList.add('full-width');
    resetBtn.style.marginTop = '10px';
    resetBtn.style.backgroundColor = '#f44336';
    resetBtn.textContent = 'Reset counters';
    resetBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'resetCounters' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("[Extension] Error resetting:", chrome.runtime.lastError);
                status.textContent = "❌ Error resetting counters";
                return;
            }

            status.textContent = "✅ Counters reset";
            updateCounter();
        });
    });
    document.querySelector('.container').appendChild(resetBtn);

    // Initialize interface 
    updateSelectedSite();
});
