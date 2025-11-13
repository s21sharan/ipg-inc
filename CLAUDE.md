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