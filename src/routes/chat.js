const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const locketManager = require('../services/locketService');

// 1. Lấy danh sách hội thoại
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const conversations = await client.chat.getConversations();

    res.json({
      code: 200,
      success: true,
      data: conversations || []
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 2. Lấy tin nhắn trong cuộc trò chuyện
router.get('/messages/:peerUid', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const { peerUid } = req.params;
    const conversationId = req.query.conversationId || null;

    const messages = await client.chat.getMessages({
      otherUserId: peerUid,
      conversationId: conversationId
    });

    res.json({
      code: 200,
      success: true,
      data: messages || []
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 3. Gửi tin nhắn trực tiếp (kèm moment nếu có)
router.post('/send', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const { receiverUid, text, momentUid } = req.body;

    if (!receiverUid) {
      return res.status(400).json({ code: 400, success: false, msg: 'Thiếu receiverUid người nhận' });
    }

    if (!text && !momentUid) {
      return res.status(400).json({ code: 400, success: false, msg: 'Nội dung tin nhắn hoặc momentUid không được để trống' });
    }

    const result = await client.chat.sendMessage({
      receiverUid,
      text: text || '',
      momentUid: momentUid || null
    });

    res.json({
      code: 200,
      success: true,
      msg: 'Đã gửi tin nhắn thành công!',
      data: result
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 4. Thả cảm xúc Emoji vào tin nhắn
router.post('/react', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const { conversationId, messageId, emoji = '❤️' } = req.body;

    if (!conversationId || !messageId) {
      return res.status(400).json({ code: 400, success: false, msg: 'Thiếu conversationId hoặc messageId' });
    }

    const result = await client.chat.sendReaction(conversationId, messageId, emoji);
    res.json({
      code: 200,
      success: true,
      msg: `Đã thả emoji ${emoji} vào tin nhắn!`,
      data: result
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 5. Gỡ cảm xúc khỏi tin nhắn
router.delete('/react', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const { conversationId, messageId } = req.body;

    if (!conversationId || !messageId) {
      return res.status(400).json({ code: 400, success: false, msg: 'Thiếu conversationId hoặc messageId' });
    }

    const result = await client.chat.removeReaction(conversationId, messageId);
    res.json({
      code: 200,
      success: true,
      msg: 'Đã gỡ cảm xúc khỏi tin nhắn.',
      data: result
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 6. Thu hồi / Xóa tin nhắn
router.delete('/messages/:conversationUid/:messageUid', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const { conversationUid, messageUid } = req.params;

    const result = await client.chat.deleteMessage(conversationUid, messageUid);
    res.json({
      code: 200,
      success: true,
      msg: 'Đã thu hồi tin nhắn thành công.',
      data: result
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

// 7. Đánh dấu đã đọc
router.post('/read', requireAuth, async (req, res) => {
  try {
    const { client } = await locketManager.getActiveClientForUser(req.user.id);
    const { conversationUid, otherUserId } = req.body;

    await client.chat.markAsRead({
      conversationUid,
      otherUserId
    });

    res.json({
      code: 200,
      success: true,
      msg: 'Đã đánh dấu cuộc trò chuyện đã đọc.'
    });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ code, success: false, msg: err.message });
  }
});

module.exports = router;
