'use client';

import React from 'react';

interface InterviewSectionHeaderProps {
  sectionNumber: number;
  sectionName: string;
  isAnimating?: boolean;
}

export function InterviewSectionHeader({
  sectionNumber,
  sectionName,
  isAnimating = false,
}: InterviewSectionHeaderProps) {
  return (
    <div
      className={`bg-[#fbfaf8] border border-[#e2e3e1] rounded-lg p-5 mb-4 ${
        isAnimating ? 'fade-slide-in' : ''
      }`}
    >
      <span className="font-bold text-[18px] text-black">SECTION {sectionNumber}</span>
      <span className="text-[#767676] text-[14px] ml-2 uppercase">{sectionName}</span>
    </div>
  );
}
