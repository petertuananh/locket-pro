const express = require('express');
const router = express.Router();
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const locketManager = require('../services/locketService');
const mediaService = require('../services/mediaService');
const prisma = require('../db/prisma');

// 1. Xem chi tiết profile
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const { client, account } = await locketManager.getActiveClientForUser(req.user.id);
    const profile = await client.user.getProfile();

    res.json({
      code: 200,
      success: true,
      data: {
        account: {
          id: account.id,
          label: account.label,
          email: account.email,
          device_model: account.device_model,
          ios_version: account.ios_version
        },
        profile
      }
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 2. Đổi họ & tên (firstName, lastName)
router.patch('/name', requireAuth, async (req, res) => {
  try {
    const { client, account } = await locketManager.getActiveClientForUser(req.user.id);
    const { firstName, lastName } = req.body;

    if (!firstName && !lastName) {
      return res.status(400).json({ code: 400, success: false, msg: 'Vui lòng cung cấp firstName hoặc lastName' });
    }

    const result = await client.user.updateName(firstName || '', lastName || '');

    // Cập nhật vào DB
    await prisma.locketAccount.update({
      where: { id: account.id },
      data: {
        first_name: firstName || account.first_name,
        last_name: lastName || account.last_name
      }
    });

    res.json({
      code: 200,
      success: true,
      msg: 'Đã cập nhật tên tài khoản Locket thành công!',
      data: result
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 3. Đổi ngày sinh (YYYY-MM-DD)
router.patch('/birthdate', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const { birthdate } = req.body;

    if (!birthdate) {
      return res.status(400).json({ code: 400, success: false, msg: 'Vui lòng cung cấp ngày sinh định dạng YYYY-MM-DD' });
    }

    const result = await client.user.updateBirthdate(birthdate);
    res.json({
      code: 200,
      success: true,
      msg: 'Đã cập nhật ngày sinh thành công!',
      data: result
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 4. Upload đổi avatar mới
router.post('/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
  let tempWebp = null;
  try {
    const { client, account } = await locketManager.getActiveClientForUser(req.user.id);

    if (!req.file) {
      return res.status(400).json({ code: 400, success: false, msg: 'Vui lòng tải lên file ảnh đại diện' });
    }

    // Chuyển sang WebP
    tempWebp = await mediaService.processImage(req.file.path);
    const avatarUrl = await client.user.uploadAvatar(tempWebp);

    // Lưu avatar URL mới vào DB
    await prisma.locketAccount.update({
      where: { id: account.id },
      data: { avatar_url: avatarUrl }
    });

    res.json({
      code: 200,
      success: true,
      msg: 'Đã đổi ảnh đại diện Locket thành công!',
      data: { avatar_url: avatarUrl }
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    if (tempWebp && fs.existsSync(tempWebp)) {
      try { fs.unlinkSync(tempWebp); } catch (_) {}
    }
  }
});

// 5. Cấu hình phần cứng giả lập thiết bị iOS
router.post('/device', requireAuth, async (req, res) => {
  try {
    const { client, account } = await locketManager.getActiveClientForUser(req.user.id);
    const { model = 'iPhone 15 Pro', osVersion = '17.4.1', bundleId = 'com.locket.Locket' } = req.body;

    client.setDevice({
      autoEmulate: false,
      modelName: model,
      iosVersion: osVersion,
      bundleId: bundleId
    });

    // Cập nhật cấu hình vào DB
    await prisma.locketAccount.update({
      where: { id: account.id },
      data: {
        device_model: model,
        ios_version: osVersion
      }
    });

    res.json({
      code: 200,
      success: true,
      msg: `Đã cập nhật giả lập thiết bị: ${model} (iOS ${osVersion}) chuẩn xác 100%!`,
      data: {
        model,
        osVersion,
        bundleId
      }
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 6. Đồng bộ Client Data & Push Notification Token
router.post('/sync', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const result = await client.user.syncClientData();

    res.json({
      code: 200,
      success: true,
      msg: 'Đã đồng bộ dữ liệu thiết bị và cờ Protobuf thành công!',
      data: result
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

module.exports = router;
