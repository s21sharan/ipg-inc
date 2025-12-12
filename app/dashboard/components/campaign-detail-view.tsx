'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '@/lib/db/supabase';

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

    // Center the grid horizontally and vertically (viewBox is 360x160)
    const gridWidth = (cols - 1) * spacing;
    const gridHeight = (rows - 1) * spacing;
    const startX = 180 - gridWidth / 2;
    const startY = 80 - gridHeight / 2;

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

    // Bounds for the cluster area (viewBox is 360x160)
    const centerX = 180;
    const centerY = 80;
    const spreadX = 100; // Horizontal spread from center
    const spreadY = 50;  // Vertical spread from center

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

      // Also ensure within reasonable bounds (viewBox is 360x160)
      if (finalX < 80 || finalX > 280 || finalY < 15 || finalY > 145) {
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
    <svg viewBox="0 0 360 160" className="w-full h-28">
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

// Insight card component - compact size to fit 2x2 grid without scrolling
function InsightCardComponent({ insight, onClick, isSelected }: { insight: InsightCard; onClick?: () => void; isSelected?: boolean }) {
  const [isHovered, setIsHovered] = useState(false);

  const showActiveState = isHovered || isSelected;

  return (
    <div
      className={`
        relative rounded-[20px] p-4 cursor-pointer flex flex-col min-h-0
        transition-all duration-300 ease-out
        ${showActiveState
          ? 'border-[1.5px] border-blue-500 shadow-[0_0_20px_rgba(37,133,230,0.3)]'
          : 'border border-[#dadada] bg-white shadow-[0px_4px_4px_0px_rgba(0,0,0,0.2)]'
        }
      `}
      style={{
        background: showActiveState
          ? 'linear-gradient(to bottom, #fbfbfb 0%, #d4e8fa 100%)'
          : 'white',
      }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <h3 className="text-[22px] font-semibold text-[#2c95ff] leading-tight">{insight.title}</h3>
        <button className="text-black text-lg flex-shrink-0 ml-2">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
          </svg>
        </button>
      </div>

      {/* Dot Cluster - number of dots = matched users, animates to grid on hover/select */}
      <div className="flex-1 flex items-center justify-center">
        <DotCluster count={insight.matchedUsers} isHovered={showActiveState} />
      </div>

      {/* Summary */}
      <p className="text-[13px] text-black mb-2 line-clamp-1">{insight.summary}</p>

      {/* Stats row */}
      <div className="flex gap-6 text-xs">
        <div>
          <span className="font-semibold text-black">Matched Users: </span>
          <span className="text-gray-500">{insight.matchedUsers.toLocaleString()}</span>
        </div>
        <div>
          <span className="font-semibold text-black">Prevalence: </span>
          <span className="text-gray-500">{insight.prevalence}</span>
        </div>
        <div>
          <span className="font-semibold text-black">Confidence: </span>
          <span className="text-gray-500">{insight.confidence.toFixed(2)}</span>
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
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]); // Array of cluster IDs
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [clusterData, setClusterData] = useState<ClusterData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  // Swarm conversation state
  const [isSwarmLoading, setIsSwarmLoading] = useState(false);
  const [swarmResponse, setSwarmResponse] = useState<any>(null);
  const [swarmError, setSwarmError] = useState<string | null>(null);

  // Expanded conversation panel state
  const [isConversationExpanded, setIsConversationExpanded] = useState(false);

  // Report view state
  const [viewMode, setViewMode] = useState<'clusters' | 'report'>('clusters');
  const [reportData, setReportData] = useState<any>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);

  // Toggle cluster selection
  const toggleClusterSelection = (clusterId: string) => {
    setSelectedClusters(prev =>
      prev.includes(clusterId)
        ? prev.filter(id => id !== clusterId)
        : [...prev, clusterId]
    );
  };

  // Remove a cluster from selection
  const removeCluster = (clusterId: string) => {
    setSelectedClusters(prev => prev.filter(id => id !== clusterId));
  };

  // Get selected cluster names for display
  const getSelectedClusterNames = () => {
    const insights = clusterData?.clusters || [];
    return selectedClusters.map(id => insights.find(c => c.id === id)?.title).filter(Boolean);
  };

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

  // Fetch and view report
  const handleViewReport = async () => {
    setIsLoadingReport(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No session');

      const response = await fetch(`/api/campaigns/${campaign.id}/analyze/status`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch report');
      }

      const data = await response.json();

      // Get the latest completed analysis with report
      const completedAnalysis = data.analyses?.find(
        (a: any) => a.status === 'completed' && a.report_markdown
      );

      if (completedAnalysis) {
        setReportData(completedAnalysis);
        setViewMode('report');
      } else {
        alert('No completed report available yet. Please run an analysis first.');
      }
    } catch (error: any) {
      console.error('Error fetching report:', error);
      alert(error.message || 'Failed to load report');
    } finally {
      setIsLoadingReport(false);
    }
  };

  // Submit question to swarm
  const handleSubmitQuestion = async () => {
    if (!chatInput.trim()) return;

    // Get agent IDs from selected clusters (or all if none selected)
    const insights = clusterData?.clusters || [];
    const clustersToUse = selectedClusters.length > 0
      ? insights.filter(c => selectedClusters.includes(c.id))
      : insights;

    // Collect all unique interview IDs from cluster members
    const agentIds = new Set<string>();
    for (const cluster of clustersToUse) {
      if (cluster.members) {
        for (const member of cluster.members) {
          agentIds.add(member.conversation_id);
        }
      }
    }

    if (agentIds.size < 2) {
      setSwarmError('Need at least 2 agents to start a conversation');
      return;
    }

    setIsSwarmLoading(true);
    setSwarmError(null);
    setSwarmResponse(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No session');

      // Create the swarm
      const createResponse = await fetch('/api/swarm/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: chatInput,
          agent_ids: Array.from(agentIds),
        }),
      });

      if (!createResponse.ok) {
        const err = await createResponse.json();
        throw new Error(err.detail || 'Failed to start conversation');
      }

      const { swarm_id } = await createResponse.json();

      // Poll for swarm completion (messages)
      let attempts = 0;
      const maxAttempts = 120; // 10 minutes max for swarm conversation
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s

        const statusResponse = await fetch(`/api/swarm/status/${swarm_id}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        });

        if (statusResponse.ok) {
          const status = await statusResponse.json();
          if (status.status === 'completed') {
            // Swarm completed - fetch messages immediately
            const messagesResponse = await fetch(`/api/swarm/messages/${swarm_id}`, {
              headers: { 'Authorization': `Bearer ${session.access_token}` },
            });
            if (messagesResponse.ok) {
              const messages = await messagesResponse.json();
              // Show messages first with loading indicator for consensus
              setSwarmResponse({
                messages: messages.messages,
                type: 'messages',
                swarm_id: swarm_id,
                consensusLoading: true
              });
            }

            // Subscribe to Supabase Realtime for consensus updates (no polling!)
            const channel = supabase
              .channel(`consensus-${swarm_id}`)
              .on(
                'postgres_changes',
                {
                  event: 'INSERT',
                  schema: 'public',
                  table: 'consensus_summaries',
                  filter: `swarm_id=eq.${swarm_id}`,
                },
                (payload) => {
                  console.log('Consensus received via realtime:', payload);
                  const consensus = payload.new;
                  setSwarmResponse(prev => ({
                    ...prev,
                    ...consensus,
                    type: 'consensus',
                    consensusLoading: false
                  }));
                  // Cleanup subscription
                  supabase.removeChannel(channel);
                }
              )
              .subscribe();

            // Timeout after 10 minutes - cleanup subscription
            setTimeout(() => {
              supabase.removeChannel(channel);
              setSwarmResponse(prev => {
                if (prev?.consensusLoading) {
                  return {
                    ...prev,
                    consensusLoading: false,
                    consensusError: 'Consensus generation timed out'
                  };
                }
                return prev;
              });
            }, 600000); // 10 minutes

            break;
          } else if (status.status === 'generating_consensus') {
            // Legacy status - keep polling
            console.log('Generating consensus report...');
          } else if (status.status === 'error' || status.status === 'terminated') {
            throw new Error('Conversation failed or was terminated');
          }
        }
        attempts++;
      }

      if (attempts >= maxAttempts) {
        throw new Error('Conversation timed out');
      }

      setChatInput('');
    } catch (error: any) {
      setSwarmError(error.message);
    } finally {
      setIsSwarmLoading(false);
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
    <div className="flex h-full w-full bg-gray-100">
      {/* Left Panel - Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-6 py-2">
          <div className="flex items-center gap-3">
            {/* Back button */}
            <button
              onClick={onBack}
              className="w-7 h-5 bg-gray-200 rounded flex items-center justify-center hover:bg-gray-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Breadcrumb */}
            <div className="flex items-center gap-3 text-xs font-semibold text-gray-400">
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

        {/* Content area - no scroll, fits viewport */}
        <div className="flex-1 flex flex-col px-6 py-3 min-h-0 overflow-y-auto">
          {/* Title with View Report */}
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-2xl font-bold text-gray-900">
              {campaign.title}
            </h1>
            {viewMode === 'clusters' && (
              <button
                onClick={handleViewReport}
                disabled={isLoadingReport}
                className="flex items-center gap-1 p-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                {isLoadingReport ? (
                  <svg className="w-4 h-4 animate-spin text-[#484848]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <>
                    <span className="text-xs text-[#484848] font-semibold underline">VIEW REPORT</span>
                    <span className="text-xs text-[#484848]">→</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-5 text-xs text-gray-600 mb-3">
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

          {/* Report View */}
          {viewMode === 'report' && reportData && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Back button */}
              <button
                onClick={() => setViewMode('clusters')}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4 w-fit"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
                <span>Back to Insights</span>
              </button>

              {/* Report content */}
              <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="p-6">
                  {/* Report header */}
                  <div className="border-b border-gray-200 pb-4 mb-6">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Analysis Report</h2>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>Version {reportData.version_number}</span>
                      <span>•</span>
                      <span>{reportData.conversations_analyzed} conversations analyzed</span>
                      <span>•</span>
                      <span>{new Date(reportData.completed_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Markdown content */}
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ children }) => (
                          <h1 className="text-2xl font-bold text-gray-900 mt-8 mb-4 first:mt-0 pb-2 border-b border-gray-200">{children}</h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="text-xl font-semibold text-gray-800 mt-6 mb-3">{children}</h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="text-lg font-semibold text-gray-800 mt-5 mb-2">{children}</h3>
                        ),
                        h4: ({ children }) => (
                          <h4 className="text-base font-semibold text-gray-700 mt-4 mb-2">{children}</h4>
                        ),
                        p: ({ children }) => (
                          <p className="text-sm text-gray-700 mb-4 leading-relaxed">{children}</p>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-semibold text-gray-900">{children}</strong>
                        ),
                        ul: ({ children }) => (
                          <ul className="list-disc list-outside ml-5 space-y-2 my-4 text-sm text-gray-700">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal list-outside ml-5 space-y-2 my-4 text-sm text-gray-700">{children}</ol>
                        ),
                        li: ({ children }) => (
                          <li className="text-sm text-gray-700 leading-relaxed">{children}</li>
                        ),
                        hr: () => (
                          <hr className="my-6 border-gray-200" />
                        ),
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-6 rounded-lg border border-gray-200">
                            <table className="min-w-full text-sm">{children}</table>
                          </div>
                        ),
                        thead: ({ children }) => (
                          <thead className="bg-gray-50">{children}</thead>
                        ),
                        th: ({ children }) => (
                          <th className="px-4 py-3 text-left font-semibold text-gray-700 border-b border-gray-200">{children}</th>
                        ),
                        td: ({ children }) => (
                          <td className="px-4 py-3 text-gray-600 border-b border-gray-100">{children}</td>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-4 border-blue-400 bg-blue-50 pl-4 pr-4 py-3 my-4 italic text-gray-700 rounded-r-lg">{children}</blockquote>
                        ),
                        code: ({ className, children }) => {
                          const isInline = !className;
                          return isInline ? (
                            <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
                          ) : (
                            <code className="block bg-gray-900 text-gray-100 p-4 rounded-lg text-xs font-mono overflow-x-auto my-4">{children}</code>
                          );
                        },
                        pre: ({ children }) => (
                          <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs font-mono overflow-x-auto my-4">{children}</pre>
                        ),
                      }}
                    >
                      {reportData.report_markdown}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Clusters View */}
          {viewMode === 'clusters' && (
            <>
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

              {/* Insight Cards Grid - 2x2 normal, 1x4 vertical when conversation expanded */}
              {!isLoading && clusterData?.status === 'completed' && insights.length > 0 && (
                <div className={`grid gap-4 ${isConversationExpanded ? 'grid-cols-1 max-w-[400px]' : 'grid-cols-2 auto-rows-fr'}`}>
                  {insights.map((insight) => (
                    <InsightCardComponent
                      key={insight.id}
                      insight={insight}
                      isSelected={selectedClusters.includes(insight.id)}
                      onClick={() => toggleClusterSelection(insight.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right Panel - Conversation Agent */}
      <div
        className={`flex-shrink-0 border-l-2 border-gray-300 flex flex-col relative transition-all duration-300 ${
          isConversationExpanded ? 'w-[calc(100%-450px)]' : 'w-[340px]'
        }`}
        style={{
          background: 'linear-gradient(to bottom, #ffffff 80%, #74b9ff 170%)',
        }}
      >
        {/* Expand/Collapse Arrow */}
        <button
          onClick={() => setIsConversationExpanded(!isConversationExpanded)}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-12 bg-white border border-gray-300 rounded-l-lg flex items-center justify-center hover:bg-gray-50 transition-colors shadow-sm z-10"
          title={isConversationExpanded ? 'Collapse panel' : 'Expand panel'}
        >
          <svg
            className={`w-4 h-4 text-gray-600 transition-transform duration-300 ${isConversationExpanded ? 'rotate-0' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Top left label */}
        <div className="px-5 pt-4">
          <p className="text-[22px] font-normal">
            <span className="text-[#a8a8a8]">IPG</span>
            <span className="text-black"> Conversation Agent</span>
          </p>
        </div>

        {/* Main content area - response or placeholder */}
        <div className="flex-1 flex flex-col px-5 py-4 overflow-y-auto">
          {isSwarmLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <svg className="w-10 h-10 animate-spin text-blue-500 mb-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-sm text-gray-600">Agents are discussing...</p>
              <p className="text-xs text-gray-400 mt-1">This may take a few minutes</p>
            </div>
          ) : swarmError ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-full">
                <p className="text-red-600 text-sm">{swarmError}</p>
              </div>
            </div>
          ) : swarmResponse ? (
            <div className="space-y-4 overflow-y-auto">
              {swarmResponse.synthesized_conclusion && (
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ children }) => (
                          <h1 className="text-xl font-bold text-gray-900 mt-4 mb-3 first:mt-0">{children}</h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{children}</h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="text-base font-semibold text-gray-800 mt-3 mb-2">{children}</h3>
                        ),
                        p: ({ children }) => (
                          <p className="text-sm text-gray-700 mb-3 leading-relaxed">{children}</p>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-semibold text-gray-900">{children}</strong>
                        ),
                        ul: ({ children }) => (
                          <ul className="list-disc list-inside space-y-1 my-3 text-sm text-gray-700">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal list-inside space-y-1 my-3 text-sm text-gray-700">{children}</ol>
                        ),
                        li: ({ children }) => (
                          <li className="text-sm text-gray-700">{children}</li>
                        ),
                        hr: () => (
                          <hr className="my-4 border-gray-200" />
                        ),
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-4">
                            <table className="min-w-full border border-gray-200 text-sm">{children}</table>
                          </div>
                        ),
                        thead: ({ children }) => (
                          <thead className="bg-gray-50">{children}</thead>
                        ),
                        th: ({ children }) => (
                          <th className="px-3 py-2 text-left font-semibold text-gray-700 border-b border-gray-200">{children}</th>
                        ),
                        td: ({ children }) => (
                          <td className="px-3 py-2 text-gray-600 border-b border-gray-100">{children}</td>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-4 border-blue-300 pl-4 my-3 italic text-gray-600">{children}</blockquote>
                        ),
                      }}
                    >
                      {swarmResponse.synthesized_conclusion}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
              {swarmResponse.type === 'messages' && swarmResponse.messages && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Discussion</h4>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {swarmResponse.messages.map((msg: any, i: number) => (
                      <div key={i} className="text-sm bg-white rounded-lg p-3 border border-gray-200">
                        <span className="font-medium text-blue-600">{msg.speaker_name}:</span>
                        <span className="text-gray-600 ml-2">{msg.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center">
              <p className="text-[32px] text-center leading-tight">
                <span className="font-bold text-black">Ask your users </span>
                <span
                  className="font-medium italic bg-clip-text"
                  style={{
                    background: 'linear-gradient(to right, #000000, #a0a0a0)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  anything.
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Cohort Filters Dropdown */}
        {showFilterDropdown && (
          <div className="absolute left-5 right-5 bottom-20 bg-white border border-[#d7d7d7] rounded-lg shadow-lg p-3 z-10">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-xs text-black">Cohort Filters</span>
              <button
                onClick={() => setShowFilterDropdown(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>

            {/* Selected clusters as tags */}
            <div className="bg-[#dbdbdb] rounded-md p-1.5 mb-2 min-h-[28px] flex flex-wrap gap-1.5 items-center">
              {selectedClusters.length === 0 ? (
                <span className="text-gray-500 text-[10px]">Select clusters...</span>
              ) : (
                insights.filter(c => selectedClusters.includes(c.id)).map(cluster => (
                  <span
                    key={cluster.id}
                    className="bg-[#6c6c6c] text-white text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
                  >
                    <button
                      onClick={() => removeCluster(cluster.id)}
                      className="hover:text-gray-300"
                    >
                      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                      </svg>
                    </button>
                    <span className="max-w-[80px] truncate">{cluster.title}</span>
                  </span>
                ))
              )}
            </div>

            {/* Cluster checkboxes */}
            <div className="space-y-0.5">
              {insights.map(cluster => (
                <label
                  key={cluster.id}
                  className="flex items-center gap-1.5 px-1 py-1.5 hover:bg-gray-50 rounded cursor-pointer border-b border-gray-100 last:border-0"
                >
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center ${
                      selectedClusters.includes(cluster.id)
                        ? 'bg-[#2c95ff]'
                        : 'bg-gray-200'
                    }`}
                    onClick={() => toggleClusterSelection(cluster.id)}
                  >
                    {selectedClusters.includes(cluster.id) && (
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                      </svg>
                    )}
                  </div>
                  <span className="text-xs text-gray-700 font-medium">{cluster.title}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Bottom section */}
        <div className="px-5 pb-6">
          {/* Chat Input */}
          <div className="bg-[#eaeaea] rounded-full flex items-center px-4 py-3.5 mb-4">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isSwarmLoading) {
                  e.preventDefault();
                  handleSubmitQuestion();
                }
              }}
              placeholder="Ask anything"
              disabled={isSwarmLoading}
              className="flex-1 bg-transparent text-gray-700 placeholder-[#a7a7a7] outline-none text-sm font-medium disabled:opacity-50"
            />
            <button
              onClick={handleSubmitQuestion}
              disabled={isSwarmLoading || !chatInput.trim()}
              className="text-black ml-3 hover:text-blue-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>

          {/* Talking to filter */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-black">Talking to:</span>
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className="flex items-center gap-1 px-2 py-1 bg-[#2c95ff] rounded text-white text-xs"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 4h18v2H3V4zm0 7h12v2H3v-2zm0 7h18v2H3v-2z"/>
              </svg>
              <span className="font-semibold text-[10px]">
                {selectedClusters.length === 0
                  ? 'All Users'
                  : selectedClusters.length === 1
                    ? insights.find(c => c.id === selectedClusters[0])?.title || 'Selected'
                    : `${selectedClusters.length} Cohorts`
                }
              </span>
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d={showFilterDropdown ? "M7 14l5-5 5 5z" : "M7 10l5 5 5-5z"}/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
