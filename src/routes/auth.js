const express = require('express');
const router = express.Router();
const passport = require('passport');
const { generateToken } = require('../config/passport');
const { requireAuth } = require('../middleware/auth');
const prisma = require('../db/prisma');
const config = require('../config/env');

// Bắt đầu luồng đăng nhập Google
router.get('/google', (req, res, next) => {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    return res.status(400).send(`
      <html>
        <body style="font-family:sans-serif; background:#12151b; color:#fff; padding:40px; text-align:center;">
          <h2 style="color:#f59e0b;">Chưa cấu hình Google OAuth</h2>
          <p>Vui lòng cấu hình GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET trong file .env.</p>
          <p>Bạn có thể sử dụng tính năng <b>Đăng nhập Demo / Dev Login</b> để trải nghiệm ngay hệ thống mà không cần Google OAuth!</p>
          <a href="/?dev=true" style="display:inline-block; margin-top:20px; background:#f59e0b; color:#000; padding:10px 24px; border-radius:8px; font-weight:bold; text-decoration:none;">Về Trang Chủ & Dùng Thử Ngay</a>
        </body>
      </html>
    `);
  }
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});

// Callback Google OAuth
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/?error=oauth_failed', session: false }),
  (req, res) => {
    try {
      const token = generateToken(req.user);
      // Chuyển hướng về Web App kèm token
      res.redirect(`/app?token=${token}`);
    } catch (err) {
      console.error('Lỗi khi phát hành JWT token sau Google login:', err);
      res.redirect('/?error=token_generation_failed');
    }
  }
);

// Lấy thông tin user hiện tại
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        locket_accounts: {
          select: {
            id: true,
            label: true,
            email: true,
            username: true,
            first_name: true,
            last_name: true,
            avatar_url: true,
            is_active: true,
            device_model: true,
            ios_version: true
          }
        }
      }
    });

    res.json({
      code: 200,
      success: true,
      data: user
    });
  } catch (err) {
    res.status(500).json({ code: 500, success: false, msg: err.message });
  }
});

// Chế độ Dev / Demo Login giúp người dùng có thể test ngay lập tức mà không cần tạo Google Cloud Project
router.post('/dev-login', async (req, res) => {
  try {
    const { email = 'demo@tuananh.dev', displayName = 'Peter Tuan Anh' } = req.body;

    let user = await prisma.user.findFirst({
      where: { email }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          google_id: `dev_${Date.now()}`,
          email,
          display_name: displayName,
          avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
          role: 'user'
        }
      });
    }

    const token = generateToken(user);

    res.json({
      code: 200,
      success: true,
      data: {
        token,
        user
      }
    });
  } catch (err) {
    res.status(500).json({ code: 500, success: false, msg: err.message });
  }
});

// Đăng xuất
router.post('/logout', (req, res) => {
  res.json({ code: 200, success: true, msg: 'Đã đăng xuất thành công.' });
});

module.exports = router;
