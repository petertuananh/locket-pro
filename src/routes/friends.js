const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const locketManager = require('../services/locketService');

// 1. Lấy danh sách tất cả bạn bè
router.get('/', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const friends = await client.friends.getAllFriends();

    res.json({
      code: 200,
      success: true,
      data: friends || []
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 2. Danh sách lời mời gửi đến và gửi đi
router.get('/requests', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const requests = await client.friends.getFriendRequests();

    res.json({
      code: 200,
      success: true,
      data: requests || { incoming: [], outgoing: [] }
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 3. Danh sách nhóm & bạn bè
router.get('/groups', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const groups = await client.friends.getGroupsAndFriends();

    res.json({
      code: 200,
      success: true,
      data: groups || []
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 4. Gửi lời mời kết bạn (hỗ trợ username hoặc link locket.cam/username)
router.post('/request', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    let { username, inviteToken } = req.body;

    if (!username && !inviteToken) {
      return res.status(400).json({
        code: 400,
        success: false,
        msg: 'Vui lòng cung cấp username hoặc link kết bạn Locket.'
      });
    }

    // Nếu người dùng dán link dạng https://locket.cam/username
    if (username && username.includes('locket.cam/')) {
      const match = username.match(/locket\.cam\/([a-zA-Z0-9_.-]+)/);
      if (match) {
        username = match[1];
      }
    }

    let result;
    if (username) {
      result = await client.friends.sendRequestByUsername(username.replace('@', '').trim());
    } else {
      result = await client.friends.sendRequest(inviteToken);
    }

    res.json({
      code: 200,
      success: true,
      msg: `Đã gửi lời mời kết bạn tới ${username || inviteToken} thành công! 🎉`,
      data: result
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 5. Chấp nhận lời mời kết bạn
router.post('/accept', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const { userUid } = req.body;

    if (!userUid) {
      return res.status(400).json({ code: 400, success: false, msg: 'Thiếu userUid' });
    }

    const result = await client.friends.acceptRequest(userUid);
    res.json({
      code: 200,
      success: true,
      msg: 'Đã đồng ý kết bạn thành công!',
      data: result
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 6. Hủy kết bạn (Unfriend)
router.post('/remove', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const { userUid } = req.body;

    if (!userUid) {
      return res.status(400).json({ code: 400, success: false, msg: 'Thiếu userUid' });
    }

    await client.friends.remove(userUid);
    res.json({
      code: 200,
      success: true,
      msg: 'Đã hủy kết bạn thành công.'
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 7. Chặn người dùng
router.post('/block', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const { userUid } = req.body;

    if (!userUid) {
      return res.status(400).json({ code: 400, success: false, msg: 'Thiếu userUid' });
    }

    await client.friends.block(userUid);
    res.json({
      code: 200,
      success: true,
      msg: 'Đã chặn người dùng.'
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 8. Bỏ chặn người dùng
router.post('/unblock', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const { userUid } = req.body;

    if (!userUid) {
      return res.status(400).json({ code: 400, success: false, msg: 'Thiếu userUid' });
    }

    await client.friends.unblock(userUid);
    res.json({
      code: 200,
      success: true,
      msg: 'Đã bỏ chặn người dùng.'
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

module.exports = router;
