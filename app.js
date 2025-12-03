// DOM Elements
const clockEl = document.getElementById('clock');
const timeInput = document.getElementById('timeInput');
const progressEl = document.getElementById('progress');
const handleEl = document.getElementById('handle');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const presets = document.querySelectorAll('.preset');

// Constants
const MAX_TIME = 60 * 60; // 60 minutes in seconds
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * 90; // 565.48

// State
let totalSeconds = 25 * 60; // Default 25 minutes
let remainingSeconds = totalSeconds;
let isRunning = false;
let timerInterval = null;
let isDragging = false;

// Initialize
function init() {
    updateClock();
    setInterval(updateClock, 1000);
    updateDisplay();
    updateProgress();
    registerServiceWorker();
    setupEventListeners();
}

// Register Service Worker
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed:', err));
    }
}

// Update current time clock
function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    clockEl.textContent = `${hours}:${minutes}:${seconds}`;
}

// Format seconds to MM:SS
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Parse MM:SS to seconds
function parseTime(str) {
    const parts = str.split(':');
    if (parts.length === 2) {
        const mins = parseInt(parts[0], 10) || 0;
        const secs = parseInt(parts[1], 10) || 0;
        return Math.min(Math.max(mins * 60 + secs, 0), MAX_TIME);
    }
    return null;
}

// Update display
function updateDisplay() {
    timeInput.value = formatTime(remainingSeconds);
}

// Update progress circle and handle position
function updateProgress() {
    const progress = remainingSeconds / MAX_TIME;
    const offset = CIRCLE_CIRCUMFERENCE * (1 - progress);
    progressEl.style.strokeDashoffset = offset;

    // Update handle position
    const angle = progress * 2 * Math.PI - Math.PI / 2;
    const cx = 100 + 90 * Math.cos(angle);
    const cy = 100 + 90 * Math.sin(angle);
    handleEl.setAttribute('cx', cx);
    handleEl.setAttribute('cy', cy);
}

// Set time from angle
function setTimeFromAngle(angle) {
    // Normalize angle to 0-2PI, starting from top (12 o'clock)
    let normalizedAngle = angle + Math.PI / 2;
    if (normalizedAngle < 0) normalizedAngle += 2 * Math.PI;
    if (normalizedAngle > 2 * Math.PI) normalizedAngle -= 2 * Math.PI;

    const progress = normalizedAngle / (2 * Math.PI);
    const newSeconds = Math.round(progress * MAX_TIME / 60) * 60; // Round to nearest minute

    totalSeconds = Math.max(60, Math.min(newSeconds, MAX_TIME)); // Min 1 minute
    remainingSeconds = totalSeconds;
    updateDisplay();
    updateProgress();
    updatePresetHighlight();
}

// Calculate angle from pointer position
function getAngleFromEvent(e, svg) {
    const rect = svg.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    return Math.atan2(clientY - centerY, clientX - centerX);
}

// Update preset button highlight
function updatePresetHighlight() {
    const mins = Math.round(totalSeconds / 60);
    presets.forEach(btn => {
        const presetMins = parseInt(btn.dataset.time, 10);
        btn.classList.toggle('active', presetMins === mins);
    });
}

// Start/Pause timer
function toggleTimer() {
    if (isRunning) {
        pauseTimer();
    } else {
        startTimer();
    }
}

function startTimer() {
    if (remainingSeconds <= 0) return;

    isRunning = true;
    startBtn.textContent = '일시정지';
    startBtn.classList.add('running');
    progressEl.classList.remove('finished');

    timerInterval = setInterval(() => {
        remainingSeconds--;
        updateDisplay();
        updateProgress();

        if (remainingSeconds <= 0) {
            finishTimer();
        }
    }, 1000);
}

function pauseTimer() {
    isRunning = false;
    startBtn.textContent = '계속';
    startBtn.classList.remove('running');
    clearInterval(timerInterval);
}

function finishTimer() {
    isRunning = false;
    clearInterval(timerInterval);
    startBtn.textContent = '시작';
    startBtn.classList.remove('running');
    progressEl.classList.add('finished');

    // Play notification sound and vibrate
    playNotification();
}

function playNotification() {
    // Vibrate if supported
    if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200, 100, 200]);
    }

    // Play beep sound using Web Audio API
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
        console.log('Audio notification failed:', e);
    }
}

function resetTimer() {
    pauseTimer();
    remainingSeconds = totalSeconds;
    startBtn.textContent = '시작';
    startBtn.classList.remove('running');
    progressEl.classList.remove('finished');
    updateDisplay();
    updateProgress();
}

// Event Listeners
function setupEventListeners() {
    const svg = document.querySelector('.timer-svg');

    // Drag events for handle
    handleEl.addEventListener('mousedown', startDrag);
    handleEl.addEventListener('touchstart', startDrag, { passive: false });

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('touchmove', onDrag, { passive: false });

    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);

    // Click on SVG to set time
    svg.addEventListener('click', (e) => {
        if (!isRunning && e.target !== handleEl) {
            const angle = getAngleFromEvent(e, svg);
            setTimeFromAngle(angle);
        }
    });

    // Time input
    timeInput.addEventListener('focus', () => {
        if (!isRunning) {
            timeInput.select();
        }
    });

    timeInput.addEventListener('blur', () => {
        const parsed = parseTime(timeInput.value);
        if (parsed !== null) {
            totalSeconds = parsed;
            remainingSeconds = parsed;
            updateProgress();
            updatePresetHighlight();
        }
        updateDisplay();
    });

    timeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            timeInput.blur();
        }
    });

    // Prevent editing while running
    timeInput.addEventListener('input', () => {
        if (isRunning) {
            updateDisplay();
        }
    });

    // Control buttons
    startBtn.addEventListener('click', toggleTimer);
    resetBtn.addEventListener('click', resetTimer);

    // Presets
    presets.forEach(btn => {
        btn.addEventListener('click', () => {
            if (!isRunning) {
                const mins = parseInt(btn.dataset.time, 10);
                totalSeconds = mins * 60;
                remainingSeconds = totalSeconds;
                updateDisplay();
                updateProgress();
                updatePresetHighlight();
            }
        });
    });
}

function startDrag(e) {
    if (isRunning) return;
    e.preventDefault();
    isDragging = true;
    handleEl.classList.add('dragging');
}

function onDrag(e) {
    if (!isDragging) return;
    e.preventDefault();
    const svg = document.querySelector('.timer-svg');
    const angle = getAngleFromEvent(e, svg);
    setTimeFromAngle(angle);
}

function endDrag() {
    if (isDragging) {
        isDragging = false;
        handleEl.classList.remove('dragging');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
