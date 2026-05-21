````md
# GAZEBook

GAZEBook adalah monorepo aplikasi sosial media realtime multi-platform berbasis chat yang menggabungkan konsep:

- WhatsApp → direct/group realtime chat
- MiChat → discovery dan social connection
- Instagram → media sharing dan visual profile
- Twitter/X → feed dan short post
- Forum/community klasik → room dan komunitas

Project ini dibangun bertahap dengan prioritas utama:
- realtime correctness,
- modular architecture,
- backend authorization,
- dan stabilization lifecycle.

---

# Current Project Status

Project saat ini berada pada fase:

```txt
STABILIZATION ONLY
````

Fokus utama development saat ini:

* direct/group realtime consistency
* reconnect lifecycle
* read receipt synchronization
* presence synchronization
* optimistic state reconciliation
* notification correctness
* media lifecycle correctness

Penambahan fitur baru bukan prioritas utama sampai lifecycle realtime stabil.

---

# Current Implemented Foundation

## Backend

* NestJS
* Prisma ORM
* PostgreSQL
* Redis
* Socket.IO
* BullMQ foundation

## Frontend

* React
* Vite
* Zustand
* TailwindCSS
* Socket.IO Client

---

# Current Features

## Authentication & User

* Register
* Login
* Refresh token
* Logout
* Protected routes
* User profile
* Avatar upload
* User search

## Relationship

* Follow / unfollow
* Friend request
* Accept / reject request
* Block user
* Suggested users

## Realtime Chat

* Direct conversation
* Group conversation basic
* Realtime messaging
* Typing indicator
* Presence snapshot
* Online/offline status
* Read receipt basic
* Reconnect repair foundation
* Soft delete message foundation

## Feed & Media Foundation

Current status:

* implemented but still stabilization phase

Features:

* post text/media
* reactions
* comments
* media upload abstraction
* attachment rendering
* media viewer

## Notifications

* unread count
* realtime notification events
* notification list
* mark as read

## Stories Foundation

Current status:

* implemented foundation
* not yet considered stable

---

# Architecture Principles

## Core Rule

Realtime chat adalah core system.

Semua fitur sosial lain:

* feed
* stories
* media
* forum
* nearby
* anonymous

tidak boleh merusak stabilitas realtime lifecycle.

---

# Development Principles

## Current Mode

```txt
MODE: STABILIZATION ONLY
```

Rules:

* no large refactor
* no unnecessary architecture rewrite
* no feature expansion before stabilization
* focus on reproducible bug fixing
* focus on source-of-truth consistency

---

# Realtime Lifecycle Priorities

Current high-risk areas:

* optimistic reconciliation
* reconnect recovery
* read receipt sync
* notification synchronization
* presence multi-tab consistency
* attachment lifecycle
* realtime ordering
* duplicate prevention

---

# Monorepo Structure

```txt
backend/
frontend/
scripts/
```

## Backend

```txt
backend/
  prisma/
  src/
    common/
    config/
    modules/
```

Main modules:

* auth
* users
* follows
* friends
* conversations
* messages
* realtime
* posts
* notifications
* reports
* safety
* media
* uploads
* stories

## Frontend

```txt
frontend/
  src/
    app/
    components/
    features/
    stores/
    lib/
```

---

# Runtime Stack

## Backend

* NestJS
* Prisma
* PostgreSQL
* Redis
* BullMQ
* Socket.IO

## Frontend

* React
* Zustand
* TailwindCSS
* Socket.IO Client

---

# Setup From Zero

## 1. Start PostgreSQL & Redis

```bash
docker compose up -d
```

---

## 2. Backend Setup

```bash
cd backend

cp .env.example .env

npm install

npm run prisma:generate

npm run prisma:migrate -- --name init

npm run start:dev
```

Backend:

```txt
http://localhost:3000
```

Global API prefix:

```txt
/api
```

---

## 3. Frontend Setup

```bash
cd frontend

cp .env.example .env

npm install

npm run dev
```

Frontend:

```txt
http://localhost:5173
```

---

# API Overview

## Health

* GET `/api/health`

---

## Auth

* POST `/api/auth/register`
* POST `/api/auth/login`
* POST `/api/auth/refresh`
* POST `/api/auth/logout`

---

## User

* GET `/api/me`
* PUT `/api/me/profile`
* GET `/api/users`
* GET `/api/users/search`
* GET `/api/users/:id/profile`

---

## Relationship

### Follow

* POST `/api/users/:id/follow`
* DELETE `/api/users/:id/follow`

### Friend

* POST `/api/friends/:id/request`
* GET `/api/friends`
* GET `/api/friend-requests`
* POST `/api/friend-requests/:id/accept`
* POST `/api/friend-requests/:id/reject`
* POST `/api/friend-requests/:id/cancel`

### Safety

* POST `/api/users/:id/block`
* DELETE `/api/users/:id/block`
* GET `/api/blocks`

---

# Chat API

## Conversation

* POST `/api/conversations/direct`
* POST `/api/conversations/group`
* GET `/api/conversations`

## Messages

* GET `/api/conversations/:conversationId/messages`
* POST `/api/conversations/:conversationId/messages`
* DELETE `/api/conversations/:conversationId/messages/:messageId`

## Group Management

* PATCH `/api/conversations/group/:id`
* POST `/api/conversations/group/:id/members`
* DELETE `/api/conversations/group/:id/members/:userId`
* POST `/api/conversations/group/:id/owner`
* POST `/api/conversations/group/:id/leave`

---

# Feed & Social API

## Feed

* GET `/api/feed`
* GET `/api/explore`

## Posts

* POST `/api/posts`
* POST `/api/posts/:id/react`
* DELETE `/api/posts/:id/react`

## Comments

* GET `/api/posts/:id/comments`
* POST `/api/posts/:id/comments`

---

# Media API

## Upload

* POST `/api/uploads/avatar`
* POST `/api/uploads/post-media`
* POST `/api/media/upload`

## Media Access

* GET `/api/media/:id`

---

# Notification API

* GET `/api/notifications`
* GET `/api/notifications/unread-count`
* POST `/api/notifications/:id/read`
* PATCH `/api/notifications/read-all`

---

# Report API

* POST `/api/reports`

---

# Socket.IO Events

Connection:

```js
auth: {
  token: accessToken
}
```

## Client Emit

```txt
conversation.join
```

Payload:

```json
{
  "conversationId": "..."
}
```

---

## Client Listen

```txt
message.sent
message.new
message.read
message.deleted

notification.new

presence.snapshot
user.online
user.offline

user.typing
user.stopTyping

post.created
post.reacted
comment.created
```

---

# API Response Format

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

# Database Notes

* UUID primary key
* snake_case database naming
* camelCase API response
* soft delete foundation
* direct conversation uniqueness protection
* Prisma as single ORM layer

---

# Manual Realtime Test

## Chat Realtime

1. Login 2 akun berbeda.
2. Buka `/chat` di 2 browser/tab.
3. Join conversation.
4. Kirim pesan.
5. Validasi:

   * realtime receive
   * no duplicate
   * read receipt sync
   * reconnect consistency

---

# Current Known Risks

## High Risk

* optimistic lifecycle
* reconnect synchronization
* notification ordering
* attachment reconciliation
* presence multi-tab consistency
* race condition prevention

## Infrastructure Risk

* local filesystem upload belum cocok untuk horizontal scaling
* Redis Pub/Sub multi-instance belum production tested
* BullMQ worker belum production-ready

---

# Security Rules

* Semua endpoint protected memakai JWT kecuali auth public dan health.
* Backend wajib validasi participant aktif sebelum access conversation.
* Frontend tidak boleh menjadi source-of-truth authorization.
* User block wajib membatasi interaction.
* Realtime room wajib divalidasi membership.

---

# Important Notes

Project ini dibangun bertahap.

Prioritas utama bukan banyak fitur,
tetapi:

* realtime correctness
* stabilization
* lifecycle consistency
* architecture safety

Karena dalam aplikasi realtime sosial media:
bug kecil pada lifecycle dapat merusak seluruh experience user.

```
```

# Support Development

Jika project ini membantu atau kamu ingin mendukung pengembangan Realtime Social Hub, kamu bisa traktir kopi di:

☕ https://trakteer.id/gazeX69

Dukungan membantu pengembangan:
- realtime infrastructure
- testing device
- deployment
- storage
- dan pengembangan fitur jangka panjang