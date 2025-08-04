// frontend/details.js
document.addEventListener('DOMContentLoaded', () => {
    const callBtn = document.getElementById('call-btn');
    const callBtnText = document.getElementById('call-btn-text');
    const callLoader = document.getElementById('call-loader');

    let pollingInterval;

    const updateUI = (data) => {
        // Update header and basic info
        document.getElementById('candidate-name-title').textContent = data.candidate_name;
        document.getElementById('job-position').textContent = data.job_position;
        document.getElementById('skills').textContent = data.skills_to_assess || 'Not specified';

        // Update status badge
        const statusEl = document.getElementById('status');
        statusEl.textContent = data.status.charAt(0).toUpperCase() + data.status.slice(1);
        statusEl.className = data.status;

        // Handle call button state
        if (data.status === 'pending') {
            callBtn.disabled = false;
        } else {
            callBtn.disabled = true;
            callBtnText.textContent = 'Call In Progress or Completed';
        }

        // Show/hide results section
        if (['completed', 'error'].includes(data.status)) {
            document.getElementById('results-section').classList.remove('hidden');
            if (pollingInterval) clearInterval(pollingInterval); // Stop polling
        }
        
        // Populate results if available
        if (data.duration_in_seconds) {
             const minutes = Math.floor(data.duration_in_seconds / 60);
             const seconds = data.duration_in_seconds % 60;
             document.getElementById('duration').textContent = `${minutes}m ${seconds}s`;
        }
        if (data.recording_url) {
            const playerContainer = document.getElementById('recording-player-container');
            playerContainer.innerHTML = `<audio controls src="${data.recording_url}"></audio>`;
        }
        document.getElementById('assessment').textContent = data.assessment || '--';
        document.getElementById('strengths').textContent = data.analysis_strengths || '--';
        document.getElementById('concerns').textContent = data.analysis_concerns || '--';
        document.getElementById('score-value').textContent = data.score || '--';
        document.getElementById('recommendation').textContent = data.recommendation || '--';
    };

    const fetchInterviewData = async () => {
        try {
            const response = await fetch(`/api/interviews/${INTERVIEW_ID}`);
            if (!response.ok) throw new Error('Failed to fetch data.');
            const data = await response.json();
            updateUI(data);
        } catch (error) {
            console.error(error);
            if (pollingInterval) clearInterval(pollingInterval);
        }
    };
    
    callBtn.addEventListener('click', async () => {
        callBtn.disabled = true;
        callLoader.classList.remove('hidden');
        callBtnText.classList.add('hidden');

        try {
            const response = await fetch(`/api/interviews/${INTERVIEW_ID}/start-call`, {
                method: 'POST'
            });
            if (!response.ok) throw new Error('Failed to start call.');
            // Instantly refresh data to show 'calling' status
            fetchInterviewData();
        } catch (error) {
            alert(error.message); // Simple alert for errors
            callLoader.classList.add('hidden');
            callBtnText.classList.remove('hidden');
        }
    });

    // Initial data fetch and start polling
    fetchInterviewData();
    pollingInterval = setInterval(fetchInterviewData, 5000); // Poll every 5 seconds
});