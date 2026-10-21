/**
 * TugasKu - Application Controller & User Interface Engine
 * Integrates Stitch UI templates, unified storage, GitHub backend, auth, and Excel handlers.
 */

class TugasKuApp {
  constructor() {
    this.currentView = "login";
    this.selectedClassId = null;
    this.selectedTaskId = null;
    this.selectedStudentId = null;
    
    // Bulk selections
    this.selectedStudentUserIds = new Set();
    this.selectedGradingUserIds = new Set();
    
    // Student submission staging
    this.stagedImages = []; // Array of compressed image objects
    this.isSubmitting = false;

    // Lightbox state
    this.lightboxImages = [];
    this.lightboxIndex = 0;
  }

  /**
   * Initialize Application
   */
  async init() {
    // 1. Initialize database & cache
    await window.storageManager.init();

    // 2. Initialize Telemetry & Header branding
    this.updateInstitutionalBranding();
    this.updateCloudTelemetryBadge();

    // 3. Setup Navigation & Routing
    this.setupEventListeners();

    // 4. Check active session
    const currentUser = window.authManager.getCurrentUser();
    if (currentUser) {
      if (currentUser.role === 'admin') {
        this.navigateTo("admin-rekap");
      } else {
        this.navigateTo("student-dashboard");
      }
    } else {
      this.navigateTo("login");
    }

    // Check default admin password warning
    this.checkAdminPasswordBanner();
  }

  // =========================================================================
  // ROUTING & VIEW CONTROLLER
  // =========================================================================

  navigateTo(viewId, params = {}) {
    this.currentView = viewId;

    // View protection
    const currentUser = window.authManager.getCurrentUser();
    if (viewId.startsWith("admin-") && (!currentUser || currentUser.role !== 'admin')) {
      this.navigateTo("login");
      return;
    }
    if (viewId.startsWith("student-") && (!currentUser || currentUser.role !== 'murid')) {
      this.navigateTo("login");
      return;
    }

    // Hide all views
    document.querySelectorAll(".app-view").forEach(el => el.classList.add("hidden"));

    // Update shell navigation bar & sidebar visibility
    const adminSidebar = document.getElementById("admin-sidebar");
    const adminHeader = document.getElementById("admin-header");
    const studentHeader = document.getElementById("student-header");
    const studentBottomNav = document.getElementById("student-bottom-nav");
    const mainContainer = document.getElementById("main-layout");

    if (viewId === "login") {
      if (adminSidebar) adminSidebar.classList.add("hidden");
      if (adminHeader) adminHeader.classList.add("hidden");
      if (studentHeader) studentHeader.classList.add("hidden");
      if (studentBottomNav) studentBottomNav.classList.add("hidden");
      if (mainContainer) mainContainer.className = "w-full min-h-screen bg-background";
    } else if (viewId.startsWith("admin-")) {
      if (adminSidebar) adminSidebar.classList.remove("hidden");
      if (adminHeader) adminHeader.classList.remove("hidden");
      if (studentHeader) studentHeader.classList.add("hidden");
      if (studentBottomNav) studentBottomNav.classList.add("hidden");
      if (mainContainer) mainContainer.className = "pl-0 lg:pl-64 pt-16 min-h-screen bg-surface";
      this.highlightAdminNav(viewId);
    } else if (viewId.startsWith("student-")) {
      if (adminSidebar) adminSidebar.classList.add("hidden");
      if (adminHeader) adminHeader.classList.add("hidden");
      if (studentHeader) studentHeader.classList.remove("hidden");
      if (studentBottomNav) studentBottomNav.classList.remove("hidden");
      if (mainContainer) mainContainer.className = "pt-16 pb-20 md:pb-8 min-h-screen bg-surface";
      this.highlightStudentNav(viewId);
    }

    // Render target view
    const targetElement = document.getElementById(`view-${viewId}`);
    if (targetElement) {
      targetElement.classList.remove("hidden");
      targetElement.classList.add("view-enter");
      this.renderView(viewId, params);
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  highlightAdminNav(viewId) {
    document.querySelectorAll("[data-admin-nav]").forEach(item => {
      const target = item.getAttribute("data-admin-nav");
      if (target === viewId) {
        item.className = "flex items-center gap-space-sm px-space-md py-2.5 rounded-xl bg-primary-container text-on-primary font-title-md text-title-md shadow-sm";
      } else {
        item.className = "flex items-center gap-space-sm px-space-md py-2.5 rounded-xl text-on-surface-variant font-label-md text-label-md hover:bg-surface-container-high hover:text-on-surface transition-colors";
      }
    });
  }

  highlightStudentNav(viewId) {
    document.querySelectorAll("[data-student-nav]").forEach(item => {
      const target = item.getAttribute("data-student-nav");
      if (target === viewId) {
        item.classList.add("text-primary", "font-bold");
        item.classList.remove("text-secondary", "text-on-surface-variant");
      } else {
        item.classList.remove("text-primary", "font-bold");
        item.classList.add("text-secondary");
      }
    });
  }

  /**
   * View Render Dispatcher
   */
  async renderView(viewId, params = {}) {
    switch (viewId) {
      case "login":
        this.renderLogin();
        break;
      case "admin-rekap":
        await this.renderAdminRekap(params);
        break;
      case "admin-master":
        this.renderAdminMaster();
        break;
      case "admin-tugas":
        this.renderAdminTugas();
        break;
      case "admin-settings":
        this.renderAdminSettings();
        break;
      case "student-dashboard":
        await this.renderStudentDashboard();
        break;
      case "student-submit":
        await this.renderStudentSubmit(params.taskId);
        break;
      case "student-rekap":
        await this.renderStudentRekap();
        break;
      case "student-settings":
        this.renderStudentSettings();
        break;
    }
  }

  // =========================================================================
  // BRANDING & CLOUD TELEMETRY
  // =========================================================================

  updateInstitutionalBranding() {
    const config = window.storageManager.getConfig();
    document.querySelectorAll(".brand-madrasah-name").forEach(el => el.textContent = config.nama_madrasah || "MTs Negeri 1 Model");
    document.querySelectorAll(".brand-madrasah-sub").forEach(el => el.textContent = config.sub_title || "Sistem Pembelajaran & Penilaian Digital Terpadu");
    document.querySelectorAll(".brand-academic-year").forEach(el => el.textContent = `TA ${config.tahun_pelajaran || "2026/2027"} • Semester ${config.semester || "Ganjil"}`);
  }

  updateCloudTelemetryBadge() {
    const gh = window.githubBackend;
    const isConnected = gh && gh.isConfigured();
    const serverBadges = document.querySelectorAll(".telemetry-server-badge");

    serverBadges.forEach(el => {
      if (isConnected) {
        el.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
          <span class="truncate font-semibold text-primary">GitHub: ${gh.config.owner}/${gh.config.repo}</span>
        `;
      } else {
        el.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-amber-500"></span>
          <span class="truncate text-secondary">Mode Lokal (GitHub Belum Diatur)</span>
        `;
      }
    });

    const quotaBadges = document.querySelectorAll(".telemetry-quota-badge");
    quotaBadges.forEach(el => {
      if (isConnected && gh.rateLimit) {
        el.textContent = `API: ${gh.rateLimit.remaining}/${gh.rateLimit.limit} Quota`;
      } else {
        el.textContent = "Offline Ready";
      }
    });
  }

  async checkAdminPasswordBanner() {
    const banner = document.getElementById("admin-default-pass-banner");
    if (!banner) return;

    if (window.authManager.isAdmin()) {
      const isDefault = await window.authManager.isDefaultAdminPassword();
      if (isDefault) {
        banner.classList.remove("hidden");
      } else {
        banner.classList.add("hidden");
      }
    } else {
      banner.classList.add("hidden");
    }
  }

  // =========================================================================
  // TOAST NOTIFICATIONS
  // =========================================================================

  showToast(title, message, type = "success") {
    const toast = document.getElementById("toastNotification");
    const toastIcon = document.getElementById("toastIcon");
    const toastTitle = document.getElementById("toastTitle");
    const toastMessage = document.getElementById("toastMessage");

    if (!toast) return;

    toastTitle.textContent = title;
    toastMessage.textContent = message;

    if (type === "success") {
      toastIcon.textContent = "check_circle";
      toastIcon.className = "material-symbols-outlined text-primary text-xl";
    } else if (type === "error") {
      toastIcon.textContent = "error";
      toastIcon.className = "material-symbols-outlined text-error text-xl";
    } else if (type === "warning") {
      toastIcon.textContent = "warning";
      toastIcon.className = "material-symbols-outlined text-amber-500 text-xl";
    } else {
      toastIcon.textContent = "info";
      toastIcon.className = "material-symbols-outlined text-tertiary text-xl";
    }

    toast.classList.remove("opacity-0", "translate-y-20", "pointer-events-none");
    toast.classList.add("opacity-100", "translate-y-0");

    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      toast.classList.add("opacity-0", "translate-y-20", "pointer-events-none");
      toast.classList.remove("opacity-100", "translate-y-0");
    }, 4000);
  }

  // =========================================================================
  // VIEW: LOGIN (ADMIN & USER)
  // =========================================================================

  renderLogin() {
    const form = document.getElementById("login-form");
    const errBox = document.getElementById("login-error-box");
    const lockBox = document.getElementById("login-lockout-box");
    const usernameInput = document.getElementById("login-username");
    const passwordInput = document.getElementById("login-password");
    const submitBtn = document.getElementById("login-submit-btn");

    if (errBox) errBox.classList.add("hidden");
    if (lockBox) lockBox.classList.add("hidden");

    // Check lockout timer
    const lockout = window.authManager.getLockoutStatus();
    if (lockout.locked) {
      if (lockBox) {
        lockBox.classList.remove("hidden");
        const remainingSeconds = Math.ceil(lockout.remainingMs / 1000);
        lockBox.textContent = `Percobaan gagal melebihi batas. Tunggu ${remainingSeconds} detik sebelum mencoba lagi.`;
      }
      if (submitBtn) submitBtn.disabled = true;
    } else {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async handleLoginSubmit(e) {
    e.preventDefault();
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;
    const errBox = document.getElementById("login-error-box");
    const submitBtn = document.getElementById("login-submit-btn");

    if (errBox) errBox.classList.add("hidden");

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="material-symbols-outlined animate-spin text-lg">progress_activity</span> Memverifikasi...`;

      const user = await window.authManager.login(username, password);

      this.showToast("Login Berhasil", `Selamat datang, ${user.nama}!`);
      this.updateCloudTelemetryBadge();
      this.checkAdminPasswordBanner();

      if (user.role === 'admin') {
        this.navigateTo("admin-rekap");
      } else {
        this.navigateTo("student-dashboard");
      }
    } catch (err) {
      if (errBox) {
        errBox.textContent = err.message;
        errBox.classList.remove("hidden");
      }
      this.showToast("Gagal Masuk", err.message, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Masuk ke Akun</span><span class="material-symbols-outlined text-base">login</span>`;
    }
  }

  // =========================================================================
  // VIEW: ADMIN - REKAP & PENILAIAN TUGAS (RPD Section 3.3 c)
  // =========================================================================

  async renderAdminRekap(params = {}) {
    const classSelect = document.getElementById("rekap-select-kelas");
    const taskSelect = document.getElementById("rekap-select-tugas");
    const tableBody = document.getElementById("rekap-table-body");
    const emptyState = document.getElementById("rekap-empty-state");

    const classes = window.storageManager.getKelas();
    const tasks = window.storageManager.getTugas();

    // Populate class selector
    classSelect.innerHTML = classes.map(c => 
      `<option value="${c.id}" ${this.selectedClassId === c.id ? "selected" : ""}>${c.nama}</option>`
    ).join("");

    if (classes.length === 0) {
      classSelect.innerHTML = `<option value="">Belum ada kelas</option>`;
    } else if (!this.selectedClassId && classes.length > 0) {
      this.selectedClassId = classes[0].id;
    }

    // Populate task selector
    const filteredTasks = tasks.filter(t => !this.selectedClassId || t.kelas_ids.includes(this.selectedClassId));
    taskSelect.innerHTML = filteredTasks.map(t => 
      `<option value="${t.id}" ${this.selectedTaskId === t.id ? "selected" : ""}>${t.judul} (${t.jenis_bukti === 'teks' ? 'Teks' : 'Foto/Gambar'})</option>`
    ).join("");

    if (filteredTasks.length === 0) {
      taskSelect.innerHTML = `<option value="">Tidak ada tugas untuk kelas ini</option>`;
      this.selectedTaskId = null;
    } else if (!this.selectedTaskId || !filteredTasks.some(t => t.id === this.selectedTaskId)) {
      this.selectedTaskId = filteredTasks[0].id;
    }

    if (!this.selectedTaskId || !this.selectedClassId) {
      if (emptyState) emptyState.classList.remove("hidden");
      if (tableBody) tableBody.innerHTML = "";
      this.updateRekapMetrics([], []);
      return;
    }

    if (emptyState) emptyState.classList.add("hidden");

    // Fetch submissions and students
    const task = window.storageManager.getTugasById(this.selectedTaskId);
    const submissions = await window.storageManager.getKirimanByTugas(this.selectedTaskId);
    const students = window.storageManager.getUsers('murid').filter(u => u.kelas_id === this.selectedClassId);

    // Sort students by absen or name
    students.sort((a, b) => (a.no_absen || 0) - (b.no_absen || 0) || a.nama.localeCompare(b.nama));

    // Update lock button state
    const lockBtn = document.getElementById("btn-lock-toggle");
    const lockIcon = document.getElementById("lock-icon");
    const lockText = document.getElementById("lock-text");
    if (lockBtn && task) {
      if (task.status === 'dikunci') {
        lockIcon.textContent = "lock";
        lockText.textContent = "Buka Kunci Tugas";
        lockBtn.className = "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-error-container text-on-error-container hover:opacity-90 transition-colors font-label-md text-label-md";
      } else {
        lockIcon.textContent = "lock_open";
        lockText.textContent = "Kunci Tugas";
        lockBtn.className = "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors font-label-md text-label-md";
      }
    }

    // Update metrics cards
    this.updateRekapMetrics(students, submissions, task);

    // Render table rows
    this.selectedGradingUserIds.clear();
    this.updateBulkGradingBar();

    const subMap = new Map(submissions.map(s => [s.user_id, s]));

    tableBody.innerHTML = students.map((st, idx) => {
      const sub = subMap.get(st.id);
      let statusPill = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-label-sm text-label-sm"><span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>Belum Mengumpulkan</span>`;
      let timeText = "-";
      let scoreText = `<span class="text-outline font-body-sm italic">-</span>`;
      let pubPill = `<span class="text-outline font-label-sm">-</span>`;

      if (sub) {
        timeText = sub.submitted_at ? new Date(sub.submitted_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }) : "-";
        
        if (sub.nilai !== null && sub.nilai !== undefined && sub.nilai !== "") {
          statusPill = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-label-sm text-label-sm"><span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>Sudah Dinilai</span>`;
          scoreText = `<span class="font-bold text-primary tabular-nums">${sub.nilai}</span> <span class="text-outline text-xs">/ ${task.nilai_max}</span>`;
        } else {
          statusPill = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200 font-label-sm text-label-sm"><span class="w-1.5 h-1.5 rounded-full bg-sky-600"></span>Terkirim (Menunggu)</span>`;
          scoreText = `<span class="text-amber-600 font-label-sm font-semibold">Belum Dinilai</span>`;
        }

        pubPill = sub.status_publikasi 
          ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-label-sm text-label-sm"><span class="material-symbols-outlined text-[13px]">visibility</span> Dipublikasikan</span>`
          : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm"><span class="material-symbols-outlined text-[13px]">visibility_off</span> Draf (Rahasia)</span>`;
      }

      return `
        <tr class="hover:bg-surface-container-low transition-colors border-b border-surface-container-high/60 group">
          <td class="p-3 text-center">
            <input type="checkbox" class="rekap-row-checkbox rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer" data-student-id="${st.id}" onchange="app.toggleSelectGradingRow('${st.id}')">
          </td>
          <td class="p-3 text-center font-label-sm text-outline tabular-nums">${st.no_absen || idx + 1}</td>
          <td class="p-3 font-semibold text-on-surface">
            <div>${st.nama}</div>
            <div class="font-body-sm text-outline text-xs font-normal">NISN: ${st.username}</div>
          </td>
          <td class="p-3">${statusPill}</td>
          <td class="p-3 font-body-sm text-on-surface-variant tabular-nums">${timeText}</td>
          <td class="p-3 text-center">${scoreText}</td>
          <td class="p-3 text-center">${pubPill}</td>
          <td class="p-3 text-right">
            <button class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-primary hover:text-on-primary text-on-surface font-label-md text-label-md transition-all shadow-sm" onclick="app.openGradingDrawer('${st.id}')">
              <span class="material-symbols-outlined text-base">rate_review</span>
              <span>${sub ? "Periksa & Nilai" : "Beri Nilai"}</span>
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  updateRekapMetrics(students, submissions, task = null) {
    const totalStudents = students.length;
    const submittedCount = submissions.length;
    const gradedList = submissions.filter(s => s.nilai !== null && s.nilai !== undefined && s.nilai !== "");
    const gradedCount = gradedList.length;
    const pendingCount = Math.max(0, submittedCount - gradedCount);

    let average = 0;
    if (gradedCount > 0) {
      const sum = gradedList.reduce((acc, curr) => acc + Number(curr.nilai), 0);
      average = (sum / gradedCount).toFixed(1);
    }

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setText("metric-rekap-total", totalStudents);
    setText("metric-rekap-terkirim", submittedCount);
    setText("metric-rekap-pending", pendingCount);
    setText("metric-rekap-dinilai", gradedCount);
    setText("metric-rekap-rerata", average);
  }

  toggleSelectAllGrading(masterCheckbox) {
    const checkboxes = document.querySelectorAll(".rekap-row-checkbox");
    checkboxes.forEach(cb => {
      cb.checked = masterCheckbox.checked;
      const id = cb.getAttribute("data-student-id");
      if (masterCheckbox.checked) {
        this.selectedGradingUserIds.add(id);
      } else {
        this.selectedGradingUserIds.delete(id);
      }
    });
    this.updateBulkGradingBar();
  }

  toggleSelectGradingRow(studentId) {
    if (this.selectedGradingUserIds.has(studentId)) {
      this.selectedGradingUserIds.delete(studentId);
    } else {
      this.selectedGradingUserIds.add(studentId);
    }
    this.updateBulkGradingBar();
  }

  updateBulkGradingBar() {
    const bar = document.getElementById("rekap-bulk-bar");
    const countEl = document.getElementById("rekap-selected-count");
    if (!bar) return;

    const count = this.selectedGradingUserIds.size;
    if (count > 0) {
      bar.classList.remove("hidden");
      if (countEl) countEl.textContent = `${count} Murid Dipilih`;
    } else {
      bar.classList.add("hidden");
    }
  }

  async handleBulkPublish(isPublished) {
    if (this.selectedGradingUserIds.size === 0) return;
    const ids = Array.from(this.selectedGradingUserIds);

    try {
      const count = await window.storageManager.setPublicationStatus(this.selectedTaskId, ids, isPublished);
      this.showToast("Berhasil", `${count} nilai murid telah ${isPublished ? "dipublikasikan" : "ditarik ke status draf"}.`);
      await this.renderAdminRekap();
    } catch (err) {
      this.showToast("Galat", err.message, "error");
    }
  }

  async handlePublishAllClass(isPublished) {
    const students = window.storageManager.getUsers('murid').filter(u => u.kelas_id === this.selectedClassId);
    const ids = students.map(s => s.id);

    try {
      const count = await window.storageManager.setPublicationStatus(this.selectedTaskId, ids, isPublished);
      this.showToast("Selesai", `Seluruh nilai kelas (${count} murid) telah ${isPublished ? "dipublikasikan" : "dibatalkan publikasinya"}.`);
      await this.renderAdminRekap();
    } catch (err) {
      this.showToast("Galat", err.message, "error");
    }
  }

  // --- Grading Drawer & Inspection (RPD 3.3 c) ---
  async openGradingDrawer(studentId) {
    this.selectedStudentId = studentId;
    const drawer = document.getElementById("grading-drawer");
    if (!drawer) return;

    const student = window.storageManager.getUserById(studentId);
    const task = window.storageManager.getTugasById(this.selectedTaskId);
    const sub = await window.storageManager.getStudentSubmission(this.selectedTaskId, studentId);

    // Populate drawer student info
    document.getElementById("drawer-student-name").textContent = student ? student.nama : "-";
    document.getElementById("drawer-student-nisn").textContent = student ? `NISN: ${student.username} • Absen: ${student.no_absen || '-'}` : "-";
    document.getElementById("drawer-max-score").textContent = task ? task.nilai_max : 100;

    const contentArea = document.getElementById("drawer-submission-content");
    const scoreInput = document.getElementById("drawer-grade-input");
    const notesInput = document.getElementById("drawer-notes-input");
    const pubStatusBox = document.getElementById("drawer-pub-status");

    scoreInput.max = task ? task.nilai_max : 100;
    scoreInput.value = sub && sub.nilai !== null ? sub.nilai : "";
    notesInput.value = sub && sub.catatan_guru ? sub.catatan_guru : "";

    if (sub && sub.status_publikasi) {
      pubStatusBox.innerHTML = `<span class="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full font-label-sm text-label-sm border border-emerald-200"><span class="material-symbols-outlined text-sm">visibility</span> Nilai Telah Dipublikasikan ke Murid</span>`;
    } else {
      pubStatusBox.innerHTML = `<span class="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full font-label-sm text-label-sm border border-amber-200"><span class="material-symbols-outlined text-sm">visibility_off</span> Nilai Belum Terpublikasi (Murid Belum Bisa Melihat)</span>`;
    }

    if (!sub) {
      contentArea.innerHTML = `
        <div class="p-space-lg rounded-xl bg-surface-container-low text-center flex flex-col items-center gap-2">
          <span class="material-symbols-outlined text-4xl text-outline">pending</span>
          <span class="font-title-md text-on-surface">Murid Belum Mengumpulkan Tugas</span>
          <p class="font-body-sm text-outline">Anda tetap dapat memberikan nilai manual bila tugas dikumpulkan secara luring.</p>
        </div>
      `;
    } else if (sub.jenis_bukti === 'teks') {
      contentArea.innerHTML = `
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm">
            <span>Jawaban Teks (${sub.teks.length} karakter):</span>
            <span>Dikirim: ${new Date(sub.submitted_at).toLocaleString("id-ID")}</span>
          </div>
          <div class="p-space-md rounded-xl bg-surface-container-low text-on-surface font-body-md whitespace-pre-wrap leading-relaxed select-text border border-surface-container-high">
            ${this.escapeHtml(sub.teks)}
          </div>
        </div>
      `;
    } else if (sub.jenis_bukti === 'gambar') {
      const images = sub.gambar_list || [];
      contentArea.innerHTML = `
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm">
            <span>Bukti Foto / Gambar (${images.length} lampiran):</span>
            <span>Dikirim: ${new Date(sub.submitted_at).toLocaleString("id-ID")}</span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
            ${images.map((img, i) => `
              <div class="group relative rounded-xl overflow-hidden aspect-square bg-surface-container-high border border-surface-container-highest cursor-pointer shadow-sm hover:shadow-md transition-all" onclick="app.openLightbox(${JSON.stringify(images).replace(/"/g, '&quot;')}, ${i})">
                <img src="${img.dataUrl}" alt="Bukti tugas" class="w-full h-full object-cover group-hover:scale-105 transition-transform">
                <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                  <span class="material-symbols-outlined text-2xl">zoom_in</span>
                </div>
              </div>
            `).join("")}
          </div>
          <p class="font-body-sm text-outline text-xs">* Klik pada gambar untuk memperbesar resolusi tinggi dengan Lightbox.</p>
        </div>
      `;
    }

    drawer.classList.remove("hidden");
    const drawerContent = drawer.querySelector(".drawer-panel");
    if (drawerContent) {
      drawerContent.classList.remove("translate-x-full");
      drawerContent.classList.add("translate-x-0");
    }
  }

  closeGradingDrawer() {
    const drawer = document.getElementById("grading-drawer");
    if (!drawer) return;
    const drawerContent = drawer.querySelector(".drawer-panel");
    if (drawerContent) {
      drawerContent.classList.remove("translate-x-0");
      drawerContent.classList.add("translate-x-full");
    }
    setTimeout(() => {
      drawer.classList.add("hidden");
    }, 250);
  }

  async saveDrawerGrade() {
    if (!this.selectedStudentId || !this.selectedTaskId) return;

    const scoreInput = document.getElementById("drawer-grade-input");
    const notesInput = document.getElementById("drawer-notes-input");
    const val = scoreInput.value;
    const notes = notesInput.value;

    if (val === "" || val === null) {
      this.showToast("Perhatian", "Masukkan nilai terlebih dahulu.", "warning");
      return;
    }

    try {
      await window.storageManager.gradeSubmission(this.selectedTaskId, this.selectedStudentId, val, notes);
      this.showToast("Nilai Tersimpan", "Nilai murid berhasil disimpan ke database.");
      await this.renderAdminRekap();
      // Keep drawer open or allow navigating to next
      const pubStatusBox = document.getElementById("drawer-pub-status");
      if (pubStatusBox) {
        pubStatusBox.innerHTML = `<span class="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full font-label-sm text-label-sm border border-amber-200"><span class="material-symbols-outlined text-sm">visibility_off</span> Nilai Belum Terpublikasi (Gunakan tombol 'Publikasikan' untuk menampilkan ke murid)</span>`;
      }
    } catch (err) {
      this.showToast("Galat", err.message, "error");
    }
  }

  navigateGradingStudent(direction) {
    const students = window.storageManager.getUsers('murid').filter(u => u.kelas_id === this.selectedClassId);
    students.sort((a, b) => (a.no_absen || 0) - (b.no_absen || 0) || a.nama.localeCompare(b.nama));

    const currentIndex = students.findIndex(s => s.id === this.selectedStudentId);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = students.length - 1;
    if (nextIndex >= students.length) nextIndex = 0;

    this.openGradingDrawer(students[nextIndex].id);
  }

  // =========================================================================
  // VIEW: ADMIN - MASTER DATA KELAS & AKUN MURID (RPD 3.3 a)
  // =========================================================================

  renderAdminMaster() {
    this.renderMasterKelas();
    this.renderMasterStudents();
  }

  renderMasterKelas() {
    const tableBody = document.getElementById("master-kelas-table-body");
    const countBadge = document.getElementById("master-kelas-total-count");
    if (!tableBody) return;

    const classes = window.storageManager.getKelas();
    const students = window.storageManager.getUsers('murid');

    if (countBadge) countBadge.textContent = `${classes.length} Rombel`;

    if (classes.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-outline">Belum ada kelas. Klik "+ Tambah Kelas" untuk membuat rombongan belajar baru.</td></tr>`;
      return;
    }

    tableBody.innerHTML = classes.map((c, idx) => {
      const studentCount = students.filter(s => s.kelas_id === c.id).length;
      return `
        <tr class="hover:bg-surface-container-low transition-colors border-b border-surface-container-high/60">
          <td class="p-3 text-center font-label-sm text-outline tabular-nums">${idx + 1}</td>
          <td class="p-3 font-bold text-on-surface flex items-center gap-2">
            <span class="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary font-bold text-sm">
              ${c.nama.substring(0, 2)}
            </span>
            <span>${c.nama}</span>
          </td>
          <td class="p-3">
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-fixed font-label-sm text-label-sm font-semibold">
              <span class="material-symbols-outlined text-[14px]">school</span>
              ${studentCount} Murid
            </span>
          </td>
          <td class="p-3 text-right">
            <button class="p-1.5 rounded-lg hover:bg-surface-container text-primary transition-colors" title="Ubah Nama" onclick="app.openEditClassModal('${c.id}', '${c.nama}')">
              <span class="material-symbols-outlined text-lg leading-none">edit</span>
            </button>
            <button class="p-1.5 rounded-lg hover:bg-error-container text-error transition-colors" title="Hapus Kelas" onclick="app.handleDeleteClass('${c.id}')">
              <span class="material-symbols-outlined text-lg leading-none">delete</span>
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  renderMasterStudents() {
    const tableBody = document.getElementById("master-students-table-body");
    const filterClass = document.getElementById("master-student-filter-class");
    const searchInput = document.getElementById("master-student-search");
    if (!tableBody) return;

    const classes = window.storageManager.getKelas();
    const students = window.storageManager.getUsers('murid');

    // Populate filter dropdown
    if (filterClass) {
      const currentFilter = filterClass.value;
      filterClass.innerHTML = `<option value="">Semua Rombel (${classes.length})</option>` +
        classes.map(c => `<option value="${c.id}" ${currentFilter === c.id ? "selected" : ""}>${c.nama}</option>`).join("");
    }

    const searchQuery = (searchInput ? searchInput.value : "").toLowerCase().trim();
    const filterClassVal = filterClass ? filterClass.value : "";

    const classMap = new Map(classes.map(c => [c.id, c.nama]));

    const filtered = students.filter(s => {
      const matchSearch = !searchQuery || s.nama.toLowerCase().includes(searchQuery) || s.username.toLowerCase().includes(searchQuery);
      const matchClass = !filterClassVal || s.kelas_id === filterClassVal;
      return matchSearch && matchClass;
    });

    // Update student metrics
    const totalEl = document.getElementById("master-stat-total-students");
    const activeEl = document.getElementById("master-stat-active-students");
    if (totalEl) totalEl.textContent = students.length;
    if (activeEl) activeEl.textContent = `${students.filter(s => s.status === 'aktif').length} Aktif`;

    this.selectedStudentUserIds.clear();
    this.updateBulkStudentBar();

    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-outline">Tidak ada data murid yang cocok.</td></tr>`;
      return;
    }

    tableBody.innerHTML = filtered.map((s, idx) => {
      const isSelected = this.selectedStudentUserIds.has(s.id);
      return `
        <tr class="hover:bg-surface-container-low transition-colors border-b border-surface-container-high/60 ${isSelected ? "bg-secondary-container/30" : ""}">
          <td class="p-3 text-center">
            <input type="checkbox" class="student-row-checkbox rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer" data-id="${s.id}" ${isSelected ? "checked" : ""} onchange="app.toggleSelectStudentRow('${s.id}')">
          </td>
          <td class="p-3 text-center font-label-sm text-outline tabular-nums">${s.no_absen || idx + 1}</td>
          <td class="p-3">
            <div class="font-bold text-on-surface">${s.nama}</div>
            <div class="font-body-sm text-outline text-xs">NISN: ${s.username}</div>
          </td>
          <td class="p-3">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm font-semibold">
              ${classMap.get(s.kelas_id) || "Belum Ditentukan"}
            </span>
          </td>
          <td class="p-3">
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-label-sm text-label-sm ${s.status === 'aktif' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-surface-container-high text-outline'}">
              <span class="w-1.5 h-1.5 rounded-full ${s.status === 'aktif' ? 'bg-emerald-500' : 'bg-outline'}"></span>
              ${s.status === 'aktif' ? "Aktif" : "Nonaktif"}
            </span>
          </td>
          <td class="p-3 text-right">
            <div class="flex items-center justify-end gap-1">
              <button class="p-1.5 rounded-lg hover:bg-surface-container text-primary transition-colors" title="Ubah Murid" onclick="app.openEditStudentModal('${s.id}')">
                <span class="material-symbols-outlined text-lg leading-none">edit</span>
              </button>
              <button class="p-1.5 rounded-lg hover:bg-error-container text-error transition-colors" title="Hapus Murid" onclick="app.handleDeleteStudent('${s.id}')">
                <span class="material-symbols-outlined text-lg leading-none">delete</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  toggleSelectAllStudents(masterCb) {
    const checkboxes = document.querySelectorAll(".student-row-checkbox");
    checkboxes.forEach(cb => {
      cb.checked = masterCb.checked;
      const id = cb.getAttribute("data-id");
      if (masterCb.checked) {
        this.selectedStudentUserIds.add(id);
      } else {
        this.selectedStudentUserIds.delete(id);
      }
    });
    this.updateBulkStudentBar();
  }

  toggleSelectStudentRow(id) {
    if (this.selectedStudentUserIds.has(id)) {
      this.selectedStudentUserIds.delete(id);
    } else {
      this.selectedStudentUserIds.add(id);
    }
    this.updateBulkStudentBar();
  }

  updateBulkStudentBar() {
    const bar = document.getElementById("master-bulk-student-bar");
    const countEl = document.getElementById("master-selected-student-count");
    if (!bar) return;

    const count = this.selectedStudentUserIds.size;
    if (count > 0) {
      bar.classList.remove("hidden");
      if (countEl) countEl.textContent = `${count} Murid Dipilih`;
    } else {
      bar.classList.add("hidden");
    }
  }

  // --- Modals: Class & Student Management ---
  openAddClassModal() {
    const modal = document.getElementById("modal-class");
    const title = document.getElementById("modal-class-title");
    const inputId = document.getElementById("class-form-id");
    const inputName = document.getElementById("class-form-nama");

    title.textContent = "Tambah Rombel (Kelas) Baru";
    inputId.value = "";
    inputName.value = "";

    modal.classList.remove("hidden");
  }

  openEditClassModal(id, currentName) {
    const modal = document.getElementById("modal-class");
    const title = document.getElementById("modal-class-title");
    const inputId = document.getElementById("class-form-id");
    const inputName = document.getElementById("class-form-nama");

    title.textContent = "Ubah Nama Rombel (Kelas)";
    inputId.value = id;
    inputName.value = currentName;

    modal.classList.remove("hidden");
  }

  async handleClassFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById("class-form-id").value;
    const name = document.getElementById("class-form-nama").value;

    try {
      if (id) {
        await window.storageManager.updateKelas(id, name);
        this.showToast("Berhasil", "Nama rombel berhasil diperbarui.");
      } else {
        await window.storageManager.addKelas(name);
        this.showToast("Berhasil", `Kelas "${name}" berhasil ditambahkan.`);
      }
      document.getElementById("modal-class").classList.add("hidden");
      this.renderMasterKelas();
      this.renderMasterStudents();
    } catch (err) {
      this.showToast("Galat", err.message, "error");
    }
  }

  async handleDeleteClass(id) {
    const k = window.storageManager.getKelasById(id);
    if (!k) return;

    if (!confirm(`Apakah Anda yakin ingin menghapus kelas "${k.nama}"?`)) return;

    try {
      await window.storageManager.deleteKelas(id);
      this.showToast("Terhapus", `Kelas "${k.nama}" berhasil dihapus.`);
      this.renderMasterKelas();
    } catch (err) {
      this.showToast("Ditolak", err.message, "error");
    }
  }

  openAddStudentModal() {
    const modal = document.getElementById("modal-student");
    const title = document.getElementById("modal-student-title");
    const form = document.getElementById("student-form");

    title.textContent = "Tambah Akun Murid Baru";
    form.reset();
    document.getElementById("student-form-id").value = "";

    // Populate class selector
    const select = document.getElementById("student-form-kelas");
    const classes = window.storageManager.getKelas();
    select.innerHTML = classes.map(c => `<option value="${c.id}">${c.nama}</option>`).join("");

    modal.classList.remove("hidden");
  }

  openEditStudentModal(id) {
    const modal = document.getElementById("modal-student");
    const title = document.getElementById("modal-student-title");
    const user = window.storageManager.getUserById(id);
    if (!user) return;

    title.textContent = "Ubah Data Akun Murid";
    document.getElementById("student-form-id").value = user.id;
    document.getElementById("student-form-nama").value = user.nama;
    document.getElementById("student-form-username").value = user.username;
    document.getElementById("student-form-absen").value = user.no_absen || "";
    document.getElementById("student-form-status").value = user.status || "aktif";
    document.getElementById("student-form-password").value = "";

    const select = document.getElementById("student-form-kelas");
    const classes = window.storageManager.getKelas();
    select.innerHTML = classes.map(c => `<option value="${c.id}" ${c.id === user.kelas_id ? "selected" : ""}>${c.nama}</option>`).join("");

    modal.classList.remove("hidden");
  }

  async handleStudentFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById("student-form-id").value;
    const data = {
      nama: document.getElementById("student-form-nama").value,
      username: document.getElementById("student-form-username").value,
      kelas_id: document.getElementById("student-form-kelas").value,
      no_absen: document.getElementById("student-form-absen").value,
      status: document.getElementById("student-form-status").value,
      password: document.getElementById("student-form-password").value
    };

    try {
      if (id) {
        await window.storageManager.updateStudent(id, data);
        this.showToast("Berhasil", "Data murid berhasil diperbarui.");
      } else {
        await window.storageManager.addStudent(data);
        this.showToast("Berhasil", `Murid ${data.nama} berhasil didaftarkan.`);
      }
      document.getElementById("modal-student").classList.add("hidden");
      this.renderMasterStudents();
      this.renderMasterKelas();
    } catch (err) {
      this.showToast("Galat", err.message, "error");
    }
  }

  async handleDeleteStudent(id) {
    const user = window.storageManager.getUserById(id);
    if (!user) return;

    if (!confirm(`Hapus murid "${user.nama}" (${user.username})? Semua riwayat kiriman dan gambar murid akan dihapus permanen.`)) return;

    try {
      await window.storageManager.deleteStudent(id);
      this.showToast("Terhapus", `Akun murid "${user.nama}" telah dihapus.`);
      this.renderMasterStudents();
      this.renderMasterKelas();
    } catch (err) {
      this.showToast("Galat", err.message, "error");
    }
  }

  // --- Bulk Student Actions ---
  openBulkMoveClassModal() {
    const modal = document.getElementById("modal-bulk-move");
    const countEl = document.getElementById("bulk-move-count");
    const select = document.getElementById("bulk-move-target-class");
    if (!modal) return;

    const count = this.selectedStudentUserIds.size;
    if (countEl) countEl.textContent = count;

    const classes = window.storageManager.getKelas();
    select.innerHTML = classes.map(c => `<option value="${c.id}">${c.nama}</option>`).join("");

    modal.classList.remove("hidden");
  }

  async executeBulkMoveClass() {
    const select = document.getElementById("bulk-move-target-class");
    const targetClassId = select.value;
    const ids = Array.from(this.selectedStudentUserIds);

    try {
      const count = await window.storageManager.bulkMoveClass(ids, targetClassId);
      this.showToast("Berhasil", `${count} murid berhasil dipindahkan ke kelas tujuan.`);
      document.getElementById("modal-bulk-move").classList.add("hidden");
      this.renderMasterStudents();
      this.renderMasterKelas();
    } catch (err) {
      this.showToast("Galat", err.message, "error");
    }
  }

  async executeBulkResetPassword() {
    const count = this.selectedStudentUserIds.size;
    if (!confirm(`Reset kata sandi ${count} murid terpilih menjadi bawaan "123456"?`)) return;

    try {
      const ids = Array.from(this.selectedStudentUserIds);
      await window.storageManager.bulkResetPassword(ids, "123456");
      this.showToast("Sandi Direset", `${count} kata sandi murid berhasil direset menjadi 123456.`);
    } catch (err) {
      this.showToast("Galat", err.message, "error");
    }
  }

  async executeBulkSetStatus(status) {
    const count = this.selectedStudentUserIds.size;
    try {
      const ids = Array.from(this.selectedStudentUserIds);
      await window.storageManager.bulkSetStatus(ids, status);
      this.showToast("Status Diperbarui", `${count} akun murid telah diubah statusnya menjadi ${status}.`);
      this.renderMasterStudents();
    } catch (err) {
      this.showToast("Galat", err.message, "error");
    }
  }

  async executeBulkDeleteStudents() {
    const count = this.selectedStudentUserIds.size;
    if (!confirm(`PERINGATAN: Anda akan menghapus ${count} akun murid sekaligus beserta seluruh berkas kiriman tugas mereka. Lanjutkan?`)) return;

    try {
      const ids = Array.from(this.selectedStudentUserIds);
      await window.storageManager.bulkDeleteStudents(ids);
      this.showToast("Terhapus", `${count} akun murid telah dihapus massal.`);
      this.renderMasterStudents();
      this.renderMasterKelas();
    } catch (err) {
      this.showToast("Galat", err.message, "error");
    }
  }

  // --- Import / Export Akun (RPD Section 5) ---
  openImportModal() {
    const modal = document.getElementById("modal-import-students");
    const previewArea = document.getElementById("import-preview-area");
    const fileInput = document.getElementById("import-file-input");

    if (fileInput) fileInput.value = "";
    if (previewArea) previewArea.classList.add("hidden");
    document.getElementById("import-confirm-btn").classList.add("hidden");

    this._pendingImportData = null;
    modal.classList.remove("hidden");
  }

  async handleImportFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;

    const previewArea = document.getElementById("import-preview-area");
    const confirmBtn = document.getElementById("import-confirm-btn");

    try {
      const existingUsers = window.storageManager.getUsers('murid');
      const existingClasses = window.storageManager.getKelas();

      const result = await window.XlsxHelper.parseStudentFile(file, existingUsers, existingClasses);
      this._pendingImportData = result;

      // Render preview
      document.getElementById("import-stat-valid").textContent = result.validRows.length;
      document.getElementById("import-stat-duplicate").textContent = result.duplicateRows.length;
      document.getElementById("import-stat-error").textContent = result.errorRows.length;

      const errorBox = document.getElementById("import-error-list");
      if (result.errorRows.length > 0) {
        errorBox.classList.remove("hidden");
        errorBox.innerHTML = `<span class="font-bold text-error">Daftar Galat Format:</span><ul class="list-disc pl-4 mt-1">` +
          result.errorRows.slice(0, 5).map(err => `<li>Baris ${err.row}: ${err.reason}</li>`).join("") +
          (result.errorRows.length > 5 ? `<li>...dan ${result.errorRows.length - 5} baris lainnya</li>` : "") +
          `</ul>`;
      } else {
        errorBox.classList.add("hidden");
      }

      previewArea.classList.remove("hidden");
      confirmBtn.classList.remove("hidden");
    } catch (err) {
      this.showToast("Format Tidak Valid", err.message, "error");
    }
  }

  async executeStudentImport() {
    if (!this._pendingImportData) return;

    const duplicateAction = document.querySelector('input[name="import-duplicate-action"]:checked').value; // skip | update
    const autoCreateClass = document.getElementById("import-auto-create-class").checked;

    const { validRows, duplicateRows } = this._pendingImportData;

    try {
      // 1. Auto create missing classes if checked
      const classMap = new Map();
      window.storageManager.getKelas().forEach(c => classMap.set(c.nama.toLowerCase().trim(), c.id));

      if (autoCreateClass) {
        const missing = this._pendingImportData.detectedClasses.filter(cn => !classMap.has(cn.toLowerCase().trim()));
        for (const newClass of missing) {
          const created = await window.storageManager.addKelas(newClass);
          classMap.set(created.nama.toLowerCase().trim(), created.id);
        }
      }

      let insertedCount = 0;
      let updatedCount = 0;

      // 2. Insert valid rows
      for (const row of validRows) {
        let kId = classMap.get(row.nama_kelas.toLowerCase().trim());
        if (!kId && autoCreateClass) {
          const created = await window.storageManager.addKelas(row.nama_kelas);
          kId = created.id;
          classMap.set(row.nama_kelas.toLowerCase().trim(), kId);
        }

        if (kId) {
          await window.storageManager.addStudent({
            nama: row.nama,
            username: row.username,
            kelas_id: kId,
            no_absen: row.no_absen,
            password: row.sandi_awal || "123456"
          });
          insertedCount++;
        }
      }

      // 3. Handle duplicates
      if (duplicateAction === 'update') {
        for (const row of duplicateRows) {
          const existing = row.existingUser;
          let kId = classMap.get(row.nama_kelas.toLowerCase().trim()) || existing.kelas_id;
          await window.storageManager.updateStudent(existing.id, {
            nama: row.nama,
            kelas_id: kId,
            no_absen: row.no_absen,
            password: row.sandi_awal
          });
          updatedCount++;
        }
      }

      this.showToast("Import Selesai", `Berhasil memasukkan ${insertedCount} murid baru dan memperbarui ${updatedCount} murid.`);
      document.getElementById("modal-import-students").classList.add("hidden");
      this.renderMasterStudents();
      this.renderMasterKelas();
    } catch (err) {
      this.showToast("Galat Import", err.message, "error");
    }
  }

  // =========================================================================
  // VIEW: ADMIN - BUAT & KELOLA TUGAS (RPD Section 3.3 b)
  // =========================================================================

  renderAdminTugas() {
    const taskListArea = document.getElementById("admin-task-list");
    const classCheckboxesArea = document.getElementById("task-form-classes");
    if (!taskListArea) return;

    const tasks = window.storageManager.getTugas();
    const classes = window.storageManager.getKelas();

    // Populate target class checkboxes in create form
    if (classCheckboxesArea) {
      classCheckboxesArea.innerHTML = classes.map(c => `
        <label class="flex items-center gap-2 p-2 rounded-lg bg-surface-container-low hover:bg-surface-container cursor-pointer font-label-md text-label-md">
          <input type="checkbox" name="task-target-class" value="${c.id}" class="rounded text-primary focus:ring-primary w-4 h-4">
          <span>${c.nama}</span>
        </label>
      `).join("");
    }

    // Update metrics
    const totalEl = document.getElementById("task-metric-total");
    const activeEl = document.getElementById("task-metric-active");
    const lockedEl = document.getElementById("task-metric-locked");

    if (totalEl) totalEl.textContent = `${tasks.length} Instrumen`;
    if (activeEl) activeEl.textContent = `${tasks.filter(t => t.status === 'aktif').length} Tugas`;
    if (lockedEl) lockedEl.textContent = `${tasks.filter(t => t.status === 'dikunci').length} Tugas`;

    if (tasks.length === 0) {
      taskListArea.innerHTML = `
        <div class="p-8 rounded-xl bg-surface-container-lowest text-center flex flex-col items-center gap-2 shadow-sm">
          <span class="material-symbols-outlined text-4xl text-outline">assignment_add</span>
          <span class="font-title-md text-on-surface">Belum Ada Instrumen Tugas</span>
          <p class="font-body-sm text-outline">Gunakan panel di sebelah kanan untuk membuat tugas penilaian murid pertama Anda.</p>
        </div>
      `;
      return;
    }

    const classMap = new Map(classes.map(c => [c.id, c.nama]));

    taskListArea.innerHTML = tasks.map(t => {
      let statusBadge = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-label-sm text-label-sm font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Aktif</span>`;
      if (t.status === 'dikunci') {
        statusBadge = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 font-label-sm text-label-sm font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>Terkunci</span>`;
      } else if (t.status === 'draf') {
        statusBadge = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container-high text-outline font-label-sm text-label-sm font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-outline"></span>Draf</span>`;
      }

      const targetClassNames = (t.kelas_ids || []).map(id => classMap.get(id) || id).join(", ");
      const deadlineText = t.tenggat ? new Date(t.tenggat).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "Tidak ada tenggat";

      return `
        <div class="p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-sm border border-surface-container-high/60 hover:shadow-md transition-all">
          <div class="flex items-start justify-between gap-space-sm">
            <div class="flex flex-col gap-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                ${statusBadge}
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm">
                  <span class="material-symbols-outlined text-[14px]">${t.jenis_bukti === 'gambar' ? 'image' : 'article'}</span>
                  ${t.jenis_bukti === 'gambar' ? 'Bukti Foto (Maks. 5)' : 'Jawaban Teks'}
                </span>
                <span class="text-outline-variant font-label-sm">•</span>
                <span class="font-label-sm text-outline">Maks. ${t.nilai_max} Poin</span>
              </div>
              <h3 class="font-headline-md text-headline-md text-on-surface font-bold tracking-tight mt-1 truncate">${t.judul}</h3>
              <p class="font-body-sm text-on-surface-variant line-clamp-2">${t.deskripsi || "Tidak ada petunjuk khusus."}</p>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button class="p-2 rounded-lg hover:bg-surface-container text-primary transition-colors" title="Duplikat Tugas" onclick="app.handleDuplicateTask('${t.id}')">
                <span class="material-symbols-outlined text-lg leading-none">content_copy</span>
              </button>
              <button class="p-2 rounded-lg hover:bg-surface-container text-on-surface transition-colors" title="${t.status === 'dikunci' ? 'Buka Kunci' : 'Kunci Tugas'}" onclick="app.handleToggleLockTask('${t.id}')">
                <span class="material-symbols-outlined text-lg leading-none ${t.status === 'dikunci' ? 'text-rose-600' : 'text-outline'}">${t.status === 'dikunci' ? 'lock' : 'lock_open'}</span>
              </button>
              <button class="p-2 rounded-lg hover:bg-surface-container text-primary transition-colors" title="Edit Tugas" onclick="app.loadTaskIntoForm('${t.id}')">
                <span class="material-symbols-outlined text-lg leading-none">edit</span>
              </button>
              <button class="p-2 rounded-lg hover:bg-error-container text-error transition-colors" title="Hapus Tugas" onclick="app.handleDeleteTask('${t.id}')">
                <span class="material-symbols-outlined text-lg leading-none">delete</span>
              </button>
            </div>
          </div>
          <div class="pt-2 border-t border-surface-container-high/40 flex flex-wrap items-center justify-between gap-2 text-outline font-label-sm text-label-sm">
            <span class="flex items-center gap-1 text-on-surface-variant">
              <span class="material-symbols-outlined text-[15px] text-primary">groups</span>
              Target: ${targetClassNames || "Semua Rombel"}
            </span>
            <span class="flex items-center gap-1">
              <span class="material-symbols-outlined text-[15px]">event</span>
              Tenggat: ${deadlineText}
            </span>
          </div>
        </div>
      `;
    }).join("");
  }

  resetTaskForm() {
    const form = document.getElementById("admin-task-form");
    if (!form) return;
    form.reset();
    document.getElementById("task-form-id").value = "";
    document.getElementById("task-form-title-label").textContent = "Buat Instrumen Tugas Baru";
    document.getElementById("task-form-submit-btn-text").textContent = "Terbitkan Tugas";
  }

  loadTaskIntoForm(id) {
    const task = window.storageManager.getTugasById(id);
    if (!task) return;

    document.getElementById("task-form-id").value = task.id;
    document.getElementById("task-form-judul").value = task.judul;
    document.getElementById("task-form-deskripsi").value = task.deskripsi || "";
    document.getElementById("task-form-jenis").value = task.jenis_bukti;
    document.getElementById("task-form-status").value = task.status;
    document.getElementById("task-form-score").value = task.nilai_max;
    document.getElementById("task-form-chars").value = task.batas_karakter || 5000;

    if (task.tenggat) {
      // Format to datetime-local
      const d = new Date(task.tenggat);
      const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      document.getElementById("task-form-deadline").value = localIso;
    }

    // Check class checkboxes
    const cbs = document.querySelectorAll('input[name="task-target-class"]');
    cbs.forEach(cb => {
      cb.checked = (task.kelas_ids || []).includes(cb.value);
    });

    document.getElementById("task-form-title-label").textContent = "Ubah Instrumen Tugas";
    document.getElementById("task-form-submit-btn-text").textContent = "Simpan Perubahan";

    // Scroll form into view on mobile
    document.getElementById("admin-task-form-card").scrollIntoView({ behavior: "smooth" });
  }

  async handleTaskFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById("task-form-id").value;

    const selectedClasses = Array.from(document.querySelectorAll('input[name="task-target-class"]:checked')).map(cb => cb.value);

    const data = {
      judul: document.getElementById("task-form-judul").value,
      deskripsi: document.getElementById("task-form-deskripsi").value,
      kelas_ids: selectedClasses,
      jenis_bukti: document.getElementById("task-form-jenis").value,
      status: document.getElementById("task-form-status").value,
      nilai_max: document.getElementById("task-form-score").value,
      batas_karakter: document.getElementById("task-form-chars").value,
      tenggat: document.getElementById("task-form-deadline").value ? new Date(document.getElementById("task-form-deadline").value).toISOString() : null
    };

    try {
      if (id) {
        await window.storageManager.updateTugas(id, data);
        this.showToast("Berhasil", `Tugas "${data.judul}" berhasil diperbarui.`);
      } else {
        await window.storageManager.addTugas(data);
        this.showToast("Tugas Diterbitkan", `Tugas baru "${data.judul}" berhasil dibuat.`);
      }
      this.resetTaskForm();
      this.renderAdminTugas();
    } catch (err) {
      this.showToast("Galat", err.message, "error");
    }
  }

  async handleDuplicateTask(id) {
    try {
      const cloned = await window.storageManager.duplicateTugas(id);
      this.showToast("Berhasil Diduplikasi", `Salinan tugas dibuat dalam status Draf.`);
      this.renderAdminTugas();
    } catch (err) {
      this.showToast("Galat", err.message, "error");
    }
  }

  async handleToggleLockTask(id) {
    try {
      const updated = await window.storageManager.toggleLockTugas(id);
      this.showToast("Status Diubah", `Tugas sekarang berstatus ${updated.status}.`);
      this.renderAdminTugas();
    } catch (err) {
      this.showToast("Galat", err.message, "error");
    }
  }

  async handleDeleteTask(id) {
    const task = window.storageManager.getTugasById(id);
    if (!task) return;

    if (!confirm(`Hapus instrumen tugas "${task.judul}"? Seluruh berkas dan penilaian yang masuk pada tugas ini akan ikut dihapus.`)) return;

    try {
      await window.storageManager.deleteTugas(id);
      this.showToast("Terhapus", `Tugas "${task.judul}" berhasil dihapus.`);
      this.renderAdminTugas();
    } catch (err) {
      this.showToast("Galat", err.message, "error");
    }
  }

  // =========================================================================
  // VIEW: ADMIN - PENGATURAN & BACKUP / GITHUB BACKEND (RPD 3.3 d, 6, 7)
  // =========================================================================

  renderAdminSettings() {
    const config = window.storageManager.getConfig();
    const gh = window.githubBackend;

    // Institutional Profile Form
    document.getElementById("settings-nama-madrasah").value = config.nama_madrasah || "";
    document.getElementById("settings-sub-title").value = config.sub_title || "";
    document.getElementById("settings-tahun-pelajaran").value = config.tahun_pelajaran || "2026/2027";
    document.getElementById("settings-semester").value = config.semester || "Ganjil";
    document.getElementById("settings-kepala-madrasah").value = config.kepala_madrasah || "";
    document.getElementById("settings-nip-kepala").value = config.nip_kepala || "";
    document.getElementById("settings-guru-pengampu").value = config.guru_pengampu || "";
    document.getElementById("settings-alamat").value = config.alamat || "";

    // GitHub Direct Backend Form
    if (gh && gh.config) {
      document.getElementById("settings-gh-owner").value = gh.config.owner || "";
      document.getElementById("settings-gh-repo").value = gh.config.repo || "";
      document.getElementById("settings-gh-branch").value = gh.config.branch || "main";
      document.getElementById("settings-gh-token").value = gh.config.token || "";
    }

    // Render Audit logs in table
    const auditLogs = window.AuditLogger.getLogs();
    const auditTable = document.getElementById("settings-audit-table-body");
    if (auditTable) {
      auditTable.innerHTML = auditLogs.slice(0, 25).map(log => `
        <tr class="hover:bg-surface-container-low transition-colors border-b border-surface-container-high/60 text-body-sm">
          <td class="p-3 text-outline tabular-nums">${new Date(log.timestamp).toLocaleString("id-ID")}</td>
          <td class="p-3 font-semibold text-on-surface">${log.user}</td>
          <td class="p-3">
            <span class="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-fixed font-label-sm text-label-sm font-semibold">${log.action}</span>
          </td>
          <td class="p-3 text-on-surface-variant">${log.details}</td>
        </tr>
      `).join("");
    }
  }

  async handleProfileSettingsSubmit(e) {
    e.preventDefault();
    const updated = {
      nama_madrasah: document.getElementById("settings-nama-madrasah").value,
      sub_title: document.getElementById("settings-sub-title").value,
      tahun_pelajaran: document.getElementById("settings-tahun-pelajaran").value,
      semester: document.getElementById("settings-semester").value,
      kepala_madrasah: document.getElementById("settings-kepala-madrasah").value,
      nip_kepala: document.getElementById("settings-nip-kepala").value,
      guru_pengampu: document.getElementById("settings-guru-pengampu").value,
      alamat: document.getElementById("settings-alamat").value
    };

    try {
      await window.storageManager.updateConfig(updated);
      this.updateInstitutionalBranding();
      this.showToast("Berhasil", "Profil identitas madrasah berhasil diperbarui.");
    } catch (err) {
      this.showToast("Galat", err.message, "error");
    }
  }

  async handleGitHubSettingsSubmit(e) {
    e.preventDefault();
    const owner = document.getElementById("settings-gh-owner").value;
    const repo = document.getElementById("settings-gh-repo").value;
    const branch = document.getElementById("settings-gh-branch").value || "main";
    const token = document.getElementById("settings-gh-token").value;

    const gh = window.githubBackend;
    gh.saveConfig({ owner, repo, branch, token });

    const btn = document.getElementById("btn-test-github");
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-lg">progress_activity</span> Menguji...`;

    try {
      const result = await gh.testConnection();
      if (result.success) {
        this.showToast("Koneksi Berhasil", result.message);
        this.updateCloudTelemetryBadge();
      } else {
        this.showToast("Koneksi Gagal", result.message, "error");
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<span class="material-symbols-outlined text-lg">cable</span><span>Uji Koneksi GitHub</span>`;
    }
  }

  async handleInitGitHubDatabase() {
    const gh = window.githubBackend;
    if (!gh.isConfigured()) {
      this.showToast("Perhatian", "Lengkapi dan simpan token repositori GitHub terlebih dahulu.", "warning");
      return;
    }

    if (!confirm("Jalankan otomatisasi pembuatan struktur folder dan database di repositori GitHub privat Anda?")) return;

    try {
      const res = await gh.initRepositoryStructure();
      this.showToast("Inisialisasi Selesai", res.message);
      // Synchronize immediately
      await window.storageManager.syncWithGitHub();
      this.updateCloudTelemetryBadge();
      this.renderAdminSettings();
    } catch (err) {
      this.showToast("Gagal Inisialisasi", err.message, "error");
    }
  }

  async handleSyncGitHubNow() {
    const btn = document.getElementById("btn-sync-github-now");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-lg">sync</span> Menyinkronkan...`;
    }

    try {
      const res = await window.storageManager.syncWithGitHub();
      if (res.success) {
        this.showToast("Sinkronisasi Sukses", res.message);
        this.updateCloudTelemetryBadge();
        this.renderAdminMaster();
        this.renderAdminTugas();
      } else {
        this.showToast("Gagal Sinkron", res.message, "error");
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-symbols-outlined text-lg">sync</span><span>Sinkronkan Sekarang</span>`;
      }
    }
  }

  async handleAdminChangePassword(e) {
    e.preventDefault();
    const oldPass = document.getElementById("admin-pass-old").value;
    const newPass = document.getElementById("admin-pass-new").value;
    const confirmPass = document.getElementById("admin-pass-confirm").value;

    try {
      await window.authManager.changePassword(oldPass, newPass, confirmPass);
      this.showToast("Kata Sandi Diganti", "Kata sandi akun administrator berhasil diperbarui.");
      document.getElementById("admin-pass-old").value = "";
      document.getElementById("admin-pass-new").value = "";
      document.getElementById("admin-pass-confirm").value = "";
      this.checkAdminPasswordBanner();
    } catch (err) {
      this.showToast("Gagal Ganti Sandi", err.message, "error");
    }
  }

  // --- Backup & Restore (RPD Section 6) ---
  async handleDownloadBackup(includeImages = true) {
    try {
      const backupObj = await window.storageManager.createBackup(includeImages);
      const jsonString = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObj, null, 2));
      const downloadAnchor = document.createElement("a");
      const dateStr = new Date().toISOString().split("T")[0];
      downloadAnchor.setAttribute("href", jsonString);
      downloadAnchor.setAttribute("download", `Backup_TugasKu_${dateStr}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      this.showToast("Backup Siap", "Berkas cadangan data madrasah berhasil diunduh.");
      await window.AuditLogger.log("BACKUP_DOWNLOAD", `Unduh cadangan data sistem (Gambar: ${includeImages ? "Ya" : "Tidak"})`);
    } catch (err) {
      this.showToast("Galat Backup", err.message, "error");
    }
  }

  openRestoreModal() {
    const modal = document.getElementById("modal-restore");
    document.getElementById("restore-file-input").value = "";
    document.getElementById("restore-admin-pass").value = "";
    document.getElementById("restore-preview-stats").classList.add("hidden");
    document.getElementById("restore-confirm-btn").classList.add("hidden");
    this._pendingRestoreData = null;
    modal.classList.remove("hidden");
  }

  async handleRestoreFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.version) throw new Error("Struktur berkas backup tidak valid.");

      this._pendingRestoreData = parsed;

      // Populate preview counts
      document.getElementById("restore-preview-classes").textContent = (parsed.kelas || []).length;
      document.getElementById("restore-preview-students").textContent = (parsed.users || []).filter(u => u.role === 'murid').length;
      document.getElementById("restore-preview-tasks").textContent = (parsed.tugas || []).length;

      document.getElementById("restore-preview-stats").classList.remove("hidden");
      document.getElementById("restore-confirm-btn").classList.remove("hidden");
    } catch (err) {
      this.showToast("Format Tidak Valid", err.message, "error");
    }
  }

  async executeRestore() {
    if (!this._pendingRestoreData) return;

    const pass = document.getElementById("restore-admin-pass").value;
    if (!pass) {
      this.showToast("Kredensial Dibutuhkan", "Harap masukkan kata sandi admin untuk otorisasi restore.", "warning");
      return;
    }

    const currentUser = window.authManager.getCurrentUser();
    const adminUser = window.storageManager.getUserById(currentUser.id);
    const valid = await window.CryptoUtils.verifyPassword(pass, adminUser.password_hash, adminUser.salt);
    if (!valid) {
      this.showToast("Kata Sandi Salah", "Kata sandi admin yang dimasukkan tidak sesuai.", "error");
      return;
    }

    const mode = document.querySelector('input[name="restore-mode"]:checked').value; // replace | merge

    try {
      await window.storageManager.restoreBackup(this._pendingRestoreData, mode);
      this.showToast("Restore Selesai", "Data sistem berhasil dikembalikan. Cadangan pengaman snapshot otomatis dibuat.");
      document.getElementById("modal-restore").classList.add("hidden");
      this.renderAdminMaster();
      this.renderAdminTugas();
      this.renderAdminSettings();
    } catch (err) {
      this.showToast("Galat Restore", err.message, "error");
    }
  }

  // =========================================================================
  // VIEW: MURID / MURID (RPD Section 3.2)
  // =========================================================================

  async renderStudentDashboard() {
    const currentUser = window.authManager.getCurrentUser();
    if (!currentUser) return;

    // Greeting
    const greetingEl = document.getElementById("student-greeting-name");
    const classBadgeEl = document.getElementById("student-greeting-class");
    const classObj = window.storageManager.getKelasById(currentUser.kelas_id);

    if (greetingEl) greetingEl.textContent = `Assalamu'alaikum, ${currentUser.nama}`;
    if (classBadgeEl) classBadgeEl.textContent = classObj ? `Rombel: ${classObj.nama}` : "Murid";

    // Get active tasks for student's class
    const allTasks = window.storageManager.getTugas();
    const classTasks = allTasks.filter(t => t.kelas_ids.includes(currentUser.kelas_id) && t.status !== 'draf');

    // Load submissions for each task
    const studentSubmissions = [];
    for (const t of classTasks) {
      const sub = await window.storageManager.getStudentSubmission(t.id, currentUser.id);
      if (sub) studentSubmissions.push(sub);
    }

    const subMap = new Map(studentSubmissions.map(s => [s.tugas_id, s]));

    const totalActive = classTasks.length;
    const completedTasks = studentSubmissions.length;
    const pendingTasks = Math.max(0, totalActive - completedTasks);
    // RPD 3.2: Murid melihat nilai hanya jika sudah dipublikasikan admin
    const gradedTasks = studentSubmissions.filter(s => s.status_publikasi && s.nilai !== null && s.nilai !== "").length;

    document.getElementById("student-stat-active").textContent = totalActive;
    document.getElementById("student-stat-completed").textContent = completedTasks;
    document.getElementById("student-stat-pending").textContent = pendingTasks;
    document.getElementById("student-stat-graded").textContent = gradedTasks;

    // Urgent tasks (closest deadline first)
    const urgentTasks = [...classTasks].sort((a, b) => new Date(a.tenggat || 0) - new Date(b.tenggat || 0));
    const urgentContainer = document.getElementById("student-urgent-tasks-container");

    if (urgentTasks.length === 0) {
      urgentContainer.innerHTML = `
        <div class="p-8 rounded-xl bg-surface-container-lowest text-center flex flex-col items-center gap-2 shadow-sm">
          <span class="material-symbols-outlined text-4xl text-emerald-600">task_alt</span>
          <span class="font-title-md text-on-surface">Alhamdulillah, Tidak Ada Tugas Aktif</span>
          <p class="font-body-sm text-outline">Semua tugas untuk rombongan belajar Anda telah terselesaikan.</p>
        </div>
      `;
      return;
    }

    urgentContainer.innerHTML = urgentTasks.map(t => {
      const sub = subMap.get(t.id);
      const isPastDeadline = t.tenggat && new Date() > new Date(t.tenggat);
      const isLocked = t.status === 'dikunci';

      let statusBadge = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 font-label-sm text-label-sm font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>Belum Dikerjakan</span>`;
      let actionBtn = `<button class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md transition-all shadow-md active:scale-95" onclick="app.navigateTo('student-submit', { taskId: '${t.id}' })"><span>Kerjakan Tugas</span><span class="material-symbols-outlined text-base">arrow_forward</span></button>`;

      if (sub) {
        if (sub.status_publikasi && sub.nilai !== null) {
          statusBadge = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-label-sm text-label-sm font-semibold"><span class="material-symbols-outlined text-[13px]">verified</span> Nilai: ${sub.nilai}/${t.nilai_max}</span>`;
        } else {
          statusBadge = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200 font-label-sm text-label-sm font-semibold"><span class="material-symbols-outlined text-[13px]">schedule</span> Terkirim (Menunggu Penilaian)</span>`;
        }

        if (!isLocked && !isPastDeadline && (!sub.nilai || sub.nilai === "")) {
          actionBtn = `<button class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-primary font-label-md text-label-md transition-all" onclick="app.navigateTo('student-submit', { taskId: '${t.id}' })"><span>Ubah Kiriman</span><span class="material-symbols-outlined text-base">edit</span></button>`;
        } else {
          actionBtn = `<button class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container text-outline font-label-md text-label-md" onclick="app.navigateTo('student-submit', { taskId: '${t.id}' })"><span>Lihat Kiriman</span><span class="material-symbols-outlined text-base">visibility</span></button>`;
        }
      } else if (isLocked || isPastDeadline) {
        statusBadge = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container-high text-outline font-label-sm text-label-sm font-semibold"><span class="material-symbols-outlined text-[13px]">lock</span> Ditutup</span>`;
        actionBtn = `<span class="font-label-sm text-outline italic">Waktu Pengumpulan Habis</span>`;
      }

      return `
        <div class="p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-space-md border border-surface-container-high/60">
          <div class="flex flex-col gap-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              ${statusBadge}
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm">
                <span class="material-symbols-outlined text-[13px]">${t.jenis_bukti === 'gambar' ? 'image' : 'article'}</span>
                ${t.jenis_bukti === 'gambar' ? 'Format Foto/Gambar' : 'Format Teks'}
              </span>
            </div>
            <h3 class="font-headline-md text-headline-md text-on-surface font-bold tracking-tight mt-1 truncate">${t.judul}</h3>
            <p class="font-body-sm text-outline flex items-center gap-1">
              <span class="material-symbols-outlined text-[15px]">event</span>
              Tenggat: ${t.tenggat ? new Date(t.tenggat).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "Tanpa Batas Waktu"}
            </p>
          </div>
          <div class="shrink-0 flex items-center">
            ${actionBtn}
          </div>
        </div>
      `;
    }).join("");
  }

  // --- Student Assignment Submission (RPD Section 3.2 b & 5.6) ---
  async renderStudentSubmit(taskId = null) {
    const currentUser = window.authManager.getCurrentUser();
    if (!currentUser) return;

    const taskSelect = document.getElementById("student-submit-task-select");
    const tasks = window.storageManager.getTugas().filter(t => t.kelas_ids.includes(currentUser.kelas_id) && t.status !== 'draf');

    taskSelect.innerHTML = tasks.map(t => 
      `<option value="${t.id}" ${taskId === t.id ? "selected" : ""}>${t.judul} (${t.jenis_bukti === 'gambar' ? 'Gambar' : 'Teks'})</option>`
    ).join("");

    const activeTaskId = taskId || (tasks.length > 0 ? tasks[0].id : null);
    if (!activeTaskId) {
      document.getElementById("student-submit-form-area").innerHTML = `
        <div class="p-8 rounded-xl bg-surface-container-lowest text-center text-outline shadow-sm">
          Tidak ada tugas aktif yang tersedia untuk kelas Anda saat ini.
        </div>
      `;
      return;
    }

    this.selectedTaskId = activeTaskId;
    taskSelect.value = activeTaskId;

    const task = window.storageManager.getTugasById(activeTaskId);
    const existingSub = await window.storageManager.getStudentSubmission(activeTaskId, currentUser.id);

    // Populate Task Metadata Header
    document.getElementById("submit-task-title").textContent = task.judul;
    document.getElementById("submit-task-desc").textContent = task.deskripsi || "Kerjakan instruksi di atas sesuai dengan petunjuk guru pengampu.";
    document.getElementById("submit-task-deadline").textContent = task.tenggat ? new Date(task.tenggat).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-";
    document.getElementById("submit-task-max-score").textContent = `${task.nilai_max} Poin`;
    document.getElementById("submit-task-type-badge").textContent = task.jenis_bukti === 'gambar' ? "Format: Foto / Gambar (Maks. 5 File, 2MB/Foto)" : `Format: Teks (Batas ${task.batas_karakter || 5000} Karakter)`;

    const isLocked = task.status === 'dikunci';
    const isPastDeadline = task.tenggat && new Date() > new Date(task.tenggat);
    const isGraded = existingSub && existingSub.nilai !== null && existingSub.nilai !== "";

    const lockNotice = document.getElementById("submit-lock-notice");
    const submitBtn = document.getElementById("student-submit-btn");
    const deleteBtn = document.getElementById("student-delete-sub-btn");

    if (isLocked || isPastDeadline || isGraded) {
      lockNotice.classList.remove("hidden");
      if (isGraded) {
        lockNotice.textContent = "Pengumpulan dikunci: Tugas Anda telah dinilai oleh guru.";
      } else if (isLocked) {
        lockNotice.textContent = "Pengumpulan dikunci: Guru telah mengunci instrumen tugas ini.";
      } else {
        lockNotice.textContent = "Pengumpulan ditutup: Tenggat waktu pengerjaan telah berakhir.";
      }
      submitBtn.disabled = true;
      submitBtn.classList.add("opacity-50", "cursor-not-allowed");
      if (deleteBtn) deleteBtn.classList.add("hidden");
    } else {
      lockNotice.classList.add("hidden");
      submitBtn.disabled = false;
      submitBtn.classList.remove("opacity-50", "cursor-not-allowed");
      if (deleteBtn && existingSub) deleteBtn.classList.remove("hidden");
      else if (deleteBtn) deleteBtn.classList.add("hidden");
    }

    // Render proof-type specific input fields
    const textSection = document.getElementById("submit-text-section");
    const imageSection = document.getElementById("submit-image-section");

    if (task.jenis_bukti === 'teks') {
      textSection.classList.remove("hidden");
      imageSection.classList.add("hidden");

      const textArea = document.getElementById("student-text-answer");
      const charCounter = document.getElementById("student-char-counter");
      const maxChars = task.batas_karakter || 5000;

      textArea.maxLength = maxChars;
      textArea.value = existingSub ? existingSub.teks : "";
      charCounter.textContent = `${textArea.value.length} / ${maxChars} karakter`;

      textArea.oninput = () => {
        charCounter.textContent = `${textArea.value.length} / ${maxChars} karakter`;
      };
    } else {
      textSection.classList.add("hidden");
      imageSection.classList.remove("hidden");

      // Reset staged images
      this.stagedImages = existingSub && existingSub.gambar_list ? [...existingSub.gambar_list] : [];
      this.renderStagedImages();
    }
  }

  async handleImageFileInput(files) {
    if (!files || files.length === 0) return;

    const validation = window.ImageCompressor.validateFiles(files, this.stagedImages.length);
    if (!validation.valid) {
      this.showToast("Batas Unggahan", validation.message, "warning");
      return;
    }

    const loader = document.getElementById("image-upload-loader");
    if (loader) loader.classList.remove("hidden");

    try {
      const compressedList = await window.ImageCompressor.batchCompress(files);
      this.stagedImages.push(...compressedList);
      this.renderStagedImages();
      this.showToast("Foto Siap", `${compressedList.length} foto berhasil dikompresi otomatis (WebP).`);
    } catch (err) {
      this.showToast("Galat Kompresi", err.message, "error");
    } finally {
      if (loader) loader.classList.add("hidden");
    }
  }

  renderStagedImages() {
    const gallery = document.getElementById("staged-images-gallery");
    const countBadge = document.getElementById("staged-image-count");
    if (!gallery) return;

    if (countBadge) countBadge.textContent = `${this.stagedImages.length} / ${APP_CONFIG.LIMITS.MAX_IMAGES_PER_SUBMISSION} Foto`;

    if (this.stagedImages.length === 0) {
      gallery.innerHTML = `<div class="col-span-full py-4 text-center text-outline font-body-sm italic">Belum ada foto yang dilampirkan.</div>`;
      return;
    }

    gallery.innerHTML = this.stagedImages.map((img, idx) => `
      <div class="relative group aspect-square rounded-xl overflow-hidden bg-surface-container-high border border-surface-container-highest shadow-sm">
        <img src="${img.dataUrl}" alt="Pratinjau" class="w-full h-full object-cover">
        <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button type="button" class="p-1.5 rounded-full bg-white text-on-surface hover:scale-110 transition-transform" title="Perbesar" onclick="app.openLightbox(app.stagedImages, ${idx})">
            <span class="material-symbols-outlined text-base">zoom_in</span>
          </button>
          <button type="button" class="p-1.5 rounded-full bg-error text-white hover:scale-110 transition-transform" title="Hapus Foto" onclick="app.removeStagedImage(${idx})">
            <span class="material-symbols-outlined text-base">delete</span>
          </button>
        </div>
        <div class="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
          ${Math.round(img.sizeBytes / 1024)} KB
        </div>
      </div>
    `).join("");
  }

  removeStagedImage(index) {
    this.stagedImages.splice(index, 1);
    this.renderStagedImages();
  }

  async handleStudentSubmitForm(e) {
    e.preventDefault();
    if (this.isSubmitting) return;

    const currentUser = window.authManager.getCurrentUser();
    const task = window.storageManager.getTugasById(this.selectedTaskId);
    if (!currentUser || !task) return;

    const submitBtn = document.getElementById("student-submit-btn");

    // Idempotency protection: momentarily disable button
    this.isSubmitting = true;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="material-symbols-outlined animate-spin text-lg">progress_activity</span> Mengirim Tugas...`;

    try {
      const payload = {};
      if (task.jenis_bukti === 'teks') {
        payload.teks = document.getElementById("student-text-answer").value;
      } else {
        payload.gambar_list = this.stagedImages;
      }

      await window.storageManager.submitTugas(this.selectedTaskId, currentUser, payload);
      this.showToast("Tugas Terkirim!", "Jawaban tugas Anda berhasil disimpan ke database madrasah.");
      this.navigateTo("student-dashboard");
    } catch (err) {
      this.showToast("Gagal Kirim", err.message, "error");
    } finally {
      this.isSubmitting = false;
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Kirim Jawaban Tugas</span><span class="material-symbols-outlined text-base">send</span>`;
    }
  }

  async handleStudentDeleteSubmission() {
    const currentUser = window.authManager.getCurrentUser();
    if (!currentUser || !this.selectedTaskId) return;

    if (!confirm("Apakah Anda yakin ingin menarik/menghapus kiriman tugas ini?")) return;

    try {
      await window.storageManager.deleteSubmission(this.selectedTaskId, currentUser.id);
      this.showToast("Kiriman Ditarik", "Kiriman tugas Anda telah berhasil dihapus.");
      this.navigateTo("student-dashboard");
    } catch (err) {
      this.showToast("Gagal Menghapus", err.message, "error");
    }
  }

  // --- Student Rekap & Grade Details (RPD Section 3.2 c) ---
  async renderStudentRekap() {
    const currentUser = window.authManager.getCurrentUser();
    if (!currentUser) return;

    const activeTab = document.querySelector(".student-rekap-tab.active").getAttribute("data-tab"); // "belum" | "sudah"
    const searchVal = (document.getElementById("student-rekap-search").value || "").toLowerCase().trim();
    const container = document.getElementById("student-rekap-list-container");

    const allTasks = window.storageManager.getTugas().filter(t => t.kelas_ids.includes(currentUser.kelas_id) && t.status !== 'draf');

    const submissions = [];
    for (const t of allTasks) {
      const sub = await window.storageManager.getStudentSubmission(t.id, currentUser.id);
      if (sub) submissions.push(sub);
    }

    const subMap = new Map(submissions.map(s => [s.tugas_id, s]));

    // Filter tasks by active tab
    const filteredTasks = allTasks.filter(t => {
      const sub = subMap.get(t.id);
      const isDone = !!sub;
      const matchTab = activeTab === "sudah" ? isDone : !isDone;
      const matchSearch = !searchVal || t.judul.toLowerCase().includes(searchVal);
      return matchTab && matchSearch;
    });

    if (filteredTasks.length === 0) {
      container.innerHTML = `
        <div class="p-8 rounded-xl bg-surface-container-lowest text-center text-outline shadow-sm">
          Tidak ada data tugas pada tab ini.
        </div>
      `;
      return;
    }

    container.innerHTML = filteredTasks.map(t => {
      const sub = subMap.get(t.id);
      let gradeCardHtml = "";

      if (sub) {
        // RPD 3.2 c: Murid melihat nilai dan catatan guru HANYA JIKA sudah dipublikasikan admin!
        if (sub.status_publikasi && sub.nilai !== null && sub.nilai !== "") {
          gradeCardHtml = `
            <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col gap-1 mt-2">
              <div class="flex items-center justify-between">
                <span class="font-label-sm text-label-sm text-emerald-800 uppercase tracking-wider font-bold">Nilai Diperoleh:</span>
                <span class="font-headline-md text-headline-md text-primary font-bold tabular-nums">${sub.nilai} <span class="text-xs text-outline font-normal">/ ${t.nilai_max}</span></span>
              </div>
              ${sub.catatan_guru ? `
                <div class="mt-1 pt-1 border-t border-emerald-200/60 font-body-sm text-emerald-900">
                  <span class="font-semibold">Catatan Guru:</span> "${this.escapeHtml(sub.catatan_guru)}"
                </div>
              ` : ""}
            </div>
          `;
        } else {
          gradeCardHtml = `
            <div class="p-2.5 rounded-xl bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm flex items-center gap-2 mt-2">
              <span class="material-symbols-outlined text-primary text-base">hourglass_top</span>
              <span>Menunggu penilaian / publikasi nilai dari guru pengampu.</span>
            </div>
          `;
        }
      }

      return `
        <div class="p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-sm border border-surface-container-high/60">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div class="flex flex-col gap-0.5">
              <h3 class="font-title-md text-title-md text-on-surface font-bold">${t.judul}</h3>
              <p class="font-body-sm text-outline flex items-center gap-2">
                <span>Tenggat: ${t.tenggat ? new Date(t.tenggat).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }) : "-"}</span>
                ${sub ? `<span>• Waktu Kirim: ${new Date(sub.submitted_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</span>` : ""}
              </p>
            </div>
            <div>
              ${sub ? `
                <button class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-primary font-label-md text-label-md transition-colors" onclick="app.navigateTo('student-submit', { taskId: '${t.id}' })">
                  <span class="material-symbols-outlined text-base">visibility</span>
                  <span>Lihat Kiriman</span>
                </button>
              ` : `
                <button class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-on-primary font-label-md text-label-md shadow-sm" onclick="app.navigateTo('student-submit', { taskId: '${t.id}' })">
                  <span>Kerjakan</span>
                  <span class="material-symbols-outlined text-base">arrow_forward</span>
                </button>
              `}
            </div>
          </div>
          ${gradeCardHtml}
        </div>
      `;
    }).join("");
  }

  // --- Student Settings (RPD Section 3.2 d) ---
  renderStudentSettings() {
    const currentUser = window.authManager.getCurrentUser();
    if (!currentUser) return;

    document.getElementById("student-settings-name").textContent = currentUser.nama;
    document.getElementById("student-settings-nisn").textContent = `NISN / Username: ${currentUser.username}`;
    const classObj = window.storageManager.getKelasById(currentUser.kelas_id);
    document.getElementById("student-settings-class").textContent = classObj ? classObj.nama : "-";
  }

  async handleStudentChangePassword(e) {
    e.preventDefault();
    const oldPass = document.getElementById("student-pass-old").value;
    const newPass = document.getElementById("student-pass-new").value;
    const confirmPass = document.getElementById("student-pass-confirm").value;

    try {
      await window.authManager.changePassword(oldPass, newPass, confirmPass);
      this.showToast("Kata Sandi Diganti", "Kata sandi Anda berhasil diperbarui.");
      document.getElementById("student-pass-old").value = "";
      document.getElementById("student-pass-new").value = "";
      document.getElementById("student-pass-confirm").value = "";
    } catch (err) {
      this.showToast("Gagal Ganti Sandi", err.message, "error");
    }
  }

  // =========================================================================
  // LIGHTBOX & MODAL UTILITIES
  // =========================================================================

  openLightbox(images, index = 0) {
    this.lightboxImages = images;
    this.lightboxIndex = index;

    const modal = document.getElementById("lightbox-modal");
    const imgEl = document.getElementById("lightbox-image");
    const countEl = document.getElementById("lightbox-counter");

    if (!modal || !imgEl) return;

    const current = images[index];
    imgEl.src = current ? current.dataUrl : "";
    if (countEl) countEl.textContent = `${index + 1} / ${images.length}`;

    modal.classList.remove("hidden");
  }

  navigateLightbox(direction) {
    if (!this.lightboxImages || this.lightboxImages.length === 0) return;
    let nextIndex = this.lightboxIndex + direction;
    if (nextIndex < 0) nextIndex = this.lightboxImages.length - 1;
    if (nextIndex >= this.lightboxImages.length) nextIndex = 0;
    this.openLightbox(this.lightboxImages, nextIndex);
  }

  closeLightbox() {
    const modal = document.getElementById("lightbox-modal");
    if (modal) modal.classList.add("hidden");
  }

  escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // =========================================================================
  // EVENT LISTENERS SETUP
  // =========================================================================

  setupEventListeners() {
    // Navigation triggers
    document.querySelectorAll("[data-nav-view]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const targetView = btn.getAttribute("data-nav-view");
        this.navigateTo(targetView);
      });
    });

    // Logout triggers
    document.querySelectorAll(".btn-trigger-logout").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        if (confirm("Apakah Anda yakin ingin keluar dari aplikasi?")) {
          window.authManager.logout();
          this.navigateTo("login");
          this.showToast("Sampai Jumpa", "Anda telah berhasil keluar.");
        }
      });
    });

    // Rekap Class and Task Selectors
    const rekapClassSelect = document.getElementById("rekap-select-kelas");
    if (rekapClassSelect) {
      rekapClassSelect.addEventListener("change", (e) => {
        this.selectedClassId = e.target.value;
        this.renderAdminRekap();
      });
    }

    const rekapTaskSelect = document.getElementById("rekap-select-tugas");
    if (rekapTaskSelect) {
      rekapTaskSelect.addEventListener("change", (e) => {
        this.selectedTaskId = e.target.value;
        this.renderAdminRekap();
      });
    }

    // Student Rekap Tab switches
    document.querySelectorAll(".student-rekap-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".student-rekap-tab").forEach(t => {
          t.classList.remove("active", "bg-primary", "text-on-primary");
          t.classList.add("text-on-surface-variant");
        });
        tab.classList.add("active", "bg-primary", "text-on-primary");
        tab.classList.remove("text-on-surface-variant");
        this.renderStudentRekap();
      });
    });

    // Student submit task selector change
    const submitTaskSelect = document.getElementById("student-submit-task-select");
    if (submitTaskSelect) {
      submitTaskSelect.addEventListener("change", (e) => {
        this.renderStudentSubmit(e.target.value);
      });
    }

    // Toggle Task Lock from Top Rekap Bar
    const btnLockToggle = document.getElementById("btn-lock-toggle");
    if (btnLockToggle) {
      btnLockToggle.addEventListener("click", () => {
        if (this.selectedTaskId) {
          this.handleToggleLockTask(this.selectedTaskId).then(() => {
            this.renderAdminRekap();
          });
        }
      });
    }

    // Master student filter triggers
    const studentFilterClass = document.getElementById("master-student-filter-class");
    if (studentFilterClass) {
      studentFilterClass.addEventListener("change", () => this.renderMasterStudents());
    }

    const studentSearchInput = document.getElementById("master-student-search");
    if (studentSearchInput) {
      studentSearchInput.addEventListener("input", () => this.renderMasterStudents());
    }

    // Close modals on backdrop click
    document.querySelectorAll(".modal-backdrop-close").forEach(bg => {
      bg.addEventListener("click", (e) => {
        if (e.target === bg) {
          bg.classList.add("hidden");
        }
      });
    });
  }
}

// Instantiate and expose globally
window.app = new TugasKuApp();
document.addEventListener("DOMContentLoaded", () => {
  window.app.init();
});
