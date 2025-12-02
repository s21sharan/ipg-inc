'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

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
  quote?: string;
  matchedUsers: number;
  prevalence: 'High' | 'Medium' | 'Low';
  confidence: number;
  members?: Array<{ conversation_id: string; participant_name: string }>;
}

interface ClusterData {
  status: 'none' | 'processing' | 'completed';
  processing_status?: string;
  dimension?: string;
  dimension_rationale?: string;
  conversations_analyzed?: number;
  clusters?: InsightCard[];
}

interface CampaignDetailViewProps {
  campaign: Campaign;
  workspaceName: string;
  onBack: () => void;
  onEdit: () => void;
}

// Dot cluster component - randomly dispersed dots representing matched users
// Animates to organized grid on hover
function DotCluster({ count, color = '#4A4A4A', isHovered = false }: { count: number; color?: string; isHovered?: boolean }) {
  // Generate seeded random number for consistent positions
  const seededRandom = (seed: number) => {
    const x = Math.sin(seed * 9999) * 10000;
    return x - Math.floor(x);
  };

  // Calculate dot size based on count - smaller dots for more users
  const getDotRadius = (count: number) => {
    if (count <= 10) return 12;
    if (count <= 20) return 10;
    if (count <= 35) return 8;
    if (count <= 50) return 6;
    if (count <= 75) return 5;
    return 4;
  };

  // Generate grid positions (organized layout for hover state)
  const generateGridPositions = (count: number) => {
    const positions: { x: number; y: number }[] = [];
    const dotRadius = getDotRadius(count);
    const spacing = dotRadius * 3; // Space between dot centers

    // Calculate grid dimensions - prefer wide horizontal layout
    // Aim for roughly 2:1 aspect ratio (more columns than rows)
    const targetCols = Math.ceil(Math.sqrt(count * 2.5));
    const cols = Math.max(4, Math.min(8, targetCols)); // Between 4-8 columns
    const rows = Math.ceil(count / cols);

    // Center the grid horizontally and vertically
    const gridWidth = (cols - 1) * spacing;
    const gridHeight = (rows - 1) * spacing;
    const startX = 180 - gridWidth / 2;
    const startY = 90 - gridHeight / 2;

    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions.push({
        x: startX + col * spacing,
        y: startY + row * spacing,
      });
    }

    return positions;
  };

  // Generate randomly dispersed positions in a cloud-like pattern
  const generateRandomPositions = (count: number, seed: number = 42) => {
    const positions: { x: number; y: number }[] = [];
    const dotRadius = getDotRadius(count);
    const minDistance = dotRadius * 2.2; // Minimum distance between dots

    // Bounds for the cluster area
    const centerX = 180;
    const centerY = 90;
    const spreadX = 100; // Horizontal spread from center
    const spreadY = 60;  // Vertical spread from center

    let attempts = 0;
    const maxAttempts = count * 100;

    while (positions.length < count && attempts < maxAttempts) {
      // Generate random position with some clustering toward center
      const angle = seededRandom(seed + attempts * 2) * Math.PI * 2;
      const distance = seededRandom(seed + attempts * 3) * 0.8 + seededRandom(seed + attempts * 4) * 0.2;

      const x = centerX + Math.cos(angle) * distance * spreadX * (0.5 + seededRandom(seed + attempts * 5) * 0.5);
      const y = centerY + Math.sin(angle) * distance * spreadY * (0.5 + seededRandom(seed + attempts * 6) * 0.5);

      // Add some noise for more organic feel
      const noiseX = (seededRandom(seed + attempts * 7) - 0.5) * 30;
      const noiseY = (seededRandom(seed + attempts * 8) - 0.5) * 20;

      const finalX = x + noiseX;
      const finalY = y + noiseY;

      // Check if position is valid (not too close to existing dots)
      let valid = true;
      for (const pos of positions) {
        const dist = Math.sqrt((pos.x - finalX) ** 2 + (pos.y - finalY) ** 2);
        if (dist < minDistance) {
          valid = false;
          break;
        }
      }

      // Also ensure within reasonable bounds
      if (finalX < 80 || finalX > 280 || finalY < 20 || finalY > 160) {
        valid = false;
      }

      if (valid) {
        positions.push({ x: finalX, y: finalY });
      }

      attempts++;
    }

    return positions;
  };

  const dotRadius = getDotRadius(count);
  const randomPositions = generateRandomPositions(count);
  const gridPositions = generateGridPositions(count);

  // Use grid positions when hovered, random otherwise
  const positions = isHovered ? gridPositions : randomPositions;

  return (
    <svg viewBox="0 0 360 180" className="w-full h-32">
      {positions.map((pos, i) => (
        <circle
          key={i}
          cx={pos.x}
          cy={pos.y}
          r={dotRadius}
          fill={color}
          opacity={0.9}
          style={{
            transition: 'cx 0.4s ease-out, cy 0.4s ease-out',
          }}
        />
      ))}
    </svg>
  );
}

// Insight card component
function InsightCardComponent({ insight, onClick }: { insight: InsightCard; onClick?: () => void }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`
        relative rounded-2xl p-5 shadow-md cursor-pointer
        transition-all duration-300 ease-out
        ${isHovered
          ? 'border-[1.5px] border-blue-500 shadow-[0_0_20px_rgba(37,133,230,0.3)]'
          : 'border border-gray-200 bg-white'
        }
      `}
      style={{
        background: isHovered
          ? 'linear-gradient(to bottom, #fbfbfb 0%, #d4e8fa 100%)'
          : 'white',
      }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
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

      {/* Quote */}
      {insight.quote && (
        <p className="text-sm text-gray-500 italic mb-2">&ldquo;{insight.quote}&rdquo;</p>
      )}

      {/* Dot Cluster - number of dots = matched users, animates to grid on hover */}
      <div className="my-4">
        <DotCluster count={insight.matchedUsers} isHovered={isHovered} />
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
          <span className="text-gray-500">{(insight.confidence * 100).toFixed(0)}%</span>
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
  const [clusterData, setClusterData] = useState<ClusterData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  // Fetch clusters on mount
  useEffect(() => {
    fetchClusters();
  }, [campaign.id]);

  // Poll for updates if processing
  useEffect(() => {
    if (clusterData?.status === 'processing') {
      const interval = setInterval(fetchClusters, 5000);
      return () => clearInterval(interval);
    }
  }, [clusterData?.status]);

  const fetchClusters = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(`/api/campaigns/${campaign.id}/cluster/latest`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setClusterData(data);
      }
    } catch (error) {
      console.error('Error fetching clusters:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateClusters = async () => {
    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No session');

      const response = await fetch(`/api/campaigns/${campaign.id}/cluster`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start clustering');
      }

      // Start polling for results
      setClusterData({ status: 'processing', processing_status: 'pending' });
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Stats from cluster data or defaults
  const stats = {
    date: new Date(campaign.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }),
    dimension: clusterData?.dimension || 'N/A',
    sampleSize: clusterData?.conversations_analyzed || 0,
  };

  const insights = clusterData?.clusters || [];

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
              <span className="font-semibold">Clustering Dimension: </span>
              <span className="font-light capitalize">{stats.dimension.replace('_', ' ')}</span>
            </span>
            <span>
              <span className="font-semibold">N= </span>
              <span className="font-normal">{stats.sampleSize.toLocaleString()}</span>
            </span>
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          )}

          {/* No clusters state */}
          {!isLoading && clusterData?.status === 'none' && (
            <div className="flex flex-col items-center justify-center py-20">
              <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-700 mb-2">No Insights Generated Yet</h3>
              <p className="text-gray-500 mb-6 text-center max-w-md">
                Generate insight clusters from your conversation data to discover patterns and themes.
              </p>
              <button
                onClick={handleGenerateClusters}
                disabled={isGenerating}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Starting...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Generate Insights
                  </>
                )}
              </button>
            </div>
          )}

          {/* Processing state */}
          {!isLoading && clusterData?.status === 'processing' && (
            <div className="flex flex-col items-center justify-center py-20">
              <svg className="w-16 h-16 text-blue-500 animate-spin mb-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <h3 className="text-lg font-medium text-gray-700 mb-2">Generating Insights...</h3>
              <p className="text-gray-500 text-center max-w-md">
                Analyzing conversations and clustering participants.
                <br />
                <span className="text-sm text-gray-400 capitalize">
                  Status: {clusterData.processing_status?.replace('_', ' ') || 'Processing'}
                </span>
              </p>
            </div>
          )}

          {/* Insight Cards Grid */}
          {!isLoading && clusterData?.status === 'completed' && insights.length > 0 && (
            <div className="grid grid-cols-2 gap-7">
              {insights.map((insight) => (
                <InsightCardComponent
                  key={insight.id}
                  insight={insight}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Conversation Agent */}
      <div
        className="w-[400px] border-l-2 border-gray-300 flex flex-col"
        style={{
          background: 'linear-gradient(to bottom, #ffffff 80%, #74b9ff 170%)',
        }}
      >
        {/* Main content area - centered text */}
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <h2 className="text-3xl font-bold text-black text-center leading-tight">
            Ask your users
          </h2>
          <p className="text-3xl italic font-medium text-black text-center">
            anything.
          </p>
        </div>

        {/* Bottom section */}
        <div className="px-5 pb-6">
          {/* Chat Input */}
          <div className="bg-[#eaeaea] rounded-full flex items-center px-4 py-3.5 mb-4">
            <button className="text-gray-400 mr-3 hover:text-gray-600 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask anything"
              className="flex-1 bg-transparent text-gray-700 placeholder-[#a7a7a7] outline-none text-sm font-medium"
            />
            <button className="text-black ml-3 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </button>
          </div>

          {/* Talking to filter */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-black">Talking to:</span>
            <button className="flex items-center gap-1 px-2 py-1 bg-[#2c95ff] rounded text-white text-xs">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 4h18v2H3V4zm0 7h12v2H3v-2zm0 7h18v2H3v-2z"/>
              </svg>
              <span className="font-semibold text-[10px]">{selectedFilter}</span>
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 10l5 5 5-5z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
