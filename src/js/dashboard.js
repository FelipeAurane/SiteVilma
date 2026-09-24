(function () {
    function updateAnalyticsDisplay() {
        // Load analytics data
        const analytics = JSON.parse(localStorage.getItem('analytics')) || {
            activeUsers: 0,
            totalVisits: 0,
            sessions: [],
            sessionTimes: []
        };

        // Calculate average session time
        const sessionTimes = analytics.sessionTimes || [];
        const totalDuration = sessionTimes.reduce((sum, session) => sum + session.duration, 0);
        const avgSessionTime = sessionTimes.length > 0 ? (totalDuration / sessionTimes.length).toFixed(2) : 0;

        // Update summary display
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

        // Update sessions table
        const tableBody = document.getElementById('sessions-table-body');
        if (tableBody) {
            tableBody.innerHTML = ''; // Clear existing rows
            analytics.sessionTimes.forEach(session => {
                const sessionData = analytics.sessions.find(s => s.sessionId === session.sessionId) || {};
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${session.sessionId}</td>
                    <td>${sessionData.startTime ? new Date(sessionData.startTime).toLocaleString('pt-BR') : 'N/A'}</td>
                    <td>${session.duration.toFixed(2)}</td>
                    <td>${sessionData.userAgent || 'N/A'}</td>
                    <td>${sessionData.page || 'N/A'}</td>
                    <td>${sessionData.active ? 'Sim' : 'Não'}</td>
                `;
                tableBody.appendChild(row);
            });
        }
    }

    // Initial display update
    updateAnalyticsDisplay();

    // Periodically update display (every 1 second) for real-time updates
    setInterval(updateAnalyticsDisplay, 1000);
})();