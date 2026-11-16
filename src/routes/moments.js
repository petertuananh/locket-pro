const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const locketManager = require('../services/locketService');
const presetsService = require('../services/presetsService');
const mediaService = require('../services/mediaService');
const prisma = require('../db/prisma');

// 1. Lấy danh sách 158 Presets & Phân loại
router.get('/presets', (req, res) => {
  try {
    const data = presetsService.getAllPresets();
    res.json({
      code: 200,
      success: true,
      data: {
        total: Object.keys(data.presets).length,
        categories: data.categories,
        presets: data.presets
      }
    });
  } catch (err) {
    res.status(500).json({ code: 500, success: false, msg: err.message });
  }
});

// 2. Lấy Feed mới nhất từ Bạn bè
router.get('/feed', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const moments = await client.moments.getLatest();

    res.json({
      code: 200,
      success: true,
      data: moments || []
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 3. Lấy toàn bộ Khoảnh khắc của tôi (My Moments)
router.get('/my', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const moments = await client.moments.getAllMyMoments();

    res.json({
      code: 200,
      success: true,
      data: moments || []
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 4. Lấy Rollcall tuần này
router.get('/rollcall', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const posts = await client.moments.getRollcallPosts();

    res.json({
      code: 200,
      success: true,
      data: posts || []
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 5. Lấy khoảnh khắc của một người bạn
router.get('/user/:userUid', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const { userUid } = req.params;
    const limit = parseInt(req.query.limit, 10) || 20;

    const moments = await client.moments.getSharedMomentsByUser(userUid, limit);
    res.json({
      code: 200,
      success: true,
      data: moments || []
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 6. Lấy khoảnh khắc theo username
router.get('/username/:username', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const { username } = req.params;
    const limit = parseInt(req.query.limit, 10) || 20;

    const moments = await client.moments.getSharedMomentsByUsername(username, limit);
    res.json({
      code: 200,
      success: true,
      data: moments || []
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 7. Đăng Khoảnh khắc mới (Photo hoặc Video)
router.post('/post', requireAuth, upload.single('file'), async (req, res) => {
  let tempProcessedPath = null;
  let tempThumbPath = null;

  try {
    const { client, account } = await locketManager.getActiveClientForUser(req.user.id);
    const {
      caption = '',
      noteType = 'standard',
      icon = null,
      colors = null,
      textColor = '#FFFFFF',
      isPrivate = false,
      recipients = null,
      webcamImage = null
    } = req.body;

    let parsedColors = null;
    if (colors) {
      try {
        parsedColors = typeof colors === 'string' ? JSON.parse(colors) : colors;
      } catch (_) {
        parsedColors = null;
      }
    }

    let parsedRecipients = null;
    if (recipients) {
      try {
        parsedRecipients = typeof recipients === 'string' ? JSON.parse(recipients) : recipients;
      } catch (_) {
        parsedRecipients = null;
      }
    }

    let filePath = null;
    let isVideo = false;

    if (webcamImage) {
      // Nhận từ Webcam Canvas (Base64)
      tempProcessedPath = await mediaService.saveBase64Image(webcamImage);
      filePath = tempProcessedPath;
    } else if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      isVideo = ['.mp4', '.mov', '.quicktime'].includes(ext) || req.file.mimetype.startsWith('video/');

      if (isVideo) {
        // Nén video chuẩn Apple HEVC
        tempProcessedPath = await mediaService.processVideo(req.file.path);
        tempThumbPath = await mediaService.extractThumbnail(tempProcessedPath);
        filePath = tempProcessedPath;
      } else {
        // Nén ảnh sang WebP < 300KB
        tempProcessedPath = await mediaService.processImage(req.file.path);
        filePath = tempProcessedPath;
      }
    } else {
      return res.status(400).json({
        code: 400,
        success: false,
        msg: 'Vui lòng cung cấp file ảnh/video hoặc chụp từ webcam.'
      });
    }

    // Đăng bài qua locket.js
    const postOptions = {
      caption: caption || '',
      noteType: noteType || 'standard',
      icon: icon || null,
      colors: parsedColors,
      textColor: textColor || '#FFFFFF',
      isPrivate: isPrivate === true || isPrivate === 'true',
      recipients: parsedRecipients
    };

    if (isVideo) {
      postOptions.video = filePath;
      if (tempThumbPath) postOptions.image = tempThumbPath;
    } else {
      postOptions.image = filePath;
    }

    const result = await client.moments.post(postOptions);

    // Lưu log bài đăng
    try {
      await prisma.postedMomentLog.create({
        data: {
          account_id: account.id,
          moment_uid: result.id || result.uid || `post_${Date.now()}`,
          media_type: isVideo ? 'video' : 'image',
          media_url: result.video_url || result.thumbnail_url || '',
          thumbnail_url: result.thumbnail_url || null,
          caption: caption || null,
          is_private: isPrivate === true || isPrivate === 'true'
        }
      });
    } catch (logErr) {
      console.warn('Lỗi ghi nhật ký posted_moment_logs:', logErr.message);
    }

    res.json({
      code: 200,
      success: true,
      msg: 'Đã đăng khoảnh khắc lên Locket thành công! 🎉',
      data: result
    });
  } catch (err) {
    console.error('Lỗi khi đăng moment:', err);
    res.status(400).json({
      code: 400,
      success: false,
      msg: err.message || 'Không thể đăng khoảnh khắc lên Locket.'
    });
  } finally {
    // Dọn dẹp file tạm
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    if (tempProcessedPath && fs.existsSync(tempProcessedPath)) {
      try { fs.unlinkSync(tempProcessedPath); } catch (_) {}
    }
    if (tempThumbPath && fs.existsSync(tempThumbPath)) {
      try { fs.unlinkSync(tempThumbPath); } catch (_) {}
    }
  }
});

// 8. Xem lượt xem & danh sách người xem moment
router.get('/:momentUid/views', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const { momentUid } = req.params;
    const views = await client.moments.getViews(momentUid);

    res.json({
      code: 200,
      success: true,
      data: views
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 9. Thả cảm xúc Emoji vào khoảnh khắc
router.post('/:momentUid/react', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const { momentUid } = req.params;
    const { reaction = '❤️' } = req.body;

    const result = await client.moments.react(momentUid, reaction);
    res.json({
      code: 200,
      success: true,
      msg: `Đã thả cảm xúc ${reaction} thành công!`,
      data: result
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 10. Bình luận vào khoảnh khắc
router.post('/:momentUid/comment', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const { momentUid } = req.params;
    const { receiverUid, text } = req.body;

    if (!receiverUid || !text) {
      return res.status(400).json({
        code: 400,
        success: false,
        msg: 'Vui lòng cung cấp receiverUid và nội dung bình luận text.'
      });
    }

    const result = await client.moments.comment(momentUid, receiverUid, text);
    res.json({
      code: 200,
      success: true,
      msg: 'Đã gửi bình luận thành công!',
      data: result
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 11. Đánh dấu đã xem
router.post('/:momentUid/view', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const { momentUid } = req.params;
    await client.moments.markAsViewed(momentUid);

    res.json({ code: 200, success: true, msg: 'Đã đánh dấu đã xem.' });
  } catch (err) {
    res.status(400).json({ code: 400, success: false, msg: err.message });
  }
});

// 12. Xóa khoảnh khắc
router.delete('/:momentUid', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const { momentUid } = req.params;
    await client.moments.delete(momentUid);

    res.json({
      code: 200,
      success: true,
      msg: 'Đã xóa khoảnh khắc thành công.'
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

module.exports = router;
