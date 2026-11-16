# 🚀 Locket Pro - Locket Camera Web Client

> **Nền tảng Web Client thế hệ mới dành cho Locket Camera: Đăng nhập Google, Quản lý đa tài khoản, Đăng ảnh & Video HEVC <6MB, 158 Presets Gradient độc quyền & Trò chuyện thời gian thực.**

🌐 **Live Website**: [https://locket.tuananh.dev](https://locket.tuananh.dev)  
📦 **Repository**: [https://github.com/petertuananh/locket-pro](https://github.com/petertuananh/locket-pro)

---

## 💖 Lời cảm ơn đặc biệt (Special Acknowledgements)

Dự án **Locket Pro** được xây dựng và vận hành thành công nhờ vào thư viện lõi:

🌟 **[locket.js](https://github.com/hmkk69/locket.js)** - Bộ SDK Node.js đảo ngược giao thức Locket Camera xuất sắc được phát triển bởi tác giả **[hmkk69](https://github.com/hmkk69)**.
- Thư viện cung cấp khả năng kết nối trực tiếp với API Locket Camera & Firebase Auth.
- Giả lập 100% phần cứng Apple iOS (iPhone 13 Pro đến 15 Pro Max, Google Protobuf flags, Firebase GMPID).
- Tích hợp pipeline nén HEVC chuẩn Apple và toàn bộ cơ sở dữ liệu 158 Presets Caption.
- Xin chân thành gửi lời cảm ơn và tri ân sâu sắc tới tác giả **hmkk69** vì những đóng góp vô giá cho cộng đồng mã nguồn mở!

---

## ✨ Tính năng nổi bật

- 🔑 **Đăng nhập Google thuận tiện (Google OAuth 2.0)**: 1-click đăng nhập qua tài khoản Google, bảo mật với JWT.
- 👥 **Đa tài khoản Locket (Multi-Account Switcher)**: Cho phép liên kết và chuyển đổi nhanh giữa nhiều tài khoản Locket (tài khoản cá nhân, tài khoản phụ, tài khoản xài chung với người yêu/bạn thân).
- 📸 **Camera WebRTC & Upload chuyên nghiệp**: Chụp trực tiếp từ Webcam máy tính/điện thoại hoặc tải ảnh/video từ thư viện. Tự động crop tỷ lệ 1:1 chuẩn Locket.
- 🎨 **158 Presets Gradient & Custom Designer**: Trọn bộ 158 bộ màu và icon preset (Flex, Nhạc chill, Tình yêu, Halloween, Giáng sinh,...) kèm công cụ tự mix màu gradient riêng.
- 🎬 **Hỗ trợ Video HEVC / H.265**: Tự động nén video chuẩn phần cứng Apple dưới 6 MB, trích xuất thumbnail WebP tức thì.
- 📰 **Bảng tin & Khoảnh khắc tương tác**: Lướt feed bạn bè, khoảnh khắc cá nhân, rollcall tuần, xem ai đã xem ảnh, thả cảm xúc emoji (`❤️`, `🔥`, `😍`, `😂`, `💛`, `🫶`) và để lại bình luận.
- 💬 **Trò chuyện Locket trực tiếp (Direct Chat)**: Nhắn tin bạn bè realtime, gửi kèm khoảnh khắc vào tin nhắn, thả emoji reactions và thu hồi tin nhắn.
- 🤝 **Quản lý Bạn bè & Lời mời**: Kết bạn qua username hoặc link `locket.cam/<username>`, duyệt lời mời kết bạn, hủy kết bạn và chặn.
- 📱 **100% Authentic iOS Hardware Emulation**: Tùy chỉnh dòng máy iPhone và phiên bản iOS giả lập, ngăn chặn tối đa rủi ro checkpoint tài khoản.

---

## 🛠️ Kiến trúc & Công nghệ (Tech Stack)

| Thành phần | Công nghệ |
| :--- | :--- |
| **Backend** | Node.js (v20+), Express.js, Socket.io |
| **Locket Engine** | [`locket.js`](https://github.com/hmkk69/locket.js) (v0.0.3) |
| **Authentication** | Passport.js Google OAuth 2.0, JWT (JSON Web Tokens) |
| **Database** | PostgreSQL + Prisma ORM |
| **Media Pipeline** | Sharp (WebP conversion) + FFmpeg (HEVC H.265 / AAC) |
| **Frontend** | HTML5, TailwindCSS, Lucide Icons, Glassmorphism Locket Amber Theme |
| **DevOps** | Docker, Docker Compose, Nginx Reverse Proxy (`locket.tuananh.dev`) |

---

## 🚀 Hướng dẫn Cài đặt & Khởi chạy

### 1. Khởi chạy bằng Docker Compose (Khuyến nghị)

```bash
# Clone dự án
git clone https://github.com/petertuananh/locket-pro.git
cd locket-pro

# Copy file môi trường
cp .env.example .env
# Chỉnh sửa thông số trong .env (DATABASE_URL, JWT_SECRET, GOOGLE_CLIENT_ID,...)

# Khởi chạy toàn bộ hệ thống (App + PostgreSQL)
docker compose up -d --build
```

### 2. Chạy thủ công trên máy chủ / Local Development

```bash
# 1. Cài đặt dependencies
npm install

# 2. Khởi tạo Database Prisma
npx prisma db push
npx prisma generate

# 3. Chạy ở chế độ phát triển
npm run dev
```

---

## 🌐 Cấu hình Nginx cho `locket.tuananh.dev`

Tệp cấu hình Nginx Reverse Proxy hỗ trợ WebSocket và SSL được đặt tại `nginx/locket.tuananh.dev.conf`.

---

## 📜 Giấy phép & Bản quyền

Dự án phát triển cho mục đích học tập, nghiên cứu và tiện ích cá nhân.  
Được phát hành theo giấy phép **MIT License**.  
Bản quyền Locket Camera thuộc về **Locket Labs, Inc.**
