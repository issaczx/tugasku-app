/**
 * TugasKu - Application Configuration & Institutional Defaults
 * References: rpd.md & Stitch Madrasah Modern Administration
 */

const APP_CONFIG = {
  APP_NAME: "TugasKu",
  VERSION: "2.0.0",
  SCHEMA_VERSION: "2.0",
  STORAGE_PREFIX: "tugasku_",
  
  // Default Institutional Identity
  DEFAULT_PROFILE: {
    nama_madrasah: "MTs Negeri 1 Model",
    sub_title: "Sistem Pembelajaran & Penilaian Digital Terpadu",
    tahun_pelajaran: "2026/2027",
    semester: "Ganjil",
    jenjang: "Madrasah Tsanawiyah (MTs)",
    akreditasi: "A (Unggul)",
    nsm_npsn: "121233730001 / 20363210",
    alamat: "Jl. Pendidikan Karakter No. 12, Semarang, Jawa Tengah",
    kepala_madrasah: "Drs. H. Miftah Faridl, M.Ag",
    nip_kepala: "197203151998031002",
    guru_pengampu: "Ust. Ahmad Fauzi, S.Pd.I",
    nip_guru: "198507202010011015",
    kontak_admin: "admin@mtsn1model.sch.id",
    kkm_nasional: 75
  },

  // Limits according to RPD
  LIMITS: {
    MAX_IMAGE_SIZE_BYTES: 2 * 1024 * 1024, // 2 MB per image
    MAX_IMAGES_PER_SUBMISSION: 5,
    DEFAULT_MAX_TEXT_CHARS: 5000,
    DEFAULT_MAX_SCORE: 100,
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION_MS: 5 * 60 * 1000, // 5 minutes
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp']
  },

  // GitHub Direct Backend Config Key
  GITHUB_CONFIG_STORAGE_KEY: "tugasku_github_config",
  
  // Default Local Storage Keys
  KEYS: {
    USERS: "tugasku_users",
    KELAS: "tugasku_kelas",
    TUGAS: "tugasku_tugas",
    KIRIMAN: "tugasku_kiriman",
    CONFIG: "tugasku_config",
    AUDIT: "tugasku_audit",
    SESSION: "tugasku_session",
    LOGIN_ATTEMPTS: "tugasku_login_attempts",
    SNAPSHOTS: "tugasku_snapshots"
  }
};

window.APP_CONFIG = APP_CONFIG;
