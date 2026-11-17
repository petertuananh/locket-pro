const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const locketManager = require('../services/locketService');
const prisma = require('../db/prisma');

// Bộ nhớ đệm danh sách bạn bè đã biết của các user
const userFriendsCache = new Map();

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

// 9. Lấy full thông tin profile người dùng (Discord style)
router.get('/profile/:identifier', requireAuth, async (req, res) => {
  try {
    const { client, account: activeAccount } = await locketManager.getActiveClientForUser(req.user.id);
    const myUid = client.session.uid;
    let identifier = req.params.identifier.trim().replace(/^@/, '');

    if (identifier.includes('locket.cam/')) {
      const match = identifier.match(/locket\.cam\/([a-zA-Z0-9_.-]+)/);
      if (match) identifier = match[1];
    }

    // Nạp danh sách bạn bè của tài khoản hiện tại trước để đối chiếu
    let myFriends = [];
    try {
      myFriends = await client.friends.getAllFriends();
      if (myUid) userFriendsCache.set(myUid, myFriends);
    } catch (_) {}

    // 1. Kiểm tra xem identifier có phải là một tài khoản trong database LocketAccount không
    const dbAccount = await prisma.locketAccount.findFirst({
      where: {
        OR: [
          { locket_uid: identifier },
          { username: { equals: identifier, mode: 'insensitive' } },
          { email: { equals: identifier, mode: 'insensitive' } }
        ]
      }
    });

    let targetUid = null;
    let targetUsername = null;
    let baseProfile = null;
    let inviteToken = null;

    if (dbAccount) {
      targetUid = dbAccount.locket_uid;
      targetUsername = dbAccount.username;
      baseProfile = {
        uid: dbAccount.locket_uid,
        username: dbAccount.username,
        first_name: dbAccount.first_name,
        last_name: dbAccount.last_name,
        profile_picture_url: dbAccount.avatar_url,
        email: dbAccount.email,
        phone_number: null,
        device_model: dbAccount.device_model,
        ios_version: dbAccount.ios_version,
        is_local_account: true,
        created_at: dbAccount.created_at
      };
    }

    // 2. Kiểm tra nếu identifier trùng với một người trong danh sách bạn bè của tôi
    if (!targetUid && myFriends.length > 0) {
      const matchedFriend = myFriends.find(f => f.uid === identifier || (f.username && f.username.toLowerCase() === identifier.toLowerCase()));
      if (matchedFriend) {
        targetUid = matchedFriend.uid;
        targetUsername = matchedFriend.username;
        baseProfile = { ...matchedFriend };
      }
    }

    // 3. Kiểm tra trong bộ nhớ đệm bạn bè của các tài khoản khác
    if (!targetUid) {
      for (const [cUid, fList] of userFriendsCache.entries()) {
        const found = fList.find(f => f.uid === identifier || (f.username && f.username.toLowerCase() === identifier.toLowerCase()));
        if (found) {
          targetUid = found.uid;
          targetUsername = found.username;
          baseProfile = { ...found };
          break;
        }
      }
    }

    // 4. Nếu chưa có UID (hoặc identifier là username), tra cứu qua Locket API
    if (!targetUid) {
      // Nếu có định dạng Firebase UID (28 ký tự gồm chữ và số)
      if (identifier.length === 28 && /^[a-zA-Z0-9]+$/.test(identifier) && !/^[a-zA-Z]+$/.test(identifier)) {
        targetUid = identifier;
      } else {
        // Là username: resolve invite token
        targetUsername = identifier;
        try {
          inviteToken = await client.friends.resolveInviteTokenFromUsername(targetUsername);
          if (inviteToken) {
            const userInvite = await client.friends.fetchUserByInviteToken(inviteToken);
            if (userInvite && userInvite.user) {
              baseProfile = { ...userInvite.user, celebrity_data: userInvite.celebrity_data };
              targetUid = baseProfile.uid;
              targetUsername = baseProfile.username || targetUsername;
            }
          }
        } catch (e) {
          console.warn('Lỗi resolve invite token:', e.message);
        }
      }
    }

    // 5. Lấy thông tin chi tiết qua fetchUserV2 nếu có UID
    let locketProfile = null;
    if (targetUid) {
      try {
        const v2Res = await client.postApi('fetchUserV2', { user_uid: targetUid });
        if (v2Res && v2Res.data) {
          locketProfile = v2Res.data;
          if (!targetUsername && locketProfile.username) targetUsername = locketProfile.username;
        }
      } catch (e) {
        console.warn('Lỗi fetchUserV2:', e.message);
      }
    }

    // Nếu vẫn chưa có targetUid và baseProfile, thử tra cứu lại qua invite token nếu identifier chưa thử
    if (!targetUid && !baseProfile && identifier) {
      try {
        inviteToken = await client.friends.resolveInviteTokenFromUsername(identifier);
        if (inviteToken) {
          const userInvite = await client.friends.fetchUserByInviteToken(inviteToken);
          if (userInvite && userInvite.user) {
            baseProfile = { ...userInvite.user, celebrity_data: userInvite.celebrity_data };
            targetUid = baseProfile.uid;
            targetUsername = baseProfile.username || identifier;
          }
        }
      } catch (_) {}
    }

    // Tổng hợp profile
    const profile = {
      uid: targetUid || identifier,
      username: (locketProfile && locketProfile.username) || (baseProfile && baseProfile.username) || targetUsername || identifier,
      first_name: (locketProfile && locketProfile.first_name) || (baseProfile && baseProfile.first_name) || '',
      last_name: (locketProfile && locketProfile.last_name) || (baseProfile && baseProfile.last_name) || '',
      profile_picture_url: (locketProfile && locketProfile.profile_picture_url) || (baseProfile && baseProfile.profile_picture_url) || null,
      badge: (locketProfile && locketProfile.badge) || (baseProfile && baseProfile.badge) || (locketProfile && locketProfile.celebrity ? 'celebrity' : null),
      celebrity: Boolean((locketProfile && locketProfile.celebrity) || (baseProfile && baseProfile.celebrity)),
      email: (baseProfile && baseProfile.email) || null,
      phone_number: (baseProfile && baseProfile.phone_number) || null,
      device_model: (baseProfile && baseProfile.device_model) || (locketProfile && locketProfile.device_model) || null,
      ios_version: (baseProfile && baseProfile.ios_version) || (locketProfile && locketProfile.ios_version) || null,
      is_local_account: Boolean(dbAccount)
    };

    profile.display_name = profile.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : (profile.username || 'Người dùng Locket');
    profile.invite_link = profile.username ? `https://locket.cam/${profile.username}` : '';

    // 6. Kiểm tra mối quan hệ bạn bè với tài khoản active
    const isMe = (profile.uid === myUid) || (activeAccount.username && profile.username && activeAccount.username.toLowerCase() === profile.username.toLowerCase());
    const isFriend = myFriends.some(f => f.uid === profile.uid || (f.username && profile.username && f.username.toLowerCase() === profile.username.toLowerCase()));

    profile.relationship = isMe ? 'self' : (isFriend ? 'friend' : 'none');

    // 7. Lấy danh sách bạn bè của user này:
    let userFriends = [];
    let declaredFriendsCount = null;

    if (dbAccount) {
      try {
        const targetClient = await locketManager.getClient(dbAccount);
        userFriends = await targetClient.friends.getAllFriends();
        if (dbAccount.locket_uid) userFriendsCache.set(dbAccount.locket_uid, userFriends);
        declaredFriendsCount = userFriends.length;
      } catch (e) {
        console.warn('Không thể nạp bạn bè cho targetClient dbAccount:', e.message);
      }
    } else if (isMe) {
      userFriends = myFriends;
      declaredFriendsCount = myFriends.length;
    } else if (userFriendsCache.has(profile.uid)) {
      userFriends = userFriendsCache.get(profile.uid) || [];
      declaredFriendsCount = userFriends.length;
    } else if (baseProfile && baseProfile.celebrity_data && baseProfile.celebrity_data.friend_count) {
      declaredFriendsCount = baseProfile.celebrity_data.friend_count;
    } else if (locketProfile && locketProfile.celebrity_data && locketProfile.celebrity_data.friend_count) {
      declaredFriendsCount = locketProfile.celebrity_data.friend_count;
    }

    // 8. Tính bạn chung (mutual friends)
    let mutualFriends = [];
    if (!isMe && myFriends.length > 0 && userFriends.length > 0) {
      const myFriendUids = new Set(myFriends.map(f => f.uid));
      mutualFriends = userFriends.filter(f => myFriendUids.has(f.uid));
    }

    // 9. Lấy moments gần đây của người dùng này (nếu đã là bạn bè hoặc là chính mình)
    let recentMoments = [];
    if (isFriend || isMe) {
      try {
        const feedRes = await client.postApi('getLatestMomentV2', isMe ? { should_count_missed_moments: false } : { friend_uid: profile.uid });
        recentMoments = (feedRes.data || []).slice(0, 12).map(m => ({
          canonical_uid: m.canonical_uid,
          thumbnail_url: m.thumbnail_url,
          video_url: m.video_url || null,
          caption: m.caption || '',
          date: m.date
        }));
      } catch (_) {}
    }

    res.json({
      code: 200,
      success: true,
      data: {
        profile,
        friends: userFriends || [],
        friendsCount: declaredFriendsCount !== null ? declaredFriendsCount : (userFriends || []).length,
        mutualFriends: mutualFriends || [],
        recentMoments: recentMoments || []
      }
    });
  } catch (err) {
    console.error('Lỗi lấy profile Discord style:', err);
    res.status(400).json({ code: 400, success: false, msg: err.message });
  }
});

module.exports = router;
