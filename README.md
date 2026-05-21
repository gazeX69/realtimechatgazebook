# Realtime Chat/Social App Starter

Monorepo awal untuk aplikasi chat realtime dengan NestJS, Prisma, PostgreSQL, Redis, Socket.IO, BullMQ, React, Vite, Zustand, dan TailwindCSS.

Fokus implementasi saat ini:

- Phase stabilisasi: auth/profile/relationship/chat/feed/media dasar sudah ada dan fokus saat ini adalah realtime correctness.
- Chat direct dan group basic tersedia, termasuk protected REST endpoint, Socket.IO room auth, typing, read receipt, reconnect repair, dan presence dasar.
- Feed dasar tersedia, termasuk post media, reactions, comments, dan realtime feed events.
- Media saat ini memakai dua jalur: legacy `/uploads` untuk avatar/kompatibilitas feed lama, dan structured `/media` untuk upload baru/chat attachments.

Runtime documentation:
- `docAI/runtime/CURRENT_SYSTEM_STATE.md`
- `docAI/runtime/ARCHITECTURE_MAP.md`
- `docAI/runtime/EVENT_CONTRACTS.md`
- `docAI/runtime/ACTIVE_BUG_WATCHLIST.md`

README ini hanya onboarding. Untuk source-of-truth runtime, gunakan dokumen `docAI/runtime`.

## Menjalankan Dari Nol

1. Jalankan PostgreSQL dan Redis.

```bash
docker compose up -d
```

2. Siapkan backend.

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run start:dev
```

Backend berjalan di `http://localhost:3000/api`.

3. Siapkan frontend.

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend berjalan di `http://localhost:5173`.

## Endpoint Tersedia

Health:

- `GET /api/health`

Auth:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout` protected

User:

- `GET /api/me` protected
- `PUT /api/me/profile` protected
- `GET /api/users` protected

Chat:

- `POST /api/conversations/direct` protected
- `POST /api/conversations/group` protected
- `PATCH /api/conversations/group/:id` protected
- `POST /api/conversations/group/:id/members` protected
- `DELETE /api/conversations/group/:id/members/:userId` protected
- `POST /api/conversations/group/:id/owner` protected
- `POST /api/conversations/group/:id/leave` protected
- `GET /api/conversations` protected
- `GET /api/conversations/:conversationId/messages` protected
- `POST /api/conversations/:conversationId/messages` protected
- `DELETE /api/conversations/:conversationId/messages/:messageId` protected
- `POST /api/conversations/:id/read-all` protected

Social:

- `GET /api/users/search` protected
- `GET /api/users/suggested` protected
- `GET /api/users/:id/profile` protected
- `POST /api/users/:id/follow` protected
- `DELETE /api/users/:id/follow` protected
- `GET /api/users/:id/followers` protected
- `GET /api/users/:id/following` protected
- `POST /api/friends/:id/request` protected
- `GET /api/friends` protected
- `GET /api/friend-requests` protected
- `POST /api/friend-requests/:id/accept` protected
- `POST /api/friend-requests/:id/reject` protected
- `POST /api/friend-requests/:id/cancel` protected
- `DELETE /api/friends/:id` protected
- `POST /api/users/:id/block` protected
- `DELETE /api/users/:id/block` protected
- `GET /api/blocks` protected

Feed, media, notifications:

- `GET /api/feed` protected
- `GET /api/explore` protected
- `POST /api/posts` protected
- `POST /api/posts/:id/react` protected
- `DELETE /api/posts/:id/react` protected
- `GET /api/posts/:id/comments` protected
- `POST /api/posts/:id/comments` protected
- `POST /api/uploads/post-media` protected
- `POST /api/uploads/avatar` protected
- `POST /api/media/upload` protected
- `GET /api/media/:id` protected
- `GET /api/notifications` protected
- `GET /api/notifications/unread-count` protected
- `POST /api/notifications/:id/read` protected
- `PATCH /api/notifications/read-all` protected
- `POST /api/reports` protected

Socket.IO:

- Connect ke `http://localhost:3000` dengan `auth.token = accessToken`
- Emit `conversation.join` dengan `{ "conversationId": "..." }`
- Listen `message.sent`, `message.new`, `message.read`, `notification.new`, `presence.snapshot`, `user.online`, `user.offline`, `user.typing`, `user.stopTyping`, `post.created`, `post.reacted`, `comment.created`
- Runtime event contract lengkap ada di `docAI/runtime/EVENT_CONTRACTS.md`

## Response API

Sukses:

```json
{
  "success": true,
  "message": "OK",
  "data": {},
  "meta": {}
}
```

Error:

```json
{
  "success": false,
  "message": "Validation failed",
  "data": null,
  "error": {
    "statusCode": 400,
    "details": {}
  }
}
```

## Test Manual Auth

1. Buka `http://localhost:5173/register`.
2. Buat akun pertama.
3. Logout.
4. Login lagi dengan email dan password yang sama.
5. Cek halaman `/chat` terbuka.
6. Cek `GET /api/me` dengan Bearer token dari localStorage jika ingin test via Postman/curl.

Contoh curl:

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"alice@example.com\",\"username\":\"alice\",\"displayName\":\"Alice\",\"password\":\"password123\"}"
```

## Test Manual Chat Realtime

1. Register akun Alice di browser pertama.
2. Register akun Bob di browser kedua atau incognito.
3. Di akun Alice, buka `/chat`, pilih Bob dari panel Users.
4. Di akun Bob, refresh `/chat`, buka conversation dengan Alice.
5. Kirim pesan dari salah satu browser.
6. Browser lain menerima event `message.sent` lewat Socket.IO.

## Catatan Database

- Primary key memakai UUID.
- Table dan column memakai snake_case lewat `@@map` dan `@map`.
- Response API tetap camelCase.
- `users`, `conversations`, dan `messages` punya `deleted_at` untuk soft delete.
- `conversations.direct_key` unik untuk mencegah direct conversation dobel antara dua user.

## Risiko dan Limitasi

- Belum ada email verification, forgot password, deteksi reuse refresh token, push notification, dan audit log admin lengkap.
- BullMQ sudah dikonfigurasi sebagai fondasi queue, tetapi belum ada worker produksi.
- Redis Pub/Sub Socket.IO sudah dipasang untuk multi-instance, tetapi belum ada deployment profile production.
- Realtime lifecycle masih fase stabilisasi: reconnect, read receipt, notification sync, presence, dan optimistic reconciliation masih high risk.
- Backend emit `message.deleted` sudah ada, tetapi client listener belum terkonfirmasi pada audit 2026-05-20.
- Local filesystem upload belum cocok untuk horizontal deployment tanpa shared/object storage.
