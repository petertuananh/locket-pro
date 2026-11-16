const express = require('express');
const router = express.Router();
const passport = require('passport');
const { generateToken } = require('../config/passport');
const { requireAuth } = require('../middleware/auth');
const prisma = require('../db/prisma');
const config = require('../config/env');

// Bắt đầu luồng đăng nhập Google OAuth
router.get('/google', (req, res, next) => {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="vi">
        <head>
          <meta charset="UTF-8">
          <title>Chưa cấu hình Google OAuth</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #090B0E; color: #fff; padding: 60px 20px; text-align: center; }
            .card { max-width: 480px; margin: 0 auto; background: #141822; padding: 32px; border-radius: 20px; border: 1px solid rgba(245, 158, 11, 0.3); }
            h2 { color: #f59e0b; margin-bottom: 12px; }
            p { color: #9ca3af; font-size: 14px; line-height: 1.6; }
            a { display: inline-block; margin-top: 24px; background: #f59e0b; color: #000; padding: 12px 28px; border-radius: 12px; font-weight: bold; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Chưa cấu hình Google OAuth</h2>
            <p>Vui lòng cấu hình GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET trong file .env để bật tính năng đăng nhập Google.</p>
            <a href="/">Về Trang Chủ</a>
          </div>
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

// Đăng xuất
router.post('/logout', (req, res) => {
  res.json({ code: 200, success: true, msg: 'Đã đăng xuất thành công.' });
});

module.exports = router;
