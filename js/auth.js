/**
 * TugasKu - Authentication & Security Manager
 * Implements RPD Section 3.1 & 8: Single login gate, generic errors, 5-attempt brute-force protection,
 * role validation, and password change utilities.
 */

class AuthManager {
  constructor() {
    this.currentUser = this.loadSession();
  }

  /**
   * Load active user from sessionStorage
   */
  loadSession() {
    try {
      const raw = sessionStorage.getItem(APP_CONFIG.KEYS.SESSION);
      if (raw) {
        const session = JSON.parse(raw);
        // Expiration check (8 hours)
        if (session.expiresAt && new Date() > new Date(session.expiresAt)) {
          this.logout();
          return null;
        }
        return session.user;
      }
    } catch (e) {
      console.warn("Failed to load session:", e);
    }
    return null;
  }

  /**
   * Get current authenticated user
   */
  getCurrentUser() {
    return this.currentUser;
  }

  /**
   * Check if user is admin
   */
  isAdmin() {
    return this.currentUser && this.currentUser.role === 'admin';
  }

  /**
   * Check if user is student
   */
  isStudent() {
    return this.currentUser && this.currentUser.role === 'murid';
  }

  /**
   * Check brute-force lockout status (5 failed attempts -> 5 min lockout)
   */
  getLockoutStatus() {
    try {
      const raw = localStorage.getItem(APP_CONFIG.KEYS.LOGIN_ATTEMPTS);
      if (!raw) return { locked: false, attempts: 0, remainingMs: 0 };

      const data = JSON.parse(raw);
      const now = Date.now();

      if (data.lockoutUntil && now < data.lockoutUntil) {
        return {
          locked: true,
          attempts: data.attempts,
          remainingMs: data.lockoutUntil - now
        };
      }

      // If lockout period expired, reset attempts
      if (data.lockoutUntil && now >= data.lockoutUntil) {
        localStorage.removeItem(APP_CONFIG.KEYS.LOGIN_ATTEMPTS);
        return { locked: false, attempts: 0, remainingMs: 0 };
      }

      return {
        locked: false,
        attempts: data.attempts || 0,
        remainingMs: 0
      };
    } catch (e) {
      return { locked: false, attempts: 0, remainingMs: 0 };
    }
  }

  /**
   * Record a failed login attempt
   */
  recordFailedAttempt() {
    try {
      const current = this.getLockoutStatus();
      const newAttempts = current.attempts + 1;
      const now = Date.now();
      let lockoutUntil = null;

      if (newAttempts >= APP_CONFIG.LIMITS.MAX_LOGIN_ATTEMPTS) {
        lockoutUntil = now + APP_CONFIG.LIMITS.LOCKOUT_DURATION_MS;
      }

      localStorage.setItem(APP_CONFIG.KEYS.LOGIN_ATTEMPTS, JSON.stringify({
        attempts: newAttempts,
        lastAttempt: now,
        lockoutUntil: lockoutUntil
      }));

      return {
        locked: !!lockoutUntil,
        attempts: newAttempts,
        remainingAttempts: Math.max(0, APP_CONFIG.LIMITS.MAX_LOGIN_ATTEMPTS - newAttempts),
        lockoutUntil: lockoutUntil
      };
    } catch (e) {
      return { locked: false, attempts: 1, remainingAttempts: 4 };
    }
  }

  /**
   * Reset failed attempts after successful login
   */
  resetFailedAttempts() {
    try {
      localStorage.removeItem(APP_CONFIG.KEYS.LOGIN_ATTEMPTS);
    } catch (e) {}
  }

  /**
   * Authenticate user with username and password
   */
  async login(username, password) {
    // 1. Check brute force lockout
    const lockout = this.getLockoutStatus();
    if (lockout.locked) {
      const remainingSeconds = Math.ceil(lockout.remainingMs / 1000);
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      throw new Error(`Terlalu banyak percobaan gagal. Akses dikunci sementara. Silakan tunggu ${minutes} menit ${seconds} detik.`);
    }

    const cleanUsername = (username || "").trim();
    const cleanPassword = (password || "").trim();

    if (!cleanUsername || !cleanPassword) {
      this.recordFailedAttempt();
      // RPD 3.1: Pesan galat generik
      throw new Error("Username atau kata sandi salah.");
    }

    const user = window.storageManager.getUserByUsername(cleanUsername);
    if (!user) {
      this.recordFailedAttempt();
      throw new Error("Username atau kata sandi salah.");
    }

    // 2. Check active status
    if (user.status === 'nonaktif') {
      throw new Error("Akun ini telah dinonaktifkan oleh administrator. Silakan hubungi guru pengampu.");
    }

    // 3. Verify password hash with salt
    const isValid = await CryptoUtils.verifyPassword(cleanPassword, user.password_hash, user.salt);
    if (!isValid) {
      const attemptResult = this.recordFailedAttempt();
      if (attemptResult.locked) {
        throw new Error("5 kali percobaan salah. Akses Anda ditangguhkan selama 5 menit demi keamanan sistem.");
      }
      throw new Error("Username atau kata sandi salah.");
    }

    // 4. Login successful: reset attempts, create session
    this.resetFailedAttempts();

    const sessionData = {
      user: {
        id: user.id,
        nama: user.nama,
        username: user.username,
        role: user.role,
        kelas_id: user.kelas_id,
        no_absen: user.no_absen
      },
      token: CryptoUtils.generateId("ses"),
      expiresAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString() // 8 hours
    };

    sessionStorage.setItem(APP_CONFIG.KEYS.SESSION, JSON.stringify(sessionData));
    this.currentUser = sessionData.user;

    await AuditLogger.log("LOGIN_SUCCESS", `Login berhasil: ${user.nama} (${user.role})`, user);
    return this.currentUser;
  }

  /**
   * Check if current admin is still using default password "123456"
   */
  async isDefaultAdminPassword() {
    if (!this.isAdmin()) return false;
    const adminUser = window.storageManager.getUserById(this.currentUser.id);
    if (!adminUser) return false;
    return CryptoUtils.verifyPassword("123456", adminUser.password_hash, adminUser.salt);
  }

  /**
   * Change current user's password
   */
  async changePassword(oldPassword, newPassword, confirmPassword) {
    if (!this.currentUser) throw new Error("Sesi telah berakhir. Silakan login kembali.");

    const cleanOld = (oldPassword || "").trim();
    const cleanNew = (newPassword || "").trim();
    const cleanConfirm = (confirmPassword || "").trim();

    if (!cleanOld || !cleanNew) {
      throw new Error("Kata sandi lama dan baru wajib diisi.");
    }

    if (cleanNew.length < 6) {
      throw new Error("Kata sandi baru minimal terdiri dari 6 karakter.");
    }

    if (cleanNew !== cleanConfirm) {
      throw new Error("Konfirmasi kata sandi baru tidak cocok.");
    }

    const fullUser = window.storageManager.getUserById(this.currentUser.id);
    if (!fullUser) throw new Error("Akun pengguna tidak ditemukan.");

    const isValid = await CryptoUtils.verifyPassword(cleanOld, fullUser.password_hash, fullUser.salt);
    if (!isValid) {
      throw new Error("Kata sandi lama yang Anda masukkan tidak sesuai.");
    }

    const newSalt = CryptoUtils.generateSalt();
    const newHash = await CryptoUtils.hashPassword(cleanNew, newSalt);

    fullUser.password_hash = newHash;
    fullUser.salt = newSalt;
    fullUser.updated_at = new Date().toISOString();

    await window.storageManager.updateStudent(fullUser.id, {
      password: cleanNew
    });

    await AuditLogger.log("CHANGE_PASSWORD", `Perubahan kata sandi untuk akun: ${fullUser.username}`);
    return true;
  }

  /**
   * Log out active session
   */
  logout() {
    if (this.currentUser) {
      AuditLogger.log("LOGOUT", `Pengguna keluar: ${this.currentUser.username}`);
    }
    sessionStorage.removeItem(APP_CONFIG.KEYS.SESSION);
    this.currentUser = null;
  }
}

window.authManager = new AuthManager();
