/**
 * TugasKu - Audit Log & Session Security Tracker
 * Records administrative events (login, bulk delete, moves, imports, backups, restores)
 * Meets RPD Section 8 requirements.
 */

const AuditLogger = {
  /**
   * Log administrative action
   */
  async log(action, details, userObj = null) {
    try {
      const activeUser = userObj || (window.authManager ? window.authManager.getCurrentUser() : null);
      const username = activeUser ? activeUser.username : "System";
      const role = activeUser ? activeUser.role : "system";

      const entry = {
        id: "aud_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
        timestamp: new Date().toISOString(),
        user: username,
        role: role,
        action: action,
        details: details,
        userAgent: navigator.userAgent.substring(0, 80)
      };

      // Retrieve current logs
      let logs = [];
      try {
        const stored = localStorage.getItem(APP_CONFIG.KEYS.AUDIT);
        if (stored) logs = JSON.parse(stored);
      } catch (e) {}

      logs.unshift(entry);
      // Cap at 500 latest entries
      if (logs.length > 500) logs = logs.slice(0, 500);

      localStorage.setItem(APP_CONFIG.KEYS.AUDIT, JSON.stringify(logs));

      // Asynchronously push to GitHub if connected
      if (window.githubBackend && window.githubBackend.isConfigured()) {
        window.githubBackend.putFile(
          "data/audit_log.json",
          logs,
          `Audit: ${action} oleh ${username}`
        ).catch(err => console.warn("[AuditLogger] Background sync failed:", err));
      }

      return entry;
    } catch (e) {
      console.warn("Audit logging error:", e);
    }
  },

  /**
   * Get all audit logs
   */
  getLogs() {
    try {
      const stored = localStorage.getItem(APP_CONFIG.KEYS.AUDIT);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }
};

window.AuditLogger = AuditLogger;
