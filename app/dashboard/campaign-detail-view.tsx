'use client';

import { useState } from 'react';

interface Campaign {
  id: string;
  name: string;
  title: string;
  caption: string;
  time_estimate: string;
  topics: any[];
  completion_logic: any;
  created_at: string;
  updated_at: string;
  workspace: string;
  workspace_id: string;
}

interface InsightCard {
  id: string;
  title: string;
  summary: string;
  matchedUsers: number;
  prevalence: 'High' | 'Medium' | 'Low';
  confidence: number;
  hexagonCount: number;
}

interface CampaignDetailViewProps {
  campaign: Campaign;
  workspaceName: string;
  onBack: () => void;
  onEdit: () => void;
}

// Demo insights data
const demoInsights: InsightCard[] = [
  {
    id: '1',
    title: 'Repetition Fatigue',
    summary: 'Users describe lessons as repetitive after Day 3.',
    matchedUsers: 6128,
    prevalence: 'High',
    confidence: 0.82,
    hexagonCount: 26,
  },
  {
    id: '2',
    title: 'Onboarding Cognitive Overload',
    summary: 'Users describe lessons as repetitive after Day 3.',
    matchedUsers: 6128,
    prevalence: 'High',
    confidence: 0.82,
    hexagonCount: 16,
  },
  {
    id: '3',
    title: 'Motivation Dependence on Gamification',
    summary: 'Users describe lessons as repetitive after Day 3.',
    matchedUsers: 6128,
    prevalence: 'High',
    confidence: 0.82,
    hexagonCount: 11,
  },
  {
    id: '4',
    title: 'Low Perceived Value',
    summary: 'Users describe lessons as repetitive after Day 3.',
    matchedUsers: 6128,
    prevalence: 'High',
    confidence: 0.82,
    hexagonCount: 5,
  },
];

// Hexagon cluster component
function HexagonCluster({ count, color = '#4A4A4A' }: { count: number; color?: string }) {
  // Generate honeycomb-pattern positions
  const generateHexPositions = (count: number) => {
    const positions: { x: number; y: number }[] = [];
    const size = 24;
    const horizontalSpacing = size * 0.85;
    const verticalSpacing = size * 0.75;

    // Start from center and spiral out
    const centerX = 180;
    const centerY = 100;

    // Create a honeycomb pattern
    let added = 0;
    let ring = 0;

    while (added < count) {
      if (ring === 0) {
        positions.push({ x: centerX, y: centerY });
        added++;
      } else {
        // Calculate positions around the ring
        const startAngle = Math.PI / 6;
        for (let side = 0; side < 6 && added < count; side++) {
          for (let pos = 0; pos < ring && added < count; pos++) {
            const angle = startAngle + (side * Math.PI / 3);
            const nextAngle = startAngle + ((side + 1) * Math.PI / 3);

            const t = pos / ring;
            const x = centerX +
              ring * horizontalSpacing * Math.cos(angle) * (1 - t) +
              ring * horizontalSpacing * Math.cos(nextAngle) * t;
            const y = centerY +
              ring * verticalSpacing * Math.sin(angle) * (1 - t) +
              ring * verticalSpacing * Math.sin(nextAngle) * t;

            positions.push({ x, y });
            added++;
          }
        }
      }
      ring++;
    }

    return positions.slice(0, count);
  };

  const positions = generateHexPositions(count);

  return (
    <svg viewBox="0 0 360 180" className="w-full h-32">
      {positions.map((pos, i) => (
        <circle
          key={i}
          cx={pos.x}
          cy={pos.y}
          r={10}
          fill={color}
          opacity={0.85}
        />
      ))}
    </svg>
  );
}

// Insight card component
function InsightCardComponent({ insight, onClick }: { insight: InsightCard; onClick?: () => void }) {
  return (
    <div
      className="bg-white border border-gray-200 rounded-2xl p-5 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-xl font-semibold text-blue-500">{insight.title}</h3>
        <button className="text-black text-xl">
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
          </svg>
        </button>
      </div>

      {/* Hexagon Cluster */}
      <div className="my-4">
        <HexagonCluster count={insight.hexagonCount} />
      </div>

      {/* Summary */}
      <p className="text-sm text-gray-900 mb-3">{insight.summary}</p>

      {/* Stats row */}
      <div className="flex gap-8 text-xs">
        <div>
          <span className="font-semibold text-gray-900">Matched Users: </span>
          <span className="text-gray-500">{insight.matchedUsers.toLocaleString()}</span>
        </div>
        <div>
          <span className="font-semibold text-gray-900">Prevalence: </span>
          <span className="text-gray-500">{insight.prevalence}</span>
        </div>
        <div>
          <span className="font-semibold text-gray-900">Confidence: </span>
          <span className="text-gray-500">{insight.confidence}</span>
        </div>
      </div>
    </div>
  );
}

export default function CampaignDetailView({
  campaign,
  workspaceName,
  onBack,
  onEdit
}: CampaignDetailViewProps) {
  const [chatInput, setChatInput] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('All Users');

  // Demo stats
  const stats = {
    date: new Date(campaign.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }),
    timeSpent: '1hr 2m',
    accuracy: '73%',
    sampleSize: 12483,
  };

  return (
    <div className="flex h-full bg-gray-100">
      {/* Left Panel - Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {/* Back button */}
            <button
              onClick={onBack}
              className="w-8 h-5 bg-gray-200 rounded flex items-center justify-center hover:bg-gray-300 transition-colors"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Breadcrumb */}
            <div className="flex items-center gap-4 text-xs font-semibold text-gray-400">
              <span>{workspaceName}</span>
              <span>/</span>
              <span>Simulated Agents</span>
              <span>/</span>
              <span className="text-gray-600">{campaign.name}</span>
            </div>
          </div>
        </div>

        {/* Horizontal line */}
        <div className="mx-6 border-t border-gray-300" />

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-10 py-6">
          {/* Title */}
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {campaign.title}
          </h1>

          {/* Stats row */}
          <div className="flex items-center gap-5 text-xs text-gray-600 mb-8">
            <span>
              <span className="font-semibold">Date: </span>
              <span className="font-light">{stats.date}</span>
            </span>
            <span>
              <span className="font-semibold">Time spent querying: </span>
              <span className="font-light">{stats.timeSpent}</span>
            </span>
            <span>
              <span className="font-semibold">Accuracy: </span>
              <span className="font-normal">{stats.accuracy}</span>
            </span>
            <span>
              <span className="font-semibold">N= </span>
              <span className="font-normal">{stats.sampleSize.toLocaleString()}</span>
            </span>
          </div>

          {/* Insight Cards Grid */}
          <div className="grid grid-cols-2 gap-7">
            {demoInsights.map((insight) => (
              <InsightCardComponent
                key={insight.id}
                insight={insight}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Conversation Agent */}
      <div className="w-[400px] bg-white border-l-2 border-gray-300 flex flex-col">
        {/* Agent Header */}
        <div className="flex-1 flex flex-col items-center justify-center border-b border-gray-200">
          <p className="text-3xl font-serif text-gray-900 text-center">IPG</p>
          <h2 className="text-3xl font-bold text-gray-900 mt-1">Conversation Agent</h2>
        </div>

        {/* Filter Bar */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-gray-900">Talking to:</span>
            <button className="flex items-center gap-1 px-2 py-1.5 border border-blue-500 rounded text-blue-500 text-sm">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 4h18v2H3V4zm0 7h12v2H3v-2zm0 7h18v2H3v-2z"/>
              </svg>
              <span className="font-semibold text-xs">{selectedFilter}</span>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 10l5 5 5-5z"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Chat Input */}
        <div className="p-4">
          <div className="bg-gray-200 rounded-full flex items-center px-4 py-3">
            <button className="text-gray-500 mr-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask anything..."
              className="flex-1 bg-transparent text-gray-500 placeholder-gray-500 outline-none text-base"
            />
            <button className="text-gray-900 ml-3">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
