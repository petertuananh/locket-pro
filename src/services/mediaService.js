const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const sharp = require('sharp');
const config = require('../config/env');

class MediaService {
  /**
   * Chuyển đổi và tối ưu ảnh sang định dạng WebP (<300KB)
   * @param {string|Buffer} input - Đường dẫn file hoặc Buffer ảnh
   * @param {string} [outputPath] - Đường dẫn lưu file WebP
   * @returns {Promise<string>} Đường dẫn file WebP đã xử lý
   */
  static async processImage(input, outputPath = null) {
    if (!outputPath) {
      const filename = `img-${Date.now()}-${Math.round(Math.random() * 1e6)}.webp`;
      outputPath = path.join(config.UPLOADS_DIR, filename);
    }

    try {
      let pipeline = sharp(input);
      const metadata = await pipeline.metadata();

      // Nếu ảnh lớn hơn 1080px, resize giữ tỉ lệ
      if (metadata.width > 1080 || metadata.height > 1080) {
        pipeline = pipeline.resize({
          width: 1080,
          height: 1080,
          fit: 'inside',
          withoutEnlargement: true
        });
      }

      await pipeline
        .webp({ quality: 85, effort: 4 })
        .toFile(outputPath);

      return outputPath;
    } catch (err) {
      console.error('Lỗi khi nén ảnh sang WebP:', err);
      throw err;
    }
  }

  /**
   * Lưu ảnh từ Base64 (từ Webcam) sang WebP
   * @param {string} base64Data
   * @returns {Promise<string>}
   */
  static async saveBase64Image(base64Data) {
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    const buffer = matches ? Buffer.from(matches[2], 'base64') : Buffer.from(base64Data, 'base64');
    return this.processImage(buffer);
  }

  /**
   * Trích xuất thumbnail từ Video tại giây thứ 1.0 sang WebP
   * @param {string} videoPath
   * @returns {Promise<string>}
   */
  static async extractThumbnail(videoPath) {
    const thumbTempJpg = path.join(config.UPLOADS_DIR, `thumb-${Date.now()}.jpg`);
    const thumbWebp = path.join(config.UPLOADS_DIR, `thumb-${Date.now()}.webp`);

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-ss', '00:00:01.000',
        '-i', videoPath,
        '-vframes', '1',
        '-q:v', '2',
        thumbTempJpg
      ]);

      ffmpeg.on('close', async (code) => {
        if (code === 0 && fs.existsSync(thumbTempJpg)) {
          try {
            await sharp(thumbTempJpg)
              .resize({ width: 720, height: 720, fit: 'inside' })
              .webp({ quality: 80 })
              .toFile(thumbWebp);
            
            // Xóa file jpg tạm
            try { fs.unlinkSync(thumbTempJpg); } catch (_) {}
            resolve(thumbWebp);
          } catch (e) {
            reject(e);
          }
        } else {
          // Thử trích xuất frame đầu tiên tại 0.0s nếu video ngắn hơn 1s
          const fallback = spawn('ffmpeg', [
            '-y',
            '-i', videoPath,
            '-vframes', '1',
            '-q:v', '2',
            thumbTempJpg
          ]);

          fallback.on('close', async (fbCode) => {
            if (fbCode === 0 && fs.existsSync(thumbTempJpg)) {
              try {
                await sharp(thumbTempJpg)
                  .resize({ width: 720, height: 720, fit: 'inside' })
                  .webp({ quality: 80 })
                  .toFile(thumbWebp);
                try { fs.unlinkSync(thumbTempJpg); } catch (_) {}
                resolve(thumbWebp);
              } catch (e) {
                reject(e);
              }
            } else {
              reject(new Error('Không thể trích xuất thumbnail từ video bằng FFmpeg'));
            }
          });
        }
      });

      ffmpeg.on('error', (err) => reject(err));
    });
  }

  /**
   * Nén video sang chuẩn Apple HEVC / H.265 < 6MB
   * @param {string} inputVideo
   * @returns {Promise<string>}
   */
  static async processVideo(inputVideo) {
    const stats = fs.statSync(inputVideo);
    const MAX_SIZE = 6 * 1024 * 1024; // 6MB

    // Nếu đã nhỏ hơn 6MB và là mp4 có thể giữ lại, nhưng để tương thích tốt nhất với Locket iOS nên encode chuẩn HEVC
    const outputVideo = path.join(config.UPLOADS_DIR, `hevc-${Date.now()}.mp4`);

    return new Promise((resolve, reject) => {
      // Tham số tối ưu HEVC chuẩn Locket:
      // -c:v libx265 -tag:v hvc1 -preset fast -b:v 1500k -vf scale='min(720,iw)':-2
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-i', inputVideo,
        '-c:v', 'libx265',
        '-tag:v', 'hvc1',
        '-pix_fmt', 'yuv420p',
        '-preset', 'fast',
        '-b:v', '1400k',
        '-maxrate', '1600k',
        '-bufsize', '2000k',
        '-vf', "scale='min(720,iw)':-2",
        '-c:a', 'aac',
        '-b:a', '64k',
        '-movflags', '+faststart',
        outputVideo
      ]);

      ffmpeg.stderr.on('data', () => {});

      ffmpeg.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputVideo)) {
          resolve(outputVideo);
        } else {
          // Nếu hệ thống thiếu libx265, fallback về libx264 tương thích
          console.warn('⚠️ FFmpeg libx265 thất bại, thử fallback sang libx264...');
          const fallback = spawn('ffmpeg', [
            '-y',
            '-i', inputVideo,
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-preset', 'fast',
            '-b:v', '1200k',
            '-vf', "scale='min(720,iw)':-2",
            '-c:a', 'aac',
            '-b:a', '64k',
            '-movflags', '+faststart',
            outputVideo
          ]);

          fallback.on('close', (fbCode) => {
            if (fbCode === 0 && fs.existsSync(outputVideo)) {
              resolve(outputVideo);
            } else {
              // Nếu cả 2 đều fail thì trả về file gốc nếu < 6MB
              if (stats.size < MAX_SIZE) {
                resolve(inputVideo);
              } else {
                reject(new Error('Không thể nén video dưới 6MB bằng FFmpeg'));
              }
            }
          });
        }
      });

      ffmpeg.on('error', (err) => {
        if (stats.size < MAX_SIZE) {
          resolve(inputVideo);
        } else {
          reject(err);
        }
      });
    });
  }
}

module.exports = MediaService;
