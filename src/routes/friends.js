const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const locketManager = require('../services/locketService');

// 1. Lấy danh sách tất cả bạn bè
router.get('/', requireAuth, async (req, res) => {
  try {
    const { client, account } = await locketManager.getActiveClientForUser(req.user.id);
    const friends = await client.friends.getAllFriends();
    const myUsername = account.username || '';

    res.json({
      code: 200,
      success: true,
      myUsername,
      myInviteLink: myUsername ? `https://locket.cam/${myUsername}` : '',
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
    const { client, account } = await locketManager.getActiveClientForUser(req.user.id);
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

    let cleanUsername = username ? username.trim().replace(/^@/, '') : null;
    const myUsername = account.username || '';

    if (cleanUsername && myUsername && cleanUsername.toLowerCase() === myUsername.toLowerCase()) {
      return res.status(400).json({
        code: 400,
        success: false,
        msg: 'Bạn không thể gửi lời mời kết bạn cho chính mình!'
      });
    }

    // 1. Kiểm tra xem đối phương đã là bạn bè chưa
    let friends = [];
    try {
      friends = await client.friends.getAllFriends();
    } catch (_) {}

    const alreadyFriend = friends.find(f =>
      (cleanUsername && f.username && f.username.toLowerCase() === cleanUsername.toLowerCase()) ||
      (inviteToken && f.uid === inviteToken) ||
      (cleanUsername && f.uid === cleanUsername)
    );

    if (alreadyFriend) {
      return res.json({
        code: 200,
        success: true,
        alreadyFriends: true,
        user: alreadyFriend,
        msg: `Bạn và @${alreadyFriend.username || cleanUsername} đã là bạn bè trên Locket rồi! 🎉`
      });
    }

    // 2. Tra cứu thông tin người dùng từ username / link
    let targetUser = null;
    let resolvedToken = inviteToken;

    if (cleanUsername) {
      try {
        resolvedToken = await client.friends.resolveInviteTokenFromUsername(cleanUsername);
        if (resolvedToken) {
          const fetchRes = await client.friends.fetchUserByInviteToken(resolvedToken);
          if (fetchRes && fetchRes.user) {
            targetUser = fetchRes.user;
          }
        }
      } catch (err) {
        console.warn('Lỗi khi resolve invite token:', err.message);
      }

      if (!targetUser) {
        try {
          const profile = await client.user.getProfileByUsername(cleanUsername);
          if (profile && profile.uid) {
            targetUser = profile;
          }
        } catch (_) {}
      }
    }

    // 3. Kiểm tra xem đối phương đã gửi lời mời đến mình chưa (nếu có -> auto accept!)
    if (targetUser && targetUser.uid) {
      try {
        const reqs = await client.friends.getFriendRequests();
        const incomingMatch = (reqs.incoming || []).find(r => r.uid === targetUser.uid);
        if (incomingMatch) {
          await client.friends.acceptRequest(targetUser.uid);
          return res.json({
            code: 200,
            success: true,
            accepted: true,
            user: targetUser,
            msg: `Đã tự động chấp nhận lời mời kết bạn từ @${cleanUsername || targetUser.username}! Hai bạn giờ đã là bạn bè! 🎉`
          });
        }
      } catch (_) {}
    }

    // 4. Thử gửi trực tiếp qua Locket API
    let sentSuccess = false;
    if (targetUser && targetUser.uid) {
      try {
        const resSend = await client.friends.sendRequest(targetUser.uid);
        if (resSend && !resSend.error && !resSend.errors) {
          sentSuccess = true;
        }
      } catch (_) {}
    }

    if (sentSuccess) {
      return res.json({
        code: 200,
        success: true,
        user: targetUser,
        msg: `Đã gửi lời mời kết bạn tới @${cleanUsername || targetUser.username} thành công! 🎉`
      });
    }

    // 5. Nếu không gửi trực tiếp được do AppCheck bảo mật của Locket Web:
    // Trả về thông tin đầy đủ kèm liên kết kết bạn chính thức
    if (targetUser) {
      const targetName = targetUser.first_name ? `${targetUser.first_name} ${targetUser.last_name || ''}`.trim() : (targetUser.username || cleanUsername);
      return res.json({
        code: 200,
        success: true,
        requireInviteLink: true,
        user: {
          uid: targetUser.uid,
          username: targetUser.username || cleanUsername,
          first_name: targetUser.first_name || '',
          last_name: targetUser.last_name || '',
          display_name: targetName,
          profile_picture_url: targetUser.profile_picture_url || '/images/locket.webp',
          friendship_status: targetUser.friendship_status || 'none'
        },
        targetInviteLink: `https://locket.cam/${targetUser.username || cleanUsername}`,
        myInviteLink: myUsername ? `https://locket.cam/${myUsername}` : '',
        msg: `Đã tìm thấy @${targetUser.username || cleanUsername} trên Locket! Bạn có thể mở liên kết kết bạn hoặc gửi link mời để kết nối.`
      });
    }

    return res.status(404).json({
      code: 404,
      success: false,
      msg: `Không tìm thấy tài khoản Locket với username @${cleanUsername}. Vui lòng kiểm tra lại chính tả!`
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
