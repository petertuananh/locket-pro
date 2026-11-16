const path = require('path');
const fs = require('fs');
const { LocketClient, DeviceProfile } = require('locket.js');
const config = require('../config/env');
const prisma = require('../db/prisma');

// Đảm bảo thư mục session tồn tại
if (!fs.existsSync(config.SESSION_DIR)) {
  fs.mkdirSync(config.SESSION_DIR, { recursive: true });
}

class LocketServiceManager {
  constructor() {
    /** @type {Map<string, LocketClient>} */
    this.clientCache = new Map();
  }

  /**
   * Tạo đường dẫn file session cho một tài khoản
   * @param {string} accountId
   * @returns {string}
   */
  getSessionPath(accountId) {
    return path.join(config.SESSION_DIR, `account_${accountId}.json`);
  }

  /**
   * Lấy instance LocketClient từ cache hoặc khởi tạo mới
   * @param {object} account - Record LocketAccount từ database
   * @returns {Promise<LocketClient>}
   */
  async getClient(account) {
    if (this.clientCache.has(account.id)) {
      const client = this.clientCache.get(account.id);
      // Đảm bảo token vẫn còn hạn
      try {
        if (client.session && client.session.refreshToken) {
          await client.session.getValidToken();
        }
        return client;
      } catch (err) {
        console.warn(`Làm mới token cho account ${account.id} gặp lỗi, thử tải lại từ session file:`, err.message);
      }
    }

    const sessionPath = this.getSessionPath(account.id);

    // Kiểm tra xem session file đã có chưa, nếu chưa có nhưng database có session_data thì khôi phục
    if (!fs.existsSync(sessionPath) && account.session_data) {
      try {
        fs.writeFileSync(sessionPath, account.session_data, 'utf8');
      } catch (e) {
        console.error('Không thể ghi file session từ DB:', e);
      }
    }

    const client = new LocketClient({
      sessionPath,
      autoEmulate: true,
      modelName: account.device_model || 'iPhone 15 Pro',
      iosVersion: account.ios_version || '17.4.1'
    });

    if (fs.existsSync(sessionPath)) {
      try {
        client.session.load();
        await client.session.getValidToken();
      } catch (err) {
        console.warn(`Không thể nạp session cho tài khoản ${account.id}:`, err.message);
      }
    }

    this.clientCache.set(account.id, client);
    return client;
  }

  /**
   * Đăng nhập và liên kết tài khoản Locket mới cho User
   * @param {string} userId
   * @param {object} data - { label, email, password, deviceModel, iosVersion }
   * @returns {Promise<object>} LocketAccount đã lưu
   */
  async addAccount(userId, data) {
    const { label, email, password, deviceModel = 'iPhone 15 Pro', iosVersion = '17.4.1' } = data;

    // Tạo record tạm trong DB để lấy accountId
    const tempAccount = await prisma.locketAccount.create({
      data: {
        user_id: userId,
        label: label || 'Tài khoản Locket',
        email: email.trim(),
        locket_uid: 'pending',
        session_data: '{}',
        device_model: deviceModel,
        ios_version: iosVersion,
        is_active: false
      }
    });

    const sessionPath = this.getSessionPath(tempAccount.id);

    const client = new LocketClient({
      sessionPath,
      autoEmulate: true,
      modelName: deviceModel,
      iosVersion: iosVersion
    });

    try {
      // Đăng nhập qua Firebase Toolkit của Locket
      await client.login(email.trim(), password);

      const locketUid = client.session.uid || '';
      let profile = {};
      try {
        profile = await client.user.getProfile();
      } catch (pe) {
        console.warn('Không thể lấy profile ngay sau khi đăng nhập:', pe.message);
      }

      // Đọc session file vừa được SDK tự động lưu
      let sessionData = '{}';
      if (fs.existsSync(sessionPath)) {
        sessionData = fs.readFileSync(sessionPath, 'utf8');
      }

      // Kiểm tra xem user đã có tài khoản active nào chưa
      const existingActive = await prisma.locketAccount.findFirst({
        where: { user_id: userId, is_active: true }
      });

      const updatedAccount = await prisma.locketAccount.update({
        where: { id: tempAccount.id },
        data: {
          locket_uid: locketUid,
          username: profile.username || profile.display_name || null,
          first_name: profile.first_name || null,
          last_name: profile.last_name || null,
          avatar_url: profile.profile_picture_url || profile.avatar_url || null,
          session_data: sessionData,
          is_active: !existingActive // Nếu chưa có active account nào thì set luôn làm active
        }
      });

      this.clientCache.set(updatedAccount.id, client);
      return updatedAccount;
    } catch (err) {
      // Xóa bản ghi tạm và file session nếu đăng nhập thất bại
      try { await prisma.locketAccount.delete({ where: { id: tempAccount.id } }); } catch (_) {}
      try { if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath); } catch (_) {}
      throw new Error(`Đăng nhập Locket thất bại: ${err.message || 'Sai email hoặc mật khẩu'}`);
    }
  }

  /**
   * Lấy Client của tài khoản đang active của User
   * @param {string} userId
   * @returns {Promise<{ client: LocketClient, account: object }>}
   */
  async getActiveClientForUser(userId) {
    let account = await prisma.locketAccount.findFirst({
      where: { user_id: userId, is_active: true }
    });

    if (!account) {
      // Nếu không có tài khoản nào được đánh dấu active, lấy tài khoản đầu tiên
      account = await prisma.locketAccount.findFirst({
        where: { user_id: userId },
        orderBy: { created_at: 'asc' }
      });

      if (account) {
        // Tự động set active
        await prisma.locketAccount.update({
          where: { id: account.id },
          data: { is_active: true }
        });
        account.is_active = true;
      }
    }

    if (!account) {
      const error = new Error('Chưa có tài khoản Locket nào được liên kết. Vui lòng thêm tài khoản Locket trước.');
      error.statusCode = 404;
      throw error;
    }

    const client = await this.getClient(account);
    return { client, account };
  }

  /**
   * Chuyển đổi tài khoản đang active
   * @param {string} userId
   * @param {string} accountId
   */
  async switchActiveAccount(userId, accountId) {
    const targetAccount = await prisma.locketAccount.findFirst({
      where: { id: accountId, user_id: userId }
    });

    if (!targetAccount) {
      throw new Error('Tài khoản Locket không tồn tại hoặc không thuộc quyền sở hữu của bạn.');
    }

    // Tắt active cho tất cả tài khoản của user
    await prisma.locketAccount.updateMany({
      where: { user_id: userId },
      data: { is_active: false }
    });

    // Bật active cho tài khoản đích
    const updated = await prisma.locketAccount.update({
      where: { id: accountId },
      data: { is_active: true }
    });

    return updated;
  }

  /**
   * Xóa tài khoản Locket
   * @param {string} userId
   * @param {string} accountId
   */
  async removeAccount(userId, accountId) {
    const targetAccount = await prisma.locketAccount.findFirst({
      where: { id: accountId, user_id: userId }
    });

    if (!targetAccount) {
      throw new Error('Tài khoản không tồn tại hoặc không thuộc về bạn.');
    }

    // Xóa session file
    const sessionPath = this.getSessionPath(accountId);
    try {
      if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
    } catch (_) {}

    // Xóa cache
    this.clientCache.delete(accountId);

    // Xóa trong DB
    await prisma.locketAccount.delete({
      where: { id: accountId }
    });

    // Nếu vừa xóa tài khoản đang active, kích hoạt tài khoản khác nếu còn
    if (targetAccount.is_active) {
      const remaining = await prisma.locketAccount.findFirst({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' }
      });
      if (remaining) {
        await prisma.locketAccount.update({
          where: { id: remaining.id },
          data: { is_active: true }
        });
      }
    }

    return true;
  }
}

module.exports = new LocketServiceManager();
