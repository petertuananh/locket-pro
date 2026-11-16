const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const config = require('./config/env');
const { passport } = require('./config/passport');

// Import routes
const authRoutes = require('./routes/auth');
const accountsRoutes = require('./routes/accounts');
const momentsRoutes = require('./routes/moments');
const friendsRoutes = require('./routes/friends');
const chatRoutes = require('./routes/chat');
const userRoutes = require('./routes/user');

const app = express();
const server = http.createServer(app);

// Cấu hình Socket.io cho realtime chat và notifications
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(passport.initialize());

// Phục vụ Static Files Frontend (tắt index mặc định để ưu tiên routing của Express)
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use('/uploads', express.static(config.UPLOADS_DIR));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/locket/accounts', accountsRoutes);
app.use('/api/locket/moments', momentsRoutes);
app.use('/api/locket/friends', friendsRoutes);
app.use('/api/locket/chat', chatRoutes);
app.use('/api/locket/user', userRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'locket-pro',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Route Landing page & Web App
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/', (req, res) => {
  if (req.query.token) {
    return res.redirect(`/app?token=${req.query.token}`);
  }
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// Socket.io Realtime connection
io.on('connection', (socket) => {
  // Lắng nghe room tham gia của user
  socket.on('join_user_room', (userId) => {
    if (userId) socket.join(`user_${userId}`);
  });

  socket.on('join_chat', (conversationId) => {
    if (conversationId) socket.join(`chat_${conversationId}`);
  });

  socket.on('send_chat_message', (data) => {
    if (data && data.conversationId) {
      io.to(`chat_${data.conversationId}`).emit('new_chat_message', data);
    }
  });

  socket.on('disconnect', () => {});
});

// 404 Not Found Handler
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ code: 404, success: false, msg: 'Không tìm thấy API endpoint này.' });
  }
  if (req.accepts('html')) {
    return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }
  res.status(404).json({ code: 404, success: false, msg: 'Không tìm thấy trang hoặc tài nguyên này.' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    code: err.status || 500,
    success: false,
    msg: err.message || 'Lỗi máy chủ nội bộ'
  });
});

// Khởi chạy server
const PORT = config.PORT;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ════════════════════════════════════════════════════════════════════
  🚀 LOCKET PRO WEB CLIENT - SERVER SẴN SÀNG!
  ────────────────────────────────────────────────────────────────────
  📍 Port: ${PORT}
  🌍 Local: http://localhost:${PORT}
  🔗 Production Domain: https://locket.tuananh.dev
  🌟 Powered by locket.js SDK (Special Thanks to hmkk69)
  🎨 Theme: Locket Iconic Amber & Obsidian Glassmorphism
  ════════════════════════════════════════════════════════════════════
  `);
});

module.exports = { app, server };
