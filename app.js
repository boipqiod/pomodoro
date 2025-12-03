// DOM Elements
const clockEl = document.getElementById('clock');
const timeInput = document.getElementById('timeInput');
const taskInput = document.getElementById('taskInput');
const progressEl = document.getElementById('progress');
const handleEl = document.getElementById('handle');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const presets = document.querySelectorAll('.preset');

// Constants
const MAX_TIME = 60 * 60; // 60 minutes in seconds
const CIRCLE_RADIUS = 90;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS; // 565.48

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
    updatePresetHighlight();
    registerServiceWorker();
    setupEventListeners();
    loadState();
}

// Load saved state from localStorage
function loadState() {
    try {
        const saved = localStorage.getItem('pomodoroState');
        if (saved) {
            const state = JSON.parse(saved);
            if (state.taskName) {
                taskInput.value = state.taskName;
            }
        }
    } catch (e) {
        console.log('Failed to load state:', e);
    }
}

// Save state to localStorage
function saveState() {
    try {
        localStorage.setItem('pomodoroState', JSON.stringify({
            taskName: taskInput.value
        }));
    } catch (e) {
        console.log('Failed to save state:', e);
    }
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
// SVG is rotated -90deg via CSS, so SVG angle 0 = screen 12 o'clock
function updateProgress() {
    // Progress: 0 (empty) to 1 (full circle)
    const progress = remainingSeconds / MAX_TIME;

    // Stroke offset: 0 = full circle shown, CIRCUMFERENCE = none shown
    const offset = CIRCLE_CIRCUMFERENCE * (1 - progress);
    progressEl.style.strokeDashoffset = offset;

    // Handle position in SVG coordinates
    // SVG angle 0 (right) = screen 12 o'clock (due to -90deg rotation)
    // Clockwise: 0° → 90° → 180° → 270° → 360°
    //            12시 → 3시 → 6시 → 9시 → 12시
    const svgAngle = progress * 2 * Math.PI;
    const cx = 100 + CIRCLE_RADIUS * Math.cos(svgAngle);
    const cy = 100 + CIRCLE_RADIUS * Math.sin(svgAngle);

    handleEl.setAttribute('cx', cx);
    handleEl.setAttribute('cy', cy);
}

// Calculate SVG angle from pointer position
// Returns angle in SVG coordinate system (0 = right, before CSS rotation)
function getAngleFromEvent(e, svg) {
    const rect = svg.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    // Screen angle (atan2 gives angle where right=0, down=π/2)
    const screenAngle = Math.atan2(clientY - centerY, clientX - centerX);

    // Convert screen angle to SVG angle
    // Screen 12 o'clock (-π/2) should map to SVG angle 0
    // SVG angle = screen angle + π/2
    const svgAngle = screenAngle + Math.PI / 2;

    return svgAngle;
}

// Set time from SVG angle
function setTimeFromAngle(svgAngle) {
    // Normalize angle to 0-2π
    let normalizedAngle = svgAngle;
    while (normalizedAngle < 0) normalizedAngle += 2 * Math.PI;
    while (normalizedAngle >= 2 * Math.PI) normalizedAngle -= 2 * Math.PI;

    // Convert angle to time (full circle = 60 minutes)
    const progress = normalizedAngle / (2 * Math.PI);
    const newSeconds = Math.round(progress * MAX_TIME / 60) * 60; // Round to nearest minute

    // Minimum 1 minute, handle edge case where 0 should be 60
    totalSeconds = newSeconds === 0 ? MAX_TIME : Math.max(60, newSeconds);
    remainingSeconds = totalSeconds;

    updateDisplay();
    updateProgress();
    updatePresetHighlight();
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

    // Show notification if permitted
    showNotification();
}

function showNotification() {
    if ('Notification' in window && Notification.permission === 'granted') {
        const taskName = taskInput.value.trim() || '타이머';
        new Notification('Pomodoro 완료!', {
            body: `${taskName} 완료되었습니다.`,
            icon: 'icon-192.png'
        });
    }
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
        if (parsed !== null && parsed > 0) {
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

    // Task input - save on change
    taskInput.addEventListener('blur', saveState);
    taskInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            taskInput.blur();
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

    // Request notification permission on first interaction
    document.body.addEventListener('click', () => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, { once: true });
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
