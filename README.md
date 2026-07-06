# SyncTube 🎬

SyncTube is a premium, real-time YouTube Watch Party application built on a scalable MERN stack architecture. It enables multiple users to watch videos together, automatically synchronizing play, pause, seek, and video changes across all participants using persistent WebSockets.

The user interface implements the **"Synchronous Dark Media System"** design language, using a theatrical, glassmorphic aesthetic built with Tailwind CSS and Framer Motion.

---

## 🚀 Live Links & Demos

- **Frontend Deployment (Vercel)**: `https://synctube-watch.vercel.app` *(Placeholder)*
- **Backend Service (Render)**: `https://synctube-backend.onrender.com` *(Placeholder)*

---

## 🛠️ Tech Stack & Key Technologies

### Frontend
- **React 19 & Vite** — High-speed Hot Module Replacement (HMR) and concurrent UI rendering.
- **Tailwind CSS** — Styled using token-matched themes from the design specification.
- **Framer Motion** — Micro-animations for card transitions, modals, and list movements.
- **Socket.IO Client** — Manages persistent bi-directional connection with automated reconnection.
- **React Hook Form** — Validates login and room forms without unnecessary re-renders.

### Backend
- **Node.js & Express** — Lightweight and modular controller-service-routing architecture.
- **MongoDB & Mongoose** — Stores ephemeral rooms with automatic 24-hour expiration (TTL index).
- **Socket.IO** — Manages real-time room channels and events.
- **Custom DNS Resolution** — Configured to bypass local ISP resolver restrictions when connecting to MongoDB Atlas.

---

## 🔌 Quick Start & Setup

### 1. Clone & Install Dependencies

```bash
# Clone the repository
git clone <your-repo-link>
cd syncTube

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the `backend/` directory:
```env
PORT=5000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/synctube
CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

Create a `.env` file in the `frontend/` directory:
```env
VITE_API_URL=/api
VITE_SOCKET_URL=http://localhost:5000
```

### 3. Run Development Servers

Run the backend server (starts Express on port `5000` and attempts database connection asynchronously):
```bash
cd backend
npm run dev
```

Run the frontend server (runs Vite dev server on port `5173`):
```bash
cd ../frontend
npm run dev
```

Open **http://localhost:5173** to access the application.

---

## 🏗️ Architecture & Project Structure

```
syncTube/
├── frontend/                       # Client codebase
│   └── src/
│       ├── components/
│       │   ├── landing/            # HeroSection, FeaturesGrid
│       │   ├── layout/             # Navbar, Footer
│       │   ├── modals/             # CreateRoomModal, JoinRoomModal
│       │   ├── room/               # VideoPlayer, VideoControls, Chat, Sidebar
│       │   └── ui/                 # Avatar, Badge, Button (Design system elements)
│       ├── context/                # SocketContext, RoomContext
│       ├── hooks/                  # useYouTubePlayer, useSocket, useCopyToClipboard
│       ├── services/               # api.js (Axios), socketService.js (Emitters)
│       └── styles/                 # globals.css (Tailwind theme tokens & glass effects)
│
├── backend/                        # API & WebSocket codebase
│   ├── src/
│   │   ├── config/                 # db.js (Mongoose config + DNS overrides)
│   │   ├── controllers/            # roomController.js (REST handlers)
│   │   ├── middlewares/            # checkDbConnection.js, errorHandler.js
│   │   ├── models/                 # Room.js (embedded schemas)
│   │   ├── routes/                 # roomRoutes.js
│   │   ├── services/               # roomService.js (State database logic)
│   │   └── socket/                 # index.js (IO initialization), roomHandlers.js
│   └── server.js                   # Application entry point
```

---

## 📡 How Real-Time WebSockets Synchronization Works

SyncTube uses a bi-directional websocket pipeline to broadcast state changes instantly.

```
[Host / Mod Player]          [Socket.IO Server]         [Participant Player]
       │                              │                          │
       │─── 1. user action (play) ───►│                          │
       │    (emits "play")            │                          │
       │                              │─── 2. validate role ────►│ [Skip validation]
       │                              │    (broadcasts "play")   │
       │                              │                          │─── 3. sets player state
       │                              │                          │    (plays video)
```

### 1. Zero-Jitter / Anti-Feedback Loop Pattern
A common problem in socket-synced players is the **infinite feedback loop**:
`Host Play` ➔ `Emit Play Event` ➔ `Participant Receives Event` ➔ `Participant Player Plays` ➔ `Participant Player Emits Play Event` ➔ `Host Receives Event` (Repeat infinitely).

**Our Solution**:
We implement a thread-safe update flag `isSyncedUpdate` on the player reference:
- When a remote event is received via socket, we toggle `isSyncedUpdate.current = true` *before* modifying the iframe player state.
- In the player's native event listener (`onStateChange`), we check if `isSyncedUpdate.current` is `true`. If yes, we reset the flag to `false` and **suppress** emitting another socket event.
- If the event was triggered by a human click, the flag is `false`, and the sync event is emitted to the server.

### 2. Late-Joiner Catch Up
When a new user joins a room:
1. They emit the `join_room` event with their temporary credentials.
2. The server appends them to the room document in MongoDB and assigns their role.
3. The server immediately returns a `sync_state` payload directly to the new socket containing:
   - The active `videoId`
   - The current host's elapsed playback time (corrected for database query latency)
   - The current playback status (`playing` or `paused`)
   - The full list of active room participants and their respective roles

---

## 👥 Role-Based Permission System

SyncTube uses a server-authoritative permission validation model. The client UI hides control buttons for view-only users, but **every incoming socket event is re-validated against the database** to prevent forged packets.

### Permission Matrix

| Feature | Host | Moderator | Participant |
| :--- | :---: | :---: | :---: |
| Play / Pause Video | ✅ | ✅ | ❌ |
| Seek Playback Time | ✅ | ✅ | ❌ |
| Change Video URL | ✅ | ❌ | ❌ |
| Kick User | ✅ | ❌ | ❌ |
| Promote to Moderator | ✅ | ❌ | ❌ |
| Transfer Host Status | ✅ | ❌ | ❌ |
| Send Chat Messages | ✅ | ✅ | ✅ |

### Server-Side Enforcement Example

Whenever a controller event is received, the server checks the database state:
```javascript
socket.on(EVENTS.PLAY, async ({ roomId, currentTime }) => {
  const room = await roomService.updateVideoState(roomId, { isPlaying: true, currentTime })
  
  // Re-verify emitter role directly in the active DB document
  if (!room.hasRole(socket.id, ['host', 'moderator'])) {
    socket.emit(EVENTS.ERROR, { message: 'Only the host or moderator can control playback.' })
    return
  }
  
  io.to(roomId).emit(EVENTS.PLAY, { currentTime })
})
```

---

## ⚙️ Production Deployment Checklist

### Backend (Render / Heroku)
1. Add the environment variables: `MONGODB_URI`, `CLIENT_URL`, `NODE_ENV=production`, and `PORT`.
2. Define the **Root Directory** as `backend`.
3. Set the **Build Command** to `npm install` and **Start Command** to `npm start`.

### Frontend (Vercel)
1. Import the project and set the **Root Directory** to `frontend`.
2. Add the environment variables:
   - `VITE_API_URL` ➔ `https://your-backend.onrender.com/api`
   - `VITE_SOCKET_URL` ➔ `https://your-backend.onrender.com`
3. Click **Deploy**. Vercel will automatically trigger the Vite build and expose the static files on edge nodes.
