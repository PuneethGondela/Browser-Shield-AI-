// detector_ml_integrated.js - Rule-Based + ML Hybrid Detection (IMPROVED & STABLE)

class PhishingDetector {
  constructor() {
    this.ruleWeights = {
      typoSquatting: 15,
      homoglyphAttacks: 15,
      subdomainTricks: 12,
      suspiciousTLD: 10,
      formAnalysis: 12,
      contentAnalysis: 10,
      domainAge: 8,
      securityFeatures: 10,
      linkAnalysis: 8
    };

    // Strongly trusted domains - almost never phishing
    this.TRUSTED_DOMAINS = [
      "google.com",
      "gmail.com",
      "youtube.com","ogs.google.com","accounts.google.com",
      "facebook.com",
      "meta.com",
      "microsoft.com",
      "live.com",
      "outlook.com",
      "office.com",
      "apple.com",
      "icloud.com",
      "amazon.com",
      "amazon.in",
      "flipkart.com",
      "paytm.com",
      "phonepe.com",
      "whatsapp.com",
      "instagram.com",
      "linkedin.com"
    ];

    this.mlModel = null;
    this.initML();
  }

  // ------------ ML INITIALIZATION (NO RANDOM NOISE) ------------

  initML() {
    // Deterministic small model, tuned for:
    // - HTTPS → LOWER risk
    // - More digits/hyphens/forms/passwords/suspicious text → HIGHER risk
    this.mlModel = {
      weights: this.generateDeterministicWeights(),
      bias: -2.0,         // push towards SAFE by default
      accuracy: 0.9,      // for display in UI (demo)
      trainingDataSize: 0
    };
  }

  generateDeterministicWeights() {
    const w = new Array(128).fill(0);

    // Feature indices (see extractFeatures)
    // 0: domain length
    // 1: digit count in domain
    // 2: hyphen count
    // 3: https (1 = https, 0 = http)
    // 4: number of forms
    // 5: number of password inputs
    // 6: number of links
    // 7: suspicious keyword count in text

    w[0] = 0.01;   // longer domain → slightly riskier
    w[1] = 0.35;   // digits in domain
    w[2] = 0.30;   // hyphens in domain
    w[3] = -1.2;   // HTTPS strongly reduces risk
    w[4] = 0.25;   // forms
    w[5] = 0.7;    // password inputs
    w[6] = 0.01;   // many links = slight risk
    w[7] = 0.6;    // phishing words in text

    // all other weights stay 0 (no random noise)
    return w;
  }

  // ------------ HELPER: TRUSTED DOMAINS ------------

  getBaseDomain(hostname) {
    if (!hostname) return "";
    const parts = hostname.toLowerCase().split(".");
    if (parts.length <= 2) return hostname.toLowerCase();
    return parts.slice(-2).join(".");
  }

  isHighlyTrustedDomain(domain) {
    const base = this.getBaseDomain(domain);
    return this.TRUSTED_DOMAINS.includes(base);
  }

  // ------------ 1. Typo-Squatting Detection ------------

  detectTypoSquatting(domain) {
    const commonBrands = ["google", "amazon", "apple", "facebook", "microsoft", "paypal", "ebay", "bank"];
    const base = this.getBaseDomain(domain).split(".")[0] || domain;

    const levenshteinDistance = (a, b) => {
      const m = a.length, n = b.length;
      const dp = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

      for (let i = 0; i <= m; i++) dp[i][0] = i;
      for (let j = 0; j <= n; j++) dp[0][j] = j;

      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          if (a[i - 1] === b[j - 1]) {
            dp[i][j] = dp[i - 1][j - 1];
          } else {
            dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
          }
        }
      }
      return dp[m][n];
    };

    for (const brand of commonBrands) {
      const distance = levenshteinDistance(base, brand);
      // If it EXACTLY equals brand with correct TLD (real site), don't mark as typo
      if (base === brand) continue;

      if (distance > 0 && distance <= 2) {
        return { score: 25, detected: true, reason: `Typo-squatting: Similar to '${brand}'` };
      }
    }
    return { score: 0, detected: false };
  }

  // ------------ 2. Homoglyph Attacks Detection ------------

  detectHomoglyphAttacks(domain) {
    const homoglyphMap = {
      "a": ["а", "ɑ", "α"],
      "e": ["е", "ε"],
      "o": ["о", "0", "ο"],
      "i": ["і", "ı", "ι"],
      "s": ["ѕ"],
      "l": ["1", "І"]
    };

    for (const [, replacements] of Object.entries(homoglyphMap)) {
      for (const replacement of replacements) {
        if (domain.includes(replacement)) {
          return { score: 30, detected: true, reason: "Homoglyph attack detected" };
        }
      }
    }
    return { score: 0, detected: false };
  }

  // ------------ 3. Subdomain Tricks ------------

  detectSubdomainTricks(domain) {
    const parts = domain.split(".");
    if (parts.length > 3) {
      const subdomains = parts.slice(0, -2).join(".");
      if (subdomains.length > 15) {
        return { score: 20, detected: true, reason: "Suspicious subdomain structure" };
      }
    }
    return { score: 0, detected: false };
  }

  // ------------ 4. Suspicious TLD Detection ------------

  detectSuspiciousTLD(domain) {
    const suspiciousTLDs = ["tk", "ml", "ga", "cf", "info", "xyz", "pw", "cc"];
    const tld = domain.split(".").pop();

    if (suspiciousTLDs.includes(tld)) {
      return { score: 15, detected: true, reason: `Suspicious TLD: .${tld}` };
    }
    return { score: 0, detected: false };
  }

  // ------------ 5. Form Analysis ------------

  detectSuspiciousForms() {
    const forms = document.querySelectorAll("form");
    let score = 0;

    for (const form of forms) {
      const inputs = form.querySelectorAll('input[type="password"], input[type="email"]');
      if (inputs.length > 0) {
        const formAction = form.getAttribute("action") || "";
        const formMethod = (form.getAttribute("method") || "get").toLowerCase();

        if (!formAction || formAction.startsWith("javascript:")) {
          score += 15;
        }
        if (formMethod === "get") {
          score += 10;
        }
      }
    }

    return { score: Math.min(score, 25), detected: score > 0, reason: "Suspicious form detected" };
  }

  // ------------ 6. Content Analysis ------------

  detectSuspiciousContent() {
    const bodyText = (document.body.innerText || "").toLowerCase();
    const keywords = [
      "verify account",
      "confirm password",
      "update payment",
      "urgent action required",
      "click here",
      "confirm identity",
      "unusual activity",
      "re-enter password"
    ];

    let matches = 0;
    for (const keyword of keywords) {
      if (bodyText.includes(keyword)) matches++;
    }

    const score = Math.min(matches * 4, 25);
    return { score, detected: score > 0, reason: `Suspicious content keywords found (${matches})` };
  }

  // ------------ 7. Domain Age Analysis (NO RANDOM) ------------

  detectNewDomain(domain) {
    // Heuristic only: if suspicious TLD + long weird domain, treat as "new"
    const base = this.getBaseDomain(domain);
    const length = base.length;
    const suspiciousTLDs = ["tk", "ml", "ga", "cf", "xyz", "info", "pw", "cc"];
    const tld = base.split(".").pop();

    const looksSuspicious = suspiciousTLDs.includes(tld) && length > 15;

    return {
      score: looksSuspicious ? 10 : 0,
      detected: looksSuspicious,
      reason: looksSuspicious ? "Domain appears newly registered / low reputation" : ""
    };
  }

  // ------------ 8. Security Features ------------

  detectSecurityFeatures() {
    const hasHTTPS = window.location.protocol === "https:";
    const score = hasHTTPS ? 0 : 20;

    return {
      score,
      detected: !hasHTTPS,
      reason: hasHTTPS ? "HTTPS enabled" : "No HTTPS detected"
    };
  }

  // ------------ 9. Link Analysis ------------

  detectSuspiciousLinks() {
    const links = document.querySelectorAll("a");
    let suspiciousCount = 0;

    for (const link of links) {
      const href = link.getAttribute("href") || "";
      if (href.startsWith("javascript:") || href.startsWith("data:")) {
        suspiciousCount++;
      }
    }

    const score = Math.min(suspiciousCount * 2, 20);
    return { score, detected: score > 0, reason: `${suspiciousCount} suspicious links found` };
  }

  // ------------ ML Prediction (DETERMINISTIC) ------------

  predictML(features) {
    let output = this.mlModel.bias;
    for (let i = 0; i < features.length; i++) {
      output += (features[i] || 0) * (this.mlModel.weights[i] || 0);
    }
    const sigmoid = 1 / (1 + Math.exp(-output));
    return +(sigmoid * 100).toFixed(1); // number
  }

  // ------------ Extract features for ML (NO RANDOM) ------------

  extractFeatures() {
    const domain = window.location.hostname || "";
    const baseDomain = this.getBaseDomain(domain);

    const isTrusted = this.isHighlyTrustedDomain(domain);

    const domainLength = baseDomain.length;
    const digitCount = (baseDomain.match(/[0-9]/g) || []).length;
    const hyphenCount = (baseDomain.match(/-/g) || []).length;
    const isHttps = window.location.protocol === "https:" ? 1 : 0;
    const formCount = document.querySelectorAll("form").length;
    const passwordInputs = document.querySelectorAll('input[type="password"]').length;
    const linkCount = document.querySelectorAll("a").length;

    const bodyText = (document.body.innerText || "").toLowerCase();
    const suspiciousWords =
      bodyText.match(/verify|confirm|urgent|password|bank|login|update/gi) || [];
    let suspiciousWordCount = suspiciousWords.length;

    // If domain is trusted & https, strongly reduce suspicious word impact
    if (isTrusted && isHttps === 1) {
      suspiciousWordCount = Math.floor(suspiciousWordCount * 0.2);
    }

    const features = [
      domainLength,
      digitCount,
      hyphenCount,
      isHttps,
      formCount,
      passwordInputs,
      linkCount,
      suspiciousWordCount
    ];

    // pad remaining to 128 with zeros (NO RANDOM)
    while (features.length < 128) {
      features.push(0);
    }
    return features;
  }

  // ------------ Hybrid Detection ------------

  analyzePageHybrid() {
    const domain = window.location.hostname || "";
    const url = window.location.href || "";

    // If highly trusted domain + HTTPS, force SAFE (very low score)
    if (this.isHighlyTrustedDomain(domain) && window.location.protocol === "https:") {
      return {
        url,
        domain,
        ruleScore: 0,
        mlScore: 5,
        finalScore: 5,
        riskLevel: "SAFE",
        reasons: ["Trusted domain with valid HTTPS connection"],
        timestamp: new Date().toISOString()
      };
    }

    // Rule-based scores
    const ruleParts = [
      this.detectTypoSquatting(domain),
      this.detectHomoglyphAttacks(domain),
      this.detectSubdomainTricks(domain),
      this.detectSuspiciousTLD(domain),
      this.detectSuspiciousForms(),
      this.detectSuspiciousContent(),
      this.detectNewDomain(domain),
      this.detectSecurityFeatures(),
      this.detectSuspiciousLinks()
    ];

    const ruleScore = ruleParts.reduce((sum, r) => sum + (r.score || 0), 0);
    const reasons = ruleParts.filter(r => r.detected && r.reason).map(r => r.reason);

    // ML prediction
    const features = this.extractFeatures();
    const mlScore = this.predictML(features);

    // Hybrid combination: 40% rules + 60% ML
    let finalScore = Math.round(ruleScore * 0.4 + mlScore * 0.6);

    // Clamp 0–100
    if (finalScore < 0) finalScore = 0;
    if (finalScore > 100) finalScore = 100;

    // Extra protection: if ruleScore is VERY low and site is HTTPS, cap score
    if (ruleScore <= 5 && window.location.protocol === "https:") {
      finalScore = Math.min(finalScore, 25);
    }

    // Determine risk level
    let riskLevel = "SAFE";
    if (finalScore >= 70) riskLevel = "HIGH_RISK";
    else if (finalScore >= 40) riskLevel = "SUSPICIOUS";

    return {
      url,
      domain,
      ruleScore,
      mlScore,
      finalScore,
      riskLevel,
      reasons,
      timestamp: new Date().toISOString()
    };
  }
}

// Initialize and run detection
const detector = new PhishingDetector();
const analysis = detector.analyzePageHybrid();

// Send results via postMessage
window.postMessage(
  {
    type: "PHISHING_ANALYSIS_RESULT",
    analysis: analysis
  },
  "*"
);

console.log("✅ Analysis complete:", analysis);
