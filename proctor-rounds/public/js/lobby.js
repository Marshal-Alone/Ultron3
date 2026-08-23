/* ═══════════════════════════════════════════════════════════════════════
   Lobby — Session Creation & Join Logic
   ═══════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    const createBtn = document.getElementById('createSessionBtn');
    const sessionLinks = document.getElementById('sessionLinks');
    const candidateLink = document.getElementById('candidateLink');
    const proctorLink = document.getElementById('proctorLink');
    const openCandidateBtn = document.getElementById('openCandidateBtn');
    const openProctorBtn = document.getElementById('openProctorBtn');
    const joinBtn = document.getElementById('joinSessionBtn');
    const joinError = document.getElementById('joinError');

    // ── Create Session ──────────────────────────────────────────────
    createBtn.addEventListener('click', async () => {
        const candidateName = document.getElementById('candidateName').value.trim() || 'Candidate';
        const proctorName = document.getElementById('proctorName').value.trim() || 'Proctor';
        const language = document.getElementById('language').value;

        createBtn.disabled = true;
        createBtn.textContent = 'Creating…';

        try {
            const res = await fetch('/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ candidateName, proctorName, language }),
            });

            const data = await res.json();
            const base = window.location.origin;

            candidateLink.value = base + data.candidateUrl;
            proctorLink.value = base + data.proctorUrl;
            openCandidateBtn.href = data.candidateUrl;
            openProctorBtn.href = data.proctorUrl;

            sessionLinks.classList.add('active');
            createBtn.textContent = 'Session Created ✓';
        } catch (err) {
            console.error('Failed to create session:', err);
            createBtn.textContent = 'Error — try again';
            createBtn.disabled = false;
        }
    });

    // ── Copy Buttons ────────────────────────────────────────────────
    document.querySelectorAll('.btn-copy').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const input = document.getElementById(targetId);
            navigator.clipboard.writeText(input.value).then(() => {
                const original = btn.textContent;
                btn.textContent = 'Copied!';
                setTimeout(() => {
                    btn.textContent = original;
                }, 1500);
            });
        });
    });

    // ── Join Session ────────────────────────────────────────────────
    joinBtn.addEventListener('click', () => {
        const sessionCode = document.getElementById('sessionCode').value.trim();
        const token = document.getElementById('joinToken').value.trim();
        const role = document.getElementById('joinRole').value;

        if (!sessionCode || !token) {
            joinError.textContent = 'Please enter both session code and token.';
            joinError.style.display = 'block';
            return;
        }

        joinError.style.display = 'none';

        const page = role === 'candidate' ? 'candidate.html' : 'proctor.html';
        window.location.href = `/${page}?session=${sessionCode}&token=${token}`;
    });
});
