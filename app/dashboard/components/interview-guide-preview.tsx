'use client';

import React, { useMemo } from 'react';
import { InterviewSectionHeader } from './interview-section-header';
import { InterviewQuestionCard } from './interview-question-card';

interface Topic {
  id: string;
  name: string;
  type: 'statement' | 'conversation' | 'question';
  content?: string;
  persona?: string;
  goals?: string;
  maxDuration?: string;
  question?: string;
  probeQuestions?: string;
  probeDepth?: string;
}

interface InterviewGuidePreviewProps {
  topics: Topic[];
  animatingIds: Set<string>;
  editingIds: Set<string>;
  typewriterText: Map<string, string>;
  isGenerating?: boolean;
  streamingText?: string;
}

interface Section {
  name: string;
  displayName: string;
  topics: Topic[];
}

// Group topics by section prefix (e.g., "Introduction: Welcome" → "Introduction")
function groupTopicsBySections(topics: Topic[]): Section[] {
  const sections: Section[] = [];
  let currentSection: Section | null = null;

  for (const topic of topics) {
    // Skip topics without required fields
    if (!topic || !topic.name || !topic.id || !topic.type) {
      console.warn('Skipping invalid topic:', topic);
      continue;
    }

    // Parse section from topic name (e.g., "Introduction: Welcome" → "Introduction")
    const colonIndex = topic.name.indexOf(':');
    const sectionName = colonIndex > 0 ? topic.name.slice(0, colonIndex).trim() : topic.name;
    const displayName = colonIndex > 0 ? topic.name.slice(colonIndex + 1).trim() : '';

    // Check if this continues the current section or starts a new one
    if (!currentSection || currentSection.name !== sectionName) {
      currentSection = { name: sectionName, displayName: sectionName, topics: [] };
      sections.push(currentSection);
    }
    currentSection.topics.push(topic);
  }

  return sections;
}

// Statement content card (for Welcome/Thank You)
function StatementCard({
  topic,
  isAnimating,
  typewriterText,
}: {
  topic: Topic;
  isAnimating: boolean;
  typewriterText?: string;
}) {
  // When typewriterText is defined (even empty string), we're in typewriter mode
  const isTypewriting = typewriterText !== undefined;
  const displayText = isTypewriting ? typewriterText : topic.content || '';

  return (
    <div
      className={`bg-[#fbfaf8] border border-[#e2e3e1] rounded-lg px-5 py-6 mb-4 transition-all duration-300 ${
        isAnimating ? 'fade-slide-in' : ''
      }`}
    >
      <p className="text-[16px] text-[#333] italic leading-relaxed min-h-[24px]">
        "{displayText}"
        {isTypewriting && <span className="typewriter-cursor">|</span>}
      </p>
    </div>
  );
}

// Loading skeleton for generating state
function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-16 rounded-lg" />
      <div className="skeleton h-32 rounded-lg" />
      <div className="skeleton h-32 rounded-lg" />
      <div className="skeleton h-16 rounded-lg" />
    </div>
  );
}

// Streaming indicator shown while generating next topic
function StreamingIndicator() {
  return (
    <div className="bg-[#fbfaf8] border border-[#e2e3e1] border-dashed rounded-lg px-5 py-6 mb-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 rounded-full border-2 border-[#2c95ff] border-t-transparent animate-spin" />
        <span className="text-[14px] text-[#999]">Generating next question...</span>
      </div>
    </div>
  );
}

export function InterviewGuidePreview({
  topics,
  animatingIds,
  editingIds,
  typewriterText,
  isGenerating = false,
  streamingText,
}: InterviewGuidePreviewProps) {
  const sections = useMemo(() => groupTopicsBySections(topics), [topics]);

  // Track question numbers across all sections
  let questionCounter = 0;
  let sectionCounter = 0;

  if (isGenerating && topics.length === 0) {
    return <LoadingSkeleton />;
  }

  if (topics.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-[#767676]">
        <p>Your interview guide will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sections.map((section, sectionIndex) => {
        sectionCounter++;

        return (
          <div key={`section-${sectionIndex}`} className="mb-6">
            {/* Section header - always show */}
            <InterviewSectionHeader
              sectionNumber={sectionCounter}
              sectionName={section.name}
              isAnimating={section.topics.some(t => animatingIds.has(t.id))}
            />

            {/* Topics in this section */}
            {section.topics.map(topic => {
              const isTopicAnimating = animatingIds.has(topic.id);
              const isTopicEditing = editingIds.has(topic.id);
              const topicTypewriterText = typewriterText.get(topic.id);

              if (topic.type === 'statement') {
                return (
                  <StatementCard
                    key={topic.id}
                    topic={topic}
                    isAnimating={isTopicAnimating}
                    typewriterText={topicTypewriterText}
                  />
                );
              }

              if (topic.type === 'question') {
                questionCounter++;
                return (
                  <InterviewQuestionCard
                    key={topic.id}
                    topic={topic}
                    questionNumber={questionCounter}
                    isAnimating={isTopicAnimating}
                    isEditing={isTopicEditing}
                    typewriterText={topicTypewriterText}
                  />
                );
              }

              // Conversation topics - render similarly to questions
              if (topic.type === 'conversation') {
                questionCounter++;
                return (
                  <div
                    key={topic.id}
                    className={`bg-[#fbfaf8] border border-[#e2e3e1] rounded-lg px-5 py-6 mb-4 ${
                      isTopicAnimating ? 'fade-slide-in' : ''
                    } ${isTopicEditing ? 'edit-highlight' : ''}`}
                  >
                    <div className="flex gap-4 items-start">
                      <span className="text-[18px] text-[#333] flex-shrink-0">💬</span>
                      <div className="flex-1">
                        <p className="text-[16px] text-[#333] font-medium mb-2">
                          {topic.name.split(':').slice(1).join(':').trim() || topic.name}
                        </p>
                        {topic.persona && (
                          <p className="text-[14px] text-[#666] mb-2">
                            <span className="font-medium">Persona:</span> {topic.persona}
                          </p>
                        )}
                        {topic.goals && (
                          <div className="text-[14px] text-[#666]">
                            <span className="font-medium">Goals:</span>
                            <ul className="list-disc list-inside mt-1">
                              {topic.goals.split('\n').map((goal, i) => (
                                <li key={i}>{goal}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {topic.maxDuration && (
                          <p className="text-[12px] text-[#999] mt-2">
                            Duration: {topic.maxDuration}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </div>
        );
      })}

      {/* Streaming indicator when more topics are being generated */}
      {isGenerating && topics.length > 0 && (
        <StreamingIndicator />
      )}
    </div>
  );
}

export default InterviewGuidePreview;
