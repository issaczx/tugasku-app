/**
 * TugasKu - Unified Storage & Database Manager
 * Orchestrates GitHub Direct Backend and LocalStorage Cache
 * Enforces RPD Section 4.1 Anti Data Ganda, Business Rules (Section 9), and Atomic Operations.
 */

class StorageManager {
  constructor() {
    this.memoryCache = {
      config: null,
      kelas: [],
      users: [],
      tugas: [],
      kirimanMap: new Map(), // tugas_id -> Array of submissions
      audit: []
    };
    this.isSyncing = false;
    this.lastSyncTime = null;
  }

  /**
   * Initialize local cache and seed default admin if empty
   */
  async init() {
    // 1. Load config
    const localConfig = this.getLocalStorage(APP_CONFIG.KEYS.CONFIG);
    if (localConfig) {
      this.memoryCache.config = localConfig;
    } else {
      this.memoryCache.config = {
        ...APP_CONFIG.DEFAULT_PROFILE,
        version: APP_CONFIG.SCHEMA_VERSION,
        created_at: new Date().toISOString()
      };
      this.setLocalStorage(APP_CONFIG.KEYS.CONFIG, this.memoryCache.config);
    }

    // 2. Load classes
    this.memoryCache.kelas = this.getLocalStorage(APP_CONFIG.KEYS.KELAS, []);

    // 3. Load users
    let users = this.getLocalStorage(APP_CONFIG.KEYS.USERS, []);
    // RPD 4.3: Ensure default admin exists if empty
    if (users.length === 0) {
      const salt = CryptoUtils.generateSalt();
      const defaultPasswordHash = await CryptoUtils.hashPassword("123456", salt);
      const defaultAdmin = {
        id: "usr_admin_default",
        nama: "Administrator Madrasah",
        username: "admin",
        password_hash: defaultPasswordHash,
        salt: salt,
        role: "admin",
        status: "aktif",
        created_at: new Date().toISOString()
      };
      users = [defaultAdmin];
      this.setLocalStorage(APP_CONFIG.KEYS.USERS, users);
    }
    this.memoryCache.users = users;

    // 4. Load tasks
    this.memoryCache.tugas = this.getLocalStorage(APP_CONFIG.KEYS.TUGAS, []);

    // 5. Try syncing with GitHub if configured
    if (window.githubBackend && window.githubBackend.isConfigured()) {
      this.syncWithGitHub().catch(err => {
        console.warn("[StorageManager] Initial GitHub sync warning:", err);
      });
    }

    return true;
  }

  // --- LocalStorage Helpers ---
  getLocalStorage(key, defaultValue = null) {
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : defaultValue;
    } catch (e) {
      console.error(`Error reading ${key}:`, e);
      return defaultValue;
    }
  }

  setLocalStorage(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.error(`Error saving ${key}:`, e);
    }
  }

  // =========================================================================
  // GITHUB DIRECT SYNCHRONIZATION
  // =========================================================================

  /**
   * Bi-directional synchronization with GitHub REST API
   */
  async syncWithGitHub(forcePush = false) {
    if (!window.githubBackend || !window.githubBackend.isConfigured()) {
      return { success: false, message: "Kredensial GitHub belum diatur." };
    }

    this.isSyncing = true;
    try {
      // 1. Fetch Config
      const remoteConfig = await window.githubBackend.getFile("data/config.json");
      if (remoteConfig.exists && !forcePush) {
        this.memoryCache.config = remoteConfig.content;
        this.setLocalStorage(APP_CONFIG.KEYS.CONFIG, this.memoryCache.config);
      } else {
        await window.githubBackend.putFile("data/config.json", this.memoryCache.config, "Sync: Config");
      }

      // 2. Fetch Kelas
      const remoteKelas = await window.githubBackend.getFile("data/kelas.json");
      if (remoteKelas.exists && !forcePush) {
        this.memoryCache.kelas = remoteKelas.content || [];
        this.setLocalStorage(APP_CONFIG.KEYS.KELAS, this.memoryCache.kelas);
      } else {
        await window.githubBackend.putFile("data/kelas.json", this.memoryCache.kelas, "Sync: Kelas");
      }

      // 3. Fetch Users
      const remoteUsers = await window.githubBackend.getFile("data/users.json");
      if (remoteUsers.exists && !forcePush) {
        this.memoryCache.users = remoteUsers.content || [];
        this.setLocalStorage(APP_CONFIG.KEYS.USERS, this.memoryCache.users);
      } else {
        await window.githubBackend.putFile("data/users.json", this.memoryCache.users, "Sync: Users");
      }

      // 4. Fetch Tugas
      const remoteTugas = await window.githubBackend.getFile("data/tugas.json");
      if (remoteTugas.exists && !forcePush) {
        this.memoryCache.tugas = remoteTugas.content || [];
        this.setLocalStorage(APP_CONFIG.KEYS.TUGAS, this.memoryCache.tugas);
      } else {
        await window.githubBackend.putFile("data/tugas.json", this.memoryCache.tugas, "Sync: Tugas");
      }

      // 5. Preload Kiriman for active tasks
      for (const t of this.memoryCache.tugas) {
        const filePath = `data/kiriman/${t.id}.json`;
        const remoteKiriman = await window.githubBackend.getFile(filePath);
        if (remoteKiriman.exists && !forcePush) {
          this.memoryCache.kirimanMap.set(t.id, remoteKiriman.content || []);
          this.setLocalStorage(`${APP_CONFIG.KEYS.KIRIMAN}_${t.id}`, remoteKiriman.content || []);
        } else {
          const localK = this.getLocalStorage(`${APP_CONFIG.KEYS.KIRIMAN}_${t.id}`, []);
          this.memoryCache.kirimanMap.set(t.id, localK);
          if (localK.length > 0) {
            await window.githubBackend.putFile(filePath, localK, `Sync: Kiriman ${t.id}`);
          }
        }
      }

      this.lastSyncTime = new Date();
      this.isSyncing = false;
      return {
        success: true,
        message: "Data berhasil disinkronkan dengan repositori GitHub!",
        timestamp: this.lastSyncTime
      };
    } catch (e) {
      this.isSyncing = false;
      console.error("[StorageManager] GitHub sync error:", e);
      return { success: false, message: e.message };
    }
  }

  // =========================================================================
  // PROFIL MADRASAH (CONFIG)
  // =========================================================================
  getConfig() {
    return this.memoryCache.config || APP_CONFIG.DEFAULT_PROFILE;
  }

  async updateConfig(newConfig) {
    this.memoryCache.config = {
      ...this.memoryCache.config,
      ...newConfig,
      updated_at: new Date().toISOString()
    };
    this.setLocalStorage(APP_CONFIG.KEYS.CONFIG, this.memoryCache.config);

    if (window.githubBackend && window.githubBackend.isConfigured()) {
      window.githubBackend.putFile("data/config.json", this.memoryCache.config, "Admin: Perbarui Profil Madrasah")
        .catch(err => console.warn("GitHub save config warning:", err));
    }
    await AuditLogger.log("UPDATE_CONFIG", "Pembaruan identitas profil madrasah");
    return this.memoryCache.config;
  }

  // =========================================================================
  // KELAS (ROMBEL) CRUD & ANTI-DUPLICATE
  // =========================================================================
  getKelas() {
    return [...this.memoryCache.kelas];
  }

  getKelasById(id) {
    return this.memoryCache.kelas.find(k => k.id === id);
  }

  async addKelas(namaKelas) {
    const trimmed = (namaKelas || "").trim();
    if (!trimmed) {
      throw new Error("Nama rombel/kelas tidak boleh kosong.");
    }

    // RPD 4.1: Kelas unik (tanpa membedakan huruf besar/kecil dan spasi)
    const normalized = trimmed.toLowerCase();
    const exists = this.memoryCache.kelas.some(k => k.nama.toLowerCase().trim() === normalized);
    if (exists) {
      throw new Error(`Kelas "${trimmed}" sudah ada di database.`);
    }

    const newKelas = {
      id: "kls_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      nama: trimmed,
      created_at: new Date().toISOString()
    };

    this.memoryCache.kelas.push(newKelas);
    this.setLocalStorage(APP_CONFIG.KEYS.KELAS, this.memoryCache.kelas);

    if (window.githubBackend && window.githubBackend.isConfigured()) {
      window.githubBackend.putFile("data/kelas.json", this.memoryCache.kelas, `Admin: Tambah Kelas ${trimmed}`)
        .catch(err => console.warn("GitHub save kelas warning:", err));
    }

    await AuditLogger.log("ADD_KELAS", `Menambah kelas baru: ${trimmed}`);
    return newKelas;
  }

  async updateKelas(id, newNama) {
    const trimmed = (newNama || "").trim();
    if (!trimmed) throw new Error("Nama rombel/kelas tidak boleh kosong.");

    const normalized = trimmed.toLowerCase();
    const duplicate = this.memoryCache.kelas.some(k => k.id !== id && k.nama.toLowerCase().trim() === normalized);
    if (duplicate) {
      throw new Error(`Nama kelas "${trimmed}" sudah digunakan rombel lain.`);
    }

    const index = this.memoryCache.kelas.findIndex(k => k.id === id);
    if (index === -1) throw new Error("Kelas tidak ditemukan.");

    const oldNama = this.memoryCache.kelas[index].nama;
    this.memoryCache.kelas[index].nama = trimmed;
    this.memoryCache.kelas[index].updated_at = new Date().toISOString();

    this.setLocalStorage(APP_CONFIG.KEYS.KELAS, this.memoryCache.kelas);

    if (window.githubBackend && window.githubBackend.isConfigured()) {
      window.githubBackend.putFile("data/kelas.json", this.memoryCache.kelas, `Admin: Ubah Nama Kelas ${oldNama} -> ${trimmed}`)
        .catch(err => console.warn("GitHub save kelas warning:", err));
    }

    await AuditLogger.log("UPDATE_KELAS", `Mengubah nama kelas ${oldNama} menjadi ${trimmed}`);
    return this.memoryCache.kelas[index];
  }

  async deleteKelas(id) {
    // RPD 3.3 a: Menghapus kelas yang masih berisi murid ditolak!
    const studentsInClass = this.memoryCache.users.filter(u => u.kelas_id === id && u.role === 'murid');
    if (studentsInClass.length > 0) {
      throw new Error(`Tidak dapat menghapus kelas ini karena masih memuat ${studentsInClass.length} murid. Silakan pindahkan murid ke kelas lain terlebih dahulu.`);
    }

    const index = this.memoryCache.kelas.findIndex(k => k.id === id);
    if (index === -1) throw new Error("Kelas tidak ditemukan.");

    const deleted = this.memoryCache.kelas.splice(index, 1)[0];
    this.setLocalStorage(APP_CONFIG.KEYS.KELAS, this.memoryCache.kelas);

    if (window.githubBackend && window.githubBackend.isConfigured()) {
      window.githubBackend.putFile("data/kelas.json", this.memoryCache.kelas, `Admin: Hapus Kelas ${deleted.nama}`)
        .catch(err => console.warn("GitHub save kelas warning:", err));
    }

    await AuditLogger.log("DELETE_KELAS", `Menghapus kelas ${deleted.nama}`);
    return deleted;
  }

  // =========================================================================
  // AKUN PENGGUNA (MURID & ADMIN) CRUD & ANTI-DUPLICATE
  // =========================================================================
  getUsers(role = null) {
    if (!role) return [...this.memoryCache.users];
    return this.memoryCache.users.filter(u => u.role === role);
  }

  getUserById(id) {
    return this.memoryCache.users.find(u => u.id === id);
  }

  getUserByUsername(username) {
    if (!username) return null;
    const clean = username.trim().toLowerCase();
    return this.memoryCache.users.find(u => u.username.trim().toLowerCase() === clean);
  }

  async addStudent(data) {
    const nama = (data.nama || "").trim();
    const username = (data.username || "").trim();
    const kelasId = data.kelas_id;
    const noAbsen = parseInt(data.no_absen || 0, 10);
    const plainPassword = (data.password || "123456").trim();

    if (!nama || !username || !kelasId) {
      throw new Error("Nama lengkap, Username (NISN), dan Kelas wajib diisi.");
    }

    // RPD 4.1: Akun murid unik berdasarkan username
    if (this.getUserByUsername(username)) {
      throw new Error(`Username / NISN "${username}" sudah digunakan.`);
    }

    const salt = CryptoUtils.generateSalt();
    const passwordHash = await CryptoUtils.hashPassword(plainPassword, salt);

    const newStudent = {
      id: "usr_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      nama: nama,
      no_absen: noAbsen,
      kelas_id: kelasId,
      username: username,
      password_hash: passwordHash,
      salt: salt,
      role: "murid",
      status: data.status || "aktif",
      created_at: new Date().toISOString()
    };

    this.memoryCache.users.push(newStudent);
    this.setLocalStorage(APP_CONFIG.KEYS.USERS, this.memoryCache.users);

    if (window.githubBackend && window.githubBackend.isConfigured()) {
      window.githubBackend.putFile("data/users.json", this.memoryCache.users, `Admin: Tambah Murid ${nama}`)
        .catch(err => console.warn("GitHub save users warning:", err));
    }

    await AuditLogger.log("ADD_STUDENT", `Menambah murid baru: ${nama} (${username})`);
    return newStudent;
  }

  async updateStudent(id, data) {
    const user = this.getUserById(id);
    if (!user) throw new Error("Akun murid tidak ditemukan.");

    const username = (data.username || user.username).trim();
    if (username.toLowerCase() !== user.username.toLowerCase()) {
      const existing = this.getUserByUsername(username);
      if (existing && existing.id !== id) {
        throw new Error(`Username "${username}" sudah digunakan akun lain.`);
      }
      user.username = username;
    }

    if (data.nama) user.nama = data.nama.trim();
    if (data.kelas_id !== undefined) user.kelas_id = data.kelas_id;
    if (data.no_absen !== undefined) user.no_absen = parseInt(data.no_absen, 10) || 0;
    if (data.status !== undefined) user.status = data.status;

    if (data.password) {
      const salt = CryptoUtils.generateSalt();
      user.password_hash = await CryptoUtils.hashPassword(data.password.trim(), salt);
      user.salt = salt;
    }

    user.updated_at = new Date().toISOString();
    this.setLocalStorage(APP_CONFIG.KEYS.USERS, this.memoryCache.users);

    if (window.githubBackend && window.githubBackend.isConfigured()) {
      window.githubBackend.putFile("data/users.json", this.memoryCache.users, `Admin: Perbarui Murid ${user.nama}`)
        .catch(err => console.warn("GitHub save users warning:", err));
    }

    await AuditLogger.log("UPDATE_STUDENT", `Memperbarui akun murid: ${user.nama}`);
    return user;
  }

  async deleteStudent(id) {
    const user = this.getUserById(id);
    if (!user) throw new Error("Akun murid tidak ditemukan.");
    if (user.role === 'admin') throw new Error("Akun Administrator tidak dapat dihapus.");

    // Delete student submissions across tasks (RPD Section 9.6)
    for (const [tugasId, submissions] of this.memoryCache.kirimanMap.entries()) {
      const filtered = submissions.filter(s => s.user_id !== id);
      if (filtered.length !== submissions.length) {
        this.memoryCache.kirimanMap.set(tugasId, filtered);
        this.setLocalStorage(`${APP_CONFIG.KEYS.KIRIMAN}_${tugasId}`, filtered);
        if (window.githubBackend && window.githubBackend.isConfigured()) {
          window.githubBackend.putFile(`data/kiriman/${tugasId}.json`, filtered, `Hapus kiriman murid ${id}`)
            .catch(() => {});
        }
      }
    }

    const idx = this.memoryCache.users.findIndex(u => u.id === id);
    const deleted = this.memoryCache.users.splice(idx, 1)[0];
    this.setLocalStorage(APP_CONFIG.KEYS.USERS, this.memoryCache.users);

    if (window.githubBackend && window.githubBackend.isConfigured()) {
      window.githubBackend.putFile("data/users.json", this.memoryCache.users, `Admin: Hapus Murid ${deleted.nama}`)
        .catch(err => console.warn("GitHub save users warning:", err));
    }

    await AuditLogger.log("DELETE_STUDENT", `Menghapus akun murid: ${deleted.nama} (${deleted.username})`);
    return deleted;
  }

  // --- Bulk Student Actions (RPD 3.3 a & 4.2) ---
  async bulkMoveClass(userIds, targetClassId) {
    const targetClass = this.getKelasById(targetClassId);
    if (!targetClass) throw new Error("Kelas tujuan tidak ditemukan.");

    let count = 0;
    for (const id of userIds) {
      const user = this.getUserById(id);
      if (user && user.role === 'murid') {
        user.kelas_id = targetClassId;
        user.updated_at = new Date().toISOString();
        count++;
      }
    }

    this.setLocalStorage(APP_CONFIG.KEYS.USERS, this.memoryCache.users);
    if (window.githubBackend && window.githubBackend.isConfigured()) {
      await window.githubBackend.putFile("data/users.json", this.memoryCache.users, `Admin: Pindah ${count} murid ke kelas ${targetClass.nama}`);
    }
    await AuditLogger.log("BULK_MOVE_CLASS", `Memindahkan ${count} murid ke kelas ${targetClass.nama}`);
    return count;
  }

  async bulkResetPassword(userIds, newPassword = "123456") {
    let count = 0;
    for (const id of userIds) {
      const user = this.getUserById(id);
      if (user && user.role === 'murid') {
        const salt = CryptoUtils.generateSalt();
        user.password_hash = await CryptoUtils.hashPassword(newPassword, salt);
        user.salt = salt;
        user.updated_at = new Date().toISOString();
        count++;
      }
    }
    this.setLocalStorage(APP_CONFIG.KEYS.USERS, this.memoryCache.users);
    if (window.githubBackend && window.githubBackend.isConfigured()) {
      await window.githubBackend.putFile("data/users.json", this.memoryCache.users, `Admin: Reset sandi ${count} murid`);
    }
    await AuditLogger.log("BULK_RESET_PASSWORD", `Reset kata sandi ${count} murid`);
    return count;
  }

  async bulkSetStatus(userIds, status = 'aktif') {
    let count = 0;
    for (const id of userIds) {
      const user = this.getUserById(id);
      if (user && user.role === 'murid') {
        user.status = status;
        user.updated_at = new Date().toISOString();
        count++;
      }
    }
    this.setLocalStorage(APP_CONFIG.KEYS.USERS, this.memoryCache.users);
    if (window.githubBackend && window.githubBackend.isConfigured()) {
      await window.githubBackend.putFile("data/users.json", this.memoryCache.users, `Admin: Ubah status ${count} murid jadi ${status}`);
    }
    await AuditLogger.log("BULK_STATUS", `Mengubah status ${count} murid menjadi ${status}`);
    return count;
  }

  async bulkDeleteStudents(userIds) {
    let count = 0;
    for (const id of userIds) {
      const user = this.getUserById(id);
      if (user && user.role === 'murid') {
        await this.deleteStudent(id);
        count++;
      }
    }
    await AuditLogger.log("BULK_DELETE_STUDENTS", `Hapus massal ${count} murid`);
    return count;
  }

  // =========================================================================
  // TUGAS (INSTRUMEN PENILAIAN) CRUD
  // =========================================================================
  getTugas() {
    return [...this.memoryCache.tugas];
  }

  getTugasById(id) {
    return this.memoryCache.tugas.find(t => t.id === id);
  }

  async addTugas(data) {
    const judul = (data.judul || "").trim();
    if (!judul) throw new Error("Judul tugas wajib diisi.");

    if (!data.kelas_ids || data.kelas_ids.length === 0) {
      throw new Error("Pilih minimal satu kelas target.");
    }

    const currentYear = this.getConfig().tahun_pelajaran;

    // RPD 4.1: Anti-duplikat tugas: Judul + kelas + tahun pelajaran
    for (const kId of data.kelas_ids) {
      const dup = this.memoryCache.tugas.some(t => 
        t.judul.toLowerCase().trim() === judul.toLowerCase() &&
        t.kelas_ids.includes(kId) &&
        (t.tahun_pelajaran || currentYear) === currentYear
      );
      if (dup) {
        const kObj = this.getKelasById(kId);
        throw new Error(`Tugas dengan judul "${judul}" sudah ada untuk kelas ${kObj ? kObj.nama : kId} pada tahun ajaran ini.`);
      }
    }

    const newTask = {
      id: "tgs_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      judul: judul,
      deskripsi: (data.deskripsi || "").trim(),
      kelas_ids: data.kelas_ids,
      jenis_bukti: data.jenis_bukti === 'gambar' ? 'gambar' : 'teks', // teks | gambar
      tgl_mulai: data.tgl_mulai || new Date().toISOString(),
      tenggat: data.tenggat || new Date(Date.now() + 7 * 86400000).toISOString(),
      nilai_max: parseInt(data.nilai_max || APP_CONFIG.LIMITS.DEFAULT_MAX_SCORE, 10),
      batas_karakter: parseInt(data.batas_karakter || APP_CONFIG.LIMITS.DEFAULT_MAX_TEXT_CHARS, 10),
      status: data.status || "aktif", // draf | aktif | dikunci
      tahun_pelajaran: currentYear,
      created_at: new Date().toISOString()
    };

    this.memoryCache.tugas.push(newTask);
    this.setLocalStorage(APP_CONFIG.KEYS.TUGAS, this.memoryCache.tugas);

    if (window.githubBackend && window.githubBackend.isConfigured()) {
      window.githubBackend.putFile("data/tugas.json", this.memoryCache.tugas, `Admin: Buat Tugas "${judul}"`)
        .catch(err => console.warn("GitHub save tugas warning:", err));
    }

    await AuditLogger.log("ADD_TUGAS", `Membuat instrumen tugas baru: "${judul}"`);
    return newTask;
  }

  async updateTugas(id, data) {
    const task = this.getTugasById(id);
    if (!task) throw new Error("Tugas tidak ditemukan.");

    // RPD 3.3 b: Jenis bukti tidak dapat diubah setelah ada kiriman masuk!
    const existingSubmissions = await this.getKirimanByTugas(id);
    if (existingSubmissions.length > 0 && data.jenis_bukti && data.jenis_bukti !== task.jenis_bukti) {
      throw new Error("Jenis bukti (Teks/Gambar) tidak dapat diubah karena murid telah mulai mengumpulkan tugas ini.");
    }

    if (data.judul) task.judul = data.judul.trim();
    if (data.deskripsi !== undefined) task.deskripsi = data.deskripsi.trim();
    if (data.kelas_ids) task.kelas_ids = data.kelas_ids;
    if (data.jenis_bukti && existingSubmissions.length === 0) task.jenis_bukti = data.jenis_bukti;
    if (data.tgl_mulai) task.tgl_mulai = data.tgl_mulai;
    if (data.tenggat) task.tenggat = data.tenggat;
    if (data.nilai_max !== undefined) task.nilai_max = parseInt(data.nilai_max, 10);
    if (data.batas_karakter !== undefined) task.batas_karakter = parseInt(data.batas_karakter, 10);
    if (data.status) task.status = data.status;

    task.updated_at = new Date().toISOString();
    this.setLocalStorage(APP_CONFIG.KEYS.TUGAS, this.memoryCache.tugas);

    if (window.githubBackend && window.githubBackend.isConfigured()) {
      window.githubBackend.putFile("data/tugas.json", this.memoryCache.tugas, `Admin: Perbarui Tugas "${task.judul}"`)
        .catch(err => console.warn("GitHub save tugas warning:", err));
    }

    await AuditLogger.log("UPDATE_TUGAS", `Memperbarui tugas: "${task.judul}"`);
    return task;
  }

  async duplicateTugas(id) {
    const task = this.getTugasById(id);
    if (!task) throw new Error("Tugas tidak ditemukan.");

    const cloneData = {
      ...task,
      judul: `${task.judul} (Salinan)`,
      status: "draf"
    };
    delete cloneData.id;
    delete cloneData.created_at;

    return this.addTugas(cloneData);
  }

  async toggleLockTugas(id) {
    const task = this.getTugasById(id);
    if (!task) throw new Error("Tugas tidak ditemukan.");

    task.status = task.status === 'dikunci' ? 'aktif' : 'dikunci';
    task.updated_at = new Date().toISOString();

    this.setLocalStorage(APP_CONFIG.KEYS.TUGAS, this.memoryCache.tugas);

    if (window.githubBackend && window.githubBackend.isConfigured()) {
      window.githubBackend.putFile("data/tugas.json", this.memoryCache.tugas, `Admin: Status Tugas "${task.judul}" -> ${task.status}`)
        .catch(err => console.warn("GitHub save tugas warning:", err));
    }

    await AuditLogger.log("TOGGLE_LOCK_TUGAS", `Mengubah status tugas "${task.judul}" menjadi ${task.status}`);
    return task;
  }

  async deleteTugas(id) {
    const task = this.getTugasById(id);
    if (!task) throw new Error("Tugas tidak ditemukan.");

    // Delete submissions for this task
    this.memoryCache.kirimanMap.delete(id);
    try {
      localStorage.removeItem(`${APP_CONFIG.KEYS.KIRIMAN}_${id}`);
    } catch (e) {}

    const index = this.memoryCache.tugas.findIndex(t => t.id === id);
    const deleted = this.memoryCache.tugas.splice(index, 1)[0];
    this.setLocalStorage(APP_CONFIG.KEYS.TUGAS, this.memoryCache.tugas);

    if (window.githubBackend && window.githubBackend.isConfigured()) {
      window.githubBackend.putFile("data/tugas.json", this.memoryCache.tugas, `Admin: Hapus Tugas "${deleted.judul}"`)
        .catch(err => console.warn("GitHub save tugas warning:", err));
      window.githubBackend.deleteFile(`data/kiriman/${id}.json`, `Hapus kiriman tugas ${deleted.judul}`)
        .catch(() => {});
    }

    await AuditLogger.log("DELETE_TUGAS", `Menghapus tugas: "${deleted.judul}"`);
    return deleted;
  }

  // =========================================================================
  // KIRIMAN TUGAS (SUBMISSIONS & GRADING)
  // =========================================================================

  /**
   * Get all submissions for a task
   */
  async getKirimanByTugas(tugasId) {
    if (this.memoryCache.kirimanMap.has(tugasId)) {
      return [...this.memoryCache.kirimanMap.get(tugasId)];
    }

    // Try local storage
    const local = this.getLocalStorage(`${APP_CONFIG.KEYS.KIRIMAN}_${tugasId}`);
    if (local) {
      this.memoryCache.kirimanMap.set(tugasId, local);
      return [...local];
    }

    // Try GitHub
    if (window.githubBackend && window.githubBackend.isConfigured()) {
      const res = await window.githubBackend.getFile(`data/kiriman/${tugasId}.json`);
      if (res.exists) {
        const list = res.content || [];
        this.memoryCache.kirimanMap.set(tugasId, list);
        this.setLocalStorage(`${APP_CONFIG.KEYS.KIRIMAN}_${tugasId}`, list);
        return [...list];
      }
    }

    return [];
  }

  /**
   * Get single student submission for a task
   */
  async getStudentSubmission(tugasId, studentId) {
    const list = await this.getKirimanByTugas(tugasId);
    return list.find(s => s.user_id === studentId) || null;
  }

  /**
   * Submit or update assignment (RPD 4.1 Anti Data Ganda: 1 submission per student per task)
   */
  async submitTugas(tugasId, studentUser, submissionData) {
    const task = this.getTugasById(tugasId);
    if (!task) throw new Error("Tugas tidak ditemukan.");

    // RPD 9.2: Kiriman tidak dapat dibuat atau diubah setelah tenggat lewat atau tugas dikunci
    if (task.status === 'dikunci') {
      throw new Error("Pengumpulan ditolak: Tugas ini telah dikunci oleh guru.");
    }
    if (task.tenggat && new Date() > new Date(task.tenggat)) {
      throw new Error("Pengumpulan ditolak: Tenggat waktu pengerjaan telah berakhir.");
    }

    const currentList = await this.getKirimanByTugas(tugasId);
    const existingIndex = currentList.findIndex(s => s.user_id === studentUser.id);

    // RPD 5.3: Kiriman tidak dapat diubah bila sudah dinilai
    if (existingIndex !== -1) {
      const existing = currentList[existingIndex];
      if (existing.nilai !== null && existing.nilai !== undefined && existing.nilai !== "") {
        throw new Error("Tugas Anda telah dinilai oleh guru dan tidak dapat diubah lagi.");
      }
    }

    // Validation by proof type
    if (task.jenis_bukti === 'teks') {
      const teks = (submissionData.teks || "").trim();
      if (!teks) throw new Error("Jawaban teks tidak boleh kosong.");
      if (task.batas_karakter && teks.length > task.batas_karakter) {
        throw new Error(`Panjang teks melebihi batas maksimal (${teks.length}/${task.batas_karakter} karakter).`);
      }
    } else if (task.jenis_bukti === 'gambar') {
      const gambarList = submissionData.gambar_list || [];
      if (gambarList.length === 0) {
        throw new Error("Silakan lampirkan minimal 1 foto/gambar hasil tugas.");
      }
      if (gambarList.length > APP_CONFIG.LIMITS.MAX_IMAGES_PER_SUBMISSION) {
        throw new Error(`Maksimal ${APP_CONFIG.LIMITS.MAX_IMAGES_PER_SUBMISSION} gambar diperbolehkan.`);
      }
    }

    const now = new Date().toISOString();
    let savedRecord = null;

    if (existingIndex !== -1) {
      // Update existing submission (RPD 4.1: Kiriman kedua otomatis menjadi ubah)
      const existing = currentList[existingIndex];
      existing.jenis_bukti = task.jenis_bukti;
      existing.teks = submissionData.teks || "";
      existing.gambar_list = submissionData.gambar_list || [];
      existing.updated_at = now;
      // RPD 9.4: Mengubah kiriman yang sudah dinilai mengosongkan status publikasi
      existing.status_publikasi = false;
      savedRecord = existing;
    } else {
      // Create new submission
      savedRecord = {
        id: "sub_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        tugas_id: tugasId,
        user_id: studentUser.id,
        user_nama: studentUser.nama,
        kelas_id: studentUser.kelas_id,
        jenis_bukti: task.jenis_bukti,
        teks: submissionData.teks || "",
        gambar_list: submissionData.gambar_list || [],
        nilai: null,
        catatan_guru: "",
        status_publikasi: false,
        submitted_at: now
      };
      currentList.push(savedRecord);
    }

    this.memoryCache.kirimanMap.set(tugasId, currentList);
    this.setLocalStorage(`${APP_CONFIG.KEYS.KIRIMAN}_${tugasId}`, currentList);

    // Push to GitHub repository asynchronously
    if (window.githubBackend && window.githubBackend.isConfigured()) {
      window.githubBackend.putFile(
        `data/kiriman/${tugasId}.json`,
        currentList,
        `Murid: Kirim Tugas "${task.judul}" (${studentUser.nama})`
      ).catch(err => console.warn("GitHub kiriman sync error:", err));
    }

    await AuditLogger.log("SUBMIT_TUGAS", `Murid ${studentUser.nama} mengumpulkan tugas "${task.judul}"`, studentUser);
    return savedRecord;
  }

  /**
   * Delete submission (RPD 5.4: Delete kiriman selama belum dikunci dan tenggat belum lewat)
   */
  async deleteSubmission(tugasId, studentId) {
    const task = this.getTugasById(tugasId);
    if (!task) throw new Error("Tugas tidak ditemukan.");

    if (task.status === 'dikunci') {
      throw new Error("Tidak dapat menghapus kiriman: Tugas telah dikunci.");
    }
    if (task.tenggat && new Date() > new Date(task.tenggat)) {
      throw new Error("Tidak dapat menghapus kiriman: Tenggat waktu telah berakhir.");
    }

    const currentList = await this.getKirimanByTugas(tugasId);
    const existingIndex = currentList.findIndex(s => s.user_id === studentId);
    if (existingIndex === -1) throw new Error("Kiriman tidak ditemukan.");

    const sub = currentList[existingIndex];
    if (sub.nilai !== null && sub.nilai !== undefined && sub.nilai !== "") {
      throw new Error("Kiriman yang sudah dinilai guru tidak dapat dihapus.");
    }

    currentList.splice(existingIndex, 1);
    this.memoryCache.kirimanMap.set(tugasId, currentList);
    this.setLocalStorage(`${APP_CONFIG.KEYS.KIRIMAN}_${tugasId}`, currentList);

    if (window.githubBackend && window.githubBackend.isConfigured()) {
      window.githubBackend.putFile(
        `data/kiriman/${tugasId}.json`,
        currentList,
        `Murid: Tarik/Hapus Kiriman Tugas ${tugasId}`
      ).catch(() => {});
    }

    await AuditLogger.log("DELETE_SUBMISSION", `Murid menarik kiriman tugas: ${tugasId}`);
    return true;
  }

  /**
   * Teacher saves score and note for a student
   */
  async gradeSubmission(tugasId, studentId, nilai, catatanGuru = "") {
    const task = this.getTugasById(tugasId);
    if (!task) throw new Error("Tugas tidak ditemukan.");

    const scoreNum = Number(nilai);
    if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > task.nilai_max) {
      throw new Error(`Nilai harus berupa angka antara 0 hingga ${task.nilai_max}.`);
    }

    const currentList = await this.getKirimanByTugas(tugasId);
    let sub = currentList.find(s => s.user_id === studentId);

    if (!sub) {
      // RPD: Teacher can record grade even if student submitted offline
      const student = this.getUserById(studentId);
      sub = {
        id: "sub_offline_" + Date.now(),
        tugas_id: tugasId,
        user_id: studentId,
        user_nama: student ? student.nama : "Murid",
        kelas_id: student ? student.kelas_id : "",
        jenis_bukti: task.jenis_bukti,
        teks: "",
        gambar_list: [],
        nilai: scoreNum,
        catatan_guru: catatanGuru.trim(),
        status_publikasi: false,
        submitted_at: new Date().toISOString()
      };
      currentList.push(sub);
    } else {
      sub.nilai = scoreNum;
      sub.catatan_guru = catatanGuru.trim();
      sub.graded_at = new Date().toISOString();
    }

    this.memoryCache.kirimanMap.set(tugasId, currentList);
    this.setLocalStorage(`${APP_CONFIG.KEYS.KIRIMAN}_${tugasId}`, currentList);

    if (window.githubBackend && window.githubBackend.isConfigured()) {
      window.githubBackend.putFile(
        `data/kiriman/${tugasId}.json`,
        currentList,
        `Guru: Menilai Tugas "${task.judul}" (${sub.user_nama}: ${scoreNum})`
      ).catch(err => console.warn("GitHub save grade warning:", err));
    }

    await AuditLogger.log("GRADE_TASK", `Menilai tugas "${task.judul}" murid ${sub.user_nama}: ${scoreNum}`);
    return sub;
  }

  /**
   * Publish or Unpublish grades (RPD 3.3 c & 9.3)
   */
  async setPublicationStatus(tugasId, studentIds, isPublished) {
    const currentList = await this.getKirimanByTugas(tugasId);
    let count = 0;

    for (const sub of currentList) {
      if (studentIds.includes(sub.user_id)) {
        sub.status_publikasi = !!isPublished;
        count++;
      }
    }

    this.memoryCache.kirimanMap.set(tugasId, currentList);
    this.setLocalStorage(`${APP_CONFIG.KEYS.KIRIMAN}_${tugasId}`, currentList);

    if (window.githubBackend && window.githubBackend.isConfigured()) {
      const task = this.getTugasById(tugasId);
      window.githubBackend.putFile(
        `data/kiriman/${tugasId}.json`,
        currentList,
        `Guru: ${isPublished ? "Publikasikan" : "Batal Publikasi"} nilai (${count} murid)`
      ).catch(() => {});
    }

    await AuditLogger.log("PUBLISH_GRADES", `${isPublished ? "Mempublikasikan" : "Membatalkan publikasi"} nilai ${count} murid`);
    return count;
  }

  // =========================================================================
  // BACKUP & RESTORE (RPD SECTION 6)
  // =========================================================================

  /**
   * Generate complete JSON backup
   */
  async createBackup(includeImages = true) {
    const backupData = {
      app: APP_CONFIG.APP_NAME,
      version: APP_CONFIG.SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      profil: this.getConfig(),
      kelas: this.getKelas(),
      users: this.memoryCache.users,
      tugas: this.getTugas(),
      kiriman: {}
    };

    // Gather submissions
    for (const t of this.memoryCache.tugas) {
      const submissions = await this.getKirimanByTugas(t.id);
      if (!includeImages) {
        // Strip heavy image base64 if user unchecks images
        backupData.kiriman[t.id] = submissions.map(s => ({
          ...s,
          gambar_list: (s.gambar_list || []).map(g => ({ filename: g.filename, size: g.sizeBytes }))
        }));
      } else {
        backupData.kiriman[t.id] = submissions;
      }
    }

    return backupData;
  }

  /**
   * Restore system from backup object with safety snapshot
   */
  async restoreBackup(backupData, mode = 'replace') {
    if (!backupData || !backupData.version) {
      throw new Error("Struktur berkas backup tidak valid atau versi skema tidak dikenali.");
    }

    // 1. Create safety snapshot first (RPD Section 6)
    const safetySnapshot = await this.createBackup(true);
    this.setLocalStorage(APP_CONFIG.KEYS.SNAPSHOTS, safetySnapshot);

    if (mode === 'replace') {
      if (backupData.profil) {
        this.memoryCache.config = backupData.profil;
        this.setLocalStorage(APP_CONFIG.KEYS.CONFIG, this.memoryCache.config);
      }
      if (Array.isArray(backupData.kelas)) {
        this.memoryCache.kelas = backupData.kelas;
        this.setLocalStorage(APP_CONFIG.KEYS.KELAS, this.memoryCache.kelas);
      }
      if (Array.isArray(backupData.users)) {
        this.memoryCache.users = backupData.users;
        this.setLocalStorage(APP_CONFIG.KEYS.USERS, this.memoryCache.users);
      }
      if (Array.isArray(backupData.tugas)) {
        this.memoryCache.tugas = backupData.tugas;
        this.setLocalStorage(APP_CONFIG.KEYS.TUGAS, this.memoryCache.tugas);
      }
      if (backupData.kiriman && typeof backupData.kiriman === 'object') {
        for (const [tugasId, list] of Object.entries(backupData.kiriman)) {
          this.memoryCache.kirimanMap.set(tugasId, list);
          this.setLocalStorage(`${APP_CONFIG.KEYS.KIRIMAN}_${tugasId}`, list);
        }
      }
    } else {
      // Merge mode without duplicates (RPD Section 6)
      if (Array.isArray(backupData.kelas)) {
        for (const k of backupData.kelas) {
          if (!this.memoryCache.kelas.some(ex => ex.nama.toLowerCase().trim() === k.nama.toLowerCase().trim())) {
            this.memoryCache.kelas.push(k);
          }
        }
        this.setLocalStorage(APP_CONFIG.KEYS.KELAS, this.memoryCache.kelas);
      }

      if (Array.isArray(backupData.users)) {
        for (const u of backupData.users) {
          if (!this.getUserByUsername(u.username)) {
            this.memoryCache.users.push(u);
          }
        }
        this.setLocalStorage(APP_CONFIG.KEYS.USERS, this.memoryCache.users);
      }

      if (Array.isArray(backupData.tugas)) {
        for (const t of backupData.tugas) {
          if (!this.memoryCache.tugas.some(ex => ex.id === t.id)) {
            this.memoryCache.tugas.push(t);
          }
        }
        this.setLocalStorage(APP_CONFIG.KEYS.TUGAS, this.memoryCache.tugas);
      }

      if (backupData.kiriman) {
        for (const [tugasId, list] of Object.entries(backupData.kiriman)) {
          const current = await this.getKirimanByTugas(tugasId);
          for (const sub of list) {
            if (!current.some(s => s.user_id === sub.user_id)) {
              current.push(sub);
            }
          }
          this.memoryCache.kirimanMap.set(tugasId, current);
          this.setLocalStorage(`${APP_CONFIG.KEYS.KIRIMAN}_${tugasId}`, current);
        }
      }
    }

    // Sync to GitHub if connected
    if (window.githubBackend && window.githubBackend.isConfigured()) {
      await this.syncWithGitHub(true);
    }

    await AuditLogger.log("RESTORE_BACKUP", `Restore data sistem (Mode: ${mode})`);
    return { success: true };
  }
}

window.storageManager = new StorageManager();
