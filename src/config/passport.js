const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const config = require('./env');
const prisma = require('../db/prisma');

// Cấu hình Google OAuth 2.0 nếu có Client ID & Client Secret
if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.GOOGLE_CLIENT_ID,
        clientSecret: config.GOOGLE_CLIENT_SECRET,
        callbackURL: config.GOOGLE_CALLBACK_URL
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : `${profile.id}@google.user`;
          const googleId = profile.id;
          const displayName = profile.displayName || email.split('@')[0];
          const avatarUrl = profile.photos && profile.photos[0] ? profile.photos[0].value : null;

          let user = await prisma.user.findUnique({
            where: { google_id: googleId }
          });

          if (!user) {
            // Kiểm tra xem email đã tồn tại chưa
            user = await prisma.user.findUnique({
              where: { email }
            });

            if (user) {
              // Cập nhật google_id
              user = await prisma.user.update({
                where: { id: user.id },
                data: { google_id: googleId, avatar_url: avatarUrl || user.avatar_url }
              });
            } else {
              user = await prisma.user.create({
                data: {
                  google_id: googleId,
                  email,
                  display_name: displayName,
                  avatar_url: avatarUrl,
                  role: 'user'
                }
              });
            }
          }

          return done(null, user);
        } catch (err) {
          console.error('Passport Google Strategy Error:', err);
          return done(err, null);
        }
      }
    )
  );
} else {
  console.warn('⚠️ [Auth Warning] GOOGLE_CLIENT_ID hoặc GOOGLE_CLIENT_SECRET chưa được cấu hình. Google OAuth sẽ chuyển sang chế độ hướng dẫn hoặc Dev Login.');
}

function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      displayName: user.display_name,
      avatarUrl: user.avatar_url
    },
    config.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.JWT_SECRET);
  } catch (err) {
    return null;
  }
}

module.exports = {
  passport,
  generateToken,
  verifyToken
};
