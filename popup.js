document.addEventListener('DOMContentLoaded', () => {
    const limitInput = document.getElementById('limit');
    const saveBtn = document.getElementById('save');
    const status = document.getElementById('status');
    const counter = document.getElementById('counter');
    const dailyLimitSpan = document.getElementById('dailyLimit');
    const closeBtn = document.getElementById('close');
    const siteCards = document.querySelectorAll('.site-card');
    const currentSiteLabel = document.getElementById('current-site');
    const quickLimitBtns = document.querySelectorAll('.quick-limit-btn');
    const showCustomBtn = document.getElementById('show-custom');
    const customForm = document.getElementById('custom-form');

    // For debug
    const debugInfo = document.createElement('div');
    debugInfo.style.fontSize = '10px';
    debugInfo.style.color = '#888';
    debugInfo.style.marginTop = '10px';
    document.querySelector('.container').appendChild(debugInfo);

    // Add info message about how the limits work
    const infoMessage = document.createElement('div');
    infoMessage.innerHTML = '<p style="font-size: 12px; color: #555; font-style: italic; margin-top: 10px;">Note: Changes to limits are applied to all platforms at once.</p>';
    document.querySelector('.limit-section').appendChild(infoMessage);

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
        currentSiteLabel.textContent = getSiteName(currentDomain);

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

            // Update active quick limit button
            updateActiveQuickLimitButton(limits);

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

    // Helper function to check if all sites have the same limit
    function allSitesHaveSameLimit(limits) {
        const sites = ['youtube.com', 'instagram.com', 'tiktok.com'];
        const firstLimit = limits[sites[0]];
        return sites.every(site => limits[site] === firstLimit);
    }

    // Update active state for quick limit buttons
    function updateActiveQuickLimitButton(limits) {
        // Remove active class from all buttons
        quickLimitBtns.forEach(btn => btn.classList.remove('active'));

        // If all sites have the same limit, check if it matches any quick limit button
        if (allSitesHaveSameLimit(limits)) {
            const currentLimit = limits['youtube.com']; // Use any site as they all have the same limit

            // Find and activate matching button
            quickLimitBtns.forEach(btn => {
                const btnLimit = parseInt(btn.getAttribute('data-limit'), 10);
                if (btnLimit === currentLimit) {
                    btn.classList.add('active');
                }
            });
        }
    }

    // Toggle custom form visibility
    showCustomBtn.addEventListener('click', () => {
        if (customForm.style.display === 'block') {
            customForm.style.display = 'none';
            showCustomBtn.textContent = 'Show custom limit';
        } else {
            customForm.style.display = 'block';
            showCustomBtn.textContent = 'Hide custom limit';
        }
    });

    // Set up quick limit buttons
    quickLimitBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const newLimit = parseInt(btn.getAttribute('data-limit'), 10);

            // Show saving status
            status.textContent = "Saving...";
            console.log("[Extension] Quick limit button clicked:", newLimit);

            // Remove active class from all buttons and add to the clicked one
            quickLimitBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update all limits at once with the new action
            const sites = ['youtube.com', 'instagram.com', 'tiktok.com'];
            console.log("[Extension] Will update all sites at once:", sites, "to new limit:", newLimit);

            chrome.runtime.sendMessage({
                action: 'updateAllLimits',
                sites: sites,
                newLimit: newLimit
            }, (response) => {
                console.log(`[Extension] Update all limits response:`, response);

                if (chrome.runtime.lastError) {
                    console.error(`[Extension] Error saving all limits:`, chrome.runtime.lastError);
                    status.textContent = "❌ Error saving limits";
                } else if (response && response.success) {
                    console.log(`[Extension] Successfully updated all sites to ${newLimit}`);
                    status.textContent = `✅ All platforms set to limit: ${newLimit}`;

                    // Update counter to refresh the display
                    updateCounter();
                } else {
                    status.textContent = "⚠️ Error updating limits";
                    console.error("[Extension] Update response:", response);
                }
            });
        });
    });

    // Update custom limit function to use the same approach
    saveBtn.addEventListener('click', () => {
        const newLimit = parseInt(limitInput.value, 10);
        if (isNaN(newLimit) || newLimit < 1) {
            status.textContent = "❌ Limit must be a number greater than 0";
            return;
        }

        // Show save status
        status.textContent = "Saving...";
        console.log("[Extension] Custom limit button clicked:", newLimit);

        // Update all limits at once
        const sites = ['youtube.com', 'instagram.com', 'tiktok.com'];
        console.log("[Extension] Will update all sites at once:", sites, "to custom limit:", newLimit);

        chrome.runtime.sendMessage({
            action: 'updateAllLimits',
            sites: sites,
            newLimit: newLimit
        }, (response) => {
            console.log(`[Extension] Update all limits response:`, response);

            if (chrome.runtime.lastError) {
                console.error(`[Extension] Error saving all limits:`, chrome.runtime.lastError);
                status.textContent = "❌ Error saving custom limit";
            } else if (response && response.success) {
                console.log(`[Extension] Successfully updated all sites to ${newLimit}`);
                status.textContent = `✅ All platforms set to limit: ${newLimit}`;

                // Update quick limit buttons
                quickLimitBtns.forEach(btn => {
                    const btnLimit = parseInt(btn.getAttribute('data-limit'), 10);
                    if (btnLimit === newLimit) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });

                // Update counter to refresh the display
                updateCounter();
            } else {
                status.textContent = "⚠️ Error updating custom limit";
                console.error("[Extension] Update response:", response);
            }
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
