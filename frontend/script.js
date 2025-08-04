// frontend/script.js
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('create-interview-form');
    const submitBtn = document.getElementById('submit-btn');
    const btnText = document.getElementById('btn-text');
    const loader = document.getElementById('loader');
    const errorMessage = document.getElementById('error-message');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        setLoading(true);

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        try {
            const response = await fetch('/api/interviews', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to create interview.');
            }

            // On success, redirect to the details page
            window.location.href = `/interview/${result.id}`;

        } catch (error) {
            errorMessage.textContent = error.message;
            errorMessage.classList.remove('hidden');
            setLoading(false);
        }
    });

    function setLoading(isLoading) {
        if (isLoading) {
            submitBtn.disabled = true;
            btnText.classList.add('hidden');
            loader.classList.remove('hidden');
            errorMessage.classList.add('hidden');
        } else {
            submitBtn.disabled = false;
            btnText.classList.remove('hidden');
            loader.classList.add('hidden');
        }
    }
});