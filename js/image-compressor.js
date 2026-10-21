/**
 * TugasKu - Client-Side Image Compressor & Validator
 * Enforces RPD constraints: max 2MB per image, max 5 images per submission.
 * Performs client-side canvas WebP/JPEG compression, thumbnail generation, and metadata cleanup.
 */

const ImageCompressor = {
  /**
   * Validate image file list against RPD constraints
   */
  validateFiles(files, existingCount = 0) {
    const totalCount = files.length + existingCount;
    if (totalCount > APP_CONFIG.LIMITS.MAX_IMAGES_PER_SUBMISSION) {
      return {
        valid: false,
        message: `Maksimal hanya dapat melampirkan ${APP_CONFIG.LIMITS.MAX_IMAGES_PER_SUBMISSION} gambar per tugas. Saat ini total ${totalCount}.`
      };
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!APP_CONFIG.LIMITS.ALLOWED_IMAGE_TYPES.includes(file.type)) {
        return {
          valid: false,
          message: `Format berkas "${file.name}" tidak didukung. Harap unggah foto berekstensi JPG, PNG, atau WebP.`
        };
      }
    }

    return { valid: true };
  },

  /**
   * Compress single image file using HTML5 Canvas
   * @param {File} file
   * @param {Object} options { maxWidth: 1600, maxHeight: 1600, quality: 0.82 }
   * @returns {Promise<Object>} { filename, dataUrl, pureBase64, sizeBytes, originalSizeBytes }
   */
  async compressImage(file, options = {}) {
    const maxWidth = options.maxWidth || 1600;
    const maxHeight = options.maxHeight || 1600;
    const quality = options.quality || 0.82;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Gagal membaca berkas gambar."));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error("Format citra gambar rusak atau tidak valid."));
        img.onload = () => {
          let { width, height } = img;

          // Maintain aspect ratio while bounding max dimensions
          if (width > maxWidth || height > maxHeight) {
            if (width / height > maxWidth / maxHeight) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");

          // Draw image
          ctx.drawImage(img, 0, 0, width, height);

          // Test WebP support, fallback to JPEG
          let outputType = "image/webp";
          let dataUrl = canvas.toDataURL(outputType, quality);
          if (!dataUrl.startsWith("data:image/webp")) {
            outputType = "image/jpeg";
            dataUrl = canvas.toDataURL(outputType, quality);
          }

          // Extract base64 without prefix for GitHub API
          const commaIndex = dataUrl.indexOf(",");
          const pureBase64 = commaIndex !== -1 ? dataUrl.substring(commaIndex + 1) : dataUrl;
          
          // Estimate byte size from base64 string
          const sizeBytes = Math.round((pureBase64.length * 3) / 4);

          // Enforce 2MB hard ceiling after compression
          if (sizeBytes > APP_CONFIG.LIMITS.MAX_IMAGE_SIZE_BYTES) {
            return reject(new Error(`Ukuran gambar "${file.name}" melebihi batas maksimal 2 MB setelah kompresi.`));
          }

          // Clean up safe filename
          const ext = outputType === "image/webp" ? "webp" : "jpg";
          const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
          const safeFilename = `${Date.now()}_${baseName}.${ext}`;

          resolve({
            filename: safeFilename,
            originalName: file.name,
            mimeType: outputType,
            dataUrl: dataUrl,
            pureBase64: pureBase64,
            sizeBytes: sizeBytes,
            originalSizeBytes: file.size,
            width: width,
            height: height
          });
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  /**
   * Batch compress multiple image files with progress callback
   */
  async batchCompress(files, onProgress = null) {
    const results = [];
    for (let i = 0; i < files.length; i++) {
      if (onProgress) {
        onProgress(i + 1, files.length, files[i].name);
      }
      const compressed = await this.compressImage(files[i]);
      results.push(compressed);
    }
    return results;
  }
};

window.ImageCompressor = ImageCompressor;
