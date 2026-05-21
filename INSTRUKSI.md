# Instruksi Pengembangan

## Prinsip Scope

Fitur awal hanya fondasi, auth, user profile, dan direct chat realtime dasar. Jangan menambahkan feed, story, nearby, anonymous forum, atau fitur sosial lain sebelum fondasi ini stabil.

## Backend

- Semua endpoint selain register, login, refresh, dan health harus protected dengan JWT.
- Jangan pernah mengembalikan `passwordHash`.
- Gunakan DTO dengan `class-validator`.
- Gunakan Prisma untuk akses database.
- Gunakan UUID primary key.
- Database tetap snake_case, response tetap camelCase.
- Untuk direct chat, selalu validasi participant aktif sebelum list atau send message.

## Frontend

- Gunakan `src/lib/api-client.ts` untuk semua HTTP request.
- Gunakan `src/lib/socket-client.ts` untuk Socket.IO Client.
- Simpan state auth di `src/stores/auth-store.ts`.
- Simpan state chat di `src/stores/chat-store.ts`.
- Jangan hardcode user id.
- UI chat harus terhubung ke backend.

## Realtime

- Client hanya memakai `socket.io-client`.
- Gateway memvalidasi JWT pada connection.
- Client harus join room conversation sebelum menerima message.
- Server emit `message.sent` ke room conversation saja.

## Perintah Utama

```bash
docker compose up -d
cd backend && npm install && npm run prisma:migrate -- --name init && npm run start:dev
cd frontend && npm install && npm run dev
```
