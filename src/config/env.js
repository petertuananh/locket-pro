const path = require('path');
require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://locket_user:locket_secret_pass@localhost:5432/locket_db?schema=public',
  JWT_SECRET: process.env.JWT_SECRET || 'locket_pro_ultra_secure_jwt_secret_token_2026',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || 'https://locket.tuananh.dev/api/auth/google/callback',
  CLIENT_URL: process.env.CLIENT_URL || 'https://locket.tuananh.dev',
  SESSION_DIR: process.env.SESSION_DIR || path.join(__dirname, '../locket_sessions'),
  UPLOADS_DIR: path.join(__dirname, '../../uploads')
};
