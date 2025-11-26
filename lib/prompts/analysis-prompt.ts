/**
 * Analysis Prompt Template
 *
 * Generates comprehensive campaign analysis from conversation transcripts
 * with statistical backing, citations, and actionable insights.
 */

interface CampaignContext {
  client_name: string;
  campaign_name: string;
  targeted_problem_statement: string;
  target_audience: string;
  research_goals: string[];
}

interface Question {
  question_id: string;
  question_text: string;
  question_type: 'open_ended' | 'multiple_choice' | 'likert' | 'ranking' | 'other';
  answer_options?: string[];
  success_criteria?: string;
}

interface ConversationBlock {
  block_id: number;
  speaker: 'interviewer' | 'respondent';
  text: string;
  question_id?: string;
  is_followup?: boolean;
}

interface Conversation {
  interview_id: string;
  respondent_id: string;
  segment_tags?: Record<string, any>;
  transcript: ConversationBlock[];
}

export function buildAnalysisPrompt(
  context: CampaignContext,
  questions: Question[],
  conversations: Conversation[]
): string {
  const systemPrompt = `SYSTEM:
You are a research analyst and reporting engine. Analyze ONLY the campaign materials and interview data I provide. Do not invent or assume facts, quotes, counts, statistics, or percentages. Every quantitative claim must be computed from the provided data and must include numerator, denominator, and percent (rounded to 1 decimal). Every quote must be verbatim and must include a source reference to the exact interview and exact block of text (interview_id + block_id + optional timestamp). If something cannot be computed from the data, write "Insufficient data" and explain what is missing.`;

  const userPrompt = `USER:
You are given data from a client research campaign focused on a specific client problem. The campaign includes a discussion guide (questions) and a set of interview transcripts. The number of interviews varies by campaign (N can be any size). Your job is to generate a report similar to an insights dashboard: executive summary, top themes, question-by-question analysis, key quotes, statistics with numerical values, recommendations, and methodology. You must also embed citations at the end of sentences that rely on interview evidence, referencing the exact interview and exact block of text used.

INPUT YOU WILL RECEIVE:
1. CLIENT + CAMPAIGN CONTEXT

• client_name: string
• campaign_name: string
• targeted_problem_statement: string
• target_audience: string
• research_goals: list of strings

2. DISCUSSION GUIDE / QUESTIONS
A list of questions used in this campaign. Each question includes:

• question_id: string
• question_text: string
• question_type: open_ended | multiple_choice | likert | ranking | other
• answer_options: optional list (for structured questions)
• success_criteria: optional string (what we are trying to learn)

3. INTERVIEWS_JSON (N interviews, N can be any size)
Each interview object includes:

• interview_id: string
• respondent_id: string (optional)
• segment_tags: object (optional; e.g., persona, role, industry, company_size)
• transcript: array of blocks/turns, each with:
  • block_id: string/int (use whichever exists; treat as the citation id)
  • speaker: "interviewer" | "respondent"
  • text: string
  • question_id: string (may be null)
  • is_followup: optional boolean

YOUR TASKS (DO ALL):

A) Build a campaign-specific CODEBOOK for qualitative analysis
For each open-ended question_id:
1. Read all respondent answers for that question.
2. Create 6–12 response categories ("codes") that cover most answers.
3. Define each code in one sentence and provide 1 short example phrase (not a verbatim quote unless you cite it).
4. Assign each respondent answer to 1–2 codes maximum.
5. Track denominators correctly (not everyone answers every question).

B) Compute NUMERIC STATS from the coding and structured answers
For each question_id:
• participation: n_answered / N and percent
• distribution: counts and percents by code (open-ended) or by option (structured)

Segment splits:
• If segment_tags exist, compute the same distributions by segment value, but only report segment breakdowns when segment sample size is at least 10. Otherwise label "low sample" and skip percentages.

C) Quote extraction + sentence-level citations
1. Build a QUOTE LIBRARY:
   • Select short, specific, representative quotes.
   • Quotes must be verbatim.
   • Each quote must include citation fields: interview_id, block_id, question_id.

2. In the REPORT, whenever you make a claim that is supported by interview evidence (including themes and stats), append an inline citation at the end of that sentence using this EXACT format:
[INT:<interview_id>|BLK:<block_id>]

If a sentence is supported by multiple interviews, list up to 3 citations like:
[INT:…|BLK:…][INT:…|BLK:…][INT:…|BLK:…]

If a sentence is supported by computed stats (like "42.3% (33/78)"), still include at least one representative citation from an interview block supporting the interpretation, unless the sentence is purely mechanical (e.g., "N=196 interviews").

D) Produce REPORT_MARKDOWN (executive-friendly and concise)
Create these sections:

1. Executive Summary / Highlights (5–10 bullets)
   • Tie findings directly to the targeted_problem_statement.
   • Every bullet with a claim must include numeric evidence when possible: "X% (a/b)".
   • Add 1–2 representative quotes with citations.

2. Top Themes (5–8 themes)
For each theme:
   • Theme name
   • What it is (1–2 sentences)
   • Why it matters to the client problem (1–2 sentences)
   • Evidence:
     • prevalence: % (a/b) across interviews who discussed it (define the denominator clearly)
     • which questions it appears in (question_ids)
     • 2–4 verbatim quotes (each with citations)

3. Question-by-Question Analysis (for EVERY question in the discussion guide)
For each question_id:
   • Question text
   • Participation: n/N and %
   • Top 3–5 patterns (coded themes or structured distributions)
   • Distribution table: code/option, count, percent, denominator
   • Segment differences (only if segment n >= 10)
   • 3–6 verbatim quotes with citations
   • Implication for targeted_problem_statement (1–2 sentences, with citations if based on interviews)

4. Recommendations (prioritized, actionable)
   • Provide 5–10 recommendations.
   • For each recommendation:
     • What to do
     • Why (link to specific themes/questions)
     • Evidence: include at least one metric (x/y, %) and at least one citation
     • Suggested next step (experiment, prototype test, messaging change, product change)

5. Methodology (transparent + repeatable)
Include:
   • how transcripts were coded (codebook creation + assignment rules)
   • how denominators were handled per question
   • how stats were computed
   • how quote selection was performed
   • limitations (sample size, bias, coverage, digital-twin constraints if relevant)

E) Produce DASHBOARD_JSON (machine-readable for charts and UI)
Return a single valid JSON object with:
• campaign_meta: client_name, campaign_name, targeted_problem_statement, N, segments_present
• questions: array with:
  • question_id, question_text, question_type
  • n_answered, N, percent_answered
  • distributions: array of {label, count, denominator, percent}
  • segment_distributions: optional, only for segment groups with n >= 10
  • top_quotes: array of quote_ids
• codebook: per question_id list of codes with definitions
• themes: array with:
  • theme_id, name, description
  • prevalence_count, prevalence_denominator, prevalence_percent
  • linked_question_ids
  • supporting_quote_ids
• quotes: object keyed by quote_id with:
  • quote_text (verbatim)
  • interview_id
  • block_id
  • question_id
  • segment_tags (if present)
  • theme_ids (if applicable)
• charts: array of Vega-Lite specs with embedded data arrays, including at minimum:
  1. theme prevalence bar chart
  2. distribution chart for the top 3 most important questions (bar or stacked bar)
  3. segment comparison chart for the most decision-critical question (grouped bar) IF segments exist with n >= 10
  4. participation rate by question (bar chart of n_answered)

STRICT RULES:
• Do not guess numbers.
• Do not fabricate quotes.
• Quotes must be verbatim and cited.
• All percentages require explicit denominators.
• If needed data is missing, say "Insufficient data" and continue with what can be computed.

OUTPUT FORMAT (MANDATORY):
Return EXACTLY two top-level sections and nothing else, in this order:

===REPORT_MARKDOWN===
[Your markdown report here]

===DASHBOARD_JSON===
[Your JSON object here]

BEGIN INPUT

CLIENT_CONTEXT:
${JSON.stringify(context, null, 2)}

DISCUSSION_GUIDE:
${JSON.stringify(questions, null, 2)}

INTERVIEWS_JSON:
${JSON.stringify(conversations, null, 2)}

END INPUT`;

  return `${systemPrompt}\n\n${userPrompt}`;
}
