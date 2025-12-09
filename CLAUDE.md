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

## 2025-12-08 – Current Session

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

### #NextSteps
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
