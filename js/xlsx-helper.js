/**
 * TugasKu - Spreadsheet (XLSX / CSV) Import & Export Manager
 * Enforces RPD Section 5: Student account templates, validations, duplicate handling, and grade sheets.
 * Powered by SheetJS (XLSX).
 */

const XlsxHelper = {
  /**
   * Check if SheetJS library is loaded
   */
  ensureLibrary() {
    if (typeof XLSX === 'undefined') {
      throw new Error("Pustaka SheetJS (XLSX) belum siap dimuat. Periksa koneksi internet.");
    }
  },

  /**
   * Generate and download Student Account Import Template
   */
  downloadStudentTemplate() {
    this.ensureLibrary();

    const templateData = [
      {
        "Nama Lengkap": "Ahmad Rasyid Al-Fath",
        "Nomor Absen": 1,
        "Nama Kelas": "IX-A",
        "Username / NISN": "0081234567",
        "Sandi Awal": "murid123"
      },
      {
        "Nama Lengkap": "Siti Nurul Hidayah",
        "Nomor Absen": 2,
        "Nama Kelas": "IX-A",
        "Username / NISN": "0081234568",
        "Sandi Awal": "murid123"
      },
      {
        "Nama Lengkap": "Muhammad Zaki Pratama",
        "Nomor Absen": 3,
        "Nama Kelas": "IX-B",
        "Username / NISN": "0081234569",
        "Sandi Awal": "murid123"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    
    // Set column widths for readability
    worksheet['!cols'] = [
      { wch: 30 }, // Nama Lengkap
      { wch: 14 }, // Nomor Absen
      { wch: 14 }, // Nama Kelas
      { wch: 20 }, // Username / NISN
      { wch: 18 }  // Sandi Awal
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template_Murid");
    XLSX.writeFile(workbook, "Template_Import_Akun_Murid_TugasKu.xlsx");
  },

  /**
   * Export registered students (Passwords strictly excluded per RPD Section 8)
   */
  exportStudents(students, classList, schoolName = "Madrasah") {
    this.ensureLibrary();

    const classMap = new Map(classList.map(c => [c.id, c.nama]));

    const exportRows = students.map((s, idx) => ({
      "No": idx + 1,
      "Nama Lengkap": s.nama,
      "No. Absen": s.no_absen || "-",
      "Kelas": classMap.get(s.kelas_id) || "Belum Ditentukan",
      "Username / NISN": s.username,
      "Status": s.status === 'aktif' ? "Aktif" : "Nonaktif",
      "Tanggal Dibuat": s.created_at ? new Date(s.created_at).toLocaleDateString("id-ID") : "-"
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 30 },
      { wch: 12 },
      { wch: 14 },
      { wch: 20 },
      { wch: 12 },
      { wch: 18 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data_Murid");
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Rekap_Akun_Murid_${schoolName.replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}.xlsx`);
  },

  /**
   * Parse uploaded student Excel/CSV file with deep validation & duplicate checks
   */
  async parseStudentFile(file, existingUsers, existingClasses) {
    this.ensureLibrary();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Gagal membaca berkas dokumen."));
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

          if (!rawRows || rawRows.length === 0) {
            return reject(new Error("Berkas spreadsheet kosong atau tidak memuat data yang valid."));
          }

          const existingUsernames = new Map();
          existingUsers.forEach(u => existingUsernames.set(u.username.toLowerCase().trim(), u));

          const classMap = new Map();
          existingClasses.forEach(c => classMap.set(c.nama.toLowerCase().trim(), c));

          const validRows = [];
          const duplicateRows = [];
          const errorRows = [];
          const detectedClasses = new Set();

          rawRows.forEach((row, index) => {
            const rowNumber = index + 2; // Accounting for 1-indexed row header

            // Standardize column key mappings
            const nama = (row["Nama Lengkap"] || row["Nama"] || row["nama"] || "").toString().trim();
            const noAbsen = parseInt(row["Nomor Absen"] || row["No Absen"] || row["Absen"] || 0, 10);
            const namaKelas = (row["Nama Kelas"] || row["Kelas"] || row["kelas"] || "").toString().trim();
            const username = (row["Username / NISN"] || row["Username"] || row["NISN"] || row["nisn"] || "").toString().trim();
            const sandiAwal = (row["Sandi Awal"] || row["Password"] || row["Sandi"] || "123456").toString().trim();

            if (!nama || !username) {
              errorRows.push({
                row: rowNumber,
                data: row,
                reason: "Nama Lengkap atau Username/NISN tidak boleh kosong."
              });
              return;
            }

            if (!namaKelas) {
              errorRows.push({
                row: rowNumber,
                data: row,
                reason: "Nama Kelas tidak boleh kosong."
              });
              return;
            }

            detectedClasses.add(namaKelas);

            const isClassExisting = classMap.has(namaKelas.toLowerCase());
            const parsedItem = {
              rowNumber: rowNumber,
              nama: nama,
              no_absen: isNaN(noAbsen) ? 0 : noAbsen,
              nama_kelas: namaKelas,
              kelas_exists: isClassExisting,
              username: username,
              sandi_awal: sandiAwal
            };

            // Duplicate username check
            if (existingUsernames.has(username.toLowerCase())) {
              duplicateRows.push({
                ...parsedItem,
                existingUser: existingUsernames.get(username.toLowerCase())
              });
            } else {
              validRows.push(parsedItem);
            }
          });

          resolve({
            totalRows: rawRows.length,
            validRows: validRows,
            duplicateRows: duplicateRows,
            errorRows: errorRows,
            detectedClasses: Array.from(detectedClasses)
          });
        } catch (err) {
          reject(new Error("Format berkas tidak dapat diproses: " + err.message));
        }
      };
      reader.readAsArrayBuffer(file);
    });
  },

  /**
   * Export Assignment Grades to XLSX / CSV
   */
  exportGrades(task, classObj, submissions, studentsInClass, schoolProfile) {
    this.ensureLibrary();

    const subMap = new Map(submissions.map(s => [s.user_id, s]));

    const rows = studentsInClass.map((student, idx) => {
      const sub = subMap.get(student.id);
      let statusStr = "Belum Mengumpulkan";
      let nilaiVal = "";
      let catatanVal = "";
      let waktuKirim = "-";
      let statusPub = "Draf";

      if (sub) {
        if (sub.nilai !== null && sub.nilai !== undefined && sub.nilai !== "") {
          statusStr = "Sudah Dinilai";
          nilaiVal = Number(sub.nilai);
        } else {
          statusStr = "Menunggu Penilaian";
        }
        catatanVal = sub.catatan_guru || "";
        waktuKirim = sub.submitted_at ? new Date(sub.submitted_at).toLocaleString("id-ID") : "-";
        statusPub = sub.status_publikasi ? "Dipublikasikan" : "Belum Dipublikasi";
      }

      return {
        "No": idx + 1,
        "No. Absen": student.no_absen || "-",
        "Nama Murid": student.nama,
        "NISN / Username": student.username,
        "Kelas": classObj.nama,
        "Status Pengerjaan": statusStr,
        "Waktu Kirim": waktuKirim,
        "Nilai (0 - " + task.nilai_max + ")": nilaiVal,
        "Catatan Guru": catatanVal,
        "Status Publikasi": statusPub
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 10 },
      { wch: 30 },
      { wch: 18 },
      { wch: 12 },
      { wch: 22 },
      { wch: 22 },
      { wch: 16 },
      { wch: 35 },
      { wch: 18 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap_Nilai");

    const safeTitle = task.judul.replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeClass = classObj.nama.replace(/[^a-zA-Z0-9_-]/g, "_");
    XLSX.writeFile(workbook, `Rekap_Nilai_${safeClass}_${safeTitle}.xlsx`);
  },

  /**
   * Download Grade Import Template
   */
  downloadGradeTemplate(task, classObj, studentsInClass) {
    this.ensureLibrary();

    const rows = studentsInClass.map((student, idx) => ({
      "No": idx + 1,
      "Username / NISN": student.username,
      "Nama Murid": student.nama,
      "Nilai": "",
      "Catatan Guru": ""
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 18 },
      { wch: 30 },
      { wch: 14 },
      { wch: 35 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template_Nilai");
    XLSX.writeFile(workbook, `Template_Import_Nilai_${classObj.nama}_${task.id}.xlsx`);
  },

  /**
   * Parse uploaded grade file
   */
  async parseGradeFile(file, task, studentsInClass) {
    this.ensureLibrary();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Gagal membaca berkas nilai."));
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

          const studentMap = new Map(studentsInClass.map(s => [s.username.toLowerCase().trim(), s]));
          const validGrades = [];
          const errorRows = [];

          rawRows.forEach((row, idx) => {
            const rowNumber = idx + 2;
            const username = (row["Username / NISN"] || row["Username"] || row["NISN"] || "").toString().trim();
            const rawScore = row["Nilai"] !== undefined ? row["Nilai"] : row["nilai"];
            const catatan = (row["Catatan Guru"] || row["Catatan"] || row["catatan"] || "").toString().trim();

            if (!username) return;

            const student = studentMap.get(username.toLowerCase());
            if (!student) {
              errorRows.push({
                row: rowNumber,
                reason: `Murid dengan username '${username}' tidak terdaftar di kelas ini.`
              });
              return;
            }

            if (rawScore !== "" && rawScore !== null && rawScore !== undefined) {
              const scoreNum = Number(rawScore);
              if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > task.nilai_max) {
                errorRows.push({
                  row: rowNumber,
                  reason: `Nilai '${rawScore}' untuk ${student.nama} tidak valid (Rentang yang diizinkan: 0 - ${task.nilai_max}).`
                });
                return;
              }

              validGrades.push({
                student_id: student.id,
                username: username,
                nama: student.nama,
                nilai: scoreNum,
                catatan: catatan
              });
            }
          });

          resolve({
            totalRows: rawRows.length,
            validGrades: validGrades,
            errorRows: errorRows
          });
        } catch (err) {
          reject(new Error("Gagal memproses spreadsheet nilai: " + err.message));
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }
};

window.XlsxHelper = XlsxHelper;
