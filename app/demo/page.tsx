'use client';

import { useState, useEffect } from 'react';

// Filter type
interface Filter {
  id: string;
  field: string;
  operator: string;
  value: string | number | [number, number];
  label: string;
}

// Agent metadata type (will be populated from extracted data)
interface AgentMetadata {
  age?: number;
  gender?: string;
  race?: string;
  hometown?: string;
  occupation?: string;
  country?: string;
  primaryApp?: string;
  learningLanguage?: string;
  learningGoal?: string;
  sentiments?: {
    overall?: string;
    streaks?: string;
    gamification?: string;
    hearts?: string;
    notifications?: string;
    pricing?: string;
    content_quality?: string;
    progression_speed?: string;
  };
  usageFrequency?: string;
  isPremiumUser?: boolean;
  personality?: string[];
  painPoints?: string[];
  valueProps?: string[];
}

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

// Import cluster data
import clusterData from '../../demo/clusters.json';

// Import agent metadata
import agentMetadataData from '../../demo/agent_metadata.json';

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
  // Metadata will be loaded separately
  metadata: {} as AgentMetadata,
}));

// Helper function to generate hexagon positions for a cluster
function generateClusterPositions(count: number): { row: number; col: number }[] {
  const positions: { row: number; col: number }[] = [];

  if (count <= 0) return positions;

  // Generate honeycomb pattern based on count
  if (count <= 2) {
    // Single row
    for (let i = 0; i < count; i++) {
      positions.push({ row: 0, col: i });
    }
  } else if (count <= 4) {
    // Two rows
    positions.push({ row: 0, col: 0 }, { row: 0, col: 1 });
    for (let i = 2; i < count; i++) {
      positions.push({ row: 1, col: i - 2 + 0.5 });
    }
  } else if (count <= 7) {
    // Honeycomb small
    const rows = [
      [0, 1],
      [0.5, 1.5, 2.5],
      [1, 2],
    ];
    let idx = 0;
    for (let r = 0; r < rows.length && idx < count; r++) {
      for (let c = 0; c < rows[r].length && idx < count; c++) {
        positions.push({ row: r, col: rows[r][c] });
        idx++;
      }
    }
  } else if (count <= 12) {
    // Honeycomb medium
    const rows = [
      [0.5, 1.5, 2.5],
      [0, 1, 2, 3],
      [0.5, 1.5, 2.5],
      [1, 2],
    ];
    let idx = 0;
    for (let r = 0; r < rows.length && idx < count; r++) {
      for (let c = 0; c < rows[r].length && idx < count; c++) {
        positions.push({ row: r, col: rows[r][c] });
        idx++;
      }
    }
  } else if (count <= 20) {
    // Honeycomb large
    const rows = [
      [1, 2, 3],
      [0.5, 1.5, 2.5, 3.5],
      [0, 1, 2, 3, 4],
      [0.5, 1.5, 2.5, 3.5],
      [1, 2, 3],
    ];
    let idx = 0;
    for (let r = 0; r < rows.length && idx < count; r++) {
      for (let c = 0; c < rows[r].length && idx < count; c++) {
        positions.push({ row: r, col: rows[r][c] });
        idx++;
      }
    }
  } else {
    // Honeycomb extra large
    const rows = [
      [1.5, 2.5, 3.5],
      [1, 2, 3, 4],
      [0.5, 1.5, 2.5, 3.5, 4.5],
      [0, 1, 2, 3, 4, 5],
      [0.5, 1.5, 2.5, 3.5, 4.5],
      [1, 2, 3, 4],
      [1.5, 2.5, 3.5],
    ];
    let idx = 0;
    for (let r = 0; r < rows.length && idx < count; r++) {
      for (let c = 0; c < rows[r].length && idx < count; c++) {
        positions.push({ row: r, col: rows[r][c] });
        idx++;
      }
    }
  }

  return positions;
}


// Function to check if an agent matches a filter
function matchesFilter(agent: typeof agentData[0], filter: Filter): boolean {
  // Get the value from the agent using the field path
  const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
    return path.split('.').reduce((acc: unknown, part) => {
      if (acc && typeof acc === 'object') {
        return (acc as Record<string, unknown>)[part];
      }
      return undefined;
    }, obj);
  };

  const agentValue = getNestedValue(agent.metadata as Record<string, unknown>, filter.field);

  if (agentValue === undefined) return false;

  switch (filter.operator) {
    case '<':
      return typeof agentValue === 'number' && agentValue < (filter.value as number);
    case '>':
      return typeof agentValue === 'number' && agentValue > (filter.value as number);
    case '<=':
      return typeof agentValue === 'number' && agentValue <= (filter.value as number);
    case '>=':
      return typeof agentValue === 'number' && agentValue >= (filter.value as number);
    case '=':
      if (typeof agentValue === 'string' && typeof filter.value === 'string') {
        return agentValue.toLowerCase() === filter.value.toLowerCase();
      }
      return agentValue === filter.value;
    case '!=':
      return agentValue !== filter.value;
    case 'contains':
      if (Array.isArray(agentValue)) {
        return agentValue.some(v =>
          typeof v === 'string' &&
          v.toLowerCase().includes((filter.value as string).toLowerCase())
        );
      }
      if (typeof agentValue === 'string') {
        return agentValue.toLowerCase().includes((filter.value as string).toLowerCase());
      }
      return false;
    case 'range':
      if (typeof agentValue === 'number' && Array.isArray(filter.value)) {
        return agentValue >= filter.value[0] && agentValue <= filter.value[1];
      }
      return false;
    default:
      return false;
  }
}

// Hexagon shape component with tooltip
function Hexagon({
  selected,
  onClick,
  name,
  summary,
  top_quotes,
  onShowTranscript,
  row,
  col,
  metadata
}: {
  selected?: boolean;
  onClick?: () => void;
  name: string;
  summary: string;
  top_quotes: string[];
  onShowTranscript: () => void;
  row: number;
  col: number;
  metadata?: AgentMetadata;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [position, setPosition] = useState<'below' | 'above' | 'left' | 'right'>('below');
  const [isShiftHeld, setIsShiftHeld] = useState(false);
  const [isHoveringTooltip, setIsHoveringTooltip] = useState(false);

  // Track shift key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftHeld(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftHeld(false);
        // Hide tooltip when shift is released if not hovering
        if (!isHoveringTooltip) {
          setShowTooltip(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isHoveringTooltip]);

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
      onMouseLeave={() => {
        if (!isShiftHeld && !isHoveringTooltip) {
          setShowTooltip(false);
        }
      }}
    >
      <svg
        width="38"
        height="38"
        viewBox="0 0 48 48"
        className={`cursor-pointer transition-all duration-300 hover:scale-110 ${
          selected ? 'drop-shadow-[0_4px_12px_rgba(249,115,22,0.4)]' : 'hover:drop-shadow-md'
        }`}
        onClick={onClick}
      >
        <polygon
          points="24,2 44,14 44,34 24,46 4,34 4,14"
          fill={selected ? '#f97316' : 'transparent'}
          stroke={selected ? '#f97316' : '#d1d5db'}
          strokeWidth="1.5"
        />
      </svg>

      {/* Tooltip */}
      {showTooltip && (
        <div
          className={`absolute z-50 w-64 p-3 bg-white rounded-lg shadow-lg border border-gray-200 pointer-events-auto ${positionClasses[position]}`}
          onMouseEnter={() => setIsHoveringTooltip(true)}
          onMouseLeave={() => {
            setIsHoveringTooltip(false);
            if (!isShiftHeld) {
              setShowTooltip(false);
            }
          }}
        >
          <p className="font-medium text-xs text-gray-900 mb-1">{name}</p>

          {/* Demographic Tags */}
          {metadata && (
            <div className="flex flex-wrap gap-1 mb-2">
              {metadata.age && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-100 text-blue-700">
                  {metadata.age} yo
                </span>
              )}
              {metadata.gender && metadata.gender.toLowerCase() !== 'unknown' && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-100 text-blue-700">
                  {metadata.gender}
                </span>
              )}
              {metadata.race && metadata.race.toLowerCase() !== 'unknown' && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-100 text-blue-700">
                  {metadata.race}
                </span>
              )}
              {metadata.hometown && metadata.hometown.toLowerCase() !== 'unknown' && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-100 text-blue-700">
                  {metadata.hometown}
                </span>
              )}
              {metadata.occupation && metadata.occupation.toLowerCase() !== 'unknown' && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-100 text-blue-700">
                  {metadata.occupation}
                </span>
              )}
              {metadata.country && metadata.country.toLowerCase() !== 'unknown' && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-100 text-blue-700">
                  {metadata.country}
                </span>
              )}
            </div>
          )}

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


// Transcript Modal Component
function TranscriptModal({
  agent,
  metadata,
  onClose
}: {
  agent: typeof agentData[0] | null;
  metadata?: AgentMetadata;
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
        <div className="p-4 border-b border-gray-100">
          <div className="flex justify-between items-start mb-3">
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

          {/* Demographics */}
          {metadata && (metadata.age || metadata.occupation || metadata.country) && (
            <div className="flex flex-wrap gap-2">
              {metadata.age && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-gray-100 text-gray-700">
                  {metadata.age} years old
                </span>
              )}
              {metadata.occupation && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700">
                  {metadata.occupation}
                </span>
              )}
              {metadata.country && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-green-50 text-green-700">
                  {metadata.country}
                </span>
              )}
              {metadata.learningLanguage && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700">
                  Learning {metadata.learningLanguage}
                </span>
              )}
              {metadata.learningGoal && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-orange-50 text-orange-700">
                  Goal: {metadata.learningGoal}
                </span>
              )}
              {metadata.primaryApp && metadata.primaryApp !== 'Duolingo' && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-red-50 text-red-700">
                  Prefers {metadata.primaryApp}
                </span>
              )}
            </div>
          )}
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
  const [selectedAgents, setSelectedAgents] = useState<Set<number>>(new Set());
  const [transcriptAgent, setTranscriptAgent] = useState<typeof agentData[0] | null>(null);
  const [activeFilters, setActiveFilters] = useState<Filter[]>([]);
  const [isFilterLoading, setIsFilterLoading] = useState(false);
  const [agentMetadata, setAgentMetadata] = useState<Record<number, AgentMetadata>>({});
  const [chatInput, setChatInput] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());

  // Load metadata on mount - match by name since IDs may differ
  useEffect(() => {
    const metadataMap: Record<number, AgentMetadata> = {};
    agentMetadataData.forEach((item: AgentMetadata & { id: number; name: string }) => {
      // Find the agent in agentData by name and use that index as the key
      const agentIndex = agentData.findIndex(a => a.name === item.name);
      if (agentIndex !== -1) {
        metadataMap[agentIndex] = item;
      }
    });
    setAgentMetadata(metadataMap);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showGroupDropdown && !(event.target as Element).closest('.group-dropdown-container')) {
        setShowGroupDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showGroupDropdown]);

  // Update agent data with metadata
  const agentsWithMetadata = agentData.map(agent => ({
    ...agent,
    metadata: agentMetadata[agent.id] || {},
  }));


  // Total agent count
  const totalAgents = agentData.length;

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

  const handleChatSend = async () => {
    if (!chatInput.trim()) return;

    const query = chatInput.trim();
    setIsFilterLoading(true);

    try {
      const response = await fetch('/api/parse-filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();

      if (data.filters && data.filters.length > 0) {
        // Add filters with unique IDs
        const newFilters = data.filters.map((f: Filter) => ({
          ...f,
          id: f.id || `${f.field}-${Date.now()}-${Math.random()}`
        }));
        setActiveFilters(prev => [...prev, ...newFilters]);
        setChatInput('');
      } else {
        // Not a valid filter - shake the input
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
      }
    } catch (error) {
      console.error('Filter error:', error);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
    } finally {
      setIsFilterLoading(false);
    }
  };

  const removeFilter = (filterId: string) => {
    setActiveFilters(prev => prev.filter(f => f.id !== filterId));
  };

  // Toggle group selection
  const toggleGroupSelection = (groupName: string) => {
    const cluster = clusterData.clusters.find(c => c.group === groupName);
    if (!cluster) return;

    const groupAgentIds = cluster.members
      .map(member => agentData.find(a => a.name === member.user_name)?.id)
      .filter((id): id is number => id !== undefined);

    setSelectedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupName)) {
        newSet.delete(groupName);
        // Remove agents from this group
        setSelectedAgents(prevAgents => {
          const newAgents = new Set(prevAgents);
          groupAgentIds.forEach(id => newAgents.delete(id));
          return newAgents;
        });
      } else {
        newSet.add(groupName);
        // Add agents from this group
        setSelectedAgents(prevAgents => {
          const newAgents = new Set(prevAgents);
          groupAgentIds.forEach(id => newAgents.add(id));
          return newAgents;
        });
      }
      return newSet;
    });
  };

  // Select all agents
  const selectAllAgents = () => {
    const allIds = agentData.map(a => a.id);
    setSelectedAgents(new Set(allIds));
    setSelectedGroups(new Set(clusterData.clusters.map(c => c.group)));
    setShowGroupDropdown(false);
  };

  // Clear all selections
  const clearAllSelections = () => {
    setSelectedAgents(new Set());
    setSelectedGroups(new Set());
    setShowGroupDropdown(false);
  };

  // Apply filters to select matching agents
  useEffect(() => {
    if (activeFilters.length === 0) {
      setSelectedAgents(new Set());
      return;
    }

    const matchingAgents = new Set<number>();
    agentsWithMetadata.forEach(agent => {
      const matchesAll = activeFilters.every(filter => matchesFilter(agent, filter));
      if (matchesAll) {
        matchingAgents.add(agent.id);
      }
    });

    setSelectedAgents(matchingAgents);
  }, [activeFilters, agentMetadata]);

  const hexSpacingX = 34;
  const hexSpacingY = 29;

  return (
    <div className="h-screen bg-white text-gray-900 flex overflow-hidden">
      {/* Left Sidebar */}
      <div className="w-16 bg-white border-r border-gray-200 flex flex-col items-center py-4 flex-shrink-0">
        {/* Logo */}
        <div className="text-sm font-bold mb-6">ipg<span style={{ color: '#11766E' }}>.</span>inc</div>

        {/* Nav icons */}
        <div className="flex flex-col gap-2">
          <button className="p-2 hover:bg-gray-100 rounded-lg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button className="p-2 bg-blue-500 text-white rounded-lg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Middle content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Breadcrumb */}
        <div className="px-6 pt-4 pb-2 text-xs text-gray-400">
          Personal Workspace <span className="mx-1">/</span> New Campaign
        </div>

        {/* Header with back button and title */}
        <div className="px-6 pb-4">
          <div className="flex items-center gap-3 mb-2">
            <button className="p-2 hover:bg-gray-100 rounded-lg">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl font-semibold">Improve Duolingo retention and engagement</h1>
          </div>
          <div className="flex items-center gap-6 text-xs text-gray-500 ml-11">
            <span><span className="font-medium">Date:</span> 11/22/25</span>
            <span><span className="font-medium">Accuracy:</span> 82%</span>
            <span><span className="font-medium">N=</span> {totalAgents}</span>
          </div>
        </div>

        {/* Clusters section */}
        <div className="flex-1 px-6 py-4 overflow-hidden">
            {/* Cluster grid - 2 top, 3 bottom layout */}
            <div className="flex flex-col gap-8">
              {/* Top row - 2 clusters (A, B) */}
              <div className="flex justify-around items-end">
                {clusterData.clusters.slice(0, 2).map((cluster) => {
                  const positions = generateClusterPositions(cluster.count);
                  const maxCol = Math.max(...positions.map(p => p.col), 0);
                  const maxRow = Math.max(...positions.map(p => p.row), 0);
                  const clusterWidth = (maxCol + 1) * hexSpacingX + 38;
                  const clusterHeight = (maxRow + 1) * hexSpacingY + 38;

                  return (
                    <div key={cluster.group} className="flex flex-col items-center">
                      {/* Hexagon cluster */}
                      <div className="relative" style={{ width: clusterWidth, height: clusterHeight }}>
                        {cluster.members.map((member, idx) => {
                          const pos = positions[idx];
                          if (!pos) return null;

                          const agent = agentData.find(a => a.name === member.user_name);
                          if (!agent) return null;

                          return (
                            <div
                              key={member.user_name}
                              className="absolute"
                              style={{
                                left: `${pos.col * hexSpacingX}px`,
                                top: `${pos.row * hexSpacingY}px`,
                              }}
                            >
                              <Hexagon
                                selected={selectedAgents.has(agent.id)}
                                onClick={() => toggleAgent(agent.id)}
                                name={agent.name}
                                summary={agent.summary}
                                top_quotes={agent.top_quotes}
                                onShowTranscript={() => setTranscriptAgent(agent)}
                                row={pos.row}
                                col={pos.col}
                                metadata={agentMetadata[agent.id]}
                              />
                            </div>
                          );
                        })}
                      </div>

                      {/* Cluster label */}
                      <div className="text-center mt-2">
                        <p className="text-sm font-semibold text-gray-900">
                          Group {cluster.group} ({cluster.percentage}%)
                        </p>
                        <p className="text-xs text-gray-500 italic max-w-[160px]">
                          &ldquo;{cluster.quote}&rdquo;
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom row - 3 clusters (C, D, E) */}
              <div className="flex justify-around items-start">
                {clusterData.clusters.slice(2).map((cluster) => {
                  const positions = generateClusterPositions(cluster.count);
                  const maxCol = Math.max(...positions.map(p => p.col), 0);
                  const maxRow = Math.max(...positions.map(p => p.row), 0);
                  const clusterWidth = (maxCol + 1) * hexSpacingX + 38;
                  const clusterHeight = (maxRow + 1) * hexSpacingY + 38;

                  return (
                    <div key={cluster.group} className="flex flex-col items-center">
                      {/* Hexagon cluster */}
                      <div className="relative" style={{ width: clusterWidth, height: clusterHeight }}>
                        {cluster.members.map((member, idx) => {
                          const pos = positions[idx];
                          if (!pos) return null;

                          const agent = agentData.find(a => a.name === member.user_name);
                          if (!agent) return null;

                          return (
                            <div
                              key={member.user_name}
                              className="absolute"
                              style={{
                                left: `${pos.col * hexSpacingX}px`,
                                top: `${pos.row * hexSpacingY}px`,
                              }}
                            >
                              <Hexagon
                                selected={selectedAgents.has(agent.id)}
                                onClick={() => toggleAgent(agent.id)}
                                name={agent.name}
                                summary={agent.summary}
                                top_quotes={agent.top_quotes}
                                onShowTranscript={() => setTranscriptAgent(agent)}
                                row={pos.row}
                                col={pos.col}
                                metadata={agentMetadata[agent.id]}
                              />
                            </div>
                          );
                        })}
                      </div>

                      {/* Cluster label */}
                      <div className="text-center mt-2">
                        <p className="text-sm font-semibold text-gray-900">
                          Group {cluster.group} ({cluster.percentage}%)
                        </p>
                        <p className="text-xs text-gray-500 italic max-w-[160px]">
                          &ldquo;{cluster.quote}&rdquo;
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom chat section */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              {/* You are talking to */}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-sm text-gray-700">You are talking to:</span>
                <div className="relative group-dropdown-container">
                  <button
                    onClick={() => setShowGroupDropdown(!showGroupDropdown)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors"
                  >
                    {selectedAgents.size === 0
                      ? `All users (N=${totalAgents})`
                      : `${selectedAgents.size} selected (N=${selectedAgents.size})`}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  {/* Group selection dropdown */}
                  {showGroupDropdown && (
                    <div className="absolute bottom-full mb-2 left-0 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                      {/* All users option */}
                      <button
                        onClick={selectAllAgents}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                          selectedAgents.size === totalAgents ? 'bg-gray-100 font-medium' : ''
                        }`}
                      >
                        All users
                      </button>

                      <div className="border-t border-gray-100 my-1"></div>

                      {/* Group options */}
                      {clusterData.clusters.map((cluster) => (
                        <button
                          key={cluster.group}
                          onClick={() => toggleGroupSelection(cluster.group)}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                            selectedGroups.has(cluster.group) ? 'bg-gray-100 font-medium' : ''
                          }`}
                        >
                          Group {cluster.group}
                        </button>
                      ))}

                      <div className="border-t border-gray-100 my-1"></div>

                      {/* Clear option */}
                      <button
                        onClick={clearAllSelections}
                        className="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                      >
                        Clear selection
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Chat input */}
              <div
                className={`flex items-center gap-3 bg-gray-100 rounded-xl px-4 py-3 transition-all ${
                  isShaking
                    ? 'animate-shake shadow-[0_0_15px_rgba(239,68,68,0.5)] border-2 border-red-400'
                    : ''
                }`}
                style={{
                  animation: isShaking ? 'shake 0.5s ease-in-out' : 'none'
                }}
              >
                <button className="p-1 hover:bg-gray-200 rounded">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                  placeholder="Filter or ask anything to the selected agents..."
                  className="flex-1 bg-transparent border-0 text-sm placeholder-gray-400 focus:outline-none"
                />
                <button className="p-1 hover:bg-gray-200 rounded">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </button>
              </div>

              {/* Shake animation styles */}
              <style jsx>{`
                @keyframes shake {
                  0%, 100% { transform: translateX(0); }
                  10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
                  20%, 40%, 60%, 80% { transform: translateX(5px); }
                }
              `}</style>
            </div>
          </div>
        </div>

      {/* Right sidebar - Summary (full height) */}
      <div className="w-80 border-l border-gray-200 p-6 bg-gray-50 flex-shrink-0 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Summary</h2>
          <span className="text-xs text-gray-500">
            {selectedAgents.size === 0
              ? `All users (N=${totalAgents})`
              : `${selectedAgents.size} selected (N=${selectedAgents.size})`}
          </span>
        </div>

        {/* Active filters */}
        {activeFilters.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {activeFilters.map((filter) => (
              <span
                key={filter.id}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800"
              >
                {filter.label}
                <button
                  onClick={() => removeFilter(filter.id)}
                  className="ml-0.5 hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Placeholder boxes for summary content */}
        <div className="space-y-4">
          <div className="bg-gray-200 rounded-lg h-32"></div>
          <div className="bg-gray-200 rounded-lg h-32"></div>
          <div className="bg-gray-200 rounded-lg h-32"></div>
          <div className="bg-gray-200 rounded-lg h-32"></div>
        </div>
      </div>

      {/* Transcript Modal */}
      <TranscriptModal
        agent={transcriptAgent}
        metadata={transcriptAgent ? agentMetadata[transcriptAgent.id] : undefined}
        onClose={() => setTranscriptAgent(null)}
      />
    </div>
  );
}
