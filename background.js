chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.set({
        limits: {
            "youtube.com": 20,
            "instagram.com": 20,
            "tiktok.com": 20
        },
        counter: {},
        lastDay: new Date().toLocaleDateString()
    }, () => {
        console.log("[Extension] Installation completed. Initial data configured.");
    });
});

// Log current state for debugging
function logCurrentState() {
    chrome.storage.sync.get(['limits', 'counter', 'lastDay'], (data) => {
        console.log("[Extension] Current state:", {
            limits: data.limits || {},
            counter: data.counter || {},
            lastDay: data.lastDay || new Date().toLocaleDateString()
        });
    });
}

// Execute log at start
logCurrentState();

// Function to open an extension page
function openExtensionPage(page, parameters = {}, tabId = null) {
    try {
        const url = chrome.runtime.getURL(page);
        const searchParams = new URLSearchParams();

        // Add parameters to URL if they exist
        for (const [key, value] of Object.entries(parameters)) {
            searchParams.append(key, value);
        }

        const completeUrl = `${url}${searchParams.toString() ? '?' + searchParams.toString() : ''}`;

        // If there's a tabId, update that tab, otherwise create a new one
        if (tabId) {
            chrome.tabs.update(tabId, { url: completeUrl });
        } else {
            chrome.tabs.create({ url: completeUrl });
        }
    } catch (error) {
        console.error("[Extension] Error opening page:", error);
    }
}

// Function to check if a URL is from a social platform and close it if necessary
function checkAndCloseTab(url, tabId) {
    try {
        const isSocialPage =
            url.includes('youtube.com') ||
            url.includes('instagram.com') ||
            url.includes('tiktok.com');

        if (isSocialPage) {
            // If it's a tab from a social platform, we close it
            chrome.tabs.remove(tabId);
        }
    } catch (error) {
        console.error("[Extension] Error closing tab:", error);
    }
}

// Safe response handling to avoid connection errors
function respondSafely(sendResponse, data) {
    try {
        sendResponse(data);
    } catch (error) {
        console.error("[Extension] Error sending response:", error);
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("[Extension] Message received:", request.action, request);

    if (request.action === 'incrementCounter') {
        chrome.storage.sync.get(['limits', 'counter', 'lastDay'], (data) => {
            try {
                let today = new Date().toLocaleDateString();
                let site = request.site;

                // Initialize objects if they don't exist
                if (!data.limits) data.limits = {
                    "youtube.com": 20,
                    "instagram.com": 20,
                    "tiktok.com": 20
                };
                if (!data.counter) data.counter = {};

                // Reset counters if it's a new day
                if (data.lastDay !== today) {
                    console.log("[Extension] New day detected, resetting counters.");
                    data.counter = {};
                    data.lastDay = today;
                }

                // Increment counter for the specific site
                data.counter[site] = (data.counter[site] || 0) + 1;
                let currentLimit = data.limits[site] || 20; // Default to 20 if not defined

                console.log("[Extension] Counter incremented:", site, data.counter[site], "/", currentLimit);

                chrome.storage.sync.set(data, () => {
                    try {
                        const reached = data.counter[site] > currentLimit;

                        // If limit reached, open limit reached page in a new tab and close the original
                        if (reached && sender && sender.tab && sender.tab.id) {
                            console.log("[Extension] Limit reached for:", site);
                            // Save original tabId to be able to close it later
                            const originalTabId = sender.tab.id;

                            // Create a new tab with the limit reached page
                            chrome.tabs.create({ url: chrome.runtime.getURL(`limit-reached.html?site=${site}`) }, () => {
                                // After creating the new tab, close the original
                                try {
                                    chrome.tabs.remove(originalTabId);
                                } catch (error) {
                                    console.error("[Extension] Error closing original tab:", error);
                                }
                            });
                        }

                        respondSafely(sendResponse, {
                            reached: reached,
                            todayCounter: data.counter[site],
                            limit: currentLimit
                        });
                    } catch (error) {
                        console.error("[Extension] Error after saving counter:", error);
                        respondSafely(sendResponse, { error: "Internal error" });
                    }
                });
            } catch (error) {
                console.error("[Extension] Error processing counter increment:", error);
                respondSafely(sendResponse, { error: "Internal error" });
            }
        });
        return true; // Important for asynchronous responses
    } else if (request.action === 'getStatus') {
        chrome.storage.sync.get(['limits', 'counter', 'lastDay'], (data) => {
            try {
                let today = new Date().toLocaleDateString();

                // Initialize objects if they don't exist
                if (!data.limits) data.limits = {
                    "youtube.com": 20,
                    "instagram.com": 20,
                    "tiktok.com": 20
                };
                if (!data.counter) data.counter = {};

                // Reset counters if it's a new day
                if (data.lastDay !== today) {
                    console.log("[Extension] New day detected, resetting counters.");
                    data.counter = {};
                    data.lastDay = today;
                    chrome.storage.sync.set({ counter: {}, lastDay: today });
                }

                console.log("[Extension] Current state:", {
                    counter: data.counter,
                    limits: data.limits
                });

                respondSafely(sendResponse, {
                    counter: data.counter,
                    limits: data.limits
                });
            } catch (error) {
                console.error("[Extension] Error getting state:", error);
                respondSafely(sendResponse, { error: "Internal error" });
            }
        });
        return true; // Important for asynchronous responses
    } else if (request.action === 'updateAllLimits') {
        console.log("[Extension] Updating ALL limits at once to:", request.newLimit);

        chrome.storage.sync.get(['limits'], (data) => {
            try {
                if (!data.limits) data.limits = {};
                const oldLimits = { ...data.limits };

                // Update all specified sites
                const sites = request.sites || ['youtube.com', 'instagram.com', 'tiktok.com'];
                sites.forEach(site => {
                    data.limits[site] = request.newLimit;
                });

                console.log("[Extension] All limits updated:",
                    "Old values:", JSON.stringify(oldLimits),
                    "New values:", JSON.stringify(data.limits));

                chrome.storage.sync.set({ limits: data.limits }, () => {
                    const response = {
                        success: true,
                        updatedSites: sites,
                        newLimit: request.newLimit,
                        allLimits: data.limits
                    };
                    console.log("[Extension] Sending response for updateAllLimits:", response);
                    respondSafely(sendResponse, response);
                });
            } catch (error) {
                console.error("[Extension] Error updating all limits:", error);
                respondSafely(sendResponse, { error: "Internal error" });
            }
        });
        return true; // Important for asynchronous responses
    } else if (request.action === 'updateLimit') {
        console.log("[Extension] UPDATING LIMIT REQUEST RECEIVED", {
            site: request.site,
            newLimit: request.newLimit,
            sender: sender ? sender.id : 'unknown'
        });

        chrome.storage.sync.get(['limits'], (data) => {
            try {
                if (!data.limits) data.limits = {};
                const oldLimit = data.limits[request.site];
                data.limits[request.site] = request.newLimit;

                console.log("[Extension] Limit updated for:", request.site,
                    "Old value:", oldLimit,
                    "New value:", request.newLimit,
                    "All limits now:", JSON.stringify(data.limits));

                chrome.storage.sync.set({ limits: data.limits }, () => {
                    const response = {
                        success: true,
                        updatedSite: request.site,
                        newLimit: request.newLimit,
                        allLimits: data.limits
                    };
                    console.log("[Extension] Sending response for updateLimit:", response);
                    respondSafely(sendResponse, response);
                });
            } catch (error) {
                console.error("[Extension] Error updating limit:", error);
                respondSafely(sendResponse, { error: "Internal error" });
            }
        });
        return true; // Important for asynchronous responses
    } else if (request.action === 'resetCounters') {
        try {
            chrome.storage.sync.get(['limits'], (data) => {
                const limits = data.limits || {
                    "youtube.com": 20,
                    "instagram.com": 20,
                    "tiktok.com": 20
                };

                // Reset only the counters, keep the limits
                chrome.storage.sync.set({
                    limits: limits,
                    counter: {},
                    lastDay: new Date().toLocaleDateString()
                }, () => {
                    console.log("[Extension] Counters manually reset.");
                    respondSafely(sendResponse, { success: true });
                });
            });
        } catch (error) {
            console.error("[Extension] Error resetting counters:", error);
            respondSafely(sendResponse, { error: "Internal error" });
        }
        return true; // Important for asynchronous responses
    } else if (request.action === 'openLimitPage') {
        try {
            // Open limit page in a new tab and close the original
            if (sender && sender.tab && sender.tab.id) {
                const originalTabId = sender.tab.id;

                // Create a new tab with the limit reached page
                chrome.tabs.create({ url: chrome.runtime.getURL(`limit-reached.html?site=${request.site}`) }, () => {
                    // After creating the new tab, close the original
                    try {
                        chrome.tabs.remove(originalTabId);
                    } catch (error) {
                        console.error("[Extension] Error closing original tab:", error);
                    }
                });
            }
            respondSafely(sendResponse, { success: true });
        } catch (error) {
            console.error("[Extension] Error opening limit page:", error);
            respondSafely(sendResponse, { error: "Internal error" });
        }
        return true;
    } else if (request.action === 'openPopup') {
        try {
            // Try to open the popup directly
            chrome.action.openPopup();
            respondSafely(sendResponse, { success: true });
        } catch (error) {
            console.error("[Extension] Error opening popup:", error);
            respondSafely(sendResponse, { error: "Internal error" });
        }
        return true;
    }

    return false;
});
