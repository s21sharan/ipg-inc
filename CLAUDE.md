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

## 2025-11-23 – Compact Session (Part 2)

### #CurrentFocus
Added follow-up questions to 196 Duolingo interviews using GPT-4o-mini Batch API and Personality column to table.

### #SessionChanges
- Added Personality column to interviews table with purple "View" button (graph icon)
- Made table columns more compact: reduced padding, auto-width Demographics, minimal button columns
- Created `demo/scripts/create_followup_batch.js` for OpenAI Batch API submission
- Created `demo/scripts/process_followup_batch.js` to process batch results and update Supabase
- Generated 4-5 follow-up moments per interview with 1-2 questions each (~8-10 new Q&As per person)
- Follow-ups stored with `is_followup: true` and `followup_to_index` fields for frontend styling
- Successfully processed 196 interviews, added ~1,700 follow-up Q&As total
- Updated transcript modal to style follow-ups: indented, orange border, orange text, ↳ arrow prefix
- Used GPT-4o-mini Batch API for 50% cost savings (~$1-2 total vs $25-35 regular)

### #NextSteps
- Implement Personality modal with Big Five or custom personality analysis #Deprecated
- Add personality analysis generation script using batch API #Deprecated
- Consider adding follow-up indicator badge to transcript button

### #BugsAndTheories
- None identified this session

### #Background
Follow-up questions enrich interviews by probing 4-5 key moments deeper. Batch API processes all 200 interviews async within 24hrs at 50% cost. Transcript notation (`is_followup`, `followup_to_index`) enables frontend to render follow-ups distinctly (indented + orange). Personality column UI ready, backend TBD.

## 2025-11-23 – Compact Session (Part 3)

### #CurrentFocus
Implemented Big Five personality analysis using GPT-4o Batch API with embedding-based scoring and radar chart visualization.

### #SessionChanges
- Created `demo/scripts/create_personality_batch.js` for GPT-4o batch submission (50 BFPT questions)
- Created `demo/scripts/process_personality_batch.js` with two-pass normalization and embedding projection
- Implemented dimensional projection: embed responses → project onto trait axes → normalize to 0-5 scale
- Used polar opposite anchor texts (HIGH/LOW) for each Big Five trait to create axis vectors
- Fixed normalization clustering issue: changed from hardcoded range to two-pass observed min/max
- Scores saved directly in 0-5 scale (rounded to 2 decimal places) in Supabase `personality` JSONB
- Added personality modal with radar/spider chart visualization (SVG pentagon)
- Replaced bar graph with radar chart showing all 5 traits with labels and scores
- Made radar chart compact (240×220px, 70px radius) to fit modal better
- Created `demo/scripts/verify_personality_data.js` to verify Supabase data matches frontend
- Created `supabase/migrations/003_cleanup_interviews_table.sql` for removing unused columns

### #NextSteps
- Run cleanup SQL to drop `participant_name` and `participant_email` columns #Deprecated
- Add hover tooltips to radar chart points showing trait descriptions #Deprecated
- Consider adding personality comparison view across multiple interviews

### #BugsAndTheories
- All scores clustering around 20 ⇒ Hardcoded normalization range too wide (fixed: two-pass normalization)
- Frontend conversion mismatch ⇒ Was converting 0-40 to 0-5 (fixed: backend now saves 0-5 directly)

### #Background
Big Five personality scoring uses embedding-based dimensional projection instead of arbitrary GPT numeric outputs. GPT-4o answers 50 BFPT questions as free-text based on interview transcript. Responses embedded with text-embedding-3-small, projected onto trait axes defined by polar opposite anchor texts. Two-pass normalization finds actual min/max across all interviews for proper 0-5 distribution. Radar chart matches standard OCEAN visualization style.

## 2025-11-23 – Compact Session (Part 4)

### #CurrentFocus
Enhanced personality modal with selectable top 3 traits, Communication Tips, and Advertising Recommendations.

### #SessionChanges
- Added `selectedTraitKey` state to track which trait card is selected in personality modal
- Added trait definitions with `communication` and `advertising` fields for all 5 Big Five traits
- Implemented selectable horizontal cards for Primary/Secondary/Tertiary traits with blue border on selection
- Primary trait selected by default; clicking any card switches displayed content
- Added Communication Tips section with blue gradient background and chat icon
- Added Advertising Recommendations section with purple gradient background and chart icon
- Made trait cards more compact: smaller fonts (`text-[8px]`, `text-[11px]`), reduced padding, `truncate` for overflow
- Made detail section more compact: `p-3` padding, `text-[11px]` content, `space-y-2.5` gaps
- Removed generated date from personality modal
- Reset `selectedTraitKey` to null when opening new personality modal
- Added scrollable modal content with `max-h-[90vh] overflow-y-auto flex-1`
- Fixed TypeScript: added `as unknown as Workspace` casts for Supabase join results (lines 179, 180, 208, 210)
- Fixed TypeScript: added union type `'middle' | 'start' | 'end'` for SVG textAnchor variable

### #NextSteps
- Run cleanup SQL to drop unused columns in interviews table
- Consider adding smooth transitions when switching between trait cards
- Add personality export/share functionality

### #BugsAndTheories
- "Conscientiousness" text overflow ⇒ Card too narrow (fixed: added `truncate` class)
- TypeScript `Workspace` cast error ⇒ Supabase returns array type (fixed: cast through `unknown`)
- TypeScript `textAnchor` type error ⇒ `string` not assignable to union (fixed: explicit union type)

### #Background
Personality modal now displays actionable insights for marketing/UX. Top 3 traits shown as selectable cards. Each trait includes Communication Tips (how to talk to this persona) and Advertising Recommendations (campaign strategies). Content sourced from Big Five personality research for practical application in market research context.

## 2025-11-24 – Compact Session

### #CurrentFocus
Built complete campaign conversation simulation system with generative AI agents, real-time progress tracking, and conversation management.

### #SessionChanges
- Extracted reflection memory from 196 interviews (personality, goals, pain points, product attitudes) using GPT-4o-mini
- Created `supabase/migrations/006_create_conversations_table.sql` with campaign/interview links and status tracking
- Built `lib/simulation-engine.ts` with agent context builder, dynamic probing, and full transcript memory
- Created `/api/campaigns/[id]/simulate` endpoint processing interviews in batches of 10 with rate limiting
- Created `/api/campaigns/[id]/simulation-status` endpoint returning real-time counts (total, completed, in_progress, failed, pending)
- Added purple "Simulate Conversations" button to campaign detail header with loading states
- Built simulation progress modal with live progress bar, participant list, and status indicators (completed/in_progress/failed)
- Implemented Conversations tab table with checkboxes, bulk delete, and real-time updates during simulation
- Configured shorter responses (max 150 tokens, 2-4 sentences) with conversational tone guidelines
- Tuned AI interviewer to bias toward probing (2-3 follow-ups per question) for natural back-and-forth dialogue
- Fixed Next.js 16 async params issue by awaiting `params` Promise in API routes
- Fixed authentication by passing Bearer token from frontend via Authorization header
- Fixed modal visibility by setting initial simulationStatus on button click
- Enabled modal close/reopen while simulation runs in background with "Close (Running in Background)" button
- Added real-time conversations list refresh every 2 seconds when on Conversations tab during active simulation

### #NextSteps
- Test simulation with full 196-interview workspace
- Monitor token usage and costs for large-scale simulations
- Add conversation export/download functionality
- Consider adding conversation comparison or analysis features

### #BugsAndTheories
- 401 Unauthorized on simulate ⇒ Cookie-based auth not working (fixed: pass Bearer token in Authorization header)
- Modal not showing "0 of 0" ⇒ simulationStatus null on first render (fixed: set initial status object immediately)
- Progress bar stuck at "0 of 0" ⇒ Polling not starting (fixed: start polling immediately, fetch total from workspace interview count)
- Paragraph-long responses ⇒ max_tokens too high (fixed: reduced from 500 to 150, added conversational guidelines)

### #Background
Simulation system creates authentic AI interviews by combining reflection memory, personality scores, and recent Q&A context. Uses full conversation memory approach (passes entire transcript each turn) for coherent multi-turn dialogue. AI interviewer dynamically selects probe questions based on response depth. Conversations stored in separate table linked to campaigns and source interviews. Progress modal updates live via 2-second polling. Can close modal and continue simulation in background. Conversations tab refreshes automatically during simulation. Designed for 196-interview Duolingo Demo workspace with ~8-12 Q&As per conversation targeting conversational tone over essay responses.

## 2025-11-25 – Compact Session

### #CurrentFocus
Built multi-batch analysis system to handle large conversation sets exceeding GPT-4o-mini's 128k token context limit by splitting into batches and merging results.

### #SessionChanges
- Replaced profile dropdown arrow with logout icon, added sign-out confirmation modal
- Created `008_create_campaign_analyses.sql` migration with versioned analysis storage and RLS policies
- Built `lib/analysis-engine.ts` for building inputs, creating batch requests, checking status, parsing responses
- Created `lib/prompts/analysis-prompt.ts` with full SYSTEM+USER prompt requiring citations [INT:id|BLK:id] and statistical backing
- Implemented POST `/api/campaigns/[id]/analyze`, GET `.../status`, GET `.../[analysis_id]` endpoints with Bearer token auth
- Created `lib/batch-processor.ts` for polling OpenAI batch status every 5min and updating DB
- Added Analyze tab UI with version history table, detail view, and "Analyze Conversations" button (green, disabled if no completed convos)
- Debugged batch failure: 203k tokens exceeded 128k limit for 196 conversations
- Created `009_add_batch_tracking.sql` with batch_processing JSONB, total_batches, completed_batches columns
- Built `lib/analysis-engine-batch.ts` splitting conversations into 50-convo batches, merge logic with synthesis prompt
- Created `lib/batch-processor-multi.ts` to orchestrate batch→merge workflow
- Updated analyze endpoint to auto-detect >50 convos and use multi-batch (4 batches for 196 convos: 50+50+50+46)
- Added batch progress display in dashboard: "3/4 batches" under conversation count
- Fixed Next.js SSR Set serialization error by using lazy initialization `() => new Set()` for expandedRows/selectedConversations
- Created diagnostic scripts: `check-batch-status.js`, `check-openai-batch.js`, `get-batch-error-details.js`

### #NextSteps
- Run migration `009_add_batch_tracking.sql` to add batch tracking columns
- Delete failed v1 analysis or start new analysis to test multi-batch system
- Monitor OpenAI batch completion via `/api/batch-processor` polling
- Consider adding progress notifications when merge batch completes

### #BugsAndTheories
- Context length exceeded (203k>128k tokens) ⇒ 196 conversations too large for single batch (fixed: split into 4×50 batches)
- Set objects not serializable error ⇒ Next.js SSR serialization issue (fixed: lazy init with arrow function)
- "Simulate Conversations" showing on all tabs ⇒ Missing conditional check (fixed: only show on conversations tab)
- Analysis button not disabled when no conversations ⇒ Missing filter logic (fixed: check completed count)

### #Background
Analysis system uses OpenAI Batch API (50% cheaper) to generate comprehensive reports with codebook, statistics (X% a/b format), citations, themes, question-by-question breakdown, and recommendations. For >50 conversations, splits into batches to avoid token limits, processes in parallel, then merges with synthesis prompt that recalculates percentages and combines themes/quotes. Each analysis versioned for historical comparison. Batch processor runs every 5min checking individual batches, triggers merge when all complete, updates final report when merge done. Dashboard shows real-time progress with batch completion counts.

## 2025-11-25 – Compact Session (Part 2)

### #CurrentFocus
Implemented automatic batch polling, markdown report rendering with clickable citations, and citation modal linking to campaign conversation transcripts.

### #SessionChanges
- Created `/api/batch-processor/auto-poll` endpoint for automatic batch status checking and result processing
- Updated analyze endpoint to trigger auto-poll after creating batches
- Added frontend auto-polling in dashboard: polls every 15s when analysis status='processing', auto-stops when complete
- Fixed JSON parse error in batch 3 by adding auto-fix for missing commas (common LLM error)
- Installed react-markdown and remark-gfm for proper markdown rendering
- Replaced dangerouslySetInnerHTML with ReactMarkdown component with custom styling (black text, proper headings, tables, lists)
- Extracted headings from markdown to build table of contents sidebar with clickable navigation
- Created citation parser converting `[INT:id|BLK:id]` to grey conversation icon buttons
- Added citation modal showing conversation transcript with participant name, demographic tags, highlighted quote
- Fixed citation data path: fetches conversation transcript (campaign-specific Q&A) not original interview transcript
- Fixed modal overlay from black to no background (modal floats over page with shadow)
- Fixed React key warnings by adding unique keys to citation elements and transcript blocks
- Updated citation highlighting to use array index instead of block.id (transcripts don't have id field)
- Made parseCitations recursive to handle nested children in markdown (works in paragraphs, lists, recommendations)
- Added auto-scroll to highlighted block when citation modal opens

### #NextSteps
- Consider adding personality export/share functionality
- Add conversation comparison or analysis features
- Implement email notification when analysis completes

### #BugsAndTheories
- Batch 3 JSON parse error ⇒ Missing commas in LLM-generated JSON (fixed: regex auto-fix for `"\n"` → `",\n"`)
- Citations showing as raw text ⇒ Only parsing simple text nodes (fixed: recursive parseCitations handling nested children)
- Modal showing only name repeated ⇒ Using wrong transcript path (fixed: use conversation.transcript not interview.transcript)
- Highlighted block not found ⇒ Blocks missing id field (fixed: match by array index instead)

### #Background
Auto-polling eliminates manual batch processor triggers—frontend detects processing status and polls every 15s until complete. Analysis reports render as markdown with proper formatting (headings, tables, blockquotes, code). Citations link to campaign-specific simulated conversations showing exact quoted answer with full transcript context. System handles both single-batch (≤50 convos) and multi-batch (>50) automatically, merging results when all batches complete.

## 2025-12-02 – Compact Session #Deprecated

### #CurrentFocus
Built new campaign insights view with Figma design implementation and conversation clustering system planning.

### #SessionChanges
- Created `app/dashboard/campaign-detail-view.tsx` with Figma design: left panel (insights cards), right panel (chat agent)
- Implemented HexagonCluster component generating honeycomb SVG patterns for user visualization
- Implemented InsightCard component with title, hexagons, summary, matched users, prevalence, confidence stats
- Added collapsible sidebar: collapse button next to logo, click anywhere on collapsed sidebar to expand
- Sidebar when collapsed: shows only "ipg" logo, icons for nav (no text), support/signout icons only
- Auto-collapse sidebar when clicking View button on campaign for more screen space
- Separated campaign card click (→ management view with tabs) from View button (→ insights view)
- Removed legacy tabbed campaign view code, replaced with CampaignDetailView component
- Added `sidebarCollapsed` state with smooth 300ms transition animation
- Updated nav/support/signout buttons with `e.stopPropagation()` to prevent sidebar expansion on click

### #NextSteps #Deprecated
- Create `campaign_clusters` table migration with versioning and RLS policies
- Build `lib/clustering-engine.ts` with dimension detection, quote extraction, embeddings, k-means, labeling
- Create cluster API endpoints: POST trigger, GET latest clusters
- Restore old tabbed view for campaign card clicks (management), keep new view for View button (insights)
- Integrate clustering to auto-run after analysis completes via `batch-processor-multi.ts`

### #BugsAndTheories
- TypeScript unused variable warnings ⇒ Legacy code removed but imports/state remained (acceptable hints)
- Sidebar buttons triggering expand ⇒ Click propagation (fixed: added stopPropagation to all buttons)

### #Background
Campaign insights view shows 4 user clusters as hexagon groups with labels like "Repetition Fatigue". Clustering uses hybrid approach: embeddings for similarity grouping, LLM for labeling. Dimension (pain_points vs goals) auto-detected per campaign. Quote extraction (2-4 verbatim quotes) preferred over summaries for authenticity. Clusters auto-generated after analysis completes. Two navigation paths: card click → management (conversations, analyze tabs), View button → insights visualization.

## 2025-12-02 – Compact Session (Part 2)

### #CurrentFocus
Implemented full conversation clustering system with hybrid embeddings+LLM approach and dual navigation UI.

### #SessionChanges
- Created `supabase/migrations/010_create_campaign_clusters.sql` with versioning, status tracking, RLS policies
- Built `lib/clustering-engine.ts`: dimension detection, quote extraction, embeddings, k-means, labeling pipeline
- Created `POST /api/campaigns/[id]/cluster` endpoint to trigger clustering
- Created `GET /api/campaigns/[id]/cluster/latest` endpoint to fetch completed clusters with status
- Added `viewingCampaignInsights` state: card click → tabbed mgmt view, View button → insights view
- Restored tabbed campaign management view with Summary, Conversations, Analyze tabs
- Updated campaign-detail-view.tsx to fetch real clusters from API with loading/empty/processing states
- Added "Generate Insights" button when no clusters exist, polls every 5s while processing
- Integrated auto-trigger clustering in batch-processor.ts and batch-processor-multi.ts after analysis
- Fixed analyze status API to return report_markdown, dashboard_json, total_batches, completed_batches
- Updated Summary tab to show campaign description (caption) instead of topics list

### #NextSteps
- Style analysis report with collapsible sections and citation modals
- Add quote references that highlight source in right-side modal
- Add outline/TOC on right side of report view

### #BugsAndTheories
- View Report not showing content ⇒ API status endpoint missing report_markdown field (fixed)
- Clustering processing async ⇒ Uses background processing with status polling

### #Background
Clustering pipeline: detect dimension (pain_points vs goals) → extract 2-4 verbatim quotes → embed with text-embedding-3-small → k-means k=4 → label with GPT-4o-mini → calculate confidence. Auto-triggers after analysis completes. Costs ~$0.12/campaign. Two navigation paths maintained: card click shows tabbed mgmt (Summary/Conversations/Analyze), View button shows hexagon cluster insights.