'use client';

import { useState } from 'react';

// Import interview data
import adrianData from '../../demo/transcripts/adrian_interview.json';
import aidenData from '../../demo/transcripts/aiden_interview.json';
import ethanData from '../../demo/transcripts/ethan_interview.json';
import jasonData from '../../demo/transcripts/jason_interview.json';
import jordanData from '../../demo/transcripts/jordan_interview.json';
import lenaData from '../../demo/transcripts/lena_interview.json';
import leoData from '../../demo/transcripts/leo_interview.json';
import mayaData from '../../demo/transcripts/maya_interview.json';
import rileyData from '../../demo/transcripts/riley_interview.json';
import riyaData from '../../demo/transcripts/riya_interview.json';

// Agent data with summaries and quotes from interview files
const agentData = [
  {
    id: 0,
    name: adrianData.user_name,
    summary: adrianData.summary,
    top_quotes: adrianData.top_quotes,
    interview_script: adrianData.interview_script,
  },
  {
    id: 1,
    name: aidenData.user_name,
    summary: aidenData.summary,
    top_quotes: aidenData.top_quotes,
    interview_script: aidenData.interview_script,
  },
  {
    id: 2,
    name: ethanData.user_name,
    summary: ethanData.summary,
    top_quotes: ethanData.top_quotes,
    interview_script: ethanData.interview_script,
  },
  {
    id: 3,
    name: jasonData.user_name,
    summary: jasonData.summary,
    top_quotes: jasonData.top_quotes,
    interview_script: jasonData.interview_script,
  },
  {
    id: 4,
    name: jordanData.user_name,
    summary: jordanData.summary,
    top_quotes: jordanData.top_quotes,
    interview_script: jordanData.interview_script,
  },
  {
    id: 5,
    name: lenaData.user_name,
    summary: lenaData.summary,
    top_quotes: lenaData.top_quotes,
    interview_script: lenaData.interview_script,
  },
  {
    id: 6,
    name: leoData.user_name,
    summary: leoData.summary,
    top_quotes: leoData.top_quotes,
    interview_script: leoData.interview_script,
  },
  {
    id: 7,
    name: mayaData.user_name,
    summary: mayaData.summary,
    top_quotes: mayaData.top_quotes,
    interview_script: mayaData.interview_script,
  },
  {
    id: 8,
    name: rileyData.user_name,
    summary: rileyData.summary,
    top_quotes: rileyData.top_quotes,
    interview_script: rileyData.interview_script,
  },
  {
    id: 9,
    name: riyaData.user_name,
    summary: riyaData.summary,
    top_quotes: riyaData.top_quotes,
    interview_script: riyaData.interview_script,
  },
];

// Hexagon shape component with tooltip
function Hexagon({
  selected,
  onClick,
  name,
  summary,
  top_quotes,
  onShowTranscript,
  row,
  col
}: {
  selected?: boolean;
  onClick?: () => void;
  name: string;
  summary: string;
  top_quotes: string[];
  onShowTranscript: () => void;
  row: number;
  col: number;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [position, setPosition] = useState<'below' | 'above' | 'left' | 'right'>('below');

  // Calculate best position based on available space
  const calculatePosition = (element: HTMLDivElement) => {
    const rect = element.getBoundingClientRect();
    const tooltipHeight = 280; // Approximate tooltip height
    const tooltipWidth = 256; // w-64 = 256px
    const margin = 16;

    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceLeft = rect.left;
    const spaceRight = window.innerWidth - rect.right;

    // Check vertical positions first
    if (spaceBelow >= tooltipHeight + margin) {
      setPosition('below');
    } else if (spaceAbove >= tooltipHeight + margin) {
      setPosition('above');
    } else if (spaceRight >= tooltipWidth + margin) {
      setPosition('right');
    } else if (spaceLeft >= tooltipWidth + margin) {
      setPosition('left');
    } else {
      // Default to below if nothing fits well
      setPosition('below');
    }
  };

  const positionClasses = {
    below: 'top-full mt-2 left-1/2 -translate-x-1/2',
    above: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
  };

  return (
    <div
      className="relative"
      onMouseEnter={(e) => {
        calculatePosition(e.currentTarget);
        setShowTooltip(true);
      }}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <svg
        width="80"
        height="80"
        viewBox="0 0 48 48"
        className={`cursor-pointer transition-all duration-300 hover:scale-110 ${
          selected ? 'drop-shadow-[0_4px_12px_rgba(249,115,22,0.4)]' : 'hover:drop-shadow-md'
        }`}
        onClick={onClick}
      >
        <polygon
          points="24,2 44,14 44,34 24,46 4,34 4,14"
          fill={selected ? '#f97316' : 'transparent'}
          stroke={selected ? '#f97316' : '#e5e7eb'}
          strokeWidth="1.5"
        />
      </svg>

      {/* Tooltip */}
      {showTooltip && (
        <div className={`absolute z-50 w-64 p-3 bg-white rounded-lg shadow-lg border border-gray-200 pointer-events-auto ${positionClasses[position]}`}>
          <p className="font-medium text-xs text-gray-900 mb-1">{name}</p>
          <p className="text-[10px] text-gray-500 mb-2 leading-relaxed">{summary}</p>

          {/* Top Quotes */}
          <div className="space-y-1.5 mb-2">
            {top_quotes.map((quote, idx) => (
              <div key={idx} className="flex gap-1">
                <span className="text-orange-500 text-[10px] mt-0.5">&ldquo;</span>
                <p className="text-[10px] text-gray-700 leading-relaxed italic flex-1">{quote}</p>
              </div>
            ))}
          </div>

          {/* Show Full Transcript Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShowTranscript();
            }}
            className="w-full text-[10px] text-center py-1 px-2 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 transition-colors"
          >
            Show full transcript
          </button>

          {/* Arrow */}
          {position === 'below' && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-[-1px]">
              <div className="border-6 border-transparent border-b-white"></div>
            </div>
          )}
          {position === 'above' && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
              <div className="border-6 border-transparent border-t-white"></div>
            </div>
          )}
          {position === 'left' && (
            <div className="absolute left-full top-1/2 -translate-y-1/2 -ml-px">
              <div className="border-6 border-transparent border-l-white"></div>
            </div>
          )}
          {position === 'right' && (
            <div className="absolute right-full top-1/2 -translate-y-1/2 -mr-px">
              <div className="border-6 border-transparent border-r-white"></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Chat message component
function ChatMessage({ message, isUser }: { message: string; isUser: boolean }) {
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[85%] px-3 py-2 rounded-xl text-xs ${
          isUser
            ? 'bg-black text-white'
            : 'bg-gray-100 text-gray-600'
        }`}
      >
        {message}
      </div>
    </div>
  );
}

// Transcript Modal Component
function TranscriptModal({
  agent,
  onClose
}: {
  agent: typeof agentData[0] | null;
  onClose: () => void;
}) {
  if (!agent) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-medium text-gray-900">{agent.name}&apos;s Interview</h2>
            <p className="text-xs text-gray-500">{agent.summary}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Transcript */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {agent.interview_script.map((item, idx) => (
            <div key={idx} className="space-y-1">
              <p className="text-xs font-medium text-gray-500">{item.question}</p>
              <p className="text-sm text-gray-700 leading-relaxed">{item.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DemoPage() {
  const [selectedAgents, setSelectedAgents] = useState<Set<number>>(new Set([1, 5]));
  const [transcriptAgent, setTranscriptAgent] = useState<typeof agentData[0] | null>(null);

  // Filter chat state
  const [filterMessages, setFilterMessages] = useState<Array<{ text: string; isUser: boolean }>>([
    { text: 'How can I help you filter the agents?', isUser: false },
  ]);
  const [filterInput, setFilterInput] = useState('');

  // Collective memory chat state
  const [memoryMessages, setMemoryMessages] = useState<Array<{ text: string; isUser: boolean }>>([
    { text: 'Ask me anything about the selected agents\' collective insights.', isUser: false },
  ]);
  const [memoryInput, setMemoryInput] = useState('');

  const toggleAgent = (id: number) => {
    setSelectedAgents((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleFilterSend = () => {
    if (!filterInput.trim()) return;
    setFilterMessages((prev) => [
      ...prev,
      { text: filterInput, isUser: true },
      { text: 'I\'ll help you filter based on that criteria.', isUser: false },
    ]);
    setFilterInput('');
  };

  const handleMemorySend = () => {
    if (!memoryInput.trim()) return;
    setMemoryMessages((prev) => [
      ...prev,
      { text: memoryInput, isUser: true },
      { text: 'Based on the collective memory of the selected agents...', isUser: false },
    ]);
    setMemoryInput('');
  };

  // Agent positions in a cluster formation
  const agentPositions = [
    { id: 0, row: 0, col: 1 },
    { id: 1, row: 0, col: 2 },
    { id: 2, row: 0, col: 3 },
    { id: 3, row: 1, col: 0.5 },
    { id: 4, row: 1, col: 1.5 },
    { id: 5, row: 1, col: 2.5 },
    { id: 6, row: 1, col: 3.5 },
    { id: 7, row: 2, col: 1 },
    { id: 8, row: 2, col: 2 },
    { id: 9, row: 2, col: 3 },
  ];

  const hexSpacingX = 82;
  const hexSpacingY = 70;

  return (
    <div className="h-screen bg-gray-50 text-gray-900 p-4 md:p-6 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="mb-4 flex-shrink-0">
        <h1 className="text-xl md:text-2xl font-light tracking-tight">
          ipg<span style={{ color: '#11766E' }}>.</span>inc
          <span className="text-gray-300 mx-2">×</span>
          <span className="text-green-500 font-normal">Duolingo</span>
        </h1>
      </header>

      {/* Main content area */}
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* Left section - Agent cluster */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center justify-center">
          <div className="relative">
            {agentPositions.map((pos) => {
              const agent = agentData.find((a) => a.id === pos.id)!;
              return (
                <div
                  key={pos.id}
                  className="absolute"
                  style={{
                    left: `${pos.col * hexSpacingX}px`,
                    top: `${pos.row * hexSpacingY}px`,
                  }}
                >
                  <Hexagon
                    selected={selectedAgents.has(pos.id)}
                    onClick={() => toggleAgent(pos.id)}
                    name={agent.name}
                    summary={agent.summary}
                    top_quotes={agent.top_quotes}
                    onShowTranscript={() => setTranscriptAgent(agent)}
                    row={pos.row}
                    col={pos.col}
                  />
                </div>
              );
            })}
            {/* Spacer to maintain container size */}
            <div style={{ width: '400px', height: '290px' }} />
          </div>
        </div>

        {/* Right section - Filter chatbot */}
        <div className="w-full lg:w-72 bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col">
          <h2 className="text-sm font-medium mb-3 text-gray-500 uppercase tracking-wider">Filter</h2>

          {/* Chat messages area */}
          <div className="flex-1 overflow-y-auto mb-3">
            {filterMessages.map((msg, idx) => (
              <ChatMessage key={idx} message={msg.text} isUser={msg.isUser} />
            ))}
          </div>

          {/* Chat input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={filterInput}
              onChange={(e) => setFilterInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFilterSend()}
              placeholder="Filter by..."
              className="flex-1 bg-gray-50 border-0 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
            <button
              onClick={handleFilterSend}
              className="px-3 py-2 bg-black text-white rounded-lg text-xs hover:bg-gray-800 transition-colors"
            >
              Send
            </button>
          </div>

          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              <span className="text-gray-600 font-medium">{selectedAgents.size}</span> agents selected
            </p>
          </div>
        </div>
      </div>

      {/* Bottom section - Chat with collective memory */}
      <div className="mt-4 bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex-shrink-0">
        <h3 className="text-xs text-gray-400 mb-3 uppercase tracking-wider font-medium">
          Chat with Collective Memory
        </h3>

        {/* Chat messages area */}
        <div className="overflow-y-auto mb-3 h-24 rounded-lg p-3 bg-gray-50">
          {memoryMessages.map((msg, idx) => (
            <ChatMessage key={idx} message={msg.text} isUser={msg.isUser} />
          ))}
        </div>

        {/* Chat input */}
        <div className="flex gap-3">
          <input
            type="text"
            value={memoryInput}
            onChange={(e) => setMemoryInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleMemorySend()}
            placeholder="Ask something about the selected agents..."
            className="flex-1 bg-gray-50 border-0 rounded-lg px-4 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200"
          />
          <button
            onClick={handleMemorySend}
            className="px-5 py-2.5 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Ask
          </button>
        </div>
      </div>

      {/* Transcript Modal */}
      <TranscriptModal
        agent={transcriptAgent}
        onClose={() => setTranscriptAgent(null)}
      />
    </div>
  );
}
