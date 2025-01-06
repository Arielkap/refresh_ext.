document.addEventListener('DOMContentLoaded', async function() {
  // Get UI elements
  const tabSelect = document.getElementById('tab-select');
  const intervalSelect = document.getElementById('interval-select');
  const customTime = document.getElementById('custom-time');
  const customSeconds = document.getElementById('custom-seconds');
  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const refreshBtn = document.getElementById('refresh-btn');
  const status = document.getElementById('status');
  const timer = document.getElementById('timer');

  let countdownInterval = null;
  let remainingTime = 0;

  // Check current refresh state
  const { autoRefresh } = await chrome.storage.local.get('autoRefresh');
  if (autoRefresh?.running) {
    const interval = autoRefresh.interval / 1000;
    const elapsed = (Date.now() - autoRefresh.lastStart) / 1000;
    const remaining = interval - (elapsed % interval);
    
    startBtn.disabled = true;
    stopBtn.disabled = false;
    refreshBtn.disabled = true;
    status.textContent = `Auto-refreshing every ${interval} seconds`;
    startCountdown(remaining);
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function startCountdown(interval) {
    remainingTime = interval;
    timer.textContent = formatTime(remainingTime);
    timer.style.visibility = 'visible';
    
    if (countdownInterval) {
      clearInterval(countdownInterval);
    }
    
    countdownInterval = setInterval(() => {
      if (remainingTime > 0) {
        remainingTime--;
        timer.textContent = formatTime(remainingTime);
        updateBadgeTime();
      }
      
      if (remainingTime <= 0) {
        clearInterval(countdownInterval);
        timer.textContent = '00:00';
        updateBadgeTime();
        countdownInterval = null;
      }
    }, 1000);
  }

  function stopCountdown() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    timer.textContent = '00:00';
  }

  function updateBadgeTime() {
    chrome.runtime.sendMessage({
      action: 'getRemainingTime'
    });
  }

  // Get all tabs and populate the select element
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      const option = document.createElement('option');
      option.value = tab.id;
      option.text = tab.title;
      tabSelect.appendChild(option);
    });
  });

  // Handle interval selection change
  intervalSelect.addEventListener('change', () => {
    if (intervalSelect.value === 'custom') {
      customTime.style.display = 'block';
    } else {
      customTime.style.display = 'none';
    }
  });

  // Handle start button click
  startBtn.addEventListener('click', () => {
    const tabId = parseInt(tabSelect.value);
    if (!tabId) {
      status.textContent = 'Please select a tab first';
      return;
    }

    let interval = parseInt(intervalSelect.value);
    if (intervalSelect.value === 'custom') {
      interval = parseInt(customSeconds.value);
      if (isNaN(interval) || interval < 1) {
        status.textContent = 'Please enter a valid custom time';
        return;
      }
    }

    chrome.runtime.sendMessage(
      {
        action: 'startAutoRefresh',
        tabId: tabId,
        interval: interval * 1000
      },
      (response) => {
        if (response && response.success) {
          status.textContent = `Auto-refreshing every ${interval} seconds`;
          startBtn.disabled = true;
          stopBtn.disabled = false;
          refreshBtn.disabled = true;
          startCountdown(interval);
        }
      }
    );
  });

  // Handle stop button click
  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage(
      {action: 'stopAutoRefresh'},
      (response) => {
        if (response && response.success) {
          status.textContent = 'Auto-refresh stopped';
          startBtn.disabled = false;
          stopBtn.disabled = true;
          refreshBtn.disabled = false;
          stopCountdown();
        }
      }
    );
  });

  // Handle refresh button click
  refreshBtn.addEventListener('click', () => {
    const tabId = parseInt(tabSelect.value);
    if (tabId) {
      chrome.runtime.sendMessage(
        {action: 'refreshTab', tabId: tabId},
        (response) => {
          if (response && response.success) {
            window.close();
          }
        }
      );
    }
  });

  // Listen for refresh notifications
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'aboutToRefresh') {
      // Reset timer immediately before refresh
      let interval = parseInt(intervalSelect.value);
      if (intervalSelect.value === 'custom') {
        interval = parseInt(customSeconds.value);
      }
      startCountdown(interval);
    }
    else if (message.action === 'tabRefreshed') {
      // Ensure timer is running after refresh
      if (startBtn.disabled) {
        let interval = parseInt(intervalSelect.value);
        if (intervalSelect.value === 'custom') {
          interval = parseInt(customSeconds.value);
        }
        startCountdown(interval);
      }
    }
    return true;
  });
});
