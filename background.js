let refreshInterval = null;
let currentTabId = null;

// Store auto-refresh state
function storeAutoRefreshState(tabId, interval) {
  chrome.storage.local.set({
    autoRefresh: {
      running: true,
      tabId: tabId,
      interval: interval,
      lastStart: Date.now()
    }
  });
}

// Clear auto-refresh state
function clearAutoRefreshState() {
  chrome.storage.local.remove('autoRefresh');
}

// Update badge with countdown timer
function updateBadge(seconds) {
  if (seconds > 0) {
    chrome.action.setBadgeText({text: seconds.toString()});
    chrome.action.setBadgeBackgroundColor({color: '#007aff'});
  } else {
    chrome.action.setBadgeText({text: ''});
  }
}

// Load saved state on startup
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get('autoRefresh', (result) => {
    if (result.autoRefresh && result.autoRefresh.running) {
      startAutoRefreshInterval(
        result.autoRefresh.tabId,
        result.autoRefresh.interval
      );
    }
  });
});

// Start auto-refresh interval
function startAutoRefreshInterval(tabId, interval) {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  currentTabId = tabId;
  
  let lastRefreshTime = Date.now();
  
  refreshInterval = setInterval(async () => {
    try {
      const now = Date.now();
      const timeSinceLastRefresh = now - lastRefreshTime;
      const remaining = interval - timeSinceLastRefresh;
      
      // Update badge with remaining time
      const secondsRemaining = Math.ceil(remaining / 1000);
      updateBadge(secondsRemaining > 0 ? secondsRemaining : 0);
      
      if (remaining <= 0) {
        // Perform the refresh
        await new Promise((resolve) => {
          chrome.tabs.reload(currentTabId, {}, () => {
            if (chrome.runtime.lastError) {
              console.warn(chrome.runtime.lastError);
            }
            resolve();
          });
        });
        
        // Reset the timer
        lastRefreshTime = Date.now();
      }
    } catch (error) {
      console.error('Refresh error:', error);
    }
  }, 500); // Check every 500ms for smoother countdown
}

async function handleMessage(request, sender, sendResponse) {
  try {
    switch (request.action) {
      case 'refreshTab':
        await new Promise((resolve) => {
          chrome.tabs.reload(request.tabId, {}, () => {
            chrome.runtime.sendMessage({
              action: 'tabRefreshed',
              tabId: request.tabId
            }, resolve);
          });
        });
        sendResponse({success: true});
        break;

      case 'startAutoRefresh':
        startAutoRefreshInterval(request.tabId, request.interval);
        storeAutoRefreshState(request.tabId, request.interval);
        sendResponse({success: true});
        break;
        
        refreshInterval = setInterval(async () => {
          try {
            const now = Date.now();
            const timeSinceLastRefresh = now - lastRefreshTime;
            const remaining = request.interval - timeSinceLastRefresh;
            
            // Update badge with remaining time
            const secondsRemaining = Math.ceil(remaining / 1000);
            updateBadge(secondsRemaining > 0 ? secondsRemaining : 0);
            
            if (remaining <= 0) {
              // Notify popup about upcoming refresh
              await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                  action: 'aboutToRefresh',
                  tabId: currentTabId,
                  remaining: 0
                }, () => {
                  if (chrome.runtime.lastError) {
                    console.warn(chrome.runtime.lastError);
                  }
                  resolve();
                });
              });
              
              // Perform the refresh
              await new Promise((resolve) => {
                chrome.tabs.reload(currentTabId, {}, () => {
                  if (chrome.runtime.lastError) {
                    console.warn(chrome.runtime.lastError);
                  }
                  resolve();
                });
              });
              
              // Reset the timer
              lastRefreshTime = Date.now();
            }
          } catch (error) {
            console.error('Refresh error:', error);
          }
        }, 500); // Check every 500ms for smoother countdown
        
        storeAutoRefreshState(currentTabId, request.interval);
        sendResponse({success: true});
        break;

      case 'stopAutoRefresh':
        if (refreshInterval) {
          clearInterval(refreshInterval);
          refreshInterval = null;
          currentTabId = null;
          clearAutoRefreshState();
          await new Promise((resolve) => {
            chrome.runtime.sendMessage(
              {action: 'refreshStopped'},
              () => {
                if (chrome.runtime.lastError) {
                  console.warn(chrome.runtime.lastError);
                }
                resolve();
              }
            );
          });
        }
        sendResponse({success: true});
        break;

      case 'getRemainingTime':
        await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            {action: 'getRemainingTime'},
            (response) => {
              if (response && response.seconds) {
                updateBadge(response.seconds);
              }
              resolve();
            }
          );
        });
        sendResponse({success: true});
        break;

      default:
        sendResponse({success: false, error: 'Unknown action'});
    }
  } catch (error) {
    console.error('Message handler error:', error);
    sendResponse({success: false, error: error.message});
  }
  return true;
}

chrome.runtime.onMessage.addListener(handleMessage);
