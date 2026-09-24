(function () {
    // Initialize analytics data in localStorage if not present
    if (!localStorage.getItem('analytics')) {
        localStorage.setItem('analytics', JSON.stringify({
            activeUsers: 0,
            totalVisits: 0,
            sessions: [],
            sessionTimes: []
        }));
    }

    // Update display function
    function updateAnalyticsDisplay() {
        const analytics = JSON.parse(localStorage.getItem('analytics'));
        
        // Calculate average session time
        const sessionTimes = analytics.sessionTimes || [];
        const totalDuration = sessionTimes.reduce((sum, session) => sum + session.duration, 0);
        const avgSessionTime = sessionTimes.length > 0 ? (totalDuration / sessionTimes.length).toFixed(2) : 0;

        // Update display only if elements exist
        const activeVisitorsElement = document.getElementById('active-visitors');
        const totalVisitsElement = document.getElementById('total-visits');
        const avgSessionTimeElement = document.getElementById('avg-session-time');

        if (activeVisitorsElement) {
            activeVisitorsElement.textContent = `Visitantes Ativos: ${analytics.activeUsers}`;
        }
        if (totalVisitsElement) {
            totalVisitsElement.textContent = `Total de Visitas: ${analytics.totalVisits}`;
        }
        if (avgSessionTimeElement) {
            avgSessionTimeElement.textContent = `Tempo Médio de Sessão: ${avgSessionTime}s`;
        }
    }

    // Check if the current page is index.html or root
    const isIndexPage = window.location.pathname === '/index.html' || window.location.pathname === '/';

    if (isIndexPage) {
        // Generate a unique session ID
        const sessionId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        const sessionStartTime = Date.now();

        // Load analytics data
        let analytics = JSON.parse(localStorage.getItem('analytics'));

        // Increment total visits and active users
        analytics.totalVisits += 1;
        analytics.activeUsers += 1;
        analytics.sessions.push({
            sessionId: sessionId,
            startTime: sessionStartTime,
            userAgent: navigator.userAgent,
            page: window.location.pathname,
            active: true // Mark session as active
        });

        // Save updated analytics
        localStorage.setItem('analytics', JSON.stringify(analytics));

        // Simulate decrementing active users and recording session time on page unload
        window.addEventListener('beforeunload', () => {
            analytics = JSON.parse(localStorage.getItem('analytics'));
            const sessionEndTime = Date.now();
            const duration = (sessionEndTime - sessionStartTime) / 1000; // Duration in seconds

            // Decrement active users
            analytics.activeUsers = Math.max(0, analytics.activeUsers - 1);

            // Mark session as inactive instead of removing it
            const session = analytics.sessions.find(session => session.sessionId === sessionId);
            if (session) {
                session.active = false;
            }

            // Record session duration
            analytics.sessionTimes.push({
                sessionId: sessionId,
                duration: duration,
                endTime: sessionEndTime
            });

            // Save updated analytics
            localStorage.setItem('analytics', JSON.stringify(analytics));
        });
    }

    // Initial display update
    updateAnalyticsDisplay();

    // Periodically update display (every 1 second) for testing
    setInterval(updateAnalyticsDisplay, 1000);
})();