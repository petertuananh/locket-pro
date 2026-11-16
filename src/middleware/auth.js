const { verifyToken } = require('../config/passport');
const prisma = require('../db/prisma');

async function requireAuth(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        code: 401,
        success: false,
        msg: 'Vui lòng đăng nhập để tiếp tục (Thiếu JWT Bearer Token)'
      });
    }

    const payload = verifyToken(token);
    if (!payload || !payload.userId) {
      return res.status(401).json({
        code: 401,
        success: false,
        msg: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.'
      });
    }

    // Lấy thông tin user mới nhất
    const user = await prisma.user.findUnique({
      where: { id: payload.userId }
    });

    if (!user) {
      return res.status(401).json({
        code: 401,
        success: false,
        msg: 'Người dùng không tồn tại trên hệ thống.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Lỗi xác thực requireAuth:', error);
    return res.status(500).json({
      code: 500,
      success: false,
      msg: 'Lỗi máy chủ khi xác thực phiên người dùng'
    });
  }
}

module.exports = {
  requireAuth
};
