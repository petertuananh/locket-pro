const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const prisma = require('../db/prisma');
const locketManager = require('../services/locketService');

// 1. Lấy danh sách tài khoản đã liên kết
router.get('/', requireAuth, async (req, res) => {
  try {
    const accounts = await prisma.locketAccount.findMany({
      where: { user_id: req.user.id },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        label: true,
        email: true,
        username: true,
        first_name: true,
        last_name: true,
        avatar_url: true,
        device_model: true,
        ios_version: true,
        is_active: true,
        created_at: true
      }
    });

    res.json({
      code: 200,
      success: true,
      data: accounts
    });
  } catch (err) {
    res.status(500).json({ code: 500, success: false, msg: err.message });
  }
});

// 2. Thêm mới tài khoản Locket (bằng Email & Mật khẩu)
router.post('/', requireAuth, async (req, res) => {
  try {
    const { label, email, password, deviceModel, iosVersion } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        code: 400,
        success: false,
        msg: 'Vui lòng cung cấp đầy đủ email và mật khẩu tài khoản Locket.'
      });
    }

    const newAccount = await locketManager.addAccount(req.user.id, {
      label: label || 'Tài khoản Locket',
      email,
      password,
      deviceModel: deviceModel || 'iPhone 15 Pro',
      iosVersion: iosVersion || '17.4.1'
    });

    res.json({
      code: 200,
      success: true,
      msg: 'Đã liên kết tài khoản Locket thành công!',
      data: {
        id: newAccount.id,
        label: newAccount.label,
        email: newAccount.email,
        username: newAccount.username,
        first_name: newAccount.first_name,
        last_name: newAccount.last_name,
        avatar_url: newAccount.avatar_url,
        is_active: newAccount.is_active
      }
    });
  } catch (err) {
    res.status(400).json({
      code: 400,
      success: false,
      msg: err.message || 'Không thể liên kết tài khoản Locket.'
    });
  }
});

// 3. Chuyển đổi tài khoản đang thao tác (Switch Active Account)
router.post('/:id/switch', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const switched = await locketManager.switchActiveAccount(req.user.id, id);

    res.json({
      code: 200,
      success: true,
      msg: `Đã chuyển sang tài khoản ${switched.label} (${switched.email}) thành công!`,
      data: switched
    });
  } catch (err) {
    res.status(400).json({ code: 400, success: false, msg: err.message });
  }
});

// 4. Lấy thông tin tài khoản đang Active và đồng bộ profile mới nhất
router.get('/active', requireAuth, async (req, res) => {
  try {
    const { client, account } = await locketManager.getActiveClientForUser(req.user.id);

    let profile = null;
    try {
      profile = await client.user.getProfile();
      // Cập nhật thông tin mới nhất vào DB nếu có thay đổi
      if (profile) {
        await prisma.locketAccount.update({
          where: { id: account.id },
          data: {
            username: profile.username || account.username,
            first_name: profile.first_name || account.first_name,
            last_name: profile.last_name || account.last_name,
            avatar_url: profile.profile_picture_url || account.avatar_url
          }
        });
      }
    } catch (e) {
      console.warn('Không thể refresh profile từ Locket:', e.message);
    }

    res.json({
      code: 200,
      success: true,
      data: {
        account: {
          id: account.id,
          label: account.label,
          email: account.email,
          username: account.username,
          first_name: account.first_name,
          last_name: account.last_name,
          avatar_url: account.avatar_url,
          device_model: account.device_model,
          ios_version: account.ios_version,
          is_active: true
        },
        locketProfile: profile
      }
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 5. Xóa tài khoản Locket
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await locketManager.removeAccount(req.user.id, id);

    res.json({
      code: 200,
      success: true,
      msg: 'Đã xóa tài khoản Locket thành công.'
    });
  } catch (err) {
    res.status(400).json({ code: 400, success: false, msg: err.message });
  }
});

module.exports = router;
