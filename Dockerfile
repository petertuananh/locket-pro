FROM node:20-bookworm-slim

# Cài đặt ffmpeg và các thư viện cần thiết cho xử lý media
RUN apt-get update && apt-get install -y \
    ffmpeg \
    ca-certificates \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cài đặt dependencies
COPY package*.json ./
RUN npm install --production=false

# Copy mã nguồn
COPY . .

# Đồng bộ caption presets cho locket.js SDK
RUN cp src/data/caption_presets.json node_modules/locket.js/caption_presets.json

# Generate Prisma Client
RUN npx prisma generate

EXPOSE 3000

# Tự động đồng bộ schema database và khởi chạy ứng dụng
CMD ["sh", "-c", "npx prisma db push && npm start"]
