/**
 * Voice Interview Agent - Test Client JavaScript
 * Handles WebRTC connection via Daily.co and real-time transcript updates
 */

class VoiceInterviewClient {
    constructor() {
        this.sessionId = null;
        this.callFrame = null;
        this.wsConnection = null;
        this.isConnected = false;
        this.transcriptData = [];
        this.statusCheckInterval = null;

        // API configuration
        this.apiBaseUrl = window.location.origin;

        // Bind event handlers
        this.initializeEventHandlers();
    }

    initializeEventHandlers() {
        // Button handlers
        document.getElementById('connectBtn').addEventListener('click', () => this.startInterview());
        document.getElementById('disconnectBtn').addEventListener('click', () => this.endInterview());
        document.getElementById('clearTranscript').addEventListener('click', () => this.clearTranscript());

        // Initialize media preview
        this.initializeMediaPreview();
    }

    async initializeMediaPreview() {
        try {
            // Get user media for preview
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            const videoElement = document.getElementById('localVideo');
            videoElement.srcObject = stream;
        } catch (error) {
            console.error('Error accessing media devices:', error);
            this.showStatus('Camera/microphone access denied', 'error');
        }
    }

    async startInterview() {
        const campaignId = document.getElementById('campaignId').value;
        if (!campaignId) {
            alert('Please enter a Campaign ID');
            return;
        }

        // Disable start button
        document.getElementById('connectBtn').disabled = true;
        this.showStatus('Connecting...', 'connecting');

        try {
            // Create session
            const sessionData = await this.createSession(campaignId);
            this.sessionId = sessionData.session_id;

            // Load Daily.co library
            await this.loadDailyScript();

            // Join Daily room
            await this.joinDailyRoom(sessionData.room_url, sessionData.participant_token);

            // Start status polling
            this.startStatusPolling();

            // Update UI
            this.isConnected = true;
            document.getElementById('connectBtn').disabled = true;
            document.getElementById('disconnectBtn').disabled = false;
            document.getElementById('progressContainer').style.display = 'block';
            this.showStatus('Connected - Interview in progress', 'connected');

        } catch (error) {
            console.error('Error starting interview:', error);
            this.showStatus(`Error: ${error.message}`, 'error');
            document.getElementById('connectBtn').disabled = false;
        }
    }

    async createSession(campaignId) {
        const participantName = document.getElementById('participantName').value || null;
        const participantEmail = document.getElementById('participantEmail').value || null;
        const enableRecording = document.getElementById('enableRecording').checked;

        const response = await fetch(`${this.apiBaseUrl}/api/sessions/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                campaign_id: campaignId,
                participant_name: participantName,
                participant_email: participantEmail,
                enable_recording: enableRecording
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to create session');
        }

        return await response.json();
    }

    async loadDailyScript() {
        return new Promise((resolve, reject) => {
            if (window.DailyIframe) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://unpkg.com/@daily-co/daily-js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async joinDailyRoom(roomUrl, token) {
        // Create Daily call frame
        this.callFrame = window.DailyIframe.createCallObject({
            showLeaveButton: false,
            showFullscreenButton: false,
            iframeStyle: {
                display: 'none'
            }
        });

        // Set up event handlers
        this.callFrame.on('joined-meeting', () => {
            console.log('Joined Daily room');
        });

        this.callFrame.on('participant-joined', (event) => {
            if (!event.participant.local) {
                console.log('Agent joined the room');
                this.addTranscriptEntry('system', 'AI Agent has joined the interview');
            }
        });

        this.callFrame.on('participant-left', (event) => {
            if (!event.participant.local) {
                console.log('Agent left the room');
                this.addTranscriptEntry('system', 'AI Agent has left the interview');
            }
        });

        this.callFrame.on('error', (error) => {
            console.error('Daily error:', error);
            this.showStatus(`Connection error: ${error.errorMsg}`, 'error');
        });

        // Join the room
        await this.callFrame.join({
            url: roomUrl,
            token: token,
            userName: 'Participant'
        });

        // Update local video
        const localVideo = document.getElementById('localVideo');
        const participants = await this.callFrame.participants();
        const localParticipant = participants.local;

        if (localParticipant && localParticipant.video) {
            localVideo.srcObject = new MediaStream([localParticipant.videoTrack]);
        }
    }

    startStatusPolling() {
        // Poll for status and transcript updates
        this.statusCheckInterval = setInterval(async () => {
            if (this.sessionId) {
                await this.updateStatus();
                await this.updateTranscript();
            }
        }, 2000); // Poll every 2 seconds
    }

    async updateStatus() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/sessions/${this.sessionId}/status`);
            if (response.ok) {
                const status = await response.json();
                this.updateProgressBar(status.progress);
            }
        } catch (error) {
            console.error('Error fetching status:', error);
        }
    }

    async updateTranscript() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/sessions/${this.sessionId}/transcript`);
            if (response.ok) {
                const data = await response.json();
                this.renderTranscript(data.transcript);
            }
        } catch (error) {
            console.error('Error fetching transcript:', error);
        }
    }

    updateProgressBar(progress) {
        if (!progress) return;

        const progressFill = document.getElementById('progressFill');
        const progressPercent = document.getElementById('progressPercent');
        const currentStep = document.getElementById('currentStep');

        if (progressFill) {
            progressFill.style.width = `${progress.progress_percentage}%`;
        }

        if (progressPercent) {
            progressPercent.textContent = `${Math.round(progress.progress_percentage)}%`;
        }

        if (currentStep && progress.current_step_name) {
            currentStep.textContent = `Step: ${progress.current_step_name}`;
        }
    }

    renderTranscript(transcriptEntries) {
        const container = document.getElementById('transcriptContainer');

        if (!transcriptEntries || transcriptEntries.length === 0) {
            return;
        }

        // Clear empty state
        if (container.querySelector('.empty-state')) {
            container.innerHTML = '';
        }

        // Render only new entries
        const currentCount = container.children.length;
        if (transcriptEntries.length > currentCount) {
            for (let i = currentCount; i < transcriptEntries.length; i++) {
                const entry = transcriptEntries[i];
                this.addTranscriptEntry(entry.speaker, entry.text, entry.timestamp);
            }
        }
    }

    addTranscriptEntry(speaker, text, timestamp = null) {
        const container = document.getElementById('transcriptContainer');

        // Clear empty state if present
        if (container.querySelector('.empty-state')) {
            container.innerHTML = '';
        }

        const entry = document.createElement('div');
        entry.className = `transcript-entry ${speaker === 'participant' ? 'participant' : ''}`;

        const speakerLabel = document.createElement('div');
        speakerLabel.className = 'speaker';
        speakerLabel.textContent = speaker === 'agent' ? 'AI Agent' :
                                 speaker === 'participant' ? 'You' : 'System';

        const textContent = document.createElement('div');
        textContent.className = 'text';
        textContent.textContent = text;

        entry.appendChild(speakerLabel);
        entry.appendChild(textContent);

        if (timestamp) {
            const time = document.createElement('div');
            time.className = 'time';
            time.textContent = new Date(timestamp).toLocaleTimeString();
            entry.appendChild(time);
        }

        container.appendChild(entry);

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    async endInterview() {
        this.showStatus('Ending interview...', 'connecting');

        try {
            // Stop the session
            if (this.sessionId) {
                await fetch(`${this.apiBaseUrl}/api/sessions/${this.sessionId}/stop`, {
                    method: 'POST'
                });
            }

            // Leave Daily room
            if (this.callFrame) {
                await this.callFrame.leave();
                await this.callFrame.destroy();
                this.callFrame = null;
            }

            // Stop status polling
            if (this.statusCheckInterval) {
                clearInterval(this.statusCheckInterval);
                this.statusCheckInterval = null;
            }

            // Update UI
            this.isConnected = false;
            this.sessionId = null;
            document.getElementById('connectBtn').disabled = false;
            document.getElementById('disconnectBtn').disabled = true;
            this.showStatus('Interview ended', 'disconnected');

            // Optionally generate profile
            if (confirm('Would you like to generate a digital twin profile from this interview?')) {
                await this.generateProfile();
            }

        } catch (error) {
            console.error('Error ending interview:', error);
            this.showStatus(`Error: ${error.message}`, 'error');
        }
    }

    async generateProfile() {
        if (!this.sessionId) return;

        try {
            this.showStatus('Generating digital twin profile...', 'connecting');

            const response = await fetch(`${this.apiBaseUrl}/api/sessions/${this.sessionId}/profile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: this.sessionId,
                    include_transcript: false
                })
            });

            if (response.ok) {
                const data = await response.json();
                console.log('Digital Twin Profile:', data.profile);
                this.showStatus('Profile generated successfully', 'connected');

                // Display profile in a new window
                const profileWindow = window.open('', '_blank');
                profileWindow.document.write(`
                    <html>
                    <head><title>Digital Twin Profile</title></head>
                    <body>
                        <h1>Digital Twin Profile</h1>
                        <pre>${JSON.stringify(data.profile, null, 2)}</pre>
                    </body>
                    </html>
                `);
            } else {
                throw new Error('Failed to generate profile');
            }
        } catch (error) {
            console.error('Error generating profile:', error);
            this.showStatus(`Error generating profile: ${error.message}`, 'error');
        }
    }

    clearTranscript() {
        const container = document.getElementById('transcriptContainer');
        container.innerHTML = `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                <p>Transcript cleared</p>
            </div>
        `;
    }

    showStatus(message, type) {
        const statusElement = document.getElementById('status');
        statusElement.textContent = `Status: ${message}`;
        statusElement.className = `status ${type}`;
    }
}

// Initialize client when document is ready
document.addEventListener('DOMContentLoaded', () => {
    window.voiceClient = new VoiceInterviewClient();
});