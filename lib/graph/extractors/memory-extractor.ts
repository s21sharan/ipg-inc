/**
 * Memory Extractor
 *
 * Extracts fine-grained Memory nodes from reflection_memory JSONB data.
 * Each pain_point, goal, preference, etc. becomes a separate Memory node
 * for precise retrieval and semantic search.
 */

/**
 * Memory type definitions matching the graph schema
 */
export type MemoryType =
  | 'pain_point'
  | 'goal'
  | 'motivation'
  | 'value'
  | 'aspiration'
  | 'preference_positive'
  | 'preference_negative'
  | 'personality_trait'
  | 'habit'
  | 'interest'
  | 'fact'
  | 'hypothesis'
  | 'experience'
  | 'workaround'
  | 'product_usage';

/**
 * Extracted memory with type and importance
 */
export interface ExtractedMemory {
  type: MemoryType;
  content: string;
  importance: number; // 1-10 scale
  category: string;   // Source category for debugging
}

/**
 * Reflection memory structure (from Supabase interviews table)
 */
export interface ReflectionMemory {
  basic_facts?: {
    age?: string;
    location?: string;
    occupation?: string;
    education?: string;
    relationship_status?: string;
    other_demographics?: string;
  };
  personality_and_lifestyle?: {
    traits?: string[];
    habits?: string[];
    interests?: string[];
    tech_savviness?: string;
    communication_style?: string;
  };
  goals_and_motivations?: {
    primary_goals?: string[];
    motivations?: string[];
    values?: string[];
    aspirations?: string[];
  };
  pain_points_and_frustrations?: {
    current_problems?: string[];
    recurring_frustrations?: string[];
    unmet_needs?: string[];
    workarounds?: string[];
  };
  product_attitudes?: {
    current_products?: string[];
    likes?: string[];
    dislikes?: string[];
    feature_preferences?: string[];
    pricing_sensitivity?: string;
    switching_barriers?: string[];
  };
  open_questions?: {
    topics_to_explore?: string[];
    contradictions?: string[];
    hypotheses?: string[];
  };
}

/**
 * Importance scoring by memory type
 * Higher = more important for agent identity/behavior
 */
const IMPORTANCE_BY_TYPE: Record<MemoryType, number> = {
  // Core identity (highest)
  goal: 9,
  pain_point: 8,
  value: 8,

  // Strong drivers
  motivation: 7,
  aspiration: 7,
  preference_negative: 7,

  // Medium importance
  preference_positive: 6,
  unmet_needs: 6,
  workaround: 6,

  // Contextual
  personality_trait: 5,
  habit: 5,
  interest: 5,
  product_usage: 5,

  // Lower importance
  fact: 4,
  experience: 4,
  hypothesis: 3,
};

/**
 * Extract all memories from a reflection_memory object
 */
export function extractMemoriesFromReflection(
  reflection: ReflectionMemory | null | undefined
): ExtractedMemory[] {
  if (!reflection) {
    return [];
  }

  const memories: ExtractedMemory[] = [];

  // Pain points and frustrations (high importance)
  if (reflection.pain_points_and_frustrations) {
    const pp = reflection.pain_points_and_frustrations;

    for (const item of pp.current_problems || []) {
      if (item && item.trim()) {
        memories.push({
          type: 'pain_point',
          content: item.trim(),
          importance: IMPORTANCE_BY_TYPE.pain_point,
          category: 'pain_points_and_frustrations.current_problems',
        });
      }
    }

    for (const item of pp.recurring_frustrations || []) {
      if (item && item.trim()) {
        memories.push({
          type: 'pain_point',
          content: item.trim(),
          importance: IMPORTANCE_BY_TYPE.pain_point - 1,
          category: 'pain_points_and_frustrations.recurring_frustrations',
        });
      }
    }

    for (const item of pp.unmet_needs || []) {
      if (item && item.trim()) {
        memories.push({
          type: 'pain_point',
          content: `Unmet need: ${item.trim()}`,
          importance: IMPORTANCE_BY_TYPE.pain_point - 1,
          category: 'pain_points_and_frustrations.unmet_needs',
        });
      }
    }

    for (const item of pp.workarounds || []) {
      if (item && item.trim()) {
        memories.push({
          type: 'workaround',
          content: item.trim(),
          importance: IMPORTANCE_BY_TYPE.workaround,
          category: 'pain_points_and_frustrations.workarounds',
        });
      }
    }
  }

  // Goals and motivations (highest importance)
  if (reflection.goals_and_motivations) {
    const gm = reflection.goals_and_motivations;

    for (const item of gm.primary_goals || []) {
      if (item && item.trim()) {
        memories.push({
          type: 'goal',
          content: item.trim(),
          importance: IMPORTANCE_BY_TYPE.goal,
          category: 'goals_and_motivations.primary_goals',
        });
      }
    }

    for (const item of gm.motivations || []) {
      if (item && item.trim()) {
        memories.push({
          type: 'motivation',
          content: item.trim(),
          importance: IMPORTANCE_BY_TYPE.motivation,
          category: 'goals_and_motivations.motivations',
        });
      }
    }

    for (const item of gm.values || []) {
      if (item && item.trim()) {
        memories.push({
          type: 'value',
          content: item.trim(),
          importance: IMPORTANCE_BY_TYPE.value,
          category: 'goals_and_motivations.values',
        });
      }
    }

    for (const item of gm.aspirations || []) {
      if (item && item.trim()) {
        memories.push({
          type: 'aspiration',
          content: item.trim(),
          importance: IMPORTANCE_BY_TYPE.aspiration,
          category: 'goals_and_motivations.aspirations',
        });
      }
    }
  }

  // Product attitudes (medium importance)
  if (reflection.product_attitudes) {
    const pa = reflection.product_attitudes;

    for (const item of pa.likes || []) {
      if (item && item.trim()) {
        memories.push({
          type: 'preference_positive',
          content: item.trim(),
          importance: IMPORTANCE_BY_TYPE.preference_positive,
          category: 'product_attitudes.likes',
        });
      }
    }

    for (const item of pa.dislikes || []) {
      if (item && item.trim()) {
        memories.push({
          type: 'preference_negative',
          content: item.trim(),
          importance: IMPORTANCE_BY_TYPE.preference_negative,
          category: 'product_attitudes.dislikes',
        });
      }
    }

    for (const item of pa.current_products || []) {
      if (item && item.trim()) {
        memories.push({
          type: 'product_usage',
          content: `Uses: ${item.trim()}`,
          importance: IMPORTANCE_BY_TYPE.product_usage,
          category: 'product_attitudes.current_products',
        });
      }
    }

    for (const item of pa.feature_preferences || []) {
      if (item && item.trim()) {
        memories.push({
          type: 'preference_positive',
          content: `Feature preference: ${item.trim()}`,
          importance: IMPORTANCE_BY_TYPE.preference_positive - 1,
          category: 'product_attitudes.feature_preferences',
        });
      }
    }

    if (pa.pricing_sensitivity && pa.pricing_sensitivity.trim()) {
      memories.push({
        type: 'preference_negative',
        content: `Pricing sensitivity: ${pa.pricing_sensitivity.trim()}`,
        importance: IMPORTANCE_BY_TYPE.preference_negative - 1,
        category: 'product_attitudes.pricing_sensitivity',
      });
    }

    for (const item of pa.switching_barriers || []) {
      if (item && item.trim()) {
        memories.push({
          type: 'experience',
          content: `Switching barrier: ${item.trim()}`,
          importance: IMPORTANCE_BY_TYPE.experience,
          category: 'product_attitudes.switching_barriers',
        });
      }
    }
  }

  // Personality and lifestyle (medium importance)
  if (reflection.personality_and_lifestyle) {
    const pl = reflection.personality_and_lifestyle;

    for (const item of pl.traits || []) {
      if (item && item.trim()) {
        memories.push({
          type: 'personality_trait',
          content: item.trim(),
          importance: IMPORTANCE_BY_TYPE.personality_trait,
          category: 'personality_and_lifestyle.traits',
        });
      }
    }

    for (const item of pl.habits || []) {
      if (item && item.trim()) {
        memories.push({
          type: 'habit',
          content: item.trim(),
          importance: IMPORTANCE_BY_TYPE.habit,
          category: 'personality_and_lifestyle.habits',
        });
      }
    }

    for (const item of pl.interests || []) {
      if (item && item.trim()) {
        memories.push({
          type: 'interest',
          content: item.trim(),
          importance: IMPORTANCE_BY_TYPE.interest,
          category: 'personality_and_lifestyle.interests',
        });
      }
    }

    if (pl.tech_savviness && pl.tech_savviness.trim()) {
      memories.push({
        type: 'personality_trait',
        content: `Tech savviness: ${pl.tech_savviness.trim()}`,
        importance: IMPORTANCE_BY_TYPE.personality_trait,
        category: 'personality_and_lifestyle.tech_savviness',
      });
    }

    if (pl.communication_style && pl.communication_style.trim()) {
      memories.push({
        type: 'personality_trait',
        content: `Communication style: ${pl.communication_style.trim()}`,
        importance: IMPORTANCE_BY_TYPE.personality_trait,
        category: 'personality_and_lifestyle.communication_style',
      });
    }
  }

  // Basic facts (lower importance)
  if (reflection.basic_facts) {
    const bf = reflection.basic_facts;

    const factFields: Array<[keyof typeof bf, string]> = [
      ['age', 'Age'],
      ['location', 'Location'],
      ['occupation', 'Occupation'],
      ['education', 'Education'],
      ['relationship_status', 'Relationship status'],
      ['other_demographics', 'Demographics'],
    ];

    for (const [field, label] of factFields) {
      const value = bf[field];
      if (value && value.trim() && value.toLowerCase() !== 'unknown') {
        memories.push({
          type: 'fact',
          content: `${label}: ${value.trim()}`,
          importance: IMPORTANCE_BY_TYPE.fact,
          category: `basic_facts.${field}`,
        });
      }
    }
  }

  // Open questions / hypotheses (lowest importance)
  if (reflection.open_questions) {
    const oq = reflection.open_questions;

    for (const item of oq.topics_to_explore || []) {
      if (item && item.trim()) {
        memories.push({
          type: 'hypothesis',
          content: `Topic to explore: ${item.trim()}`,
          importance: IMPORTANCE_BY_TYPE.hypothesis,
          category: 'open_questions.topics_to_explore',
        });
      }
    }

    for (const item of oq.contradictions || []) {
      if (item && item.trim()) {
        memories.push({
          type: 'hypothesis',
          content: `Contradiction: ${item.trim()}`,
          importance: IMPORTANCE_BY_TYPE.hypothesis,
          category: 'open_questions.contradictions',
        });
      }
    }

    for (const item of oq.hypotheses || []) {
      if (item && item.trim()) {
        memories.push({
          type: 'hypothesis',
          content: item.trim(),
          importance: IMPORTANCE_BY_TYPE.hypothesis,
          category: 'open_questions.hypotheses',
        });
      }
    }
  }

  return memories;
}

/**
 * Get memory statistics for debugging
 */
export function getMemoryStats(memories: ExtractedMemory[]): {
  total: number;
  byType: Record<string, number>;
  avgImportance: number;
} {
  const byType: Record<string, number> = {};
  let totalImportance = 0;

  for (const memory of memories) {
    byType[memory.type] = (byType[memory.type] || 0) + 1;
    totalImportance += memory.importance;
  }

  return {
    total: memories.length,
    byType,
    avgImportance: memories.length > 0 ? totalImportance / memories.length : 0,
  };
}

/**
 * Filter memories by minimum importance
 */
export function filterByImportance(
  memories: ExtractedMemory[],
  minImportance: number
): ExtractedMemory[] {
  return memories.filter((m) => m.importance >= minImportance);
}

/**
 * Group memories by type
 */
export function groupByType(
  memories: ExtractedMemory[]
): Record<MemoryType, ExtractedMemory[]> {
  const grouped: Record<string, ExtractedMemory[]> = {};

  for (const memory of memories) {
    if (!grouped[memory.type]) {
      grouped[memory.type] = [];
    }
    grouped[memory.type].push(memory);
  }

  return grouped as Record<MemoryType, ExtractedMemory[]>;
}
