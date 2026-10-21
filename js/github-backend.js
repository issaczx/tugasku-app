/**
 * TugasKu - Direct GitHub REST API Backend
 * Pure client-side backend communicating directly with GitHub API without Cloudflare or proxies.
 * Handles Git SHA concurrency, conflict auto-retries, rate-limiting telemetry, and automated repo initialization.
 */

class GitHubBackend {
  constructor() {
    this.baseUrl = "https://api.github.com";
    this.config = this.loadConfig();
    this.rateLimit = {
      limit: 5000,
      remaining: 5000,
      reset: null
    };
    this.cacheSha = new Map(); // path -> sha
  }

  /**
   * Load saved GitHub connection credentials from LocalStorage
   */
  loadConfig() {
    try {
      const saved = localStorage.getItem(APP_CONFIG.GITHUB_CONFIG_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Failed to load GitHub config:", e);
    }
    return {
      owner: "",
      repo: "",
      branch: "main",
      token: "",
      connected: false
    };
  }

  /**
   * Save GitHub connection configuration
   */
  saveConfig(cfg) {
    this.config = {
      ...this.config,
      ...cfg,
      owner: (cfg.owner || "").trim(),
      repo: (cfg.repo || "").trim(),
      branch: (cfg.branch || "main").trim(),
      token: (cfg.token || "").trim()
    };
    try {
      localStorage.setItem(APP_CONFIG.GITHUB_CONFIG_STORAGE_KEY, JSON.stringify(this.config));
    } catch (e) {
      console.error("Failed to save GitHub config to localStorage:", e);
    }
  }

  /**
   * Check if GitHub credentials are configured
   */
  isConfigured() {
    return !!(this.config.owner && this.config.repo && this.config.token);
  }

  /**
   * Update internal rate limit state from response headers
   */
  updateRateLimits(headers) {
    const limit = headers.get("x-ratelimit-limit");
    const remaining = headers.get("x-ratelimit-remaining");
    const reset = headers.get("x-ratelimit-reset");

    if (limit) this.rateLimit.limit = parseInt(limit, 10);
    if (remaining) this.rateLimit.remaining = parseInt(remaining, 10);
    if (reset) this.rateLimit.reset = new Date(parseInt(reset, 10) * 1000);
  }

  /**
   * Get common request headers
   */
  getHeaders() {
    const headers = {
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json"
    };
    if (this.config.token) {
      headers["Authorization"] = `Bearer ${this.config.token}`;
    }
    return headers;
  }

  /**
   * Test connection to GitHub repository
   */
  async testConnection(customConfig = null) {
    const cfg = customConfig || this.config;
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      return { success: false, message: "Kredensial repositori belum lengkap (Owner, Repo, Token wajib diisi)." };
    }

    try {
      const url = `${this.baseUrl}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "Authorization": `Bearer ${cfg.token}`
        }
      });

      this.updateRateLimits(response.headers);

      if (response.status === 200) {
        const repoData = await response.json();
        const branchCheck = await this.checkBranch(cfg);
        
        return {
          success: true,
          message: `Berhasil terhubung ke repositori ${repoData.full_name} (${repoData.private ? "Privat" : "Publik"})`,
          data: repoData,
          branchOk: branchCheck.success
        };
      } else if (response.status === 401) {
        return { success: false, message: "Token GitHub tidak valid atau telah kedaluwarsa (401 Unauthorized)." };
      } else if (response.status === 404) {
        return { success: false, message: `Repositori ${cfg.owner}/${cfg.repo} tidak ditemukan atau Token tidak memiliki hak akses baca/tulis.` };
      } else {
        const err = await response.json().catch(() => ({}));
        return { success: false, message: `Galat GitHub API (${response.status}): ${err.message || response.statusText}` };
      }
    } catch (e) {
      return { success: false, message: `Gagal menghubungi server GitHub: ${e.message}. Pastikan koneksi internet aktif.` };
    }
  }

  /**
   * Check if branch exists
   */
  async checkBranch(cfg = null) {
    const config = cfg || this.config;
    const branch = config.branch || "main";
    try {
      const url = `${this.baseUrl}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/branches/${encodeURIComponent(branch)}`;
      const res = await fetch(url, {
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "Authorization": `Bearer ${config.token}`
        }
      });
      if (res.status === 200) return { success: true };
      return { success: false, message: `Branch '${branch}' belum ada.` };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  /**
   * Get file content from GitHub repository
   */
  async getFile(path) {
    if (!this.isConfigured()) {
      throw new Error("GitHub backend belum dikonfigurasi.");
    }

    const cleanPath = path.replace(/^\/+/, '');
    const url = `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}/contents/${cleanPath}?ref=${encodeURIComponent(this.config.branch)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders()
    });

    this.updateRateLimits(response.headers);

    if (response.status === 404) {
      return { exists: false, content: null, sha: null, path: cleanPath };
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`GitHub getFile [${cleanPath}] gagal (${response.status}): ${err.message || response.statusText}`);
    }

    const data = await response.json();
    this.cacheSha.set(cleanPath, data.sha);

    // Decode base64 content
    let rawText = "";
    if (data.content) {
      rawText = CryptoUtils.base64ToUtf8(data.content);
    }

    let parsed = rawText;
    if (cleanPath.endsWith('.json')) {
      try {
        parsed = JSON.parse(rawText);
      } catch (e) {
        parsed = rawText;
      }
    }

    return {
      exists: true,
      content: parsed,
      raw: rawText,
      sha: data.sha,
      path: cleanPath
    };
  }

  /**
   * Put (create or update) file on GitHub with auto-retry on 409 conflict
   */
  async putFile(path, content, commitMessage = "Update data", existingSha = null, retryCount = 0) {
    if (!this.isConfigured()) {
      throw new Error("GitHub backend belum dikonfigurasi.");
    }

    const cleanPath = path.replace(/^\/+/, '');
    let sha = existingSha || this.cacheSha.get(cleanPath);

    // If SHA not known, try to fetch current SHA
    if (!sha) {
      const check = await this.getFile(cleanPath);
      if (check.exists) {
        sha = check.sha;
      }
    }

    // Prepare content base64
    let contentString = typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content);
    let base64Content = CryptoUtils.utf8ToBase64(contentString);

    const body = {
      message: commitMessage,
      content: base64Content,
      branch: this.config.branch
    };

    if (sha) {
      body.sha = sha;
    }

    const url = `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}/contents/${cleanPath}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });

    this.updateRateLimits(response.headers);

    // Conflict detection (HTTP 409 Conflict - SHA mismatch due to concurrent commit)
    if (response.status === 409 && retryCount < 3) {
      console.warn(`[GitHubBackend] SHA conflict pada ${cleanPath}. Mengambil ulang SHA dan mencoba kembali (Percobaan ${retryCount + 1})...`);
      // Wait a short jittered delay
      await new Promise(r => setTimeout(r, 400 * (retryCount + 1)));
      const latest = await this.getFile(cleanPath);
      return this.putFile(path, content, commitMessage, latest.sha, retryCount + 1);
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`GitHub putFile [${cleanPath}] gagal (${response.status}): ${err.message || response.statusText}`);
    }

    const result = await response.json();
    if (result.content && result.content.sha) {
      this.cacheSha.set(cleanPath, result.content.sha);
    }

    return {
      success: true,
      commit: result.commit,
      content: result.content
    };
  }

  /**
   * Delete file on GitHub
   */
  async deleteFile(path, commitMessage = "Delete file", existingSha = null) {
    if (!this.isConfigured()) {
      throw new Error("GitHub backend belum dikonfigurasi.");
    }

    const cleanPath = path.replace(/^\/+/, '');
    let sha = existingSha || this.cacheSha.get(cleanPath);

    if (!sha) {
      const check = await this.getFile(cleanPath);
      if (!check.exists) return { success: true, message: "File already deleted." };
      sha = check.sha;
    }

    const body = {
      message: commitMessage,
      sha: sha,
      branch: this.config.branch
    };

    const url = `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}/contents/${cleanPath}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });

    this.updateRateLimits(response.headers);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`GitHub deleteFile [${cleanPath}] gagal (${response.status}): ${err.message || response.statusText}`);
    }

    this.cacheSha.delete(cleanPath);
    return { success: true };
  }

  /**
   * Upload binary/base64 image directly to GitHub /uploads/ directory
   */
  async uploadImage(path, pureBase64, commitMessage = "Upload submission image") {
    if (!this.isConfigured()) {
      throw new Error("GitHub backend belum dikonfigurasi.");
    }

    const cleanPath = path.replace(/^\/+/, '');
    
    // Check if file exists
    let sha = null;
    const check = await this.getFile(cleanPath).catch(() => ({ exists: false }));
    if (check.exists) {
      sha = check.sha;
    }

    const body = {
      message: commitMessage,
      content: pureBase64,
      branch: this.config.branch
    };
    if (sha) body.sha = sha;

    const url = `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}/contents/${cleanPath}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });

    this.updateRateLimits(response.headers);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Gagal upload gambar ke GitHub [${cleanPath}]: ${err.message || response.statusText}`);
    }

    const result = await response.json();
    return {
      success: true,
      download_url: result.content.download_url,
      path: cleanPath
    };
  }

  /**
   * Automated 1-Click Database Initialization on GitHub
   * Ensures zero dummy data, compliant with RPD section 4.3 & 7
   */
  async initRepositoryStructure(initialAdminPassword = "admin") {
    if (!this.isConfigured()) {
      throw new Error("Kredensial GitHub belum lengkap.");
    }

    const results = [];

    // 1. /data/config.json
    const configCheck = await this.getFile("data/config.json");
    if (!configCheck.exists) {
      const initConfig = {
        ...APP_CONFIG.DEFAULT_PROFILE,
        version: APP_CONFIG.SCHEMA_VERSION,
        created_at: new Date().toISOString()
      };
      await this.putFile("data/config.json", initConfig, "Init: Konfigurasi Profil Madrasah");
      results.push("Dibuat: data/config.json");
    } else {
      results.push("Sudah ada: data/config.json");
    }

    // 2. /data/kelas.json
    const kelasCheck = await this.getFile("data/kelas.json");
    if (!kelasCheck.exists) {
      await this.putFile("data/kelas.json", [], "Init: Koleksi Kelas (Kosong)");
      results.push("Dibuat: data/kelas.json");
    } else {
      results.push("Sudah ada: data/kelas.json");
    }

    // 3. /data/users.json
    const usersCheck = await this.getFile("data/users.json");
    if (!usersCheck.exists) {
      // Create initial admin account (username: admin, default salt + hash)
      const salt = CryptoUtils.generateSalt();
      const passwordHash = await CryptoUtils.hashPassword("123456", salt);
      const defaultAdmin = [{
        id: "usr_admin_" + Date.now(),
        nama: "Administrator Madrasah",
        username: "admin",
        password_hash: passwordHash,
        salt: salt,
        role: "admin",
        status: "aktif",
        created_at: new Date().toISOString()
      }];
      await this.putFile("data/users.json", defaultAdmin, "Init: Inisialisasi Akun Admin Default");
      results.push("Dibuat: data/users.json (Akun default admin terinisialisasi)");
    } else {
      results.push("Sudah ada: data/users.json");
    }

    // 4. /data/tugas.json
    const tugasCheck = await this.getFile("data/tugas.json");
    if (!tugasCheck.exists) {
      await this.putFile("data/tugas.json", [], "Init: Koleksi Instrumen Tugas (Kosong)");
      results.push("Dibuat: data/tugas.json");
    } else {
      results.push("Sudah ada: data/tugas.json");
    }

    // 5. /data/audit_log.json
    const auditCheck = await this.getFile("data/audit_log.json");
    if (!auditCheck.exists) {
      const initAudit = [{
        id: "aud_" + Date.now(),
        timestamp: new Date().toISOString(),
        user: "System",
        role: "admin",
        action: "INIT_DATABASE",
        details: "Inisialisasi repositori GitHub backend TugasKu v2.0"
      }];
      await this.putFile("data/audit_log.json", initAudit, "Init: Berkas Log Audit Sistem");
      results.push("Dibuat: data/audit_log.json");
    } else {
      results.push("Sudah ada: data/audit_log.json");
    }

    return {
      success: true,
      message: "Struktur repositori GitHub berhasil disiapkan!",
      log: results
    };
  }
}

window.githubBackend = new GitHubBackend();
