// popup.js - Popup UI Management

document.addEventListener('DOMContentLoaded', () => {
  initializeTabs();
  updateDashboard();
  updateCurrentPageScore();
  setupEventListeners();

  setInterval(updateDashboard, 5000);
  setInterval(updateCurrentPageScore, 3000);
});

// Tab Management
function initializeTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      showTab(tabName);
    });
  });
}

function showTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));

  const tab = document.getElementById(tabName);
  if (tab) tab.classList.add('active');

  const button = document.querySelector(`[data-tab="${tabName}"]`);
  if (button) button.classList.add('active');

  if (tabName === 'history') loadHistory();
}

// Dashboard Update
function updateDashboard() {
  chrome.storage.local.get(['scan_history', 'extension_stats', 'ml_stats'], (result) => {
    const history = result.scan_history || [];
    const stats = result.extension_stats || {};
    const mlStats = result.ml_stats || {};

    document.getElementById('scanCount').textContent = history.length;

    const threats = history.filter(h => h.finalScore > 69).length;
    document.getElementById('threatCount').textContent = threats;

    if (history.length > 0) {
      const lastAnalysis = history[0];
      const date = new Date(lastAnalysis.timestamp);
      document.getElementById('lastDetection').textContent = date.toLocaleTimeString();
    }

    const accuracy = (mlStats.accuracy * 100).toFixed(1);
    document.getElementById('modelAccuracy').textContent = accuracy + '%';

    document.getElementById('trainedSamples').textContent = mlStats.trainingDataSize || 0;
  });
}

// Current Page Score
async function updateCurrentPageScore() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.tabs.sendMessage(
      tab.id,
      { type: 'GET_PAGE_ANALYSIS' },
      (response) => {
        if (chrome.runtime.lastError) {
          console.log('Content script not ready');
          return;
        }
        if (response && response.data) {
          displayPageScore(response.data);
        }
      }
    );
  } catch (error) {
    console.error('Error getting page score:', error);
  }
}

function displayPageScore(analysis) {
  if (!analysis) return;

  const ruleScore = analysis.ruleScore || '--';
  const mlScore = Math.round(analysis.mlScore || 0);
  const finalScore = analysis.finalScore || '--';

  document.getElementById('currentRuleScore').textContent = ruleScore;
  document.getElementById('currentMLScore').textContent = mlScore;
  document.getElementById('currentFinalScore').textContent = finalScore;

  let riskText = '🟢 Safe';
  let riskColor = 'success';
  let riskIcon = '✓';

  if (finalScore > 69) {
    riskText = '🔴 HIGH RISK';
    riskColor = 'danger';
    riskIcon = '⚠️';
  } else if (finalScore > 39) {
    riskText = '🟡 Suspicious';
    riskColor = 'warning';
    riskIcon = '?';
  }

  const riskElement = document.getElementById('riskLevel');
  riskElement.textContent = riskText;
  riskElement.className = `risk-level ${riskColor}`;

  document.getElementById('riskIcon').textContent = riskIcon;
}

// Load History
function loadHistory() {
  chrome.storage.local.get('scan_history', (result) => {
    const history = result.scan_history || [];
    const container = document.getElementById('historyContainer');

    if (history.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No scan history yet</p></div>';
      return;
    }

    container.innerHTML = history.slice(0, 20).map(record => {
      let className = 'safe';
      if (record.finalScore > 69) className = 'high-risk';
      else if (record.finalScore > 39) className = 'suspicious';

      const date = new Date(record.timestamp);
      return `
        <div class="history-item ${className}">
          <div class="domain">${record.domain}</div>
          <div class="score">Score: ${record.finalScore} | ${date.toLocaleTimeString()}</div>
        </div>
      `;
    }).join('');
  });
}

// Event Listeners
function setupEventListeners() {
  document.getElementById('reportPhishing')?.addEventListener('click', () => {
    reportCurrentPage(true);
  });

  document.getElementById('reportSafe')?.addEventListener('click', () => {
    reportCurrentPage(false);
  });

  document.getElementById('exportStats')?.addEventListener('click', exportStats);

  document.getElementById('resetModel')?.addEventListener('click', () => {
    if (confirm('Reset ML model?')) resetModel();
  });

  document.getElementById('clearData')?.addEventListener('click', () => {
    if (confirm('Clear all data?')) clearAllData();
  });

  document.getElementById('enableMLDetection')?.addEventListener('change', (e) => {
    chrome.storage.local.set({ enableML: e.target.checked });
  });

  document.getElementById('enableRuleDetection')?.addEventListener('change', (e) => {
    chrome.storage.local.set({ enableRules: e.target.checked });
  });

  document.getElementById('enableWarnings')?.addEventListener('change', (e) => {
    chrome.storage.local.set({ enableWarnings: e.target.checked });
  });

  document.getElementById('enableAutoTrain')?.addEventListener('change', (e) => {
    chrome.storage.local.set({ autoTrain: e.target.checked });
  });

  document.getElementById('learningRate')?.addEventListener('change', (e) => {
    document.getElementById('thresholdValue').textContent = e.target.value;
    chrome.storage.local.set({ riskThreshold: parseInt(e.target.value) });
  });

  // Load settings
  chrome.storage.local.get([
    'enableML', 'enableRules', 'enableWarnings', 'autoTrain', 'riskThreshold'
  ], (result) => {
    if (result.enableML !== undefined) {
      document.getElementById('enableMLDetection').checked = result.enableML;
    }
    if (result.enableRules !== undefined) {
      document.getElementById('enableRuleDetection').checked = result.enableRules;
    }
    if (result.enableWarnings !== undefined) {
      document.getElementById('enableWarnings').checked = result.enableWarnings;
    }
    if (result.autoTrain !== undefined) {
      document.getElementById('enableAutoTrain').checked = result.autoTrain;
    }
    if (result.riskThreshold) {
      document.getElementById('learningRate').value = result.riskThreshold;
      document.getElementById('thresholdValue').textContent = result.riskThreshold;
    }
  });
}

// Report Functions
async function reportCurrentPage(isPhishing) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.tabs.sendMessage(
      tab.id,
      { type: 'USER_FEEDBACK', isPhishing: isPhishing },
      (response) => {
        if (chrome.runtime.lastError) {
          console.log('Feedback not processed');
          return;
        }
        if (response && response.trained) {
          const message = isPhishing ? 
            '✅ Reported as phishing!' : 
            '✅ Reported as safe!';
          showNotification(message);
          setTimeout(updateDashboard, 1000);
        }
      }
    );
  } catch (error) {
    console.error('Error reporting page:', error);
  }
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: #4CAF50;
    color: white;
    padding: 15px;
    border-radius: 5px;
    z-index: 10000;
    font-weight: bold;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

function exportStats() {
  chrome.storage.local.get('scan_history', (result) => {
    const history = result.scan_history || [];

    const stats = {
      total: history.length,
      threats: history.filter(h => h.finalScore > 69).length,
      suspicious: history.filter(h => h.finalScore > 39 && h.finalScore <= 69).length,
      safe: history.filter(h => h.finalScore <= 39).length,
      exported: new Date().toISOString(),
      history: history.slice(-100)
    };

    const dataStr = JSON.stringify(stats, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `phishing-shield-stats-${Date.now()}.json`;
    link.click();

    showNotification('✅ Stats exported!');
  });
}

function resetModel() {
  chrome.runtime.sendMessage({ type: 'RESET_MODEL' }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('Reset failed');
      return;
    }
    if (response && response.reset) {
      showNotification('✅ Model reset!');
      setTimeout(updateDashboard, 500);
    }
  });
}

function clearAllData() {
  chrome.storage.local.clear(() => {
    chrome.runtime.sendMessage({ type: 'RESET_MODEL' }, () => {
      showNotification('✅ All data cleared!');
      setTimeout(() => {
        location.reload();
      }, 1000);
    });
  });
}