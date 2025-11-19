# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is ipg.inc's landing page - a Next.js application for a UCLA student startup focused on AI-moderated market research interviews. The company builds AI agents that conduct dynamic interviews to capture customer insights and create generative-agent representations for continuous engagement.

## Development Commands

- `npm run dev` - Start development server on http://localhost:3000
- `npm run build` - Build the application for production
- `npm start` - Start the production server

## Architecture & Tech Stack

- **Framework**: Next.js 16 with App Router
- **Styling**: Tailwind CSS v4 with custom CSS variables
- **TypeScript**: Strict mode enabled with path aliases (@/*)
- **UI**: React 19.2.0 with serif font styling (Georgia fallback)

## Project Structure

The application follows Next.js App Router conventions:

- `app/page.tsx` - Main landing page with hero section, company description, and contact info
- `app/layout.tsx` - Root layout with metadata (title: "ipg.inc", description: "Talk to your users 24/7.")
- `app/signin/` & `app/signup/` - Authentication pages (basic structure)
- `app/globals.css` - Global styles with dark theme and serif typography

## Design System

- **Color Scheme**: Black background (#000) with white text, blue accent (#3b82f6)
- **Typography**: Primary serif fonts (Georgia), secondary sans-serif for headers
- **Layout**: Responsive design with mobile-first approach
- **Theme**: Dark mode with minimal, professional aesthetic

## Key Features

- Contact email: contact@ipg.inc
- Custom favicon (IPG.ico)
- Responsive layout with backdrop blur effects on desktop
- Authentication flow placeholder pages #Deprecated

## Authentication System

- **Supabase Integration**: Full auth with email/password and Google OAuth
- **OTP Verification**: 6-digit email codes for signup and optional signin
- **Real-time Validation**: Email existence checking during signup
- **Password Validation**: Visual feedback for 8+ character requirement
- **Protected Routes**: Dashboard redirect after successful authentication

## 2025-11-06 – Compact Session

### #CurrentFocus
Implemented complete Supabase authentication system with OTP verification and real-time email validation.

### #SessionChanges  
- Set up Supabase client configuration with environment variables
- Created OTP verification page with 6-digit input and auto-focus
- Implemented two-step signin flow (email → password/code choice)
- Added real-time email existence checking during signup with red border feedback
- Updated signin page to support both password and OTP authentication methods
- Fixed verification page styling to match dark theme design
- Created dashboard page with simple welcome message
- Updated all auth flows to redirect to /dashboard after successful login
- Fixed TypeScript errors for boolean props and ref assignments
- Added Suspense boundary for useSearchParams hook to resolve build errors
- Removed "use another method" links from signup flow per requirements

### #NextSteps
- Set up Supabase environment variables in Vercel deployment settings
- Test complete authentication flow in production environment
- Add user session management and logout functionality

### #BugsAndTheories
- ERR_NAME_NOT_RESOLVED on signup ⇒ Typo in Supabase URL (fixed: extra 'x' in domain)
- TypeScript build errors ⇒ String type in boolean prop context (fixed with !! operator)
- Vercel build failing ⇒ Missing environment variables and Suspense boundary issues (fixed)

### #Background
Project transitioned from static landing page to full authentication system using Supabase. Focus on email-first signup with OTP verification to prevent duplicate accounts and provide secure authentication flow.

## 2025-11-09 – Compact Session

### #CurrentFocus
Built complete dashboard with campaign creation flow, using three-step form with progress bars.

### #SessionChanges
- Removed Home tab, made Campaigns default active tab in dashboard
- Added Simulated Agents tab between Campaigns and Conversations
- Created workspace selector dropdown with "Add workspace" option
- Built two-option modal for campaign creation (Prompt vs Scratch)
- Implemented 3-section form: Campaign Details, Discussion Guide, Completion Logic
- Added preloaded topics: Kickoff (statement), middle topic, Signoff (statement)
- Fixed input text colors and select dropdown arrows for visibility
- Converted tabs to three-bar progress indicator showing completion status
- Made forms stretch full width, removed constraining containers
- Hide header title/button when in create campaign mode

### #NextSteps
- Implement "Create from Prompt" flow with AI assistance #Deprecated
- Add form validation before allowing section navigation #Deprecated
- Build campaign list view with created campaigns #Deprecated
- Connect form submission to Supabase backend #Deprecated

### #BugsAndTheories
- White text in inputs ⇒ Missing text-gray-900 class (fixed)
- Missing dropdown arrow ⇒ Browser default removed, custom SVG added (fixed)

### #Background
Dashboard implements PulseIQ-style interface adapted for ipg.inc. Campaign creation uses progressive disclosure with visual progress tracking. Changed "Pulses" terminology to "Campaigns" throughout.

## 2025-11-13 – Compact Session

### #CurrentFocus
Enhanced campaign creation UI with auto-growing textareas, persistent save functionality, and "Create from Prompt" interface.

### #SessionChanges
- Added auto-growing textareas in Discussion Guide (Goals, Question, Probe Questions) with 150px max height and scrollbars
- Added "Save" button to all campaign form sections (Details, Guide, Completion) positioned bottom-right
- Modified save function to keep users on same page instead of redirecting to dashboard
- Changed save button text from "Save Campaign" to "Save"
- Built "Create from Prompt" UI with large textarea and "Draft Campaign" button
- Enabled "Create from Prompt" option in campaign creation modal
- Aligned profile section styling with other sidebar buttons (Campaigns, Conversations, etc.)
- Connected campaign form to Supabase for create/update operations
- Added campaign list view with edit/delete functionality in dashboard

### #NextSteps
- Implement AI-powered campaign generation from user prompts
- Add backend API route for draft campaign generation
- Test campaign save/edit flows with Supabase

### #BugsAndTheories
- None identified this session

### #Background
Session focused on UX improvements for campaign creation. Auto-growing textareas prevent page scrolling while providing flexibility. Save buttons allow iterative editing without losing context. "Create from Prompt" offers AI-assisted campaign creation workflow.

## 2025-11-18 – Compact Session

### #CurrentFocus
Built standalone Python/Pipecat voice agent backend with Daily.co integration for conducting AI-moderated interviews.

### #SessionChanges
- Created ipg-voice-agent/ directory with complete Python backend structure
- Built Pydantic models for discussion guides (Statement, Conversation, Question step types)
- Implemented format converter between Supabase campaign schema and agent guide format
- Created Supabase client for fetching campaigns and saving interview transcripts
- Built Daily.co client for WebRTC room management and token generation
- Implemented guide engine with step transitions, timing logic, and probe selection
- Created Daily.co transport layer for Pipecat audio streaming
- Built main Pipecat agent with Deepgram STT, Cartesia TTS, and OpenAI LLM orchestration
- Implemented FastAPI server with session management and REST endpoints
- Created digital twin profiling system for generating personality profiles from transcripts
- Added conversation logging utilities saving to files and Supabase
- Built test client with HTML/JavaScript for standalone testing
- Created Dockerfile and docker-compose.yml for containerized deployment
- Fixed Python dependency conflicts (aiohttp, httpx, numpy versions) by loosening version constraints
- Updated CameraView.tsx to integrate with voice agent backend API
- Created Supabase migration for interviews, transcript_entries, and digital_twin_profiles tables

### #NextSteps
- Run Supabase SQL migration to create interview tables
- Fix nginx.conf mounting error in docker-compose (file vs directory issue)
- Test voice agent backend startup and health check endpoint
- Complete full integration test: Next.js app → Python backend → Daily.co → Voice interview
- Test campaign format conversion and guide execution flow

### #BugsAndTheories
- Docker dependency conflicts ⇒ Exact version pins incompatible (fixed: use >= constraints)
- nginx mount error ⇒ nginx.conf file doesn't exist, docker-compose trying to mount non-existent file
- Pipecat version conflicts ⇒ pipecat-ai 0.0.39 requires specific numpy/aiohttp versions (fixed: flexible ranges)

### #Background
Built production-ready voice interview agent as standalone Python service using Pipecat framework. Integrates with existing Next.js campaign system via format converters. Uses Daily.co for WebRTC instead of raw WebSocket per user preference. Agent conducts interviews following structured discussion guides with three step types, intelligent probe selection, and natural conversation flow. Generates digital twin profiles for simulation. All API keys already configured from existing .env.local.

## 2025-11-19 – Compact Session

### #CurrentFocus
Fixed Daily.co Python SDK integration and threading issues to enable voice agent audio streaming with Pipecat pipeline.

### #SessionChanges
- Commented out nginx service in docker-compose.yml (file didn't exist, causing mount errors)
- Pinned gotrue==2.4.2 to fix httpx compatibility (TypeError: unexpected 'proxy' argument)
- Changed DailyTransport inheritance from BaseTransport to FrameProcessor (BaseTransport has no push_frame/process_frame methods)
- Fixed Daily.co join() API: moved token to meeting_token parameter, updated client_settings to use inputs/publishing keys only
- Removed invalid update_subscription_profiles() call (wrong API keys: subscribed, maxBitrate not supported)
- Fixed event handler signatures: on_active_speaker_change → on_active_speaker_changed, added reason parameter to on_participant_left
- Implemented CustomAudioSource and CustomAudioTrack for sending agent audio instead of non-existent send_audio() method
- Used set_audio_renderer() callback to receive participant audio instead of non-existent on_audio_data event
- Fixed threading errors: used asyncio.run_coroutine_threadsafe() for Daily callbacks (run on Daily's thread, not event loop)
- Stored event_loop reference during start() for cross-thread communication
- Added comprehensive logging to DailyTransport.start() and process_frame() for debugging

### #NextSteps
- Investigate why StartFrame not reaching process_frame() despite pipeline linking successfully
- Verify agent initialization triggers and Daily room join process
- Test complete audio flow: participant speaks → STT → LLM → TTS → agent speaks
- Debug why no "DailyTransport: Processing StartFrame" log appears in output

### #BugsAndTheories
- nginx mount error ⇒ docker-compose.yml referenced non-existent nginx.conf file (fixed: commented out service)
- gotrue/httpx incompatibility ⇒ gotrue 2.12.4 uses proxy parameter not in httpx 0.25.2 (fixed: pinned gotrue==2.4.2)
- BaseTransport missing methods ⇒ Doesn't inherit FrameProcessor, no push_frame/process_frame (fixed: inherit FrameProcessor)
- Daily.co API errors ⇒ Python SDK uses different structure than JS SDK (fixed: meeting_token param, inputs/publishing settings)
- RuntimeError: no running event loop ⇒ Daily callbacks run on separate thread (fixed: run_coroutine_threadsafe with stored loop)
- Agent not speaking ⇒ StartFrame likely not triggering start() method, pipeline runs but transport never initializes

### #Background
Session focused on debugging Daily.co Python SDK integration. Major discovery: BaseTransport is abstract and doesn't provide frame processing - must use FrameProcessor. Daily Python SDK has completely different API from JS version (callbacks run on separate threads, different method signatures). Successfully resolved all API compatibility and threading issues, but agent still not initializing despite pipeline linking. Added extensive logging to diagnose startup flow.