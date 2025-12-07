// content.js - Content Script for Page Analysis

console.log('🛡️ Content script loaded');

// Inject detector script into page context
const script = document.createElement('script');
script.src = chrome.runtime.getURL('detector_ml_integrated.js');
script.onload = function() {
  this.remove();
  console.log('✅ Detector script injected');
};
(document.head || document.documentElement).appendChild(script);

// Listen for analysis results from detector
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  if (event.data.type === 'PHISHING_ANALYSIS_RESULT') {
    const analysis = event.data.analysis;
    
    // Send to background script
    chrome.runtime.sendMessage({
      type: 'PAGE_ANALYSIS_RESULT',
      data: analysis
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('Failed to send analysis:', chrome.runtime.lastError.message);
      }
    });

    // Store in session for popup
    sessionStorage.setItem('currentPageAnalysis', JSON.stringify(analysis));
  }
});

// Handle requests from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_PAGE_ANALYSIS') {
    const analysis = sessionStorage.getItem('currentPageAnalysis');
    if (analysis) {
      sendResponse({ data: JSON.parse(analysis) });
    } else {
      sendResponse({ data: null });
    }
  } else if (request.type === 'SHOW_WARNING_OVERLAY') {
    showWarningOverlay(request.data);
    sendResponse({ shown: true });
  } else if (request.type === 'USER_FEEDBACK') {
    // Send feedback to background for ML training
    chrome.runtime.sendMessage({
      type: 'USER_FEEDBACK',
      data: request
    });
    sendResponse({ trained: true });
  }
  return true;
});

// Show warning overlay
function showWarningOverlay(analysis) {
  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'phishing-shield-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;

  const score = analysis.finalScore || analysis.riskScore || 0;
  const level = score >= 70 ? 'HIGH RISK' : 'SUSPICIOUS';
  const color = score >= 70 ? '#FF5555' : '#FFA500';

  overlay.innerHTML = `
    <div style="
      background: white;
      border-radius: 12px;
      padding: 30px;
      max-width: 500px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      text-align: center;
    ">
      <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
      <h1 style="color: ${color}; margin: 0 0 10px 0; font-size: 24px;">${level}</h1>
      <p style="color: #666; margin: 0 0 20px 0; font-size: 14px;">
        This website appears to be suspicious.
      </p>
      <div style="
        background: #f0f0f0;
        padding: 15px;
        border-radius: 8px;
        margin-bottom: 20px;
        text-align: left;
      ">
        <p style="margin: 5px 0; font-size: 13px;"><strong>Domain:</strong> ${analysis.domain}</p>
        <p style="margin: 5px 0; font-size: 13px;"><strong>Risk Score:</strong> ${score}/100</p>
      </div>
      <button id="phishing-leave-btn" style="
        background: #F44336;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        margin-right: 10px;
      ">Leave Site</button>
      <button id="phishing-stay-btn" style="
        background: #4CAF50;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
      ">Stay on Site</button>
    </div>
  `;

  document.body.appendChild(overlay);

  // Event listeners
  document.getElementById('phishing-leave-btn').addEventListener('click', () => {
    window.location.href = 'about:blank';
  });

  document.getElementById('phishing-stay-btn').addEventListener('click', () => {
    overlay.remove();
  });
}