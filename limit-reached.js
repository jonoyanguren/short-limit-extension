document.addEventListener('DOMContentLoaded', () => {
    const siteElement = document.getElementById('site');
    const todayCounterElement = document.getElementById('todayCounter');
    const limitElement = document.getElementById('limit');
    const timeRemainingElement = document.getElementById('timeRemaining');
    const configureBtn = document.getElementById('configure');
    const goToGoogleBtn = document.getElementById('goToGoogle');

    // Get site information from URL (passed as parameter)
    // Support both 'site' (new) and 'sitio' (old) parameters for backward compatibility
    const urlParams = new URLSearchParams(window.location.search);
    const site = urlParams.get('site') || urlParams.get('sitio') || 'unknown';

    // Function to format remaining time
    function formatTimeRemaining(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours} h ${minutes % 60} min`;
        } else if (minutes > 0) {
            return `${minutes} min ${seconds % 60} s`;
        } else {
            return `${seconds} seconds`;
        }
    }

    // Update limit information
    function updateInfo() {
        chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("[Extension] Error:", chrome.runtime.lastError);
                return;
            }

            if (response) {
                const counters = response.counter || {};
                const limits = response.limits || {};
                const counter = counters[site] || 0;
                const limit = limits[site] || 10;

                // Show friendly site name
                let siteToShow = site;
                if (site === 'youtube.com') siteToShow = 'YouTube';
                if (site === 'instagram.com') siteToShow = 'Instagram';
                if (site === 'tiktok.com') siteToShow = 'TikTok';

                siteElement.textContent = siteToShow;
                todayCounterElement.textContent = counter;
                limitElement.textContent = limit;

                // Calculate remaining time until midnight
                const now = new Date();
                const midnight = new Date();
                midnight.setHours(24, 0, 0, 0);
                const timeRemaining = midnight - now;

                timeRemainingElement.textContent = formatTimeRemaining(timeRemaining);

                // Update button to go to Google or main page
                goToGoogleBtn.textContent = 'Go to Google';
            }
        });
    }

    // Configure buttons
    configureBtn.addEventListener('click', () => {
        // Open popup directly as a page with the site parameter
        const popupUrl = chrome.runtime.getURL(`popup.html?site=${site}`);
        window.location.href = popupUrl;
    });

    goToGoogleBtn.addEventListener('click', () => {
        window.location.href = 'https://google.com';
    });

    // Add button to return to main page (without limited content)
    const container = document.querySelector('.buttons');
    if (container) {
        const returnBtn = document.createElement('button');
        returnBtn.classList.add('secondary');
        returnBtn.textContent = 'Return to ' + (site === 'youtube.com' ? 'YouTube' :
            site === 'instagram.com' ? 'Instagram' :
                site === 'tiktok.com' ? 'TikTok' : site);

        returnBtn.addEventListener('click', () => {
            // Return to the main page of the site (without entering limited content)
            window.location.href = `https://${site}`;
        });

        container.appendChild(returnBtn);
    }

    // Update initial information
    updateInfo();

    // Update every minute
    setInterval(updateInfo, 60000);
});
