'use client';

import React from 'react';

interface InterviewFollowupsProps {
  probeQuestions: string;
  isAnimating?: boolean;
  typewriterText?: string;
}

export function InterviewFollowups({
  probeQuestions,
  isAnimating = false,
  typewriterText,
}: InterviewFollowupsProps) {
  // Split by newlines to get individual follow-ups
  const followups = (typewriterText || probeQuestions)
    .split('\n')
    .filter(q => q.trim().length > 0);

  if (followups.length === 0) return null;

  return (
    <div className={`mt-4 ml-2 ${isAnimating ? 'fade-slide-in' : ''}`}>
      <span className="text-[10px] font-bold text-[#2c95ff] tracking-wider">
        FOLLOW UP QUESTIONS
      </span>
      <div className="mt-2 space-y-2">
        {followups.map((followup, index) => (
          <div key={index} className="flex items-start gap-3">
            <div className="w-0.5 min-h-[16px] h-full bg-[#2c95ff] mt-1 flex-shrink-0" />
            <span className={`text-[14px] text-[#333] ${isAnimating ? 'typewriter-cursor' : ''}`}>
              {followup}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
