const express = require('express');
const router = express.Router();
const spotifyService = require('../services/spotifyService');

// Tìm kiếm bài hát Spotify
router.get('/search', async (req, res) => {
  try {
    const q = req.query.q;
    const limit = parseInt(req.query.limit, 10) || 10;

    if (!q || !q.trim()) {
      return res.json({
        code: 200,
        success: true,
        data: []
      });
    }

    const tracks = await spotifyService.searchTracks(q, limit);

    res.json({
      code: 200,
      success: true,
      data: tracks
    });
  } catch (err) {
    console.error('Spotify Search Route Error:', err.message);
    res.status(500).json({
      code: 500,
      success: false,
      msg: err.message || 'Lỗi khi tìm kiếm bài hát Spotify'
    });
  }
});

module.exports = router;
