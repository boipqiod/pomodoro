// DOM Elements
const clockEl = document.getElementById('clock');
const timeInput = document.getElementById('timeInput');
const taskInput = document.getElementById('taskInput');
const progressEl = document.getElementById('progress');
const handleEl = document.getElementById('handle');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const presets = document.querySelectorAll('.preset');
const historyList = document.getElementById('historyList');

// Backlog Elements
const backlogModal = document.getElementById('backlogModal');
const backlogList = document.getElementById('backlogList');
const backlogTaskInput = document.getElementById('backlogTaskInput');
const backlogTimeSelect = document.getElementById('backlogTimeSelect');
const backlogAddBtn = document.getElementById('backlogAddBtn');
const viewBacklogBtn = document.getElementById('viewBacklogBtn');
const closeBacklogModal = document.getElementById('closeBacklogModal');

// Archive Elements
const viewArchiveBtn = document.getElementById('viewArchiveBtn');
const archiveModal = document.getElementById('archiveModal');
const archiveList = document.getElementById('archiveList');
const closeArchiveModal = document.getElementById('closeArchiveModal');
const clearAllHistoryBtn = document.getElementById('clearAllHistoryBtn');

// Modal Elements
const timerModal = document.getElementById('timerModal');
const historyModal = document.getElementById('historyModal');
const modalTaskName = document.getElementById('modalTaskName');
const finishBtn = document.getElementById('finishBtn');
const extendBtns = document.querySelectorAll('.extend-btn');
const closeHistoryModal = document.getElementById('closeHistoryModal');
const detailTaskName = document.getElementById('detailTaskName');
const detailStartTime = document.getElementById('detailStartTime');
const detailEndTime = document.getElementById('detailEndTime');
const detailPauseTime = document.getElementById('detailPauseTime');
const detailWorkTime = document.getElementById('detailWorkTime');

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
let targetEndTime = null; // Target end timestamp for accurate background timing

// Session tracking
let sessionStartTime = null;
let pauseStartTime = null;
let totalPausedTime = 0; // Total paused time in milliseconds
let workHistory = [];
let taskBacklog = [];
let currentBacklogTaskId = null; // Track which backlog task is being worked on

// Initialize
function init() {
    updateClock();
    setInterval(updateClock, 1000);
    registerServiceWorker();
    setupEventListeners();
    loadState();
    renderBacklog();
    renderTodayHistory();

    // Try to restore timer state from localStorage
    const timerState = loadTimerState();

    if (timerState === true) {
        // Timer was running - resume it
        updateDisplay();
        updateProgress();
        updatePresetHighlight();
        resumeTimerFromState();
    } else if (timerState === 'finished') {
        // Timer finished while in background - show completion
        updateDisplay();
        updateProgress();
        updatePresetHighlight();
        finishTimer();
    } else if (timerState === 'paused') {
        // Timer was paused - restore paused UI
        updateDisplay();
        updateProgress();
        updatePresetHighlight();
        restorePausedState();
    } else {
        // No saved timer state - normal init
        updateDisplay();
        updateProgress();
        updatePresetHighlight();
    }
}

// Resume timer from saved state
function resumeTimerFromState() {
    isRunning = true;
    startBtn.textContent = '일시정지';
    startBtn.classList.add('running');
    resetBtn.textContent = '완료';
    resetBtn.classList.add('finish-early');
    taskInput.disabled = true;

    timerInterval = setInterval(() => {
        const now = Date.now();
        remainingSeconds = Math.max(0, Math.ceil((targetEndTime - now) / 1000));
        updateDisplay();
        updateProgress();

        if (remainingSeconds <= 0) {
            finishTimer();
        }
    }, 1000);
}

// Restore paused timer UI
function restorePausedState() {
    if (sessionStartTime !== null) {
        startBtn.textContent = '계속';
        resetBtn.textContent = '완료';
        resetBtn.classList.add('finish-early');
        taskInput.disabled = true;
    }
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
            if (state.workHistory) {
                workHistory = state.workHistory;
            }
            if (state.taskBacklog) {
                taskBacklog = state.taskBacklog;
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
            taskName: taskInput.value,
            workHistory: workHistory,
            taskBacklog: taskBacklog
        }));
    } catch (e) {
        console.log('Failed to save state:', e);
    }
}

// Save timer state for background/refresh recovery
function saveTimerState() {
    try {
        localStorage.setItem('pomodoroTimerState', JSON.stringify({
            targetEndTime: targetEndTime,
            totalSeconds: totalSeconds,
            remainingSeconds: remainingSeconds,
            isRunning: isRunning,
            sessionStartTime: sessionStartTime ? sessionStartTime.toISOString() : null,
            pauseStartTime: pauseStartTime,
            totalPausedTime: totalPausedTime,
            taskName: taskInput.value,
            currentBacklogTaskId: currentBacklogTaskId
        }));
    } catch (e) {
        console.log('Failed to save timer state:', e);
    }
}

// Load timer state from localStorage
function loadTimerState() {
    try {
        const saved = localStorage.getItem('pomodoroTimerState');
        if (!saved) return false;

        const state = JSON.parse(saved);

        // If there was a running timer
        if (state.targetEndTime && state.isRunning) {
            const now = Date.now();
            const remaining = Math.ceil((state.targetEndTime - now) / 1000);

            if (remaining > 0) {
                // Timer still has time left - restore it
                targetEndTime = state.targetEndTime;
                totalSeconds = state.totalSeconds;
                remainingSeconds = remaining;
                sessionStartTime = state.sessionStartTime ? new Date(state.sessionStartTime) : null;
                totalPausedTime = state.totalPausedTime || 0;
                currentBacklogTaskId = state.currentBacklogTaskId || null;

                if (state.taskName) {
                    taskInput.value = state.taskName;
                }

                return true; // Signal to resume timer
            } else {
                // Timer has already finished while in background
                totalSeconds = state.totalSeconds;
                remainingSeconds = 0;
                sessionStartTime = state.sessionStartTime ? new Date(state.sessionStartTime) : null;
                totalPausedTime = state.totalPausedTime || 0;
                currentBacklogTaskId = state.currentBacklogTaskId || null;

                if (state.taskName) {
                    taskInput.value = state.taskName;
                }

                return 'finished'; // Signal that timer finished in background
            }
        } else if (state.remainingSeconds !== undefined && !state.isRunning) {
            // Timer was paused - restore paused state
            totalSeconds = state.totalSeconds;
            remainingSeconds = state.remainingSeconds;
            sessionStartTime = state.sessionStartTime ? new Date(state.sessionStartTime) : null;
            pauseStartTime = state.pauseStartTime;
            totalPausedTime = state.totalPausedTime || 0;
            currentBacklogTaskId = state.currentBacklogTaskId || null;

            if (state.taskName) {
                taskInput.value = state.taskName;
            }

            return 'paused'; // Signal paused state
        }

        return false;
    } catch (e) {
        console.log('Failed to load timer state:', e);
        return false;
    }
}

// Clear timer state from localStorage
function clearTimerState() {
    try {
        localStorage.removeItem('pomodoroTimerState');
    } catch (e) {
        console.log('Failed to clear timer state:', e);
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

// Format milliseconds to readable duration
function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}시간 ${minutes}분 ${seconds}초`;
    } else if (minutes > 0) {
        return `${minutes}분 ${seconds}초`;
    } else {
        return `${seconds}초`;
    }
}

// Format date to readable string
function formatDateTime(date) {
    const d = new Date(date);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

// Format date to short date string
function formatDate(date) {
    const d = new Date(date);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
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

    // If this is a fresh start (not resuming from pause)
    if (sessionStartTime === null) {
        sessionStartTime = new Date();
        totalPausedTime = 0;
    } else if (pauseStartTime !== null) {
        // Resuming from pause - add paused duration
        totalPausedTime += Date.now() - pauseStartTime;
        pauseStartTime = null;
    }

    isRunning = true;
    startBtn.textContent = '일시정지';
    startBtn.classList.add('running');
    resetBtn.textContent = '완료';
    resetBtn.classList.add('finish-early');
    progressEl.classList.remove('finished');

    // Disable task input while running
    taskInput.disabled = true;

    // Set target end time for accurate background timing
    targetEndTime = Date.now() + remainingSeconds * 1000;
    saveTimerState();

    timerInterval = setInterval(() => {
        // Calculate remaining time from target end time
        const now = Date.now();
        remainingSeconds = Math.max(0, Math.ceil((targetEndTime - now) / 1000));
        updateDisplay();
        updateProgress();

        if (remainingSeconds <= 0) {
            finishTimer();
        }
    }, 1000);
}

function pauseTimer() {
    isRunning = false;
    pauseStartTime = Date.now();
    targetEndTime = null; // Clear target end time on pause
    startBtn.textContent = '계속';
    startBtn.classList.remove('running');
    clearInterval(timerInterval);
    saveTimerState();
}

function finishTimer() {
    isRunning = false;
    clearInterval(timerInterval);
    targetEndTime = null;
    startBtn.textContent = '시작';
    startBtn.classList.remove('running');
    progressEl.classList.add('finished');
    clearTimerState();

    // Play notification sound and vibrate
    playNotification();

    // Show notification if permitted
    showNotification();

    // Show timer complete modal
    showTimerModal();
}

function showTimerModal() {
    const taskName = taskInput.value.trim() || '이름 없는 작업';
    modalTaskName.textContent = taskName;
    timerModal.classList.add('active');
}

function hideTimerModal() {
    timerModal.classList.remove('active');
}

function showHistoryDetailModal(historyItem) {
    detailTaskName.textContent = historyItem.taskName;
    detailStartTime.textContent = formatDateTime(historyItem.startTime);
    detailEndTime.textContent = formatDateTime(historyItem.endTime);
    detailPauseTime.textContent = formatDuration(historyItem.pausedTime);
    detailWorkTime.textContent = formatDuration(historyItem.workTime);
    historyModal.classList.add('active');
}

function hideHistoryDetailModal() {
    historyModal.classList.remove('active');
}

function extendTime(minutes) {
    hideTimerModal();

    // Add time
    remainingSeconds = minutes * 60;
    totalSeconds = remainingSeconds;

    // Continue session
    updateDisplay();
    updateProgress();
    updatePresetHighlight();

    // Resume if was paused
    if (pauseStartTime !== null) {
        totalPausedTime += Date.now() - pauseStartTime;
        pauseStartTime = null;
    }

    startTimer();
}

function finishSession() {
    hideTimerModal();

    const endTime = new Date();

    // Calculate final paused time if currently paused
    let finalPausedTime = totalPausedTime;
    if (pauseStartTime !== null) {
        finalPausedTime += Date.now() - pauseStartTime;
    }

    // Calculate work time
    const totalElapsed = endTime - sessionStartTime;
    const workTime = totalElapsed - finalPausedTime;

    // Create history entry
    const historyEntry = {
        id: Date.now(),
        taskName: taskInput.value.trim() || '이름 없는 작업',
        startTime: sessionStartTime.toISOString(),
        endTime: endTime.toISOString(),
        pausedTime: finalPausedTime,
        workTime: Math.max(0, workTime)
    };

    // Add to history
    workHistory.unshift(historyEntry);

    // Keep only last 100 entries
    if (workHistory.length > 100) {
        workHistory = workHistory.slice(0, 100);
    }

    // Remove completed backlog task
    if (currentBacklogTaskId) {
        taskBacklog = taskBacklog.filter(t => t.id !== currentBacklogTaskId);
        currentBacklogTaskId = null;
    }

    // Reset session
    sessionStartTime = null;
    pauseStartTime = null;
    totalPausedTime = 0;
    targetEndTime = null;

    // Reset task name
    taskInput.value = '';
    taskInput.disabled = false;

    // Reset timer
    remainingSeconds = totalSeconds;
    startBtn.textContent = '시작';
    startBtn.classList.remove('running');
    resetBtn.textContent = '리셋';
    resetBtn.classList.remove('finish-early');
    progressEl.classList.remove('finished');
    updateDisplay();
    updateProgress();

    // Save and render
    saveState();
    clearTimerState();
    renderBacklog();
    renderTodayHistory();
}

// Get today's date string (YYYY-MM-DD)
function getDateString(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Get today's history items
function getTodayHistory() {
    const today = getDateString(new Date());
    return workHistory.filter(item => getDateString(item.startTime) === today);
}

// Render today's completed tasks
function renderTodayHistory() {
    const todayItems = getTodayHistory();

    if (todayItems.length === 0) {
        historyList.innerHTML = '<div class="history-empty">오늘 완료된 작업이 없습니다</div>';
        return;
    }

    historyList.innerHTML = todayItems.map((item) => {
        const index = workHistory.findIndex(h => h.id === item.id);
        return `
        <div class="history-item" data-index="${index}">
            <div class="history-item-header">
                <span class="history-item-name">${escapeHtml(item.taskName)}</span>
                <span class="history-item-duration">${formatDuration(item.workTime)}</span>
            </div>
            <div class="history-item-time">
                ${formatDateTime(item.startTime)} ~ ${formatDateTime(item.endTime)}
            </div>
        </div>
    `}).join('');

    // Add click listeners
    historyList.querySelectorAll('.history-item').forEach(el => {
        el.addEventListener('click', () => {
            const index = parseInt(el.dataset.index, 10);
            showHistoryDetailModal(workHistory[index]);
        });
    });
}

// Render backlog list
function renderBacklog() {
    if (taskBacklog.length === 0) {
        backlogList.innerHTML = '<div class="backlog-empty">등록된 작업이 없습니다</div>';
        return;
    }

    backlogList.innerHTML = taskBacklog.map((item) => `
        <div class="backlog-item" data-id="${item.id}">
            <span class="backlog-item-name">${escapeHtml(item.name)}</span>
            <span class="backlog-item-time">${item.minutes}분</span>
            <button class="backlog-item-delete" data-id="${item.id}">&times;</button>
        </div>
    `).join('');

    // Add click listeners for setting task (not starting)
    backlogList.querySelectorAll('.backlog-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.classList.contains('backlog-item-delete')) return;
            const id = parseInt(el.dataset.id, 10);
            setBacklogTask(id);
        });
    });

    // Add click listeners for delete buttons
    backlogList.querySelectorAll('.backlog-item-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id, 10);
            deleteBacklogTask(id);
        });
    });
}

// Add task to backlog
function addBacklogTask() {
    const name = backlogTaskInput.value.trim();
    const minutes = parseInt(backlogTimeSelect.value, 10);

    if (!name) {
        backlogTaskInput.focus();
        return;
    }

    const task = {
        id: Date.now(),
        name: name,
        minutes: minutes
    };

    taskBacklog.push(task);
    saveState();
    renderBacklog();

    // Clear input
    backlogTaskInput.value = '';
}

// Delete task from backlog
function deleteBacklogTask(id) {
    taskBacklog = taskBacklog.filter(t => t.id !== id);
    saveState();
    renderBacklog();
}

// Set timer from backlog task (does not start, just sets values)
function setBacklogTask(id) {
    if (isRunning) {
        if (!confirm('현재 진행 중인 타이머가 있습니다. 새 작업으로 변경하시겠습니까?')) {
            return;
        }
        // Stop current timer without saving to history
        clearInterval(timerInterval);
        isRunning = false;
        startBtn.textContent = '시작';
        startBtn.classList.remove('running');
        resetBtn.textContent = '리셋';
        resetBtn.classList.remove('finish-early');
        sessionStartTime = null;
        pauseStartTime = null;
        totalPausedTime = 0;
        clearTimerState();
    }

    const task = taskBacklog.find(t => t.id === id);
    if (!task) return;

    // Set timer (but don't start)
    taskInput.value = task.name;
    totalSeconds = task.minutes * 60;
    remainingSeconds = totalSeconds;
    currentBacklogTaskId = id;

    updateDisplay();
    updateProgress();
    updatePresetHighlight();

    // Close backlog modal
    hideBacklogModal();
}

// Remove completed backlog task
function removeCompletedBacklogTask() {
    if (currentBacklogTaskId) {
        taskBacklog = taskBacklog.filter(t => t.id !== currentBacklogTaskId);
        currentBacklogTaskId = null;
        saveState();
        renderBacklog();
    }
}

// Show backlog modal
function showBacklogModal() {
    renderBacklog();
    backlogModal.classList.add('active');
}

// Hide backlog modal
function hideBacklogModal() {
    backlogModal.classList.remove('active');
}

// Show archive modal
function showArchiveModal() {
    renderArchive();
    archiveModal.classList.add('active');
}

// Hide archive modal
function hideArchiveModal() {
    archiveModal.classList.remove('active');
}

// Render archive (grouped by date)
function renderArchive() {
    if (workHistory.length === 0) {
        archiveList.innerHTML = '<div class="archive-empty">작업 기록이 없습니다</div>';
        return;
    }

    // Group by date
    const grouped = {};
    workHistory.forEach(item => {
        const dateStr = getDateString(item.startTime);
        if (!grouped[dateStr]) {
            grouped[dateStr] = [];
        }
        grouped[dateStr].push(item);
    });

    // Sort dates descending
    const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

    archiveList.innerHTML = sortedDates.map(dateStr => {
        const items = grouped[dateStr];
        const d = new Date(dateStr);
        const today = getDateString(new Date());
        const yesterday = getDateString(new Date(Date.now() - 86400000));

        let dateLabel;
        if (dateStr === today) {
            dateLabel = '오늘';
        } else if (dateStr === yesterday) {
            dateLabel = '어제';
        } else {
            dateLabel = `${d.getMonth() + 1}월 ${d.getDate()}일`;
        }

        const totalWork = items.reduce((sum, item) => sum + item.workTime, 0);

        return `
            <div class="archive-date-group">
                <div class="archive-date-header">${dateLabel} (${formatDuration(totalWork)})</div>
                <div class="archive-items">
                    ${items.map(item => `
                        <div class="archive-item" data-id="${item.id}">
                            <div class="archive-item-header">
                                <span class="archive-item-name">${escapeHtml(item.taskName)}</span>
                                <span class="archive-item-duration">${formatDuration(item.workTime)}</span>
                                <button class="archive-item-delete" data-id="${item.id}">&times;</button>
                            </div>
                            <div class="archive-item-time">${formatDateTime(item.startTime)} ~ ${formatDateTime(item.endTime)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');

    // Add delete event listeners
    archiveList.querySelectorAll('.archive-item-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id, 10);
            deleteHistoryItem(id);
        });
    });
}

// Delete individual history item
function deleteHistoryItem(id) {
    workHistory = workHistory.filter(item => item.id !== id);
    saveState();
    renderArchive();
    renderTodayHistory();
}

// Clear all history
function clearAllHistory() {
    if (workHistory.length === 0) return;

    if (confirm('모든 작업 기록을 삭제하시겠습니까?')) {
        workHistory = [];
        saveState();
        renderTodayHistory();
        renderArchive();
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

    // If session was in progress, finish it
    if (sessionStartTime !== null) {
        finishSession();
        return;
    }

    targetEndTime = null;
    remainingSeconds = totalSeconds;
    startBtn.textContent = '시작';
    startBtn.classList.remove('running');
    resetBtn.textContent = '리셋';
    resetBtn.classList.remove('finish-early');
    progressEl.classList.remove('finished');
    taskInput.disabled = false;
    updateDisplay();
    updateProgress();
    clearTimerState();
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

    // Modal events - extend buttons
    extendBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const minutes = parseInt(btn.dataset.extend, 10);
            extendTime(minutes);
        });
    });

    // Modal events - finish button
    finishBtn.addEventListener('click', finishSession);

    // Close history modal
    closeHistoryModal.addEventListener('click', hideHistoryDetailModal);

    // Backlog events
    viewBacklogBtn.addEventListener('click', showBacklogModal);
    closeBacklogModal.addEventListener('click', hideBacklogModal);
    backlogAddBtn.addEventListener('click', addBacklogTask);
    backlogTaskInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            addBacklogTask();
        }
    });

    backlogModal.addEventListener('click', (e) => {
        if (e.target === backlogModal) {
            hideBacklogModal();
        }
    });

    // Archive events
    viewArchiveBtn.addEventListener('click', showArchiveModal);
    closeArchiveModal.addEventListener('click', hideArchiveModal);
    clearAllHistoryBtn.addEventListener('click', clearAllHistory);

    archiveModal.addEventListener('click', (e) => {
        if (e.target === archiveModal) {
            hideArchiveModal();
        }
    });

    // Close modals on overlay click
    timerModal.addEventListener('click', (e) => {
        if (e.target === timerModal) {
            // Don't allow closing timer modal by clicking overlay
            // User must choose extend or finish
        }
    });

    historyModal.addEventListener('click', (e) => {
        if (e.target === historyModal) {
            hideHistoryDetailModal();
        }
    });

    // Handle visibility change (returning from background)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && isRunning && targetEndTime) {
            // Immediately update timer when returning to foreground
            const now = Date.now();
            remainingSeconds = Math.max(0, Math.ceil((targetEndTime - now) / 1000));
            updateDisplay();
            updateProgress();

            if (remainingSeconds <= 0) {
                finishTimer();
            }
        }
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
