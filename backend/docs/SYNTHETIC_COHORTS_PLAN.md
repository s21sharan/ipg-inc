# SyntheticCohorts Framework Implementation Plan

## Overview
Build a generative agents framework for collective memory chat with streaming responses and interactive ECharts visualizations. Framework name: **SyntheticCohorts**.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                         │
│  CohortChatPanel → StreamingMessage → EChartsBlock          │
└─────────────────────────┬───────────────────────────────────┘
                          │ SSE Stream
┌─────────────────────────▼───────────────────────────────────┐
│                    API Layer (FastAPI)                      │
│  POST /api/cohorts/{id}/chat (streaming)                    │
│  GET  /api/cohorts/{id}/sessions                            │
│  POST /api/visualizations/generate                          │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    Service Layer                            │
│  CollectiveMemoryService → StreamingChatService             │
│  ResponseFormatEngine (chart detection & generation)        │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    Data Layer (Supabase)                    │
│  chat_sessions, chat_messages, collective_memory_aggregations│
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Database & Core Services

### 1.1 New Migration: `012_create_synthetic_cohorts.sql`

**Tables to create:**
- `chat_sessions` - Campaign chat sessions with selected cluster IDs
- `chat_messages` - Messages with role, content, visualizations JSONB, citations JSONB
- `collective_memory_aggregations` - Pre-computed cluster aggregations (pain_points, goals, personality distribution)

### 1.2 CollectiveMemoryService (`backend/app/services/collective_memory_service.py`)

```python
class CollectiveMemoryService:
    async def aggregate_reflections(campaign_id, cluster_ids) -> dict
    async def build_collective_persona(cluster_id, members) -> CollectivePersona
    async def synthesize_multi_cohort(personas) -> MultiCohortContext
    def format_context_for_prompt(context) -> str
```

**CollectivePersona structure:**
- `top_pain_points` - Aggregated with frequency counts and supporting quotes
- `top_goals` - Aggregated with frequency counts
- `personality_profile` - Big Five averages with std deviation
- `demographics` - Distribution summaries
- `representative_quotes` - With citations to source conversations

---

## Phase 2: Streaming Chat

### 2.1 StreamingChatService (`backend/app/services/streaming_chat_service.py`)

```python
class StreamingChatService:
    async def stream_response(session_id, message, cohort_context, history) -> AsyncGenerator[StreamChunk]
    def build_system_prompt(context: MultiCohortContext) -> str
```

**StreamChunk types:**
- `text` - Partial response text
- `chart_start` / `chart_data` / `chart_end` - Inline visualization
- `citation` - Source reference
- `done` - Completion with metadata

### 2.2 API Endpoint (`backend/app/routers/cohorts.py`)

```python
@router.post("/{campaign_id}/chat")
async def chat_with_cohort(
    campaign_id: str,
    message: str,
    cluster_ids: list[str],
    session_id: Optional[str]
) -> StreamingResponse:  # SSE
```

---

## Phase 3: Frontend Components

### 3.1 Component Structure

```
CampaignDetailView (existing)
└── CohortChatPanel (new - replaces right panel)
    ├── ChatHeader
    │   ├── CohortSelector (multi-select clusters)
    │   └── SessionHistory (dropdown)
    ├── MessageList
    │   ├── MessageBubble (user)
    │   └── MessageBubble (assistant)
    │       ├── MarkdownRenderer
    │       ├── EChartsBlock (inline charts)
    │       └── CitationTooltip
    ├── StreamingIndicator
    └── ChatInput
```

### 3.2 Key Files to Create

- `app/dashboard/components/cohort-chat-panel.tsx`
- `app/dashboard/components/echarts-block.tsx`
- `app/dashboard/components/streaming-message.tsx`
- `lib/hooks/use-streaming-chat.ts`

### 3.3 Dependencies to Install

```bash
npm install echarts echarts-for-react
```

---

## Phase 4: Visualization Engine

### 4.1 ResponseFormatEngine (`backend/app/services/response_format_engine.py`)

**Chart detection in LLM responses:**
```
[CHART:bar]
title: Pain Point Distribution
data: {"labels": [...], "values": [...]}
[/CHART]
```

**Supported chart types:**
- `pie` - Sentiment distribution
- `bar` / `grouped_bar` - Comparison breakdowns
- `radar` - Personality profiles (Big Five)
- `line` - Trend analysis

### 4.2 ECharts Config Templates (`lib/chart-configs.ts`)

Pre-built templates for each chart type with dynamic data injection.

---

## Phase 5: Open-Source Preparation

### 5.1 Directory Structure for Extraction

```
synthetic-cohorts/
├── packages/
│   ├── core/           # Services (collective-memory, streaming-chat)
│   ├── react/          # React components (CohortChat, EChartsRenderer)
│   └── adapters/       # Database adapters (supabase, prisma)
├── examples/
└── docs/
```

### 5.2 Whitepaper Outline

1. **Introduction** - Problem of scaling qualitative research
2. **Architecture** - Collective memory synthesis approach
3. **Multi-Cohort Conversations** - Cross-segment comparison
4. **Inline Visualizations** - ECharts integration
5. **Evaluation** - Accuracy vs manual analysis
6. **Case Study** - Duolingo 196-participant dataset
7. **Open-Source** - Framework usage guide

---

## Implementation Order

| Phase | Task | Priority | Files |
|-------|------|----------|-------|
| 1 | Database migration | HIGH | `supabase/migrations/012_create_synthetic_cohorts.sql` |
| 1 | CollectiveMemoryService | HIGH | `backend/app/services/collective_memory_service.py` |
| 2 | StreamingChatService | HIGH | `backend/app/services/streaming_chat_service.py` |
| 2 | Chat API endpoint (SSE) | HIGH | `backend/app/routers/cohorts.py` |
| 3 | CohortChatPanel UI | HIGH | `app/dashboard/components/cohort-chat-panel.tsx` |
| 3 | useStreamingChat hook | HIGH | `lib/hooks/use-streaming-chat.ts` |
| 4 | ResponseFormatEngine | MEDIUM | `backend/app/services/response_format_engine.py` |
| 4 | EChartsBlock component | MEDIUM | `app/dashboard/components/echarts-block.tsx` |
| 5 | Package extraction | LOW | `synthetic-cohorts/` |
| 5 | Whitepaper draft | LOW | `docs/whitepaper.md` |

---

## Critical Existing Files

- `lib/simulation-engine.ts` - Reference for agent context building
- `lib/conversation-reflection.ts` - ReflectionMemory structure to aggregate
- `lib/clustering-engine.ts` - Cluster data patterns
- `app/dashboard/campaign-detail-view.tsx` - UI integration point (right panel)
- `supabase/migrations/010_create_campaign_clusters.sql` - Schema reference
