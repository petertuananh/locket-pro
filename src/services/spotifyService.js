const config = require('../config/env');

class SpotifyService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
  }

  /**
   * Lấy access token từ Spotify API qua client credentials
   */
  async getAccessToken() {
    // Nếu token vẫn còn hạn (trừ đi 60s buffer)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    const clientId = config.SPOTIFY_CLIENT_ID;
    const clientSecret = config.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Chưa cấu hình SPOTIFY_CLIENT_ID hoặc SPOTIFY_CLIENT_SECRET');
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    });

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Spotify Auth failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in * 1000);

    return this.accessToken;
  }

  /**
   * Tìm kiếm bài hát trên Spotify
   * @param {string} query 
   * @param {number} limit 
   * @returns {Promise<Array>}
   */
  async searchTracks(query, limit = 10) {
    if (!query || !query.trim()) return [];

    const token = await this.getAccessToken();
    const cleanLimit = Math.min(Math.max(limit, 1), 20);
    const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query.trim())}&type=track&limit=${cleanLimit}`;

    const res = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Spotify Search failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const items = (data.tracks && data.tracks.items) ? data.tracks.items : [];

    return items.map(track => {
      const artistNames = (track.artists || []).map(a => a.name).join(', ');
      const albumImages = (track.album && track.album.images) ? track.album.images : [];
      const image = albumImages[0]?.url || '';
      const thumb = albumImages[albumImages.length - 1]?.url || image;

      return {
        id: track.id,
        name: track.name,
        artists: artistNames,
        album: track.album?.name || '',
        image: image,
        thumbnail: thumb,
        url: track.external_urls?.spotify || '',
        duration_ms: track.duration_ms,
        preview_url: track.preview_url || null
      };
    });
  }
}

module.exports = new SpotifyService();
