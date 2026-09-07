/**
 * DeeplinkValidator — Phase 5 Deterministic Deeplink & External URL Validator.
 *
 * Enforces strict security boundaries:
 * 1. URL existence and valid URI parsing.
 * 2. Secure protocol enforcement (https: only; blocks javascript:, data:, file:, etc.).
 * 3. Controlled provider domain allowlist matching.
 * 4. Rejection of arbitrary client URLs and open redirects.
 */

// Controlled allowlist mapping provider identifiers to authorized hostname suffixes.
// Any domain that matches or ends with these authorized domains is accepted.
const PROVIDER_DOMAINS = {
  'air india': ['airindia.com', 'airindiaexpress.com', 'express.airindia.com'],
  'air india express': ['airindiaexpress.com', 'express.airindia.com', 'airindia.com'],
  'ai': ['airindia.com', 'airindiaexpress.com', 'express.airindia.com'],
  'ix': ['airindiaexpress.com', 'express.airindia.com'],
  'indigo': ['goindigo.in', 'indigo.in'],
  '6e': ['goindigo.in', 'indigo.in'],
  'vistara': ['airvistara.com', 'vistara.com'],
  'uk': ['airvistara.com', 'vistara.com'],
  'spicejet': ['spicejet.com'],
  'sg': ['spicejet.com'],
  'akasa air': ['akasaair.com'],
  'qp': ['akasaair.com'],
  'alliance air': ['allianceair.in'],
  '9i': ['allianceair.in'],
  'virgin atlantic': ['virginatlantic.com', 'virgin-atlantic.com'],
  'vs': ['virginatlantic.com', 'virgin-atlantic.com'],
  'emirates': ['emirates.com'],
  'ek': ['emirates.com'],
  'qatar airways': ['qatarairways.com'],
  'qr': ['qatarairways.com'],
  'british airways': ['britishairways.com', 'ba.com'],
  'ba': ['britishairways.com', 'ba.com'],
  'singapore airlines': ['singaporeair.com'],
  'sq': ['singaporeair.com'],
  'lufthansa': ['lufthansa.com'],
  'lh': ['lufthansa.com'],
  'etihad': ['etihad.com'],
  'ey': ['etihad.com'],
  'air france': ['airfrance.com'],
  'klm': ['klm.com'],
  'flydubai': ['flydubai.com'],
  'air arabia': ['airarabia.com'],
  'srilankan airlines': ['srilankan.com'],
  'indian railways': ['irctc.co.in', 'indianrail.gov.in'],
  'irctc': ['irctc.co.in', 'indianrail.gov.in'],
  'ksrtc': ['ksrtc.in'],
  'redbus': ['redbus.in'],
  'marriott': ['marriott.com'],
  'taj': ['tajhotels.com', 'ihcltata.com'],
  'default_demo': ['demo.example.com', 'demo.triprescue.local'],
};

// Global generic allowed demo/sandbox domains (for unit test fixtures)
const DEMO_DOMAINS = ['demo.example.com', 'demo.triprescue.local'];

// Dangerous protocols that must be immediately blocked
const DANGEROUS_PROTOCOLS = new Set([
  'javascript:',
  'data:',
  'file:',
  'vbscript:',
  'about:',
  'blob:',
]);

class DeeplinkValidator {
  /**
   * Validate an external URL against provider expectations and safety policies.
   * @param {string} urlStr - The external URL to validate
   * @param {string} providerName - The expected provider/carrier name
   * @returns {{ valid: boolean, error?: string, parsedUrl?: URL, normalizedUrl?: string }}
   */
  validate(urlStr, providerName = '') {
    // 1. URL existence check
    if (!urlStr || typeof urlStr !== 'string' || urlStr.trim() === '') {
      return { valid: false, error: 'URL is required and cannot be empty' };
    }

    const trimmed = urlStr.trim();

    // 2. Protocol security check
    const lower = trimmed.toLowerCase();
    for (const proto of DANGEROUS_PROTOCOLS) {
      if (lower.startsWith(proto)) {
        return { valid: false, error: 'Dangerous URL protocol rejected: ' + proto };
      }
    }

    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch (err) {
      return { valid: false, error: 'Malformed URL: ' + err.message };
    }

    // Must be https: (or http: only on localhost/testing)
    if (parsed.protocol !== 'https:') {
      if (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
        // Allowed only for local test harness
      } else {
        return { valid: false, error: 'Insecure URL protocol: expected https: but got ' + parsed.protocol };
      }
    }

    // 3. Provider Domain Allowlist Check
    const domainCheck = this.validateProviderDomain(parsed.hostname, providerName);
    if (!domainCheck.valid) {
      return { valid: false, error: domainCheck.error };
    }

    return {
      valid: true,
      parsedUrl: parsed,
      normalizedUrl: parsed.toString(),
    };
  }

  /**
   * Check if a hostname belongs to the authorized domains for a given provider.
   * @param {string} hostname - Parsed hostname (e.g. "airindiaexpress.com")
   * @param {string} providerName - Provider identifier (e.g. "Air India Express")
   * @returns {{ valid: boolean, error?: string }}
   */
  validateProviderDomain(hostname, providerName) {
    if (!hostname) {
      return { valid: false, error: 'Missing hostname in URL' };
    }

    const host = hostname.toLowerCase();

    // Allow generic demo sandbox domains in demo mode
    for (const demoDom of DEMO_DOMAINS) {
      if (host === demoDom || host.endsWith('.' + demoDom)) {
        return { valid: true };
      }
    }

    if (!providerName || typeof providerName !== 'string') {
      return { valid: false, error: 'Provider name is required for domain verification' };
    }

    const normProvider = providerName.trim().toLowerCase();

    // Lookup provider allowed domains
    let allowedDomains = PROVIDER_DOMAINS[normProvider];
    if (!allowedDomains) {
      // Check partial matches (e.g. "air india" in "air india express")
      for (const [pKey, dList] of Object.entries(PROVIDER_DOMAINS)) {
        if (normProvider.includes(pKey) || pKey.includes(normProvider)) {
          allowedDomains = dList;
          break;
        }
      }
    }

    if (!allowedDomains || allowedDomains.length === 0) {
      return {
        valid: false,
        error: 'Provider "' + providerName + '" is not recognized in authorized domain registry',
      };
    }

    const isMatch = allowedDomains.some(
      (d) => host === d.toLowerCase() || host.endsWith('.' + d.toLowerCase())
    );

    if (!isMatch) {
      return {
        valid: false,
        error: 'Hostname "' + host + '" does not belong to authorized domains for provider "' + providerName + '"',
      };
    }

    return { valid: true };
  }
}

module.exports = new DeeplinkValidator();
