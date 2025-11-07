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