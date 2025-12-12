'use client';

import React from 'react';

interface InterviewChoicesProps {
  options: string[];
  isAnimating?: boolean;
}

export function InterviewChoices({ options, isAnimating = false }: InterviewChoicesProps) {
  if (options.length === 0) return null;

  return (
    <div className={`mt-4 space-y-2 ${isAnimating ? 'fade-slide-in' : ''}`}>
      {options.map((option, index) => (
        <div key={index} className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-[#d1d1d1] flex-shrink-0" />
          <span className="text-[14px] text-[#333]">{option}</span>
        </div>
      ))}
    </div>
  );
}

// Helper to parse options from question text
export function parseOptionsFromQuestion(question: string): {
  questionText: string;
  options: string[];
} {
  const optionsMatch = question.match(/\n\nOptions:\n([\s\S]+)$/i);

  if (!optionsMatch) {
    return { questionText: question, options: [] };
  }

  const questionText = question.slice(0, question.indexOf('\n\nOptions:'));
  const optionsText = optionsMatch[1];
  const options = optionsText
    .split('\n')
    .map(opt => opt.replace(/^-\s*/, '').trim())
    .filter(opt => opt.length > 0);

  return { questionText, options };
}
