# Automatic Analysis Flow

This document describes the fully automatic analysis flow that processes campaign conversations.

## Overview

When you click "Analyze Conversations", the system automatically:
1. Creates batches and submits to OpenAI
2. Polls for completion every 15 seconds
3. Downloads and processes results
4. Merges multi-batch analyses
5. Updates the UI with final report

## Complete Flow

### 1. User Clicks "Analyze Conversations"
- Button triggers `POST /api/campaigns/[id]/analyze`
- System creates analysis record with status `pending`
- Returns immediately to user with analysis ID

### 2. Background Batch Creation
- `processAnalysisInBackground()` runs asynchronously
- Fetches all completed conversations
- Decides: Single batch (≤50 conversations) or Multi-batch (>50 conversations)

**Single Batch (≤50 conversations):**
- Creates one OpenAI batch job
- Updates status to `processing`
- Sets `batch_id` in database

**Multi-Batch (>50 conversations):**
- Splits into chunks of 50 conversations each
- Creates separate batch job for each chunk
- Updates status to `processing`
- Stores all batch IDs in `batch_processing.batches[]`

### 3. Automatic Polling Starts
- Frontend detects `status: 'processing'`
- Triggers `/api/batch-processor/auto-poll` immediately
- Continues polling every 15 seconds

### 4. Batch Processing (Auto-Poll)
Each poll cycle:
- Checks all batch statuses with OpenAI API
- Downloads completed batch results
- Parses markdown reports and JSON dashboards
- Auto-fixes common JSON formatting errors
- Updates `completed_batches` counter

### 5. Merge Phase (Multi-Batch Only)
When all individual batches complete:
- System automatically triggers merge
- Creates special merge batch with combined data
- Merge prompt instructs LLM to:
  - Recalculate statistics across all conversations
  - Combine themes and insights
  - Preserve all citations
  - Merge dashboard charts

### 6. Completion
When merge (or single batch) completes:
- Downloads final results
- Updates analysis record:
  - `status: 'completed'`
  - `report_markdown: "..."`
  - `dashboard_json: {...}`
  - `completed_at: timestamp`
- Frontend auto-refreshes and shows results

### 7. User Sees Results
- Analysis appears in Analyze tab
- Can view full markdown report
- Can see dashboard visualizations
- Can compare with previous versions

## Key Files

### Backend
- `/app/api/campaigns/[id]/analyze/route.ts` - Analysis creation and background processing
- `/app/api/batch-processor/auto-poll/route.ts` - Automatic polling endpoint
- `/lib/batch-processor.ts` - Single-batch processing
- `/lib/batch-processor-multi.ts` - Multi-batch orchestration
- `/lib/analysis-engine-batch.ts` - Batch splitting and merging logic

### Frontend
- `/app/dashboard/page.tsx` - Auto-polling useEffect (lines 600-648)

## Polling Behavior

### Frontend Polling
- **Trigger**: When `analysisStatus.status === 'processing'`
- **Interval**: Every 15 seconds
- **Actions**:
  1. Call `/api/batch-processor/auto-poll`
  2. Refresh analysis list
  3. Stop when complete

### Backend Processing
- **Checks**: OpenAI batch status for all batches
- **Downloads**: Results when batches complete
- **Auto-fixes**: Common JSON formatting errors (missing commas)
- **Triggers**: Merge batch when all individual batches done

## Error Handling

### JSON Parsing Errors
- Automatically attempts to fix missing commas
- Common LLM generation error in structured output
- Logs error context for debugging

### Failed Batches
- Marks analysis as `failed`
- Stores error message
- Stops auto-polling

### Network Errors
- Auto-poll continues on transient errors
- User can manually refresh if needed

## Cost Optimization

### Batch API Benefits
- **50% cost savings** vs. real-time API
- Processes asynchronously (up to 24 hours)
- Typically completes in minutes

### Multi-Batch Strategy
- Splits large datasets to avoid token limits
- Each batch stays under 128k token limit
- Merge batch combines results efficiently

## Monitoring

### Console Logs
All operations log to console with `[Auto-Poll]` prefix:
```
[Auto-Poll] Analysis in progress, starting automatic polling...
[Auto-Poll] Processed. Still processing: true
[Auto-Poll] Analysis complete, stopping polling.
```

### Database Status
Check analysis status in Supabase:
```sql
SELECT
  id,
  version_number,
  status,
  completed_batches,
  total_batches,
  created_at,
  completed_at
FROM campaign_analyses
ORDER BY created_at DESC;
```

## Manual Testing

### Trigger Analysis
```bash
# Via UI: Click "Analyze Conversations" button
# Or via API:
curl -X POST http://localhost:3000/api/campaigns/[CAMPAIGN_ID]/analyze \
  -H "Authorization: Bearer [TOKEN]"
```

### Check Status
```bash
# Via auto-poll endpoint:
curl -X POST http://localhost:3000/api/batch-processor/auto-poll

# Via custom script:
node scripts/check-batch-status.js
```

### Verify Results
```bash
node scripts/verify-analysis-data.js
```

## Expected Timeline

### Single Batch (≤50 conversations)
- Batch creation: ~5-10 seconds
- OpenAI processing: 2-30 minutes
- Result download: ~5 seconds
- **Total: 2-30 minutes**

### Multi-Batch (>50 conversations)
- Batch creation: ~10-30 seconds (multiple batches)
- Individual batches: 2-30 minutes (parallel)
- Merge batch: 2-10 minutes
- Result download: ~10 seconds
- **Total: 5-40 minutes**

*Note: OpenAI batch API typically processes much faster than the 24-hour maximum window.*

## Future Improvements

- [ ] Add progress bar showing batch completion percentage
- [ ] Email notification when analysis completes
- [ ] Webhook support for external integrations
- [ ] Retry logic for failed batches
- [ ] Batch priority configuration
