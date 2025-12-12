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
  const displayText = typewriterText !== undefined ? typewriterText : topic.question || '';
  const { questionText, options } = parseOptionsFromQuestion(displayText);
  const isStreaming = typewriterText !== undefined;

  const icon = questionNumber <= 10 ? questionIcons[questionNumber - 1] : `(${questionNumber})`;

  // Extract question title from topic name (e.g., "Free Experience: Learning moments" → "Learning moments")
  const questionTitle = topic.name.includes(':')
    ? topic.name.split(':').slice(1).join(':').trim().toUpperCase()
    : '';

  return (
    <div
      className={`bg-[#fbfaf8] border border-[#e2e3e1] rounded-lg px-5 py-6 mb-4 transition-all ${
        isAnimating ? 'fade-slide-in' : ''
      } ${isEditing ? 'edit-highlight' : ''}`}
    >
      <div className="flex gap-4 items-start">
        <span className="text-[18px] text-[#333] flex-shrink-0">{icon}</span>
        <div className="flex-1">
          {questionTitle && (
            <p className="text-[12px] font-bold text-[#333] mb-2 tracking-wide">
              {questionTitle}
            </p>
          )}
          <p className="text-[16px] text-[#333]">
            {questionText}
            {isStreaming && <span className="typewriter-cursor">&nbsp;</span>}
          </p>

          {options.length > 0 && (
            <InterviewChoices options={options} isAnimating={isAnimating} />
          )}

          {topic.probeQuestions && (
            <InterviewFollowups
              probeQuestions={topic.probeQuestions}
              isAnimating={isAnimating}
            />
          )}
        </div>
      </div>
    </div>
  );
}
