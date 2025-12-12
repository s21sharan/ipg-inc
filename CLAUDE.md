# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ipg.inc - Next.js application for a UCLA student startup focused on AI-moderated market research interviews. Builds AI agents that conduct dynamic interviews and create generative-agent representations for continuous engagement.

## Development Commands

- `npm run dev` - Start development server on http://localhost:3000
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run db:migrate` - Run Memgraph schema migrations

## Architecture & Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19.2.0, Tailwind CSS v4, TypeScript (strict)
- **Backend**: Python FastAPI in `backend/`, Supabase (auth + postgres), OpenAI APIs
- **Graph/Vector**: Memgraph (7687/7444), Qdrant (6333/6334) via docker-compose
- **AI Models**: gpt-5-nano (reasoning), gpt-4o-mini (batch), text-embedding-3-small

## Design System

- Black background (#000), white text, blue accent (#3b82f6)
- Serif fonts (Georgia), dark mode aesthetic
- Path aliases: @/*

## Core Systems (Built Nov-Dec 2025)

### Authentication
Supabase auth with email/password, Google OAuth, OTP verification, protected routes → /dashboard

### Dashboard & Workspaces
- Workspace selector with UUID-based linking
- Duolingo Demo workspace (UUID: `00000000-0000-0000-0000-000000000001`) globally accessible
- Tabs: Campaigns, Interviews, Conversations

### Interviews System
- 196 Duolingo interviews with demographics, transcripts, follow-ups, Big Five personality
- Table view with search, CSV export, expandable rows, personality radar charts
- Follow-ups styled with orange border/indent (is_followup, followup_to_index fields)

### Campaign System
- 3-step creation: Details → Discussion Guide → Completion Logic
- Simulation engine: batches of 10, real-time progress modal, 150 max_tokens for conversational responses
- Conversations tab with bulk delete, checkboxes, live refresh during simulation

### Analysis System
- Multi-batch processing for >50 conversations (splits into 50-convo batches, merges results)
- OpenAI Batch API (50% cheaper), auto-polling every 15s
- Markdown reports with citations [INT:id|BLK:id] → clickable modals showing transcript

### Clustering System
- Auto-triggers after analysis: dimension detection → quote extraction → embeddings → k-means(k=4) → LLM labeling
- Hexagon cluster visualization in campaign insights view
- Dual navigation: card click → management tabs, View button → insights view

## Current Architecture: Generative Agent Framework

### LangGraph Orchestration (`backend/app/orchestration/`)
- **agent_state.py**: TypedDict schemas (AgentState, MemoryObject, PersonalityProfile, EmotionalState)
- **llm_client.py**: OpenAI wrapper for gpt-5-nano, embeddings, importance scoring
- **memory_stream.py**: Weighted retrieval (recency 0.3, importance 0.3, relevance 0.4)
- **nodes.py**: observe → plan → act → reflect nodes with Chain-of-Feeling emotional tracking
- **graph.py**: StateGraph workflow + AgentOrchestrator class

### Knowledge Graph (Memgraph + Qdrant)
- 8 node types: Agent, Trait, Topic, Product, Event, Sentiment, Memory, Cluster
- Qdrant collections: agent_embeddings (196), memory_embeddings (7497)
- Memgraph: Agent nodes (196), Memory nodes (7497), Trait nodes (980)
- Relations: REMEMBERS, HAS_TRAIT, DERIVED_FROM

### Data Flow
Interview (Supabase) → reflection_memory extraction → fine-grained Memory nodes (~40/agent) → Qdrant embeddings + Memgraph graph

---

## 2025-12-08 – Current Session #Deprecated

### #CurrentFocus
Fixed LangGraph agent for gpt-5-nano reasoning model and explored existing Qdrant/Memgraph data for memory integration.

### #SessionChanges
- Fixed gpt-5-nano compatibility: `max_tokens` → `max_completion_tokens` (reasoning model requirement)
- Increased token limits from 100-500 to 1500-2000 (reasoning models use tokens for internal reasoning)
- Removed `temperature` parameter (gpt-5-nano only supports default=1)
- Fixed graph recursion: set `should_terminate=True` for single turns to prevent infinite loops
- Fixed nested personality structure: `personality.scores.trait` and `extroversion`/`extraversion` spellings
- Added WorkflowInput/WorkflowOutput exports to orchestration `__init__.py`
- Fixed OCEAN display in test script to show all 5 traits correctly
- Created `tests/test_agent_interactive.py` with 15 unit tests for interactive mode
- Created `scripts/debug_llm.py` for testing LLM responses directly
- Explored Qdrant: 4 collections (agent_embeddings: 196, memory_embeddings: 7497, product/topic: empty)
- Explored Memgraph: Agent nodes (196), Memory nodes (7497), Trait nodes (980), REMEMBERS + HAS_TRAIT relations
- Olga has 40 memories in Qdrant/Memgraph: pain_points, goals, traits, preferences, habits, facts

### #NextSteps #Deprecated
- Integrate Qdrant long-term memories into Memory Stream at session start
- Add runtime conversation memories (observations, reflections) during agent interactions
- Create DERIVED_FROM relationships in Memgraph when reflections are generated
- Add temporal indexing/timestamps for recency scoring

### #BugsAndTheories
- Empty agent responses ⇒ gpt-5-nano used all tokens for reasoning, none left for output (fixed: 1500+ tokens)
- `max_tokens` unsupported ⇒ Reasoning models require `max_completion_tokens` parameter (fixed)
- `temperature` unsupported ⇒ gpt-5-nano only supports temperature=1 default (fixed: removed param)
- GraphRecursionError ⇒ should_terminate never set True for single turns (fixed: set before invoke)
- Personality showing N/A ⇒ Nested structure `personality.scores` not handled (fixed)

### #Background
gpt-5-nano is a reasoning model (like o1) that uses internal reasoning tokens before output. Existing Qdrant/Memgraph data contains rich agent profiles: 40 memories per agent (pain_points, goals, habits, traits), OCEAN personality scores as Trait nodes. This is "long-term memory" from original interviews. Runtime Memory Stream will add new conversation memories on top.

## 2025-12-08 – Compact Session (Part 2) #Deprecated

### #CurrentFocus
Implemented persistent memory stream with Qdrant storage and Memgraph relationship tracking across agent sessions.

### #SessionChanges
- Created `app/orchestration/persistent_memory.py` with PersistentMemoryStore class for Qdrant + Memgraph ops
- Added `load_memories()`, `save_memory()`, `search_similar()` methods in PersistentMemoryStore
- Implemented `_create_memory_node()` creating Memory nodes with REMEMBERS relationships in Memgraph
- Implemented `_create_derived_from_relationship()` linking reflections to source memories
- Updated `memory_stream.py` with `persistent` flag, `session_id`, and persistence methods
- Added `load_from_persistent()`, `save_to_persistent()`, `add_memory_persistent()` to MemoryStream
- Added `add_reflection_with_sources()` for tracking DERIVED_FROM relationships
- Updated AgentOrchestrator with `persistent` flag and auto-load/save in `initialize_state`/`run_single_turn`
- Added `get_memory_stats()`, `get_session_id()`, `finalize_session()` helper methods to orchestrator
- Created `tests/test_persistent_memory.py` with unit tests, integration tests, and OpenAI evaluation test
- Created `scripts/test_persistent_memory.py` for interactive testing with --auto and --inspect modes
- Added pytest markers `integration` and `evaluation` to conftest.py
- Exported `PersistentMemoryStore`, `get_persistent_memory_store` from orchestration module

### #NextSteps #Deprecated
- Run integration tests with `pytest tests/test_persistent_memory.py -v -s -m integration`
- Test with `python scripts/test_persistent_memory.py --auto` for two-session memory continuity
- Consider adding memory decay/consolidation for long-running agents
- Add API endpoint to expose persistent memory stats

### #BugsAndTheories
- None identified this session (clean implementation)

### #Background
Persistent memory enables cross-session continuity: memories load from Qdrant at session start, new memories save after each turn, DERIVED_FROM tracks reflection sources in Memgraph. Test file uses OpenAI to evaluate whether agent responses reference prior session content. Interactive script provides --auto mode for automated two-session testing.

## 2025-12-11 – Compact Session #Deprecated

### #CurrentFocus
Built multi-agent swarm system with consensus generation; wired to frontend cluster selector.

### #SessionChanges
- Created `app/swarm/` module: SwarmOrchestrator, SwarmAgent, speaker selection strategies
- Created `app/consensus/` module: CriticAgent (quality eval), ConsensusBuilder (insight extraction)
- Created `app/services/swarm_service.py` orchestrating swarm→critic→consensus pipeline
- Created `app/routers/swarm.py` with REST endpoints: create, status, messages, consensus, stop
- Mounted swarm router in `main.py` at `/api/swarm`
- Created Supabase migration `012_create_swarm_tables.sql` (sessions, participants, messages, summaries)
- Created Next.js proxy routes: `/api/swarm/create`, `/api/swarm/status/[id]`, etc.
- Wired `campaign-detail-view.tsx` to call swarm API from cluster selector + chat input
- Fixed agent names: `interview.get("name")` before falling back to `Participant-{id}`
- Fixed consensus extraction: switched from gpt-5-nano to gpt-4o-mini (reasoning model left 0 output)
- Added `model` param to `LLMClient.complete()` for flexible model selection
- Fixed conversation ID resolution: `_get_interviews()` now maps conversation→source_interview_id
- Created `tests/test_swarm_integration.py` (10 tests) and `tests/test_swarm_router.py` (13 tests)
- Created `scripts/test_swarm_e2e.py` for full pipeline testing with GPT evaluation

### #NextSteps #Deprecated
- Test swarm flow from frontend with real cluster selection
- Add WebSocket streaming for real-time message updates during swarm
- Implement swarm history/replay in campaign view
- Add rate limiting for swarm creation

### #BugsAndTheories
- Empty consensus ⇒ gpt-5-nano used all tokens for reasoning (fixed: use gpt-4o-mini for extraction)
- "Agents not found" ⇒ cluster members have conversation_id not interview_id (fixed: lookup mapping)
- Agent names showing "Participant-xxx" ⇒ code checked demographics.name not interview.name (fixed)

### #Background
Swarm system enables multi-agent discussions on user questions. Agents from clusters discuss topic for N turns, CriticAgent evaluates quality, ConsensusBuilder extracts insights/agreements/conclusions. E2E test achieved 9/10 GPT evaluation score. Frontend wired via Next.js proxy to FastAPI backend.

## 2025-12-11 – Compact Session (Part 2) #Deprecated

### #CurrentFocus
Fixed swarm timeout issues by decoupling consensus generation and adding Supabase Realtime for live updates.

### #SessionChanges
- Fixed `swarm_sessions_status_check` constraint: added `generating_consensus` to allowed statuses
- Created migration `013_fix_swarm_status_constraint.sql` to alter existing constraint
- Decoupled consensus from swarm completion: swarm marks "completed" immediately, consensus generates after
- Replaced frontend polling with Supabase Realtime subscription for `consensus_summaries` table
- Frontend now shows messages immediately when swarm completes, consensus appears via WebSocket push
- Extended swarm timeout to 10 minutes, consensus timeout to 10 minutes
- Updated `swarm_service.py` to not block on consensus generation

### #NextSteps #Deprecated
- Run SQL to enable Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE consensus_summaries`
- Implement memory persistence for swarm conversations (save to Qdrant/Memgraph)
- Add memory creation after each agent response in swarm
- Create reflection memories summarizing swarm discussions

### #BugsAndTheories
- "Conversation timed out" ⇒ consensus generation blocked swarm completion (fixed: decoupled)
- 404 on consensus ⇒ constraint blocked `generating_consensus` status update (fixed: added to constraint)
- Swarm agents NOT saving memories ⇒ `load_memories()` exists but no `save_memory()` calls in swarm

### #Background
Swarm agents load 40+ memories from Qdrant at start but don't persist new conversation memories. PersistentMemoryStore has save methods but SwarmAgent doesn't call them. Next step: wire up memory persistence so agents "learn" from swarm discussions.

## 2025-12-12 – Compact Session #Deprecated

### #CurrentFocus
Redesigned campaigns dashboard UI and create campaign page to match new Figma designs.

### #SessionChanges
- Removed 10-agent limit from swarm: `agent_ids.slice(0,10)` → `agent_ids` (all cluster members participate)
- Added expand/collapse arrow to conversation panel in campaign-detail-view.tsx
- Expanded mode: conversation panel grows to `calc(100%-450px)`, clusters stack vertically (grid-cols-1)
- Added VIEW REPORT button to campaign title bar, fetches latest analysis report_markdown
- Implemented report view with back button, markdown rendering, scrollable content
- Report view hides VIEW REPORT button, shows "Back to Insights" navigation
- Redesigned campaigns dashboard: title "Campaigns: {workspace}", search bar, filter chips
- Campaign cards: gradient background, Date/Status tags, title at bottom, hover edit/delete buttons
- Removed top header bar (workspace name + create campaign button) - now in content area
- Changed card click → viewingCampaignInsights (clusters view), gear icon → viewingCampaign (management)
- Redesigned create campaign page: "Tell us about your project" with TITLE, GOAL, TEMPLATES fields
- Template cards: Churn Diagnosis, Onboarding Optimization, Improve Conversion, Feature Exploration
- Added state: createCampaignTitle, createCampaignGoal, createCampaignTemplate
- Generate Campaign button disabled until title filled, Create from scratch link opens manual form

### #NextSteps #Deprecated
- Wire Generate Campaign button to AI campaign generation with title/goal/template context
- Add filter chip functionality (Name, Status, Date sorting/filtering)
- Implement template-based campaign prefills based on selected template

### #BugsAndTheories
- Tags overflowing card ⇒ positioned from top instead of bottom (fixed: bottom-[100px])
- Cards too small for content ⇒ adjusted card height and tag/title positioning

### #Background
Dashboard redesign follows new Figma specs. Campaigns view now has gray gradient background, larger cards with gradient fills, and fixed CREATE CAMPAIGN button at bottom-right. Create campaign flow asks for title (required), goal, and template selection before generating with AI or creating from scratch.

## 2025-12-12 – Compact Session (Part 2) #Deprecated

### #CurrentFocus
Refined create campaign page UI to fit viewport without scrolling and improved form validation.

### #SessionChanges
- Shrunk create campaign page to fit one screen: reduced title 48→24px, labels 20→14px, inputs 76→44px
- Template cards now use flex-1 width and 100px height (down from 204×170px fixed)
- Content centered vertically/horizontally with flexbox, max-width 900px (down from 1170px)
- Changed container from overflow-y-auto to overflow-hidden
- Made GOAL field required: added blue asterisk, button disabled until both title AND goal filled
- Template selection now toggles: clicking selected template deselects it (sets to null)
- Close button reduced from 14×14 to 10×10 with smaller icon

### #NextSteps #Deprecated
- Wire Generate Campaign button to AI campaign generation with title/goal/template context
- Add filter chip functionality (Name, Status, Date sorting/filtering)
- Implement template-based campaign prefills based on selected template

### #BugsAndTheories
- Page required scrolling ⇒ elements too large for viewport (fixed: reduced all sizes)
- Couldn't deselect template ⇒ onClick always set value (fixed: toggle with ternary)

### #Background
Create campaign page now fits entirely within viewport. Form requires both title and goal. Templates are optional and can be toggled on/off. UI follows Figma design with smaller, responsive sizing.

## 2025-12-12 – Compact Session (Part 3)

### #CurrentFocus
Built AI-assisted campaign builder with two-column chat interface for audience selection and focus categories.

### #SessionChanges
- Created `/api/compress-audience/route.ts` to compress audience descriptions to 4-6 words via gpt-5-nano
- Created `/api/generate-focus-categories/route.ts` to generate 4 interview focus categories with descriptions
- Added campaign builder state: `showCampaignBuilder`, `builderStep`, `focusCategories`, `selectedFocusCategory`
- Implemented two-column layout: left=chat panel (gradient bg), right=progress form (Title/Goal/Audience/Questions)
- Chat flow: "What sort of users?" → compress audience → "Fantastic— let's shape interview" → 4 focus options
- Focus categories use few-shot prompting with 10 examples (Value Perception, Usage & Habits, etc.)
- Added RECOMMENDED header with sparkle icon above focus category cards
- Category cards show name (blue bold) + description (gray) in 2x2 grid
- Progress bar changed from 4 segments to continuous gradient line (50%→75%→100% based on completion)
- Interview Questions section only shows after audience is filled
- "Fantastic—" message only appears after focus categories are generated (not during loading)

### #NextSteps
- Wire selected focus category to actual interview question generation
- Implement "CONTINUE →" button to proceed to next step after focus selection
- Add ability to type custom focus instead of selecting from options

### #BugsAndTheories
- Progress bar looked choppy ⇒ was split into 4 divs (fixed: single gradient fill)
- Message appeared before options ⇒ setState order issue (fixed: set categories before message)

### #Background
Campaign builder guides users through: Title/Goal (from prev page) → Audience (chat compress) → Focus (AI categories). Uses gpt-5-nano for compression/generation. Focus categories include: Value Perception, Usage & Habits, Onboarding, Upgrade & Pricing, Churn, Feature Discovery, Motivation & Goals, Pain Points, Alternatives, Content Fit.
