# Rampage Films - Streaming Platform

## Overview
Rampage Films is a premium streaming platform offering rare and hard-to-find movies, including cult classics, indie gems, and forgotten films. It provides trailers and full movie streaming with a sophisticated black and gold design, limited advertisements, and an app-like experience as a Progressive Web App (PWA). The platform aims to deliver a high-quality viewing experience for unique cinematic content and includes a monetization system that allows for platform tips, filmmaker revenue sharing, and brand sponsorships, all while remaining free for viewers.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The platform features a "New York" style with a black and gold aesthetic, Inter and Playfair Display fonts, responsive layouts, and a hero carousel. It is designed as a Progressive Web App (PWA) for an installable, app-like experience with offline support. Smart TV support includes TV-optimized CSS and D-pad spatial navigation.

### Technical Implementations
- **Frontend:** Built with React 18+ (TypeScript, Vite, Wouter for routing, TanStack Query). Utilizes Shadcn/ui, Radix UI, Tailwind CSS, and CVA for UI components.
- **Backend:** Developed with Express.js (TypeScript) providing a RESTful API for authentication, movie management, and integrations.
- **Data Layer:** Drizzle ORM manages interactions with a PostgreSQL database, following a repository pattern.
- **Authentication & Profiles:** Replit Auth handles user authentication. The platform supports Netflix-style multi-user profiles (up to 5) with a "Who's watching?" selector and a Kids Profile mode. Admin authentication uses `ADMIN_SECRET`.
- **Self-Hosted Video Storage:** Videos are primarily stored in Cloudflare R2 for zero egress fees, served via 24-hour signed URLs. Replit Object Storage serves as a legacy fallback.
- **Video Download & Processing:** A robust system integrates `yt-dlp` and `aria2c` for efficient video downloading from various sources (Ok.ru, Dailymotion, VK, TokyVideo, Archive.org, Rumble), featuring 3-5x faster speeds via parallel connections, a resume capability, and intelligent retry logic. YouTube downloads require cookie-based authentication. **Checkpoint System:** When R2 is configured, checkpoints are saved after download and processing phases to enable resume after workflow restarts. Uploads restart from scratch if interrupted (resumable uploads planned for future).
- **Metadata:** TMDB integration auto-fills movie details, and OpenAI GPT-4o-mini extracts metadata from video URLs.
- **AI Dubbing Multi-Speaker Support:** The dubbing feature supports four speaker modes: Single (one voice for all dialogue), Alternating (automatically switches between male/female voices), Multi (up to 6 configurable speakers with name and gender), and Smart (AI-powered pitch-based gender detection that automatically assigns male/female voices to each segment based on the original speaker). Speaker configuration is passed to the TTS script via JSON file. Smart mode uses `server/tts/smart_diarize.py` for pitch analysis (male: 85-180Hz, female: 165-255Hz) with confidence scoring.
- **AI Dubbing Transcription (100% FREE):** Uses local faster-whisper (free, word-level timestamps) instead of OpenAI Whisper API. Falls back to Google Speech Recognition if faster-whisper fails. Provides word-level timestamps for Netflix-quality lip-sync. Implementation: `server/tts/whisper_transcribe.py`.
- **AI Dubbing Translation:** DeepL integration for higher accuracy translations with automatic fallback to OpenAI GPT-4o-mini. Set DEEPL_API_KEY environment variable to enable DeepL.
- **AI Dubbing Audio Mixing (Netflix Quality):** Professional audio mixing with EBU R128 loudness normalization (-16 LUFS target), adaptive reverb matching, dynamic range compression, de-essing, and clarity enhancement. Uses `server/tts/professional_mixer.py` for high-quality output.
- **AI Dubbing Time Stretching:** High-quality time stretching using pyrubberband to fit dubbed speech into original timing gaps without pitch distortion. Falls back to FFmpeg atempo filter when dependencies are unavailable. Uses `server/tts/time_stretcher.py` and `server/tts/segment_assembler.py`.
- **AI Dubbing Emotion Detection:** Audio-based emotion detection analyzes pitch, energy, and tempo to infer emotional characteristics (happy, sad, angry, fearful, calm, etc.) and adjusts TTS prosody (rate, pitch) accordingly. Falls back to keyword-based emotion detection when librosa is unavailable. Uses `server/tts/emotion_detector.py`.
- **AI Dubbing Voice Consistency:** Intelligent voice selection ensures character consistency throughout a movie - the same speaker always gets the same voice. Supports 16 languages with male/female voice pairs. Uses `server/tts/voice_selector.py`.
- **AI Dubbing TTS Fallback:** Edge TTS is the primary engine (300+ neural voices). If Edge TTS is unreachable (network issues), automatically falls back to Google TTS (gTTS) which has fewer voices but is reliable. After 3 consecutive Edge TTS failures, gTTS is used directly to avoid delays.
- **AI Dubbed Audio Streaming:** Proxy endpoint `/api/stream-audio/:trackId` bypasses CORS issues with direct R2 URLs, enabling reliable audio download and playback.
- **Advanced Features:** Includes "Continue Watching," "Watchlist," "Trending" section, curated collections, user reviews and ratings, and enhanced video player controls (skip intro/credits, subtitles, dual-audio).
- **Job Queue System:** A PostgreSQL-based job queue handles background processes (e.g., video downloads) with lifecycle tracking, progress updates, and retry logic. A background worker processes jobs concurrently.
- **Monetization:** Supports platform tips, a 70/30 filmmaker revenue share model (for user-uploaded content), and brand sponsorships (hero banners, pre-roll cards, collection sponsors, footer banners). Stripe integration is planned for filmmaker payouts.

## External Dependencies

- **Database:** Neon Serverless PostgreSQL.
- **UI Libraries:** Radix UI, Embla Carousel, Lucide React, React Hook Form.
- **Authentication:** Replit Auth, Passport.js, `openid-client`, `connect-pg-simple`.
- **Movie Data:** TMDB (The Movie Database) API.
- **AI Services:** OpenAI GPT-4o-mini (via Replit AI Integrations).
- **Utilities:** `date-fns`, `clsx`, `tailwind-merge`, `nanoid`, `cmdk`.
- **Storage:** Cloudflare R2.