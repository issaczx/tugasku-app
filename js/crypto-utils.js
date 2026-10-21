/**
 * TugasKu - Cryptographic & Encoding Utilities
 * Secure hashing (PBKDF2/SHA-256 + Salt) via Web Crypto API
 * UTF-8 Safe Base64 Encoding for GitHub REST API
 */

const CryptoUtils = {
  /**
   * Generate cryptographic random salt (hex string)
   */
  generateSalt(length = 16) {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  },

  /**
   * Hash password with PBKDF2 using SHA-256 and salt
   */
  async hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const passwordKey = await window.crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );

    const saltBuffer = encoder.encode(salt);
    const derivedBits = await window.crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltBuffer,
        iterations: 20000,
        hash: "SHA-256"
      },
      passwordKey,
      256
    );

    const hashArray = Array.from(new Uint8Array(derivedBits));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /**
   * Verify password against stored hash and salt
   */
  async verifyPassword(password, storedHash, salt) {
    if (!password || !storedHash || !salt) return false;
    const computedHash = await this.hashPassword(password, salt);
    return computedHash === storedHash;
  },

  /**
   * Generate UUID v4
   */
  generateId(prefix = '') {
    if (window.crypto && window.crypto.randomUUID) {
      return prefix ? `${prefix}_${window.crypto.randomUUID()}` : window.crypto.randomUUID();
    }
    const rand = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    return prefix ? `${prefix}_${rand}` : rand;
  },

  /**
   * UTF-8 Safe string to Base64 (Essential for GitHub API)
   */
  utf8ToBase64(str) {
    return window.btoa(unescape(encodeURIComponent(str)));
  },

  /**
   * Base64 to UTF-8 Safe string (Essential for GitHub API)
   */
  base64ToUtf8(b64) {
    // Strip possible whitespace/newlines in base64 string
    const cleaned = b64.replace(/\s/g, '');
    return decodeURIComponent(escape(window.atob(cleaned)));
  },

  /**
   * Simple SHA-256 hex string generator for idempotency & integrity
   */
  async sha256(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
};

window.CryptoUtils = CryptoUtils;
