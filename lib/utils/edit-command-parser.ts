export type EditCommandType =
  | 'full_regeneration'
  | 'add_followup'
  | 'add_choice'
  | 'modify_question'
  | 'delete_question'
  | 'add_question'
  | 'change_section'
  | 'reorder';

export interface ParsedCommand {
  type: EditCommandType;
  targetSection?: string;
  targetQuestionIndex?: number;
  targetQuestionId?: string;
  instruction: string;
  originalCommand: string;
}

const FULL_REGEN_PATTERNS = [
  /make.*(questions?|guide|interview).*(more|less|about|focus)/i,
  /focus.*on/i,
  /regenerate/i,
  /start\s*over/i,
  /redo.*entire/i,
  /change.*tone/i,
  /make.*it.*more/i,
  /rewrite/i,
  /completely.*different/i,
];

const ADD_FOLLOWUP_PATTERNS = [
  /add.*(follow[- ]?up|probe).*(question\s*)?(\d+)?/i,
  /more.*follow[- ]?up.*(question\s*)?(\d+)?/i,
  /additional.*probe/i,
];

const ADD_CHOICE_PATTERNS = [
  /add.*(choice|option).*(question\s*)?(\d+)?/i,
  /more.*(choices?|options?)/i,
  /new.*option/i,
];

const MODIFY_QUESTION_PATTERNS = [
  /(change|modify|update|edit|rephrase|reword).*(question\s*)?(\d+)/i,
  /question\s*(\d+).*(should|could|needs?)/i,
  /make\s*question\s*(\d+)/i,
];

const DELETE_QUESTION_PATTERNS = [
  /(delete|remove).*(question\s*)?(\d+)/i,
  /get\s*rid\s*of.*(question\s*)?(\d+)/i,
];

const ADD_QUESTION_PATTERNS = [
  /add.*(new\s*)?(question|item)/i,
  /new.*question.*(about|regarding|for)/i,
  /include.*question/i,
];

const CHANGE_SECTION_PATTERNS = [
  /(rename|change).*(section)/i,
  /move.*question.*(\d+).*to.*(section)/i,
];

function extractQuestionNumber(command: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = command.match(pattern);
    if (match) {
      // Look for a number in the match groups or near "question"
      for (let i = 1; i < match.length; i++) {
        if (match[i] && /^\d+$/.test(match[i])) {
          return parseInt(match[i], 10);
        }
      }
    }
  }

  // Fallback: find any number after "question"
  const questionNumMatch = command.match(/question\s*#?\s*(\d+)/i);
  if (questionNumMatch) {
    return parseInt(questionNumMatch[1], 10);
  }

  // Fallback: find standalone number
  const standaloneNum = command.match(/\b(\d+)\b/);
  if (standaloneNum) {
    return parseInt(standaloneNum[1], 10);
  }

  return undefined;
}

function matchesAnyPattern(command: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(command));
}

export function parseEditCommand(command: string): ParsedCommand {
  const normalizedCommand = command.trim().toLowerCase();

  // Check for targeted edit patterns first (most specific)
  if (matchesAnyPattern(normalizedCommand, DELETE_QUESTION_PATTERNS)) {
    return {
      type: 'delete_question',
      targetQuestionIndex: extractQuestionNumber(normalizedCommand, DELETE_QUESTION_PATTERNS),
      instruction: command,
      originalCommand: command,
    };
  }

  if (matchesAnyPattern(normalizedCommand, MODIFY_QUESTION_PATTERNS)) {
    return {
      type: 'modify_question',
      targetQuestionIndex: extractQuestionNumber(normalizedCommand, MODIFY_QUESTION_PATTERNS),
      instruction: command,
      originalCommand: command,
    };
  }

  if (matchesAnyPattern(normalizedCommand, ADD_FOLLOWUP_PATTERNS)) {
    return {
      type: 'add_followup',
      targetQuestionIndex: extractQuestionNumber(normalizedCommand, ADD_FOLLOWUP_PATTERNS),
      instruction: command,
      originalCommand: command,
    };
  }

  if (matchesAnyPattern(normalizedCommand, ADD_CHOICE_PATTERNS)) {
    return {
      type: 'add_choice',
      targetQuestionIndex: extractQuestionNumber(normalizedCommand, ADD_CHOICE_PATTERNS),
      instruction: command,
      originalCommand: command,
    };
  }

  if (matchesAnyPattern(normalizedCommand, ADD_QUESTION_PATTERNS)) {
    return {
      type: 'add_question',
      instruction: command,
      originalCommand: command,
    };
  }

  if (matchesAnyPattern(normalizedCommand, CHANGE_SECTION_PATTERNS)) {
    return {
      type: 'change_section',
      instruction: command,
      originalCommand: command,
    };
  }

  // Full regeneration is the default for ambiguous or broad commands
  if (matchesAnyPattern(normalizedCommand, FULL_REGEN_PATTERNS)) {
    return {
      type: 'full_regeneration',
      instruction: command,
      originalCommand: command,
    };
  }

  // Default to full regeneration for unrecognized patterns
  return {
    type: 'full_regeneration',
    instruction: command,
    originalCommand: command,
  };
}

export function isTargetedEdit(parsedCommand: ParsedCommand): boolean {
  return parsedCommand.type !== 'full_regeneration';
}

export function getEditDescription(parsedCommand: ParsedCommand): string {
  switch (parsedCommand.type) {
    case 'full_regeneration':
      return 'Regenerating entire interview guide...';
    case 'add_followup':
      return parsedCommand.targetQuestionIndex
        ? `Adding follow-up to question ${parsedCommand.targetQuestionIndex}...`
        : 'Adding follow-up questions...';
    case 'add_choice':
      return parsedCommand.targetQuestionIndex
        ? `Adding choice to question ${parsedCommand.targetQuestionIndex}...`
        : 'Adding choice options...';
    case 'modify_question':
      return parsedCommand.targetQuestionIndex
        ? `Modifying question ${parsedCommand.targetQuestionIndex}...`
        : 'Modifying question...';
    case 'delete_question':
      return parsedCommand.targetQuestionIndex
        ? `Removing question ${parsedCommand.targetQuestionIndex}...`
        : 'Removing question...';
    case 'add_question':
      return 'Adding new question...';
    case 'change_section':
      return 'Updating section...';
    case 'reorder':
      return 'Reordering questions...';
    default:
      return 'Processing edit...';
  }
}
