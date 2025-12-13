'use client';

import React from 'react';
import { InterviewFollowups } from './interview-followups';
import { InterviewChoices, parseOptionsFromQuestion } from './interview-choices';

interface Topic {
  id: string;
  name: string;
  type: 'statement' | 'conversation' | 'question';
  content?: string;
  question?: string;
  probeQuestions?: string;
  probeDepth?: string;
}

interface InterviewQuestionCardProps {
  topic: Topic;
  questionNumber: number;
  isAnimating?: boolean;
  isEditing?: boolean;
  typewriterText?: string;
}

// Question number icons (circled numbers)
const questionIcons = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

export function InterviewQuestionCard({
  topic,
  questionNumber,
  isAnimating = false,
  isEditing = false,
  typewriterText,
}: InterviewQuestionCardProps) {
  // When typewriterText is defined (even empty string), we're in typewriter mode
  const isTypewriting = typewriterText !== undefined;
  const displayText = isTypewriting ? typewriterText : topic.question || '';

  // Only parse options from the full text when not typewriting
  const fullQuestion = topic.question || '';
  const { questionText: fullQuestionText, options: fullOptions } = parseOptionsFromQuestion(fullQuestion);

  // For display during typewriting, just show the partial text without parsing
  const questionText = isTypewriting ? displayText : fullQuestionText;
  const options = isTypewriting ? [] : fullOptions;

  // Show follow-ups and options only after typewriter animation completes
  const showExtras = !isTypewriting;

  const icon = questionNumber <= 10 ? questionIcons[questionNumber - 1] : `(${questionNumber})`;

  // Extract question title from topic name (e.g., "Free Experience: Learning moments" → "Learning moments")
  const questionTitle = topic.name.includes(':')
    ? topic.name.split(':').slice(1).join(':').trim().toUpperCase()
    : '';

  return (
    <div
      className={`bg-[#fbfaf8] border border-[#e2e3e1] rounded-lg px-5 py-6 mb-4 transition-all duration-300 ${
        isAnimating ? 'fade-slide-in' : ''
      } ${isEditing ? 'edit-highlight' : ''}`}
    >
      <div className="flex gap-4 items-start">
        <span className="text-[18px] text-[#333] flex-shrink-0">{icon}</span>
        <div className="flex-1 min-h-[24px]">
          {questionTitle && (
            <p className="text-[12px] font-bold text-[#333] mb-2 tracking-wide">
              {questionTitle}
            </p>
          )}
          <p className="text-[16px] text-[#333] leading-relaxed">
            {questionText}
            {isTypewriting && <span className="typewriter-cursor">|</span>}
          </p>

          {/* Show options after typewriter completes */}
          {showExtras && options.length > 0 && (
            <div className="animate-fade-in">
              <InterviewChoices options={options} isAnimating={false} />
            </div>
          )}

          {/* Show follow-ups after typewriter completes */}
          {showExtras && topic.probeQuestions && (
            <div className="animate-fade-in">
              <InterviewFollowups
                probeQuestions={topic.probeQuestions}
                isAnimating={false}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
