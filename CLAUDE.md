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

## 2025-11-22 – Compact Session

### #CurrentFocus
Built demo page with clustered hexagon UI, interview clustering script, and demographic metadata extraction.

### #SessionChanges
- Updated landing page text (WHAT WE DO, HOW IT WORKS, WHO WE ARE sections)
- Reduced landing page spacing to fit on one desktop screen without scrolling
- Fixed TypeScript build error: added missing `id` field to drafted Campaign object
- Created `demo/scripts/cluster_interviews.js` using OpenAI embeddings + K-means clustering
- Added quote generation for each cluster (5-6 word first-person complaints)
- Redesigned demo page with clustered hexagon layout (3 top, 2 bottom staggered)
- Implemented honeycomb pattern generator for variable cluster sizes
- Updated `demo/scripts/extract_metadata.js` to include gender, race, hometown fields
- Fixed extraction script to extract actual transcript data instead of hallucinating
- Added blue demographic tags to hexagon tooltips (age, gender, race, hometown, occupation, country)
- Fixed metadata ID mismatch: now matches by name instead of array index
- Hide metadata fields with "unknown" values in tooltips
- Moved agent_metadata.json from public/ to demo/ and updated import

### #NextSteps
- Run updated extract_metadata.js to populate new demographic fields
- Fine-tune hexagon cluster positioning and sizing
- Implement filter functionality in demo page sidebar
- Connect "Chat with Collective Memory" to actual agent data

### #BugsAndTheories
- Olga showing Valentina's data ⇒ Agent ID mismatch between agentData and metadata (fixed: match by name)
- Metadata extraction hallucinating ⇒ GPT not reading transcript carefully (fixed: stricter prompts)
- Hexagons too small/centered ⇒ Spacing and layout values too tight (fixed: increased sizes)

### #Background
Demo page shows Duolingo user interview clusters visualized as hexagon groups. Each cluster represents users with similar pain points (e.g., "lacks depth", "streak anxiety"). Metadata extraction uses GPT to pull demographics from interview transcripts. Clustering uses OpenAI embeddings on summary + frustration answers.

## 2025-11-22 – Compact Session (Part 2)

### #CurrentFocus
Implemented workspace-based interviews system with Supabase integration and dashboard Interviews tab for Duolingo Demo.

### #SessionChanges
- Created SQL migration `002_create_interviews_table.sql` with workspace_id foreign key
- Added columns to existing interviews table: workspace_id, name, summary, transcript, demographics
- Created Duolingo Demo workspace with fixed UUID `00000000-0000-0000-0000-000000000001`
- Added RLS policies for workspace-based interview access (all users can view duolingo-demo)
- Updated dashboard to use workspace_id instead of text workspace field
- Added Workspace interface and dynamic workspace selector fetching from Supabase
- Built Interviews tab UI with card grid, demographic tags, and transcript modal
- Fixed scrollbar positioning: outer container `h-screen overflow-hidden`, inner cards `overflow-y-auto`
- Fixed transcript modal X button not working by adding `e.stopPropagation()`
- Updated CreateCampaignForm to accept workspaceId prop instead of workspace string
- Created `demo/scripts/seed_duolingo_interviews.js` to populate interviews from transcripts
- Created `demo/scripts/generate_more_interviews.js` to generate 139 new interviews with GPT-4o
- Changed completion logic button from "Save" to "Create Campaign" for new campaigns

### #NextSteps
- Run generate_more_interviews.js to create 139 additional Duolingo interviews
- Add workspace creation functionality from dashboard
- Implement interview filtering/search in Interviews tab

### #BugsAndTheories
- "column workspace does not exist" ⇒ interviews table missing columns (fixed: ALTER TABLE)
- Duolingo Demo not visible to all users ⇒ Missing RLS policy on workspaces table (fixed)
- Scrollbar in wrong position ⇒ padding inside scrollable container (fixed: moved padding to inner div)
- X button not closing modal ⇒ Event propagation issue (fixed: added stopPropagation)

### #Background
Workspace system uses UUID-based workspace_id linking to workspaces table. Duolingo Demo workspace is globally accessible via special RLS policy. Personal workspaces are auto-created for new users. Interview generation uses same prompts/questions as original generate_interviews.js for consistency.

## 2025-11-23 – Compact Session

### #CurrentFocus
Converted Interviews tab from card grid to sortable table with toolbar, search, and URL-based workspace persistence.

### #SessionChanges
- Converted Interviews from card grid to table format with columns: Name, Demographics, Summary, Quotes, Transcript
- Added toolbar with Download CSV, Search, and Fullscreen buttons
- Implemented CSV download exporting filtered interview data with workspace name in filename
- Added permanent search bar on left side filtering by name, summary, country, occupation, language, quotes
- Implemented fullscreen toggle for interviews table
- Made Summary and Quotes columns expandable on click (removes line-clamp when clicked)
- Added sorting for Name column with three-dot menu on hover showing asc/desc options
- Sort indicator (arrow) appears left of column title when sorted
- Removed Demographics sorting per user request
- Fixed transcript modal X button visibility by adding `text-gray-500` color class
- Fixed sort dropdown positioning from `right-0` to `left-0` to stay within viewport
- Implemented URL-based workspace/tab persistence using `useSearchParams`
- URLs now include `?workspace=<id>&tab=<tab>` for refresh persistence
- Wrapped DashboardContent in Suspense boundary for useSearchParams compatibility
- Added `handleWorkspaceChange` and `handleTabChange` functions to update URL on changes

### #NextSteps
- Run generate_more_interviews.js to create 139 additional Duolingo interviews #Deprecated
- Add workspace creation functionality from dashboard
- Consider adding more sortable columns (Summary, Quotes)

### #BugsAndTheories
- X button not visible in modal ⇒ Missing text color on button (fixed: added text-gray-500)
- Sort dropdown going off-screen ⇒ Positioned from right edge (fixed: changed to left-0)
- Workspace not persisting on refresh ⇒ No URL state (fixed: added useSearchParams)

### #Background
Interviews table provides data-grid UX with expandable rows for long content. Three-dot menu on hover follows Notion-style column actions. URL persistence allows sharing specific workspace views and maintains state on refresh. Suspense wrapper required for Next.js useSearchParams hook.