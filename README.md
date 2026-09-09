# SyncTube 🎬 — Real-Time Synchronous Watch Party Platform

SyncTube is a production-hardened, real-time collaborative YouTube watch party platform built on a modern MERN stack architecture with WebSockets, Clerk Google OAuth authentication, Nodemailer SMTP invitations, and Cloudinary voice messaging.

Participants can watch synchronized video streams with zero jitter, manage collaborative playback queues, exchange instant text messages, record and listen to voice notes, and invite friends via server-authorized email links.

---

## 🏛️ System Architecture

```mermaid
flowchart TD
    subgraph Clients["Clients (Browsers)"]
        HostTab1["Host Browser (Tab 1)"]
        HostTab2["Host Browser (Tab 2)"]
        GuestTab["Guest Browser"]
    end

    subgraph Auth["Identity & Auth Tier"]
        Clerk["Clerk Auth (Google OAuth)"]
    end

    subgraph Backend["SyncTube Node.js Server"]
        Express["Express 5 REST API"]
        SocketIO["Socket.IO Server"]
        AuthMiddleware["Clerk Bearer Auth Middleware"]
        SecurityHeaders["Security Headers (nosniff, SAMEORIGIN)"]
        
        subgraph Services["Server Core Services"]
            RoomService["Room Service (MongoDB)"]
            ChatLimiter["Chat Rate Limiter (20/10s)"]
            VideoLimiter["Video Control Throttler (15/3s)"]
            VoiceLimiter["Voice Rate Limiter (10/5min)"]
            InviteLimiter["Invite Rate Limiter (5/10min)"]
            GraceManager["Disconnect Grace Manager (7s)"]
            CleanupService["Voice Cleanup Service (24h TTL)"]
        end
    end

    subgraph External["External Cloud Services"]
        MongoAtlas[("MongoDB Atlas (TTL Index)")]
        Cloudinary[("Cloudinary Audio Storage")]
        SMTP[("SMTP Server (Nodemailer)")]
    end

    Clients -->|OAuth Session Tokens| Clerk
    HostTab1 -->|REST: Create/Delete Room| Express
    Clients -->|WebSockets (Bi-directional)| SocketIO

    Express --> AuthMiddleware --> SecurityHeaders --> RoomService
    SocketIO --> Services
    Services --> RoomService

    RoomService --> MongoAtlas
    Services -->|Binary Streams & Deletions| Cloudinary
    Services -->|Transactional Invites| SMTP
```

---

## 🔐 Core Security & Hardening Architecture

### 1. Dual-Tier Authentication & Room Ownership
* **Room Creation**: Restricted strictly to authenticated Clerk users (`POST /api/rooms/create`). The frontend attaches a Clerk session JWT in `Authorization: Bearer <token>`. The backend verifies the token with `CLERK_SECRET_KEY`, extracts the verified Clerk `userId`, and assigns `createdByClerkUserId`. Unauthenticated attempts are rejected with `HTTP 401`.
* **Room Deletion**: Protected by `requireAuthenticatedUser` on `DELETE /api/rooms/:id`. The controller verifies that `req.auth.userId === room.createdByClerkUserId`. Unauthenticated requests yield `HTTP 401`, non-owner attempts yield `HTTP 403 Forbidden`. Before deletion, all connected room sockets are notified and evicted.
* **Internal Data Leak Prevention**:
  * `hostSocketId` is stripped from public REST endpoints (`GET /api/rooms`, `GET /api/rooms/:id`).
  * Cloudinary storage internal identifiers (`publicId`) are omitted from client payloads in `toSafeChatMessages()`.
* **Guest Access**: Frictionless join flow without forced registration. Guests supply a nickname and an opaque `localStorage` device UUID; the server generates deterministic identity hashes.

### 2. Real-Time Socket Trust Boundaries
* **Room Membership Validation (`isSocketInRoom`)**: Every incoming room socket event (`PLAY`, `PAUSE`, `SEEK`, `CHANGE_VIDEO`, `ASSIGN_ROLE`, `TRANSFER_HOST`, `REMOVE_PARTICIPANT`, `SEND_CHAT`, `SEND_VOICE_MESSAGE`, `SEND_EMAIL_INVITE`, `QUEUE_*`, `SYNC_REQUEST`) validates that the emitting socket is currently joined to the specified `roomId`, preventing cross-room packet spoofing.
* **Role Verification Before State Mutation**: Playback control events (`PLAY`, `PAUSE`, `SEEK`, `CHANGE_VIDEO`) check `room.hasRoleForSocket(socket.id, ['host', 'moderator'])` *before* modifying MongoDB state, preventing unauthorized viewers from executing unauthorized seeks or pauses.
* **Orphan Audio Rollback**: In `send_voice_message`, if Cloudinary upload succeeds but the subsequent MongoDB chat write or voice asset record fails, the remote audio file is immediately deleted via `deleteAudio(uploadedPublicId)` to prevent storage leaks.

### 3. Multi-Layer Rate Limiting & Flood Protection
* **Text Chat**: Sliding-window rate limiter enforcing a maximum of **20 messages per 10 seconds** per participant identity (`chatRateLimiter.js`).
* **Playback Controls**: Flood protection enforcing a maximum of **15 playback events per 3 seconds** per socket (`videoRateLimiter.js`), automatically cleared on disconnect.
* **Voice Messaging**: Sliding-window rate limiter enforcing **10 voice notes per 5 minutes** per participant (`voiceRateLimiter.js`). Maximum audio buffer size capped at **1.5 MB** and maximum recording duration capped at **60 seconds**.
* **Email Invitations**: Socket-level quota enforcing **5 invites per 10 minutes** with a **60-second cooldown** per recipient in the same room (`inviteRateLimiter.js`).

### 4. HTTP Headers & Startup Diagnostics
* Express disabled `X-Powered-By`.
* Security headers configured: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`.
* Startup environment validator (`backend/src/config/envValidator.js`) performs diagnostics and safely masks secrets in logs (`sk_test_...abcd`).
* Health monitoring endpoint `/health` reports database connectivity (`connected` | `disconnected`), server uptime (seconds), and returns `HTTP 503` if the database is disconnected.

---

## 🆔 Stable Identity & Multi-Tab Synchronization

SyncTube decouples the **Socket Connection (`socket.id`)** from **Participant Identity (`participantId`)**:

1. **Multi-Tab Presence**: Opening multiple tabs in the same room associates all socket IDs to a single `Participant` document (`participant.socketIds`).
2. **Primary Connection Election**: The server designates one active socket as `primarySocketId`. Only the host's primary socket emits the periodic 5-second playback sync heartbeat, preventing sync thrashing.
3. **Disconnect Grace Period**: Unexpected socket disconnects trigger a 7-second grace timer managed by `disconnectGraceManager`. If any socket belonging to that participant reconnects within 7 seconds, the timer cancels and presence is preserved without emitting `USER_LEFT`.
4. **Reliable Kick & Ban Enforcement**:
   - When a host kicks a participant, all sockets associated with that participant are evicted with a `kicked` event.
   - The participant's SHA-256 `identityHash` is permanently added to `room.blockedParticipants`.
   - Rejoining attempts trigger `BANNED_FROM_ROOM`.

---

## 📋 Environment Variables Matrix

### Backend (`backend/.env`)

| Variable | Required | Default / Example | Purpose |
| :--- | :---: | :--- | :--- |
| `PORT` | Optional | `5000` | Port for Express & Socket.IO server |
| `NODE_ENV` | Optional | `development` | Environment mode (`development`, `production`, `test`) |
| `MONGODB_URI` | **Required** | `mongodb+srv://...` | MongoDB Atlas or local connection string |
| `CLIENT_URL` | **Required** | `http://localhost:5173` | Allowed frontend origin for CORS and invite URLs |
| `CLERK_PUBLISHABLE_KEY` | **Required** | `pk_test_...` | Clerk frontend publishable key |
| `CLERK_SECRET_KEY` | **Required** | `sk_test_...` | Clerk backend secret key for JWT verification |
| `SMTP_HOST` | Optional | `smtp.example.com` | SMTP server host for email invitations |
| `SMTP_PORT` | Optional | `587` | SMTP server port (`465` for SSL, `587` for TLS) |
| `SMTP_SECURE` | Optional | `false` | `true` for port 465, `false` for port 587 |
| `SMTP_USER` | Optional | `user@example.com` | SMTP authentication username |
| `SMTP_PASS` | Optional | `app-password` | SMTP authentication password |
| `EMAIL_FROM` | Optional | `noreply@synctube.app`| Outgoing email sender address |
| `EMAIL_FROM_NAME` | Optional | `SyncTube` | Display name on invitation emails |
| `CLOUDINARY_CLOUD_NAME` | Optional | `your_cloud_name` | Cloudinary account cloud name for audio storage |
| `CLOUDINARY_API_KEY` | Optional | `123456789012345` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Optional | `secret_abc123` | Cloudinary API secret |

### 📧 Email Invitations (Nodemailer + SMTP ONLY)

SyncTube uses **Nodemailer + SMTP ONLY** for email invitations. No third-party email SDKs or HTTP providers (e.g. Brevo, Resend, SendGrid) are used.

#### Required Backend Variables:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_16_character_app_password
EMAIL_FROM=your_email@gmail.com
EMAIL_FROM_NAME=SyncTube
```

#### Gmail SMTP Setup:
1. In your Google Account, enable **2-Step Verification** (Security -> 2-Step Verification).
2. Go to **Security -> App Passwords** (or search "App Passwords").
3. Create a new App Password named `SyncTube`.
4. Copy the generated 16-character password into `backend/.env` as `SMTP_PASS=...`.
5. For port 587, set `SMTP_PORT=587` and `SMTP_SECURE=false` (STARTTLS).
   For port 465, set `SMTP_PORT=465` and `SMTP_SECURE=true` (Implicit TLS).

#### Diagnostic Verification:
Test your SMTP credentials and delivery with the built-in diagnostic tool:
```bash
# Verify connection & credentials only:
npm run test:smtp

# Send a real test invitation to an inbox:
npm run test:smtp -- your_test_email@example.com
```

#### ⚠️ Cloud Hosting Egress Warning:
* Certain cloud hosting platforms (specifically **Render's Free Tier**) block all outbound TCP traffic on SMTP ports 25, 465, and 587 by firewall.
* Nodemailer SMTP requires network access to the SMTP server. For production deployment on Render, an upgraded instance tier (e.g. Starter) or an infrastructure provider that permits outbound SMTP egress is required.

---

### Frontend (`frontend/.env`)

| Variable | Required | Default / Example | Purpose |
| :--- | :---: | :--- | :--- |
| `VITE_API_URL` | Optional | `/api` | REST API base path (proxied in dev) |
| `VITE_SOCKET_URL` | **Required** | `http://localhost:5000` | Backend WebSocket server URL |
| `VITE_CLERK_PUBLISHABLE_KEY` | **Required** | `pk_test_...` | Clerk publishable key for `<ClerkProvider>` |

---

## 🛠️ Local Development & Quick Start

### 1. Prerequisites
- **Node.js**: v20.x LTS or higher
- **npm**: v10.x or higher
- **MongoDB**: Local instance or MongoDB Atlas cluster

### 2. Setup & Installation

```bash
# Clone the repository
git clone https://github.com/your-username/syncTube.git
cd syncTube

# Setup Backend
cd backend
npm install
cp .env.example .env
# Fill in your MONGODB_URI and CLERK keys in backend/.env

# Setup Frontend
cd ../frontend
npm install
cp .env.example .env
# Fill in VITE_CLERK_PUBLISHABLE_KEY in frontend/.env
```

### 3. Run Locally

In separate terminal windows:

```bash
# Start backend (port 5000)
cd backend
npm run dev

# Start frontend (port 5173)
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Testing & Quality Assurance

SyncTube includes an end-to-end automated test runner covering all security, rate limiting, and core architectural features across Phase 2 through Phase 5.

### Run Backend Regression Suite

```bash
cd backend
npm test
```

**Test Coverage Highlights**:
- **Phase 2 (`phase2_email.test.js`)**: Email format validation, HTML escaping for XSS prevention, socket invite rate limiter & cooldown, SMTP configuration detection.
- **Phase 3 (`phase3_identity.test.js`)**: Deterministic guest & Clerk identity derivation, disconnect grace manager timer cancellation, multi-tab socket detachment, identity hash blocking.
- **Phase 4 (`phase4_voice.test.js`)**: Voice rate limiting (10/5min), audio duration formatting, safe chat serialization (omitting `publicId`), `VoiceAsset` model schema validation.
- **Phase 5 (`phase5_hardening.test.js`)**: `DELETE /api/rooms/:id` Clerk authentication and owner matching, `getRoom` internal socket redaction, text chat limiter (20/10s), video control throttler (15/3s), role-before-mutation verification, environment validator secrets masking.

### Run Frontend Lint & Build Check

```bash
cd frontend
npm run lint    # Oxlint with 0 errors and 0 warnings
npm run build   # Production Vite bundle build
```

---

## 🚀 Continuous Integration (GitHub Actions)

SyncTube features automated continuous integration via `.github/workflows/ci.yml`.

Every push and pull request to `main` executes:
1. **Backend Tests Job**: Runs on `ubuntu-latest` with Node 20 LTS, running `npm ci` and `npm test` without requiring production credentials.
2. **Frontend Build Job**: Runs `npm ci`, checks code quality with `npm run lint`, and verifies build integrity with `npm run build`.

---

## 🌐 Production Deployment Guide

### Option A: Render (Backend) + Vercel (Frontend)

#### Backend on Render:
1. Create a new **Web Service** pointing to the repository.
2. Set **Root Directory** to `backend`.
3. Set **Runtime** to `Node`.
4. Set **Build Command** to `npm ci`.
5. Set **Start Command** to `node server.js`.
6. Add environment variables: `MONGODB_URI`, `CLIENT_URL` (your Vercel URL), `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NODE_ENV=production`.
7. (Optional) Add `SMTP_*` and `CLOUDINARY_*` credentials.

#### Frontend on Vercel:
1. Import repository and set **Root Directory** to `frontend`.
2. Framework Preset: **Vite**.
3. Add environment variables:
   - `VITE_SOCKET_URL` = `https://your-render-service.onrender.com`
   - `VITE_API_URL` = `https://your-render-service.onrender.com/api`
   - `VITE_CLERK_PUBLISHABLE_KEY` = your Clerk publishable key
4. Deploy.

---

## ⚠️ Known Architecture Assumptions & Limitations

### 1. Single-Backend Instance Assumption
All rate limiters (`chatRateLimiter.js`, `videoRateLimiter.js`, `voiceRateLimiter.js`, `inviteRateLimiter.js`), the disconnect grace manager (`disconnectGraceManager.js`), and active Socket.IO rooms are maintained in Node.js process memory.

* **Current Design**: Tailored for single-instance or vertical-scaling production servers.
* **Horizontal Scaling Path**: To scale horizontally across multiple stateless nodes behind a load balancer:
  - Configure `@socket.io/redis-adapter` for inter-node socket broadcasting.
  - Back the sliding-window rate limiters and disconnect grace periods with a managed Redis cluster (e.g. Upstash or AWS ElastiCache).

### 2. Guest Identity & Ban Limitations
* Guest participant identity relies on a browser-persisted `localStorage` UUID.
* If an anonymous guest clears site data or opens a fresh Incognito profile, a new UUID will be generated.
* Authenticated Clerk users are banned using `SHA-256("clerk:" + clerkUserId)`, which cannot be bypassed by clearing cookies or switching devices.

---

## 📄 License
This project is licensed under the ISC License.
