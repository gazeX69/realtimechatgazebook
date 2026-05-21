````md id="j3m8x2"
# Instruksi Pengembangan

## Current Development Mode

```txt
MODE: STABILIZATION ONLY
````

Fokus utama project saat ini:

* realtime correctness
* reconnect lifecycle
* read receipt synchronization
* optimistic reconciliation
* presence consistency
* notification synchronization
* media lifecycle correctness

Note : Penambahan fitur baru bukan prioritas utama sampai lifecycle realtime stabil.

---

# Prinsip Scope

Fondasi auth, relationship, dan realtime chat tetap menjadi core system.

Feed, stories, media, forum, nearby, dan anonymous room sudah memiliki fondasi awal, tetapi masih berada dalam fase stabilisasi dan belum dianggap production-stable.

Jangan memperluas fitur sosial sebelum:

* reconnect stabil
* read receipt konsisten
* duplicate event selesai
* optimistic lifecycle aman
* presence synchronization benar

Jika ada konflik:

* stabilitas realtime lebih penting daripada fitur baru.

---

# Backend Rules

* Semua endpoint selain:

  * register
  * login
  * refresh
  * health

  wajib protected dengan JWT.

* Jangan pernah mengembalikan:

  * password
  * passwordHash
  * refresh token raw
  * secret internal

* Gunakan DTO dengan:

  * class-validator
  * class-transformer

* Gunakan Prisma sebagai single ORM layer.

* Gunakan UUID primary key.

* Database tetap snake_case.

* API response tetap camelCase.

* Jangan query lintas module tanpa service layer.

* Jangan hardcode:

  * user id
  * role id
  * permission id

---

# Realtime Rules

Client wajib memakai:

```txt
socket.io-client
```

Server wajib:

* validasi JWT saat socket connection
* validasi membership sebelum join room
* validasi authorization sebelum emit sensitive event

Semua realtime event wajib:

* memiliki source-of-truth jelas
* tidak duplicate
* tidak race-condition prone
* tidak broadcast ke user tidak berhak

Server emit event hanya ke room yang relevan.

---

# Chat Lifecycle Rules

## Conversation Access

* User hanya boleh membaca conversation jika participant aktif.
* User hanya boleh mengirim message jika participant aktif.
* User blocked tidak boleh mengirim interaction baru.

## Message Rules

* Message delete wajib soft delete/tombstone.
* Jangan hard delete message penting.
* Attachment wajib divalidasi:

  * mime type
  * size
  * ownership

## Realtime Message Rules

* `message.sent` tidak boleh duplicate.
* `message.read` tidak boleh lompat state.
* Reconnect tidak boleh membuat phantom message.
* Presence tidak boleh false offline pada multi-tab.

---

# Frontend Rules

Gunakan:

```txt
src/lib/api-client.ts
```

untuk semua HTTP request.

Gunakan:

```txt
src/lib/socket-client.ts
```

untuk semua realtime connection.

State management:

```txt
src/stores/auth-store.ts
src/stores/chat-store.ts
```

Rules:

* Jangan hardcode user id.
* Jangan membuat source-of-truth kedua.
* Jangan update state dari REST + socket tanpa reconciliation guard.
* Optimistic update wajib memiliki rollback/reconciliation strategy.
* UI tidak boleh menganggap request sukses sebelum lifecycle selesai.

---

# Media Rules

Media system saat ini memiliki dua jalur:

## Legacy

```txt
/uploads
```

Digunakan untuk:

* avatar lama
* compatibility lama

## Structured Media

```txt
/media
```

Digunakan untuk:

* attachment baru
* media lifecycle baru
* protected media access

Rules:

* Private attachment tidak boleh diakses public raw URL.
* Media ownership wajib divalidasi backend.
* Frontend tidak boleh menjadi source-of-truth media authorization.

---

# Architecture Rules

## Domain Boundary Rules

STRICT.

* Module chat tidak boleh import forum.
* Module forum tidak boleh import chat.
* Module anonymous tidak boleh expose real user_id.
* Semua komunikasi lintas module harus lewat service layer.

Jika melanggar:
→ anggap sebagai architecture bug.

---

# Stabilization Rules

## Reproduce First

Jangan langsung coding.

Sebelum fix bug:

* reproduce minimal 2x
* catat:

  * action
  * API response
  * socket event
  * frontend state

Jika bug tidak bisa direproduce:
→ jangan sentuh kode.

---

## One Bug = One Fix

Rules:

* satu bug = satu perubahan kecil
* jangan refactor besar saat debugging
* jangan tambah layer baru tanpa alasan nyata
* jangan rewrite lifecycle tanpa root cause jelas

---

## Validation Wajib

Setelah fix:

* test 2 akun
* test spam click
* test reconnect
* test reload
* test multi-tab
* test event ordering

Jika salah satu gagal:
→ fix belum selesai.

---

# Source Of Truth Rules

Selalu identifikasi source-of-truth:

* database
* socket event
* frontend state

Jika ada multiple conflicting source-of-truth:
→ itu bug.

Frontend tidak boleh:

* overwrite state tanpa reconciliation
* percaya optimistic state permanen
* percaya socket tanpa validasi lifecycle

---

# API Response Rules

Semua response wajib konsisten.

## Success

```json
{
  "success": true,
  "message": "OK",
  "data": {},
  "meta": {}
}
```

## Error

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

---

# Database Rules

* snake_case naming
* UUID primary key
* soft delete untuk entity penting
* jangan hard delete message/post penting
* migration wajib masuk repository
* Prisma schema menjadi source-of-truth database structure

---

# Security Rules

* Semua endpoint protected wajib validasi ownership/access.
* Jangan percaya frontend authorization.
* Jangan expose internal moderation data.
* Jangan expose anonymous real identity.
* Jangan expose sensitive realtime payload.
* Rate limit wajib ada pada:

  * messaging
  * friend request
  * reconnect spam
  * notification spam
  * upload abuse

---

# Current High Risk Areas

Current stabilization watchlist:

* reconnect lifecycle
* optimistic reconciliation
* read receipt synchronization
* presence multi-tab consistency
* attachment lifecycle
* notification ordering
* duplicate prevention
* race condition prevention

---

# Main Commands

## Start Infrastructure

```bash
docker compose up -d
```

---

## Backend

```bash
cd backend

npm install

npm run prisma:generate

npm run prisma:migrate -- --name init

npm run start:dev
```

---

## Frontend

```bash
cd frontend

npm install

npm run dev
```

---

# Final Principle

Project ini dibangun sebagai sistem realtime jangka panjang.

Prioritas utama bukan:

* banyak fitur
* cepat selesai
* terlihat kompleks

Tetapi:

* lifecycle consistency
* realtime correctness
* architecture safety
* stabilization quality

Karena dalam aplikasi realtime:
bug kecil pada lifecycle dapat merusak seluruh user experience.

```
```
