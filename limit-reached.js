document.addEventListener('DOMContentLoaded', () => {
    const timeRemainingElement = document.getElementById('timeRemaining');

    // Get site information from URL (passed as parameter)
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

    // Update time display
    function updateTimeDisplay() {
        if (!timeRemainingElement) return;

        // Calculate remaining time until midnight
        const now = new Date();
        const midnight = new Date();
        midnight.setHours(24, 0, 0, 0);
        const timeRemaining = midnight - now;

        timeRemainingElement.textContent = formatTimeRemaining(timeRemaining);
    }

    // Update time display immediately and every second
    updateTimeDisplay();
    setInterval(updateTimeDisplay, 1000);
});
