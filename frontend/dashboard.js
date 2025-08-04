// frontend/dashboard.js
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const form = document.getElementById('create-interview-form');
    const submitBtn = document.getElementById('submit-btn');
    const btnText = document.getElementById('btn-text');
    const loader = document.getElementById('loader');
    const errorMessage = document.getElementById('error-message');
    const interviewListBody = document.getElementById('interview-list-body');
    const emptyState = document.getElementById('empty-state');
    
    // Modal elements
    const modal = document.getElementById('details-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalCandidateName = document.getElementById('modal-candidate-name');
    const modalBody = document.getElementById('modal-body');

    let timers = {}; // To store interval IDs for live timers

    // --- Main Functions ---

    /**
     * Fetches all interviews and renders them in the table.
     */
    const fetchAndRenderInterviews = async () => {
        try {
            const response = await fetch('/api/interviews');
            const interviews = await response.json();
            
            interviewListBody.innerHTML = ''; // Clear existing list
            
            if (interviews.length === 0) {
                emptyState.classList.remove('hidden');
            } else {
                emptyState.classList.add('hidden');
                interviews.forEach(interview => {
                    const row = createInterviewRow(interview);
                    interviewListBody.appendChild(row);
                });
            }
        } catch (error) {
            console.error("Failed to fetch interviews:", error);
            interviewListBody.innerHTML = '<tr><td colspan="4" class="error-text">Failed to load interviews.</td></tr>';
        }
    };
    
    /**
     * Creates a single table row element for an interview.
     * @param {object} interview - The interview data object.
     * @returns {HTMLElement} - The <tr> element.
     */
    const createInterviewRow = (interview) => {
        const row = document.createElement('tr');
        row.dataset.interviewId = interview.id; // Store ID for easy access

        const statusHtml = `<span class="status-badge ${interview.status}">${interview.status}</span>`;
        let actionHtml = '';

        switch (interview.status) {
            case 'pending':
                actionHtml = `<button class="action-btn call-btn" data-id="${interview.id}">Start Call</button>`;
                break;
            case 'calling':
                actionHtml = `<span class="timer" data-start-time="${Date.now()}">0m 0s</span>`;
                startTimer(row, interview.id);
                break;
            case 'analyzing':
                actionHtml = `<span class="timer">Analyzing...</span>`;
                stopTimer(interview.id);
                break;
            case 'completed':
            case 'error':
                actionHtml = `<button class="action-btn report-btn" data-id="${interview.id}">View Report</button>`;
                stopTimer(interview.id);
                break;
            default:
                actionHtml = '<span>--</span>';
        }

        row.innerHTML = `
            <td>
                <div class="candidate-name">${interview.candidate_name}</div>
                <div class="job-position">${interview.job_position}</div>
            </td>
            <td>${interview.skills_to_assess || '--'}</td>
            <td class="status-cell">${statusHtml}</td>
            <td class="action-cell">${actionHtml}</td>
        `;
        return row;
    };

    /**
     * Updates an existing row in the table with new data.
     * @param {object} interview - The updated interview data.
     */
    const updateInterviewRow = (interview) => {
        const row = document.querySelector(`tr[data-interview-Id="${interview.id}"]`);
        if (!row) return;

        const newRow = createInterviewRow(interview);
        // Replace status and action cells only to avoid flicker
        row.querySelector('.status-cell').innerHTML = newRow.querySelector('.status-cell').innerHTML;
        row.querySelector('.action-cell').innerHTML = newRow.querySelector('.action-cell').innerHTML;
    };

    /**
     * Handles the creation form submission.
     */
    const handleFormSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        
        const data = {
            candidate_name: document.getElementById('candidate_name').value,
            phone_number: document.getElementById('phone_number').value,
            job_position: document.getElementById('job_position').value,
            job_description: document.getElementById('job_description').value,
            skills_to_assess: document.getElementById('skills_to_assess').value,
        };

        try {
            const response = await fetch('/api/interviews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const newInterview = await response.json();
            if (!response.ok) throw new Error(newInterview.error || 'Failed to create interview.');

            // Add new interview to the top of the list
            const row = createInterviewRow(newInterview);
            interviewListBody.prepend(row);
            emptyState.classList.add('hidden');
            form.reset(); // Clear the form

        } catch (error) {
            errorMessage.textContent = error.message;
            errorMessage.classList.remove('hidden');
        } finally {
            setLoading(false);
        }
    };
    
    /**
     * Handles clicks on the table body (for Start Call and View Report buttons).
     */
    const handleTableClick = async (e) => {
        // Start Call button
        if (e.target.classList.contains('call-btn')) {
            const btn = e.target;
            const id = btn.dataset.id;
            btn.disabled = true;
            btn.textContent = 'Starting...';
            try {
                const response = await fetch(`/api/interviews/${id}/start-call`, { method: 'POST' });
                const updatedInterview = await response.json();
                 if (!response.ok) throw new Error(updatedInterview.error || 'Failed to start call.');
                updateInterviewRow(updatedInterview);
            } catch(error) {
                alert(error.message);
                btn.disabled = false;
                btn.textContent = 'Start Call';
            }
        }
        // View Report button
        if (e.target.classList.contains('report-btn')) {
            const id = e.target.dataset.id;
            openDetailsModal(id);
        }
    };
    
    /**
     * Opens the details modal and populates it with data.
     * @param {number} interviewId - The ID of the interview to display.
     */
    const openDetailsModal = async (interviewId) => {
        // Fetch the specific interview data again to ensure it's fresh
        const response = await fetch(`/api/interviews/${interviewId}`);
        const data = await response.json();

        modalCandidateName.textContent = data.candidate_name;
        
        let recordingHtml = data.recording_url 
            ? `<h4>Recording</h4><audio controls src="${data.recording_url}"></audio>`
            : '<h4>Recording</h4><p>Not available.</p>';
        
        let reportHtml = `
            <h4>Assessment</h4>
            <p>${data.assessment || 'No assessment generated.'}</p>
            <h4>Strengths</h4>
            <p>${data.analysis_strengths || 'Not analyzed.'}</p>
            <h4>Concerns / Follow-up</h4>
            <p>${data.analysis_concerns || 'Not analyzed.'}</p>
            <h4>Overall Score</h4>
            <p><strong>${data.score || '--'} / 100</strong></p>
            <h4>Hiring Recommendation</h4>
            <p><strong>${data.recommendation || 'No recommendation.'}</strong></p>
        `;

        modalBody.innerHTML = recordingHtml + reportHtml;
        modal.classList.remove('hidden');
    };

    // --- Helper Functions ---
    const setLoading = (isLoading) => {
        submitBtn.disabled = isLoading;
        loader.classList.toggle('hidden', !isLoading);
        btnText.classList.toggle('hidden', isLoading);
        if (isLoading) errorMessage.classList.add('hidden');
    };

    const startTimer = (row, id) => {
        if (timers[id]) return; // Timer already running
        const timerEl = row.querySelector('.timer');
        if (!timerEl) return;
        
        const startTime = Date.now();
        timers[id] = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            timerEl.textContent = `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
        }, 1000);
    };

    const stopTimer = (id) => {
        if (timers[id]) {
            clearInterval(timers[id]);
            delete timers[id];
        }
    };
    
    // --- Polling for Real-Time Updates ---
    // This is the key to fixing the "stuck on calling" bug
    const pollForUpdates = async () => {
        try {
            const response = await fetch('/api/interviews');
            const interviews = await response.json();
            interviews.forEach(interview => {
                const row = document.querySelector(`tr[data-interview-id="${interview.id}"]`);
                if (row) {
                    // Check if status has changed before re-rendering
                    const currentStatus = row.querySelector('.status-badge').textContent;
                    if (currentStatus !== interview.status) {
                         updateInterviewRow(interview);
                    }
                }
            });
        } catch (error) {
            console.error("Polling failed:", error);
        }
    };

    // --- Event Listeners ---
    form.addEventListener('submit', handleFormSubmit);
    interviewListBody.addEventListener('click', handleTableClick);
    modalCloseBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { // Close modal if overlay is clicked
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });

    // --- Initial Load ---
    fetchAndRenderInterviews();
    setInterval(pollForUpdates, 5000); // Poll for updates every 5 seconds
});