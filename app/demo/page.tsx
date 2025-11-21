'use client';

import { useState } from 'react';

// Import all interview data
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
import marcusData from '../../demo/transcripts/marcus_interview.json';
import sofiaData from '../../demo/transcripts/sofia_interview.json';
import kenjiData from '../../demo/transcripts/kenji_interview.json';
import priyaData from '../../demo/transcripts/priya_interview.json';
import dmitriData from '../../demo/transcripts/dmitri_interview.json';
import aaliyahData from '../../demo/transcripts/aaliyah_interview.json';
import chenWeiData from '../../demo/transcripts/chen wei_interview.json';
import mariaData from '../../demo/transcripts/maria_interview.json';
import tyroneData from '../../demo/transcripts/tyrone_interview.json';
import ingridData from '../../demo/transcripts/ingrid_interview.json';
import carlosData from '../../demo/transcripts/carlos_interview.json';
import fatimaData from '../../demo/transcripts/fatima_interview.json';
import trevorData from '../../demo/transcripts/trevor_interview.json';
import yukiData from '../../demo/transcripts/yuki_interview.json';
import deshawnData from '../../demo/transcripts/deshawn_interview.json';
import anyaData from '../../demo/transcripts/anya_interview.json';
import mohammedData from '../../demo/transcripts/mohammed_interview.json';
import luciaData from '../../demo/transcripts/lucia_interview.json';
import brandonData from '../../demo/transcripts/brandon_interview.json';
import amaraData from '../../demo/transcripts/amara_interview.json';
import viktorData from '../../demo/transcripts/viktor_interview.json';
import jasmineData from '../../demo/transcripts/jasmine_interview.json';
import omarData from '../../demo/transcripts/omar_interview.json';
import siennaData from '../../demo/transcripts/sienna_interview.json';
import kwameData from '../../demo/transcripts/kwame_interview.json';
import elenaData from '../../demo/transcripts/elena_interview.json';
import rashidData from '../../demo/transcripts/rashid_interview.json';
import destinyData from '../../demo/transcripts/destiny_interview.json';
import hansData from '../../demo/transcripts/hans_interview.json';
import meiLinData from '../../demo/transcripts/mei lin_interview.json';
import jamalData from '../../demo/transcripts/jamal_interview.json';
import katyaData from '../../demo/transcripts/katya_interview.json';
import obinnaData from '../../demo/transcripts/obinna_interview.json';
import guadalupeData from '../../demo/transcripts/guadalupe_interview.json';
import finnData from '../../demo/transcripts/finn_interview.json';
import aishaData from '../../demo/transcripts/aisha_interview.json';
import darnellData from '../../demo/transcripts/darnell_interview.json';
import nadiaData from '../../demo/transcripts/nadia_interview.json';
import tomaszData from '../../demo/transcripts/tomasz_interview.json';
import blessingData from '../../demo/transcripts/blessing_interview.json';
import svenData from '../../demo/transcripts/sven_interview.json';
import laylaData from '../../demo/transcripts/layla_interview.json';
import kofiData from '../../demo/transcripts/kofi_interview.json';
import valentinaData from '../../demo/transcripts/valentina_interview.json';
import rajeshData from '../../demo/transcripts/rajesh_interview.json';
import zaraData from '../../demo/transcripts/zara_interview.json';
import emmanuelData from '../../demo/transcripts/emmanuel_interview.json';
import olgaData from '../../demo/transcripts/olga_interview.json';
import danteData from '../../demo/transcripts/dante_interview.json';
import ameliaData from '../../demo/transcripts/amelia_interview.json';
import tariqData from '../../demo/transcripts/tariq_interview.json';

// All interview data
const allInterviewData = [
  adrianData, aidenData, ethanData, jasonData, jordanData, lenaData, leoData, mayaData, rileyData, riyaData,
  marcusData, sofiaData, kenjiData, priyaData, dmitriData, aaliyahData, chenWeiData, mariaData, tyroneData, ingridData,
  carlosData, fatimaData, trevorData, yukiData, deshawnData, anyaData, mohammedData, luciaData, brandonData, amaraData,
  viktorData, jasmineData, omarData, siennaData, kwameData, elenaData, rashidData, destinyData, hansData, meiLinData,
  jamalData, katyaData, obinnaData, guadalupeData, finnData, aishaData, darnellData, nadiaData, tomaszData, blessingData,
  svenData, laylaData, kofiData, valentinaData, rajeshData, zaraData, emmanuelData, olgaData, danteData, ameliaData, tariqData,
];

// Create agent data from all interviews
const agentData = allInterviewData.map((data, i) => ({
  id: i,
  name: data.user_name,
  summary: data.summary,
  top_quotes: data.top_quotes,
  interview_script: data.interview_script,
}));

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
        width="48"
        height="48"
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
    { text: 'What type of customers do you want to talk to? I\'ll automatically filter the agents for you.', isUser: false },
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

  // Agent positions in a symmetrical hexagon shape (61 hexagons)
  const agentPositions: { id: number; row: number; col: number }[] = [];
  let id = 0;

  // Hexagonal shape pattern
  const rowConfigs = [
    { count: 5, startCol: 2 },     // Row 0
    { count: 6, startCol: 1.5 },   // Row 1
    { count: 7, startCol: 1 },     // Row 2
    { count: 8, startCol: 0.5 },   // Row 3
    { count: 9, startCol: 0 },     // Row 4 (center)
    { count: 8, startCol: 0.5 },   // Row 5
    { count: 7, startCol: 1 },     // Row 6
    { count: 6, startCol: 1.5 },   // Row 7
    { count: 5, startCol: 2 },     // Row 8
  ];

  rowConfigs.forEach((config, row) => {
    for (let i = 0; i < config.count; i++) {
      agentPositions.push({
        id: id++,
        row,
        col: config.startCol + i,
      });
    }
  });

  const hexSpacingX = 50;
  const hexSpacingY = 42;

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
            <div style={{ width: '500px', height: '430px' }} />
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
          <div className="flex gap-2 items-end">
            <textarea
              value={filterInput}
              onChange={(e) => {
                setFilterInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleFilterSend();
                }
              }}
              placeholder="Filter by..."
              rows={1}
              className="flex-1 bg-gray-50 border-0 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none overflow-hidden"
              style={{ minHeight: '36px' }}
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
