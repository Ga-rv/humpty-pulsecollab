# PulseCollab ⚡

> **Mission-Control Chat & AI Sprint Intelligence Platform**  
> Real-time team collaboration with WebSocket-driven live chat and instant conversation synthesis into actionable sprint deliverables powered by **Google Gemini 3.5 Flash**.

---

## 🌟 Overview

Modern sprint teams lose hours combing through unstructured chat threads to figure out what was promised, who is building what, and when deliverables are due. 

**PulseCollab** solves this by combining:
1. **Real-Time Team Communication**: Multi-channel discussions (`#general`, `#backend`, `#frontend`, `#design`, `#ops`) and private 1-to-1 Direct Messages.
2. **Pusher Real-Time WebSockets Engine**: Sub-50ms bidirectional message distribution over native WebSockets (`wss://`), built natively for serverless environments (e.g., Vercel) with transparent background polling fallback.
3. **AI Pulse Synthesis Engine (Gemini 3.5 Flash)**: An intelligent extraction system that analyzes conversation history to extract structured deadlines, prioritized deliverables, and deduplicated action items assigned to real team members.
4. **Interactive Sprint Intelligence Drawer**: Live timeline view with one-click Google Calendar integration, task tracking, and executive sprint summaries.
5. **Secure Authentication & Guest Lockout Gate**: JWT-based authentication with bcrypt password hashing and a lockout gate protecting confidential sprint channels and private DMs from unauthenticated users.

---

## 🏗️ Architecture & Technology Stack

PulseCollab is designed for a **stateless, serverless architecture** capable of running on Vercel while delivering real-time WebSockets and AI synthesis.

```
                           ┌────────────────────────────────────────┐
                           │          Browser Client UI             │
                           │     (Next.js 16 / React 19 / TS)       │
                           └───────┬────────────────────────┬───────┘
                                   │                        │
         Native WebSockets (wss://)│                        │ HTTPS REST
         Sub-50ms Real-Time Push   │                        │ API Routes
                                   ▼                        ▼
                      ┌──────────────────────┐   ┌─────────────────────────────┐
                      │   Pusher Channels    │   │      Next.js App Router     │
                      │   WebSocket Cluster  │   │     (Serverless Functions)  │
                      └──────────▲───────────┘   └──────────────┬──────────────┘
                                 │                              │
                                 │ REST Trigger                 ├──────────────────────────┐
                                 │ (pusher server SDK)          │                          │
                                 │                              ▼                          ▼
                                 │                   ┌────────────────────┐     ┌──────────────────────┐
                                 └───────────────────┤   MongoDB Atlas    │     │   Google Gemini      │
                                                     │ (Mongoose Schemas) │     │     3.5 Flash        │
                                                     └────────────────────┘     └──────────────────────┘
```

### Technology Breakdown

| Layer | Technologies Used | Description |
|---|---|---|
| **Frontend** | Next.js 16 (Turbopack), React 19, TypeScript, Tailwind CSS, Lucide Icons | Responsive mission-control UI with dark theme, dynamic drawer, and optimistic updates. |
| **Real-Time Transport** | **Pusher Channels** (`pusher-js` & `pusher`) | Serverless WebSocket layer bypassing long-lived server limits on Vercel. |
| **Resilient Fallback** | Automated background HTTP polling sync | Transparently activates (2s DMs, 3s channels) if WebSockets disconnect or keys are absent. |
| **AI Intelligence** | Google Gen AI SDK (`@google/genai`) | Powered by **Gemini 3.5 Flash** with multi-turn context stitching and two-pass entity extraction. |
| **Database** | MongoDB Atlas via Mongoose | Indexed schemas for `User`, `Message`, `DirectMessage`, and `Task`. |
| **Authentication** | Stateless JWT (`jsonwebtoken`), `bcryptjs` | Bearer token authorization with guest lockout protection. |

---

## 🚀 Real-Time Communication Design

Hackathons and cloud deployments often mandate **WebSocket technology**, but modern hosting platforms like **Vercel** run on ephemeral serverless functions that cannot host persistent TCP servers (like standalone `ws` or `Socket.IO`).

### How PulseCollab Solves This:
1. **Client Connection**: Browsers connect directly to Pusher’s global edge network via native WebSockets (`wss://ws-{cluster}.pusher.com`) using `pusher-js`.
2. **Serverless Message Ingestion**: When a user sends a message, it is posted to the Next.js API route (`/api/messages` or `/api/messages/direct`).
3. **Database Write & Instant Broadcast**:
   - The message is persisted in MongoDB.
   - The route calls `triggerPusherEvent` (`pusher` SDK) over HTTPS in `< 10ms`.
   - Pusher immediately broadcasts the event over active WebSocket connections to all room subscribers.
4. **Transparent Degradation**: If Pusher credentials are missing or the connection drops, the app automatically relies on deduplicated background polling with zero UI flicker or errors.

---

## ✨ Major Features

### 1. Multi-Channel & Direct Messaging
- **Channels**: Dedicated channels for cross-functional sprint discussions.
- **Direct Messages**: Private 1-to-1 messaging with live unread count indicators and real-time delivery to both participants.
- **Optimistic UI**: Messages render immediately upon sending, then reconcile smoothly with MongoDB IDs.

### 2. AI Pulse Synthesis (Gemini 3.5 Flash)
- **One-Click Scan**: Scans either the last 50 messages or today's conversations in the active room.
- **Two-Pass Isolated Entity Extraction**: Strict entity isolation rules ensure dates and event names derive strictly from their respective sentences, completely eliminating title-bleeding bugs (e.g. "Hackathon Presentation" vs "STAC Event").
- **Date & Day Normalization**: Regex-driven sanitization guarantees months ("October") or days ("Sunday") never become event titles.
- **Action Item Resolution**: Conversational fragments (e.g., *"so im doing front end and you are doing backend"*) are synthesized into professional tasks (*"Develop frontend components"* assigned to User A, *"Build backend API services"* assigned to User B).

### 3. Sprint Tracker & Calendar Integration
- **Action Tracker**: Mark tasks complete or pending directly from the side drawer.
- **Google Calendar Links**: Pre-formatted Google Calendar links generated on the fly for every deadline.

### 4. Authentication & Security
- **Guest Lockout Gate**: Unauthenticated users or guests see a security shield preventing unauthorized access to sprint channels and private direct messages.
- **Stateless Tokens**: Secure JSON Web Tokens stored with bearer headers.

---

## 🔑 Environment Variables & External Services

Create a `.env.local` file in the root directory. You can copy the template from `.env.example`:

```bash
cp .env.example .env.local
```

### Required Configuration

| Variable | Required | Description | Example / Source |
|---|---|---|---|
| `MONGODB_URI` | **Yes** | MongoDB connection string (Atlas or Local) | `mongodb+srv://<user>:<password>@cluster.mongodb.net/pulsecollab` |
| `GEMINI_API_KEY` | **Yes** | Google Gemini API key for AI synthesis | Get from [Google AI Studio](https://aistudio.google.com/) |
| `JWT_SECRET` | **Yes** | Secret string used to sign JWT auth tokens | Any secure string (e.g. `sprint_secret_key_12345`) |
| `PUSHER_APP_ID` | **Yes** | Pusher App ID (Backend serverless trigger) | From [Pusher Dashboard](https://dashboard.pusher.com/) |
| `PUSHER_KEY` | **Yes** | Pusher Key (Backend trigger) | From Pusher Dashboard |
| `PUSHER_SECRET` | **Yes** | Pusher Secret (Backend trigger) | From Pusher Dashboard |
| `PUSHER_CLUSTER` | **Yes** | Pusher Cluster location | e.g. `mt1`, `ap2`, `eu` |
| `NEXT_PUBLIC_PUSHER_KEY` | **Yes** | Pusher Key accessible to browser WebSockets | Same as `PUSHER_KEY` |
| `NEXT_PUBLIC_PUSHER_CLUSTER` | **Yes** | Pusher Cluster accessible to browser | Same as `PUSHER_CLUSTER` |
| `PORT` | Optional | Local port (defaults to 3000) | `3000` |

---

## 💻 Installation & Local Setup

### Prerequisites
- **Node.js**: v18.18.0 or higher (v20+ recommended)
- **Package Manager**: `npm` (or `pnpm`)
- **MongoDB**: MongoDB Atlas URI or local MongoDB instance

### Step-by-Step Setup

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/Ga-rv/humpty-pulsecollab.git
   cd humpty-pulsecollab
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   ```bash
   cp .env.example .env.local
   ```
   Open `.env.local` and add your `MONGODB_URI`, `GEMINI_API_KEY`, `JWT_SECRET`, and Pusher keys.

4. **Run the Development Server**:
   ```bash
   npm run dev
   ```
   The application will be live at: **[http://localhost:3000](http://localhost:3000)**.

5. **Production Build & Verification**:
   ```bash
   npm run build
   npm start
   ```

---

## 🧪 Clean Environment Reproduction & Verification Guide

Follow these steps to test and verify all functionality in a clean environment:

### Step 1: User Registration & Authentication Gate
1. Open [http://localhost:3000](http://localhost:3000) in an Incognito / private browser window.
2. Note that Guest sessions are gated by the **Authentication Required** lockout screen.
3. Click **"Sign In"** or the avatar icon in the bottom left.
4. Select the **Register** tab and create **User 1**:
   - Username: `Garv`
   - Email: `garv@test.com`
   - Password: `password123`
5. Click **Create Account**. You are now logged in and have full access to channels and sprint tools.

### Step 2: Test Real-Time WebSocket Messaging
1. Open a **second** browser window (different browser or separate profile).
2. Register **User 2**:
   - Username: `Ishaan`
   - Email: `ishaan@test.com`
   - Password: `password123`
3. In User 1's window, navigate to `#general` and send:
   > *"Hello team, welcome to the sprint!"*
4. **Verification**: In User 2's window, the message appears **instantly via Pusher WebSockets** without needing a page refresh.
5. In User 2's sidebar, click on `Garv` under **Direct Messages** and send:
   > *"Hey Garv, ready for the sprint planning."*
6. **Verification**: User 1 receives the DM immediately, and the unread notification badge increments.

### Step 3: Test AI Pulse Synthesis (Gemini 3.5 Flash)
1. In the direct message thread or `#general`, send messages detailing upcoming dates and team tasks:
   > **Garv**: *"Hey, we have the Hackathon presentation on Sunday, 12th october at 5:00 PM. Don't forget the STAC event on 11th october 10 am either."*  
   > **Ishaan**: *"Got it! So im doing frontend and you are doing backend right?"*  
   > **Garv**: *"Yes, I will build the backend APIs and you develop frontend components. Also submit the Devpost project by 11:30 PM tonight."*
2. In the top right header, click **"Run Pulse"** (or open the Pulse drawer and click **"Rescan Messages"**).
3. **Verification**:
   - **Deadlines Extracted**:
     - *Hackathon Presentation* — Oct 12, 5:00 PM (Priority: High)
     - *STAC Event* — Oct 11, 10:00 AM (Priority: High)
     - *Devpost Submission* — Tonight, 11:30 PM (Priority: High)
     *(Notice: Month/day names like "Sunday" or "October" are never mistakenly used as titles).*
   - **Action Items Extracted**:
     - *"Develop frontend components"* — Assigned to `Ishaan`
     - *"Build backend APIs"* — Assigned to `Garv`
   - **Executive Summary**: A concise sprint summary of all commitments.

### Step 4: Test Resilient Fallback Mechanism
1. In `.env.local`, temporarily comment out `PUSHER_KEY` or provide an invalid key.
2. Restart the app (`npm run dev`) or test sending messages between two windows.
3. **Verification**:
   - The application does **not throw 500 errors or crash**.
   - Messages are saved to MongoDB and synced across both browsers via the automatic background polling fallback.
   - Restoring the Pusher keys immediately upgrades connections back to real-time WebSockets.

---

## 📁 Repository Structure

```
├── app/
│   ├── api/
│   │   ├── auth/          # Login & registration endpoints (JWT, bcrypt)
│   │   ├── messages/      # Channel message fetch & WebSocket trigger
│   │   │   └── direct/    # 1-to-1 DM fetch & multi-channel WebSocket trigger
│   │   ├── pulse/         # Pulse synthesis routes
│   │   ├── synthesize/    # Main AI synthesis endpoint (Gemini 3.5 Flash)
│   │   ├── tasks/         # Sprint task tracking CRUD
│   │   └── users/         # Team member directory
│   ├── layout.tsx         # Root layout with providers & fonts
│   └── page.tsx           # Main application entry point
├── components/
│   ├── pulse/
│   │   ├── workspace.tsx  # Core workspace orchestrator & WebSocket subscriber
│   │   ├── chat-stream.tsx# Message stream renderer & optimistic UI
│   │   ├── pulse-drawer.tsx# Gemini synthesis panel (Deadlines, Tasks, Summary)
│   │   ├── sidebar.tsx    # Channels, DMs, user presence, and auth status
│   │   └── ...            # Modals (auth, add context, new chat)
│   └── ui/                # Base UI component library
├── lib/
│   ├── auth.ts            # JWT verification & token decoding
│   ├── mongodb.ts         # Cached Mongoose connection helper
│   ├── pusher-server.ts   # Resilient backend Pusher WebSocket trigger
│   ├── pusher-client.ts   # Lazy browser Pusher WebSocket subscriber
│   └── synthesis.ts       # Gemini 3.5 Flash prompt engine & two-pass extractor
├── models/
│   ├── User.ts            # User credentials & roles
│   ├── Message.ts         # Channel messages
│   ├── DirectMessage.ts   # 1-to-1 direct messages
│   └── Task.ts            # Sprint tasks & tracking state
├── .env.example           # Environment variable template
├── package.json           # Scripts and dependencies
└── README.md              # Project documentation
```

---

## 👥 Authors & Credits

Built with ❤️ by **Garv Dharmapuri** & **Ishaan Pande** (Team humpty) for **FIRST//COMMIT**.
