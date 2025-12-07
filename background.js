// background.js - Service Worker for Extension Management (COMPLETE)

const ANALYSIS_CACHE = {};
const WHITELIST = new Set([
  'google.com', 'gmail.com', 'youtube.com',
  'github.com', 'stackoverflow.com', 'reddit.com',
  'wikipedia.org', 'facebook.com', 'twitter.com'
]);

// Storage keys
const STORAGE_KEYS = {
  SCAN_HISTORY: 'scan_history',
  WHITELIST: 'whitelist',
  SETTINGS: 'settings',
  STATS: 'extension_stats',
  ML_STATS: 'ml_stats'
};

// Initialize storage on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed - initializing storage');
  
  chrome.storage.local.set({
    scan_history: [],
    whitelist: Array.from(WHITELIST),
    settings: {
      enabled: true,
      showWarnings: true,
      riskThreshold: 70,
      blockHighRisk: false,
      enableML: true,
      enableRules: true,
      autoTrain: true
    },
    extension_stats: {
      totalScans: 0,
      threatsDetected: 0,
      lastScan: null
    },
    ml_stats: {
      accuracy: 0.7,
      trainingDataSize: 0,
      predictions: { total: 0, phishing: 0, legitimate: 0 },
      lastUpdated: new Date().toISOString()
    }
  });
});

// Message handler - consolidated
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender, sendResponse);
  return true;
});

async function handleMessage(request, sender, sendResponse) {
  try {
    switch (request.type) {
      case 'PAGE_ANALYSIS_RESULT':
        await handlePageAnalysis(request.data, sender.tab);
        sendResponse({ status: 'received' });
        break;

      case 'GET_SCAN_HISTORY':
        const historyData = await chrome.storage.local.get('scan_history');
        sendResponse({ history: historyData.scan_history || [] });
        break;

      case 'GET_STATS':
        const statsData = await chrome.storage.local.get('extension_stats');
        sendResponse({ stats: statsData.extension_stats || {} });
        break;

      case 'GET_ML_STATS':
        const mlStatsData = await chrome.storage.local.get('ml_stats');
        sendResponse({ stats: mlStatsData.ml_stats || {} });
        break;

      case 'ADD_TO_WHITELIST':
        WHITELIST.add(request.domain);
        await chrome.storage.local.set({ whitelist: Array.from(WHITELIST) });
        sendResponse({ success: true });
        break;

      case 'REMOVE_FROM_WHITELIST':
        WHITELIST.delete(request.domain);
        await chrome.storage.local.set({ whitelist: Array.from(WHITELIST) });
        sendResponse({ success: true });
        break;

      case 'GET_SETTINGS':
        const settingsData = await chrome.storage.local.get('settings');
        sendResponse({ settings: settingsData.settings || {} });
        break;

      case 'UPDATE_SETTINGS':
        await chrome.storage.local.set({ settings: request.settings });
        sendResponse({ success: true });
        break;

      case 'CLEAR_HISTORY':
        await chrome.storage.local.set({ scan_history: [] });
        sendResponse({ success: true });
        break;

      case 'RESET_MODEL':
        await chrome.storage.local.set({
          ml_stats: {
            accuracy: 0.7,
            trainingDataSize: 0,
            predictions: { total: 0, phishing: 0, legitimate: 0 },
            lastUpdated: new Date().toISOString()
          }
        });
        sendResponse({ reset: true });
        break;

      case 'SET_LEARNING_RATE':
        await chrome.storage.local.set({ learning_rate: request.rate });
        sendResponse({ success: true });
        break;

      case 'USER_FEEDBACK':
        await handleUserFeedback(request.data, sender.tab);
        sendResponse({ trained: true });
        break;

      default:
        sendResponse({ error: 'Unknown request type' });
    }
  } catch (error) {
    console.error('Message handler error:', error);
    sendResponse({ error: error.message });
  }
}

// Handle user feedback for ML training
async function handleUserFeedback(feedback, tab) {
  try {
    const mlStatsData = await chrome.storage.local.get('ml_stats');
    let mlStats = mlStatsData.ml_stats || {
      accuracy: 0.7,
      trainingDataSize: 0,
      predictions: { total: 0, phishing: 0, legitimate: 0 }
    };

    mlStats.trainingDataSize++;
    mlStats.predictions.total++;
    if (feedback.isPhishing) {
      mlStats.predictions.phishing++;
    } else {
      mlStats.predictions.legitimate++;
    }
    mlStats.lastUpdated = new Date().toISOString();

    await chrome.storage.local.set({ ml_stats: mlStats });
    console.log('User feedback recorded for training');
  } catch (error) {
    console.error('Feedback handler error:', error);
  }
}

// Handle page analysis
async function handlePageAnalysis(analysis, tab) {
  try {
    const settingsData = await chrome.storage.local.get('settings');
    const config = settingsData.settings || {
      enabled: true,
      showWarnings: true,
      riskThreshold: 70
    };

    if (!config.enabled) return;

    // Get scan history
    const historyData = await chrome.storage.local.get('scan_history');
    let scanHistory = historyData.scan_history || [];

    // Add record
    const scanRecord = {
      url: analysis.url,
      domain: analysis.domain,
      ruleScore: analysis.ruleScore || 0,
      mlScore: analysis.mlScore || 0,
      finalScore: analysis.finalScore || analysis.riskScore || 0,
      riskLevel: analysis.riskLevel || 'UNKNOWN',
      timestamp: new Date().toISOString(),
      tabId: tab.id
    };

    scanHistory.unshift(scanRecord);
    scanHistory = scanHistory.slice(0, 1000);

    await chrome.storage.local.set({ scan_history: scanHistory });

    // Update badge
    updateBadge(scanRecord.finalScore, tab.id);

    // Show warning if high risk
    const threshold = config.riskThreshold || 70;
    if (scanRecord.finalScore >= threshold && config.showWarnings) {
      showWarningNotification(analysis, tab.id);

      // Inject overlay
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'SHOW_WARNING_OVERLAY',
          data: analysis
        });
      } catch (err) {
        console.log('Overlay injection failed');
      }
    }

    // Update stats
    updateStats(scanRecord.riskLevel);

  } catch (error) {
    console.error('Page analysis error:', error);
  }
}

// Update badge
function updateBadge(riskScore, tabId) {
  try {
    let badgeText = '';
    let badgeColor = '#4CAF50';

    if (riskScore >= 70) {
      badgeText = '🔴';
      badgeColor = '#F44336';
    } else if (riskScore >= 40) {
      badgeText = '🟡';
      badgeColor = '#FF9800';
    } else if (riskScore > 0) {
      badgeText = '🟢';
      badgeColor = '#4CAF50';
    }

    chrome.action.setBadgeText({ text: badgeText, tabId });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor, tabId });
  } catch (error) {
    console.warn('Badge update error:', error);
  }
}

// Show notification
function showWarningNotification(analysis, tabId) {
  try {
    const score = analysis.finalScore || analysis.riskScore || 0;
    const level = score >= 70 ? 'HIGH RISK' : 'SUSPICIOUS';

    const options = {
      type: 'basic',
      iconUrl: 'icons/icon_48.png',
      title: '🛡️ Phishing Shield - Security Alert',
      message: `${level} detected on ${analysis.domain || 'this site'} (Score: ${score}/100)`,
      priority: 2,
      eventTime: Date.now()
    };

    chrome.notifications.create(
      `alert-${tabId}-${Date.now()}`,
      options,
      (notificationId) => {
        if (chrome.runtime.lastError) {
          console.warn('Notification error:', chrome.runtime.lastError.message);
        }
      }
    );
  } catch (error) {
    console.error('Notification error:', error);
  }
}

// Update stats
async function updateStats(riskLevel) {
  try {
    const statsData = await chrome.storage.local.get('extension_stats');
    let stats = statsData.extension_stats || {
      totalScans: 0,
      threatsDetected: 0,
      lastScan: null
    };

    stats.totalScans++;
    stats.lastScan = new Date().toISOString();
    
    if (riskLevel === 'HIGH_RISK' || riskLevel === 'SUSPICIOUS') {
      stats.threatsDetected++;
    }

    await chrome.storage.local.set({ extension_stats: stats });
  } catch (error) {
    console.error('Stats error:', error);
  }
}

// Tab update handler
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    try {
      chrome.action.setBadgeText({ text: '', tabId });
    } catch (error) {
      console.warn('Badge clear error:', error);
    }
  }
});

// Cleanup on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  try {
    chrome.action.setBadgeText({ text: '', tabId });
  } catch (error) {
    console.warn('Cleanup error:', error);
  }
});

// Setup cleanup alarm
chrome.alarms.create('cleanup', { periodInMinutes: 60 });

// Cleanup handler
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanup') {
    cleanupOldScans();
  }
});

// Cleanup old records
async function cleanupOldScans() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const historyData = await chrome.storage.local.get('scan_history');
    let scanHistory = historyData.scan_history || [];

    scanHistory = scanHistory.filter(record => {
      const recordDate = new Date(record.timestamp);
      return recordDate > thirtyDaysAgo;
    });

    await chrome.storage.local.set({ scan_history: scanHistory });
    console.log(`Cleanup completed. Records kept: ${scanHistory.length}`);
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

console.log('✅ Background service worker initialized');