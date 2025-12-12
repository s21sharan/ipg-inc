'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/db/supabase';
import CreateCampaignForm from './components/create-campaign';
import CampaignDetailView from './components/campaign-detail-view';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import AnalysisReportView from './components/analysis-report-view';
import { InterviewGuidePreview } from './components/interview-guide-preview';
import { getEditDescription, parseEditCommand } from '@/lib/utils/edit-command-parser';

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

interface Workspace {
  id: string;
  name: string;
  owner_id: string;
}

// Duolingo Demo workspace ID (fixed UUID)
const DUOLINGO_DEMO_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

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

interface PersonalityScores {
  extroversion: number;
  agreeableness: number;
  conscientiousness: number;
  neuroticism: number;
  openness: number;
}

interface PersonalityData {
  scores?: PersonalityScores;
  responses?: any[];
  rawProjections?: any;
  generated_at?: string;
}

interface Interview {
  id: string;
  workspace_id: string;
  name: string;
  summary: string;
  top_quotes: string[];
  transcript: { question: string; answer: string }[];
  age: number | null;
  gender: string | null;
  race: string | null;
  hometown: string | null;
  occupation: string | null;
  country: string | null;
  learning_language: string | null;
  learning_goal: string | null;
  usage_frequency: string | null;
  is_premium_user: boolean;
  personality: PersonalityData | string[] | null;
  pain_points: string[];
  value_props: string[];
  created_at: string;
}

function DashboardContent() {
  const [user, setUser] = useState<any>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [personalWorkspaceId, setPersonalWorkspaceId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPromptBox, setShowPromptBox] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [createCampaignTitle, setCreateCampaignTitle] = useState('');
  const [createCampaignGoal, setCreateCampaignGoal] = useState('');
  const [createCampaignTemplate, setCreateCampaignTemplate] = useState<'churn' | 'onboarding' | 'conversion' | 'feature' | null>(null);
  const [showCampaignBuilder, setShowCampaignBuilder] = useState(false);
  const [createCampaignAudience, setCreateCampaignAudience] = useState('');
  const [builderChatInput, setBuilderChatInput] = useState('');
  const [builderChatMessages, setBuilderChatMessages] = useState<{role: 'system' | 'user'; text: string}[]>([]);
  const [isCompressingAudience, setIsCompressingAudience] = useState(false);
  const [builderStep, setBuilderStep] = useState<'audience' | 'focus' | 'guide'>('audience');
  const [focusCategories, setFocusCategories] = useState<{name: string; description: string}[]>([]);
  const [selectedFocusCategory, setSelectedFocusCategory] = useState<string | null>(null);
  const [isGeneratingFocus, setIsGeneratingFocus] = useState(false);
  // Interview Guide Builder State
  const [generatedTopics, setGeneratedTopics] = useState<Topic[]>([]);
  const [isGeneratingGuide, setIsGeneratingGuide] = useState(false);
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [typewriterText, setTypewriterText] = useState<Map<string, string>>(new Map());
  const [contextFlags, setContextFlags] = useState<{ isNewFeature: boolean; featureName?: string } | null>(null);
  const [isEditingGuide, setIsEditingGuide] = useState(false);
  const [isDraftingCampaign, setIsDraftingCampaign] = useState(false);
  const [draftedCampaign, setDraftedCampaign] = useState<Campaign | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [viewingCampaign, setViewingCampaign] = useState<Campaign | null>(null);
  const [viewingCampaignInsights, setViewingCampaignInsights] = useState<Campaign | null>(null);
  const [campaignViewTab, setCampaignViewTab] = useState<'summary' | 'conversations' | 'analyze'>('summary');
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loadingInterviews, setLoadingInterviews] = useState(false);
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
  const [personalityInterview, setPersonalityInterview] = useState<Interview | null>(null);
  const [selectedTraitKey, setSelectedTraitKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showSortDropdown, setShowSortDropdown] = useState<string | null>(null);
  const [demographicSortField, setDemographicSortField] = useState<string>('age');
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showSimulationModal, setShowSimulationModal] = useState(false);
  const [simulationStatus, setSimulationStatus] = useState<any>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConversations, setSelectedConversations] = useState<Set<string>>(() => new Set());
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<any | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<any>(null);
  const [citationModal, setCitationModal] = useState<{ interviewId: string; blockId: string } | null>(null);
  const [citationInterview, setCitationInterview] = useState<any | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get URL params
  const workspaceIdFromUrl = searchParams.get('workspace');
  const tabFromUrl = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabFromUrl || 'campaigns');

  // Update URL when workspace or tab changes
  const updateUrl = (workspaceId: string, tab: string) => {
    const params = new URLSearchParams();
    params.set('workspace', workspaceId);
    params.set('tab', tab);
    router.replace(`/dashboard?${params.toString()}`, { scroll: false });
  };

  // Handle workspace change
  const handleWorkspaceChange = (workspace: Workspace) => {
    setCurrentWorkspace(workspace);
    setShowWorkspaceMenu(false);
    updateUrl(workspace.id, activeTab);
  };

  // Handle tab change
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (currentWorkspace) {
      updateUrl(currentWorkspace.id, tab);
    }
  };

  // Handle simulation
  const handleSimulate = async () => {
    if (!viewingCampaign) return;

    // If already simulating, just show the modal and refresh status
    if (isSimulating) {
      setShowSimulationModal(true);
      // Refresh status immediately to show current progress
      await checkSimulationStatus();
      return;
    }

    setIsSimulating(true);
    setShowSimulationModal(true);

    // Set initial status so modal shows immediately
    setSimulationStatus({
      total: 0,
      completed: 0,
      in_progress: 0,
      failed: 0,
      pending: 0,
      simulation_status: 'running',
      conversations: []
    });

    // Start polling immediately to get the total count
    pollSimulationStatus();

    try {
      // Get auth session
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('No active session. Please log in again.');
      }

      // Kick off the simulation (don't await - let it run in background)
      const response = await fetch(`/api/campaigns/${viewingCampaign.id}/simulate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      if (!response.ok) {
        console.error('Simulation API error:', data);
        setIsSimulating(false);
        alert(data.error || 'Simulation failed');
      }

    } catch (error) {
      console.error('Simulation error:', error);
      alert(error instanceof Error ? error.message : 'Simulation failed');
      setIsSimulating(false);
      setShowSimulationModal(false);
      setSimulationStatus(null);
    }
  };

  // Handle stop simulation
  const handleStopSimulation = async () => {
    if (!viewingCampaign) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('No active session. Please log in again.');
      }

      const response = await fetch(`/api/campaigns/${viewingCampaign.id}/stop-simulation`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      if (!response.ok) {
        console.error('Stop simulation error:', data);
        alert(data.error || 'Failed to stop simulation');
      } else {
        // Refresh status immediately
        await checkSimulationStatus();
      }

    } catch (error) {
      console.error('Stop simulation error:', error);
      alert(error instanceof Error ? error.message : 'Failed to stop simulation');
    }
  };

  // Check simulation status once
  const checkSimulationStatus = async () => {
    if (!viewingCampaign) return null;

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(`/api/campaigns/${viewingCampaign.id}/simulation-status`, {
        headers: session?.access_token ? {
          'Authorization': `Bearer ${session.access_token}`
        } : {}
      });
      const data = await response.json();

      setSimulationStatus(data);

      // Update isSimulating based on backend status
      const isRunning = data.simulation_status === 'running';
      setIsSimulating(isRunning);

      return data;
    } catch (error) {
      console.error('Status check error:', error);
      return null;
    }
  };

  // Handle analyze conversations
  const handleAnalyze = async () => {
    if (!viewingCampaign) return;

    setIsAnalyzing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(`/api/campaigns/${viewingCampaign.id}/analyze`, {
        method: 'POST',
        headers: session?.access_token ? {
          'Authorization': `Bearer ${session.access_token}`
        } : {}
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Analysis error:', data);
        alert(data.error || 'Failed to start analysis');
        setIsAnalyzing(false);
        return;
      }

      // Refresh analyses list
      await fetchAnalyses();

      // Show success message
      alert(`Analysis started! Version ${data.version} is processing. Results will be ready in ~24 hours.`);

    } catch (error) {
      console.error('Analysis error:', error);
      alert(error instanceof Error ? error.message : 'Failed to start analysis');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Poll simulation status
  const pollSimulationStatus = () => {
    if (!viewingCampaign) return;

    const pollInterval = setInterval(async () => {
      try {
        const data = await checkSimulationStatus();

        if (!data) return;

        // Always refresh conversations list while simulation is running
        // This ensures the list updates regardless of which tab you're viewing
        await fetchConversations();

        // Stop polling if simulation is no longer running
        if (data.simulation_status !== 'running') {
          clearInterval(pollInterval);
          setIsSimulating(false);

          // Final refresh of conversations
          await fetchConversations();
        }
      } catch (error) {
        console.error('Status poll error:', error);
      }
    }, 2000); // Poll every 2 seconds

    return pollInterval;
  };

  // Fetch conversations for current campaign
  const fetchConversations = useCallback(async () => {
    if (!viewingCampaign) return;

    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('campaign_id', viewingCampaign.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setConversations(data);
    }
  }, [viewingCampaign]);

  // Fetch analyses for current campaign
  const fetchAnalyses = useCallback(async () => {
    if (!viewingCampaign) return;

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;

    if (!token) return;

    try {
      const response = await fetch(`/api/campaigns/${viewingCampaign.id}/analyze/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setAnalyses(data.analyses || []);
        setAnalysisStatus(data.latest);
      }
    } catch (error) {
      console.error('Error fetching analyses:', error);
    }
  }, [viewingCampaign]);

  // Fetch interview data for citation
  const fetchCitationInterview = async (conversationId: string) => {
    try {
      // Fetch the conversation (simulated interview for this campaign)
      const { data: convData } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .single();

      if (convData) {
        // Get the source interview for demographic data
        const { data: interviewData } = await supabase
          .from('interviews')
          .select('*')
          .eq('id', convData.source_interview_id)
          .single();

        // Use the conversation's transcript (the simulated conversation for this campaign)
        setCitationInterview({
          interview: {
            ...interviewData,
            transcript: convData.transcript, // Use conversation transcript, not original interview
          },
        });
        return;
      }

      // Fallback: try as interview directly (shouldn't happen for campaign citations)
      const { data: intData } = await supabase
        .from('interviews')
        .select('*')
        .eq('id', conversationId)
        .single();

      if (intData) {
        setCitationInterview({
          interview: intData,
        });
      }
    } catch (error) {
      console.error('Error fetching citation interview:', error);
    }
  };

  // Handle citation click
  const handleCitationClick = (interviewId: string, blockId: string) => {
    setCitationModal({ interviewId, blockId });
    fetchCitationInterview(interviewId);
  };

  // Auto-scroll to highlighted block when citation interview loads
  useEffect(() => {
    if (citationInterview && citationModal) {
      setTimeout(() => {
        const element = document.getElementById(`block-${citationModal.blockId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [citationInterview, citationModal]);

  // Parse text with citations and make them clickable
  const parseCitations = (children: any): any => {
    // Handle different types of children
    if (typeof children === 'string') {
      const citationRegex = /\[INT:([^\|]+)\|BLK:([^\]]+)\]/g;
      const parts = [];
      let lastIndex = 0;
      let match;
      let citationIndex = 0;

      while ((match = citationRegex.exec(children)) !== null) {
        // Add text before citation
        if (match.index > lastIndex) {
          parts.push(<span key={`text-${lastIndex}`}>{children.substring(lastIndex, match.index)}</span>);
        }

        // Add citation as clickable element
        const interviewId = match[1];
        const blockId = match[2];
        parts.push(
          <button
            key={`citation-${citationIndex++}`}
            onClick={() => handleCitationClick(interviewId, blockId)}
            className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded px-1.5 py-0.5 transition-colors"
            title="View source conversation"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
        );

        lastIndex = match.index + match[0].length;
      }

      // Add remaining text
      if (lastIndex < children.length) {
        parts.push(<span key={`text-${lastIndex}`}>{children.substring(lastIndex)}</span>);
      }

      return parts.length > 0 ? parts : children;
    } else if (Array.isArray(children)) {
      // Recursively process array of children
      return children.map((child, idx) => {
        if (typeof child === 'string') {
          return <span key={idx}>{parseCitations(child)}</span>;
        }
        return child;
      });
    }

    return children;
  };

  // Delete selected conversations
  const deleteSelectedConversations = async () => {
    if (selectedConversations.size === 0) return;

    const confirmMessage = `Are you sure you want to delete ${selectedConversations.size} conversation${selectedConversations.size > 1 ? 's' : ''}?`;
    if (!confirm(confirmMessage)) return;

    try {
      const { error } = await supabase
        .from('conversations')
        .delete()
        .in('id', Array.from(selectedConversations));

      if (error) throw error;

      // Update local state
      setConversations(conversations.filter(c => !selectedConversations.has(c.id)));
      setSelectedConversations(new Set());
    } catch (error) {
      console.error('Error deleting conversations:', error);
      alert('Failed to delete conversations');
    }
  };

  // Toggle conversation selection
  const toggleConversationSelection = (id: string) => {
    const newSelected = new Set(selectedConversations);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedConversations(newSelected);
  };

  // Toggle select all conversations
  const toggleSelectAllConversations = () => {
    if (selectedConversations.size === conversations.length) {
      setSelectedConversations(new Set());
    } else {
      setSelectedConversations(new Set(conversations.map(c => c.id)));
    }
  };

  useEffect(() => {
    // Get current user and set up workspaces
    const initialize = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        // Fetch user's workspaces
        const { data: memberWorkspaces } = await supabase
          .from('workspace_members')
          .select('workspace_id, workspaces(id, name, owner_id)')
          .eq('user_id', user.id);

        // Also fetch the Duolingo Demo workspace (accessible to all)
        const { data: duolingoWorkspace } = await supabase
          .from('workspaces')
          .select('*')
          .eq('id', DUOLINGO_DEMO_WORKSPACE_ID)
          .single();

        // Find or create personal workspace
        let personalWs = memberWorkspaces?.find(
          (m: any) => m.workspaces?.name === 'Personal Workspace'
        );

        if (!personalWs) {
          // Create personal workspace for this user
          const { data: newWorkspace } = await supabase
            .from('workspaces')
            .insert({ name: 'Personal Workspace', owner_id: user.id })
            .select()
            .single();

          if (newWorkspace) {
            // Add user as member
            await supabase
              .from('workspace_members')
              .insert({ workspace_id: newWorkspace.id, user_id: user.id, role: 'owner' });

            personalWs = { workspace_id: newWorkspace.id, workspaces: newWorkspace };
          }
        }

        // Build workspaces list
        const allWorkspaces: Workspace[] = [];

        if (personalWs?.workspaces) {
          allWorkspaces.push(personalWs.workspaces as unknown as Workspace);
          setPersonalWorkspaceId((personalWs.workspaces as unknown as Workspace).id);
        }

        if (duolingoWorkspace) {
          allWorkspaces.push(duolingoWorkspace);
        }

        // Add other workspaces the user is a member of
        memberWorkspaces?.forEach((m: any) => {
          if (m.workspaces && m.workspaces.name !== 'Personal Workspace') {
            allWorkspaces.push(m.workspaces);
          }
        });

        setWorkspaces(allWorkspaces);

        // Check if workspace ID is in URL
        if (workspaceIdFromUrl) {
          const workspaceFromUrl = allWorkspaces.find(ws => ws.id === workspaceIdFromUrl);
          if (workspaceFromUrl) {
            setCurrentWorkspace(workspaceFromUrl);
            setIsInitialized(true);
            return;
          }
        }

        // Set default workspace to personal
        if (personalWs?.workspaces) {
          setCurrentWorkspace(personalWs.workspaces as unknown as Workspace);
          // Update URL with default workspace
          updateUrl((personalWs.workspaces as unknown as Workspace).id, tabFromUrl || 'campaigns');
        } else if (allWorkspaces.length > 0) {
          setCurrentWorkspace(allWorkspaces[0]);
          updateUrl(allWorkspaces[0].id, tabFromUrl || 'campaigns');
        }
        setIsInitialized(true);
      }
    };

    initialize();
  }, [workspaceIdFromUrl, tabFromUrl]);

  // Check for existing simulation when campaign is opened
  useEffect(() => {
    const checkExistingSimulation = async () => {
      if (!viewingCampaign) return;

      const status = await checkSimulationStatus();

      // If simulation is running, start polling
      if (status?.simulation_status === 'running') {
        setIsSimulating(true);
        pollSimulationStatus();
      }

      // Fetch conversations
      fetchConversations();
    };

    checkExistingSimulation();
  }, [viewingCampaign?.id]);

  const fetchCampaigns = async (workspaceId?: string) => {
    setLoadingCampaigns(true);
    try {
      const wsId = workspaceId || currentWorkspace?.id;
      if (!wsId) {
        setCampaigns([]);
        return;
      }

      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setCampaigns(data || []);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const fetchInterviews = async (workspaceId?: string) => {
    setLoadingInterviews(true);
    try {
      const wsId = workspaceId || currentWorkspace?.id;
      if (!wsId) {
        setInterviews([]);
        return;
      }

      const { data, error } = await supabase
        .from('interviews')
        .select('*')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setInterviews(data || []);
    } catch (error) {
      console.error('Error fetching interviews:', error);
    } finally {
      setLoadingInterviews(false);
    }
  };

  // Refetch campaigns and interviews when workspace changes
  useEffect(() => {
    if (user && currentWorkspace) {
      fetchCampaigns(currentWorkspace.id);
      fetchInterviews(currentWorkspace.id);
    }
  }, [currentWorkspace, user]);

  // Fetch conversations when viewing a campaign
  useEffect(() => {
    if (viewingCampaign) {
      fetchConversations();
    }
  }, [viewingCampaign, fetchConversations]);

  // Fetch analyses when viewing a campaign
  useEffect(() => {
    if (viewingCampaign && campaignViewTab === 'analyze') {
      fetchAnalyses();
    }
  }, [viewingCampaign, campaignViewTab, fetchAnalyses]);

  // Auto-poll batch processor when there's a processing analysis
  useEffect(() => {
    if (!analysisStatus || analysisStatus.status !== 'processing') {
      return;
    }

    console.log('[Auto-Poll] Analysis in progress, starting automatic polling...');

    const pollBatchProcessor = async () => {
      try {
        // Trigger batch processor
        const response = await fetch('/api/batch-processor/auto-poll', {
          method: 'POST',
        });

        if (response.ok) {
          const data = await response.json();
          console.log(`[Auto-Poll] Processed. Still processing: ${data.still_processing}`);

          // Refresh analyses to get updated status
          await fetchAnalyses();

          return data.still_processing;
        }
        return true;
      } catch (error) {
        console.error('[Auto-Poll] Error:', error);
        return true;
      }
    };

    // Run immediately on mount
    pollBatchProcessor();

    // Then poll every 15 seconds
    const pollInterval = setInterval(async () => {
      const stillProcessing = await pollBatchProcessor();
      if (!stillProcessing) {
        console.log('[Auto-Poll] Analysis complete, stopping polling.');
        clearInterval(pollInterval);
      }
    }, 15000);

    // Cleanup on unmount or when analysis completes
    return () => {
      console.log('[Auto-Poll] Cleaning up polling interval');
      clearInterval(pollInterval);
    };
  }, [analysisStatus, fetchAnalyses]);

  const deleteCampaign = async (id: string) => {
    if (!confirm('Are you sure you want to delete this campaign?')) return;

    try {
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Remove from local state
      setCampaigns(campaigns.filter(c => c.id !== id));
    } catch (error) {
      console.error('Error deleting campaign:', error);
      alert('Failed to delete campaign');
    }
  };

  const handleSignOut = async () => {
    setShowSignOutConfirm(false);
    await supabase.auth.signOut();
    router.push('/');
  };

  const handleDraftCampaign = async () => {
    if (!promptText.trim()) return;

    setIsDraftingCampaign(true);
    try {
      const response = await fetch('/api/draft-campaign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: promptText }),
      });

      if (!response.ok) {
        throw new Error('Failed to draft campaign');
      }

      const data = await response.json();

      // Create a campaign object from the drafted data (without id so it gets inserted as new)
      const drafted: Campaign = {
        id: '', // Empty id so it creates a new campaign instead of updating
        name: data.basicDetails.name,
        title: data.basicDetails.title,
        caption: data.basicDetails.caption,
        time_estimate: data.basicDetails.timeEstimate,
        topics: data.topics,
        completion_logic: data.completionLogic,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        workspace: currentWorkspace?.name || 'personal',
        workspace_id: currentWorkspace?.id || '',
      };

      setDraftedCampaign(drafted);
      setShowPromptBox(false);
      setShowCreateForm(true);
      setPromptText('');
    } catch (error) {
      console.error('Error drafting campaign:', error);
      alert('Failed to draft campaign. Please try again.');
    } finally {
      setIsDraftingCampaign(false);
    }
  };

  const renderMainContent = () => {
    // Show insights view - hexagon clusters (triggered by View button)
    if (viewingCampaignInsights) {
      return (
        <CampaignDetailView
          campaign={viewingCampaignInsights}
          workspaceName={currentWorkspace?.name || 'Personal Workspace'}
          onBack={() => {
            setViewingCampaignInsights(null);
          }}
          onEdit={() => {
            setViewingCampaignInsights(null);
            setEditingCampaign(viewingCampaignInsights);
          }}
        />
      );
    }

    // Show campaign management view - tabbed interface (triggered by clicking card)
    if (viewingCampaign) {
      const completedConversations = conversations.filter(c => c.status === 'completed');

      return (
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          {/* Header */}
          <div className="border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    setViewingCampaign(null);
                    setCampaignViewTab('summary');
                    setConversations([]);
                    setAnalyses([]);
                    setSelectedAnalysis(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{viewingCampaign.title}</h2>
                  <p className="text-sm text-gray-500">{viewingCampaign.caption}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setViewingCampaignInsights(viewingCampaign);
                    setViewingCampaign(null);
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-green-600 border border-green-600 rounded-md hover:bg-green-50 transition-colors"
                >
                  View Insights
                </button>
                <button
                  onClick={() => {
                    setEditingCampaign(viewingCampaign);
                    setViewingCampaign(null);
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-600 rounded-md hover:bg-blue-50 transition-colors"
                >
                  Edit
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-6 mt-4">
              {(['summary', 'conversations', 'analyze'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setCampaignViewTab(tab)}
                  className={`pb-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                    campaignViewTab === tab
                      ? 'text-blue-600 border-blue-600'
                      : 'text-gray-500 border-transparent hover:text-gray-700'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {campaignViewTab === 'summary' && (
              <div className="max-w-3xl">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Campaign Overview</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Description</label>
                    <p className="text-gray-900 mt-1">{viewingCampaign.caption || 'No description provided'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Time Estimate</label>
                    <p className="text-gray-900">{viewingCampaign.time_estimate} minutes</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Topics</label>
                    <p className="text-gray-500 text-sm">{viewingCampaign.topics?.length || 0} topics configured</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Created</label>
                    <p className="text-gray-900">{new Date(viewingCampaign.created_at).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}

            {campaignViewTab === 'conversations' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Conversations ({conversations.length})
                  </h3>
                  <button
                    onClick={handleSimulate}
                    disabled={isSimulating}
                    className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {isSimulating ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Simulating...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Simulate Conversations
                      </>
                    )}
                  </button>
                </div>

                {conversations.length === 0 ? (
                  <div className="text-center py-12">
                    <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <p className="text-gray-500">No conversations yet. Click &quot;Simulate Conversations&quot; to generate interviews.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Select all / Delete selected */}
                    {selectedConversations.size > 0 && (
                      <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg mb-4">
                        <span className="text-sm text-blue-700">{selectedConversations.size} selected</span>
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete ${selectedConversations.size} conversations?`)) return;
                            const ids = Array.from(selectedConversations);
                            await supabase.from('conversations').delete().in('id', ids);
                            setConversations(conversations.filter(c => !selectedConversations.has(c.id)));
                            setSelectedConversations(new Set());
                          }}
                          className="text-sm text-red-600 hover:text-red-700"
                        >
                          Delete selected
                        </button>
                      </div>
                    )}

                    {/* Conversations table */}
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            <input
                              type="checkbox"
                              checked={selectedConversations.size === conversations.length && conversations.length > 0}
                              onChange={() => {
                                if (selectedConversations.size === conversations.length) {
                                  setSelectedConversations(new Set());
                                } else {
                                  setSelectedConversations(new Set(conversations.map(c => c.id)));
                                }
                              }}
                              className="rounded border-gray-300"
                            />
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Participant</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Messages</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Transcript</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {conversations.map((conv) => (
                          <tr key={conv.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={selectedConversations.has(conv.id)}
                                onChange={() => {
                                  const newSelected = new Set(selectedConversations);
                                  if (newSelected.has(conv.id)) {
                                    newSelected.delete(conv.id);
                                  } else {
                                    newSelected.add(conv.id);
                                  }
                                  setSelectedConversations(newSelected);
                                }}
                                className="rounded border-gray-300"
                              />
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-900">{conv.participant_name || 'Unknown'}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                conv.status === 'completed' ? 'bg-green-100 text-green-800' :
                                conv.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                                conv.status === 'failed' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {conv.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-500">{conv.transcript?.length || 0}</td>
                            <td className="px-3 py-2 text-sm text-gray-500">
                              {new Date(conv.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                onClick={() => {
                                  // Show transcript in a modal
                                  setSelectedInterview({
                                    ...({} as Interview),
                                    id: conv.id,
                                    name: conv.participant_name || 'Unknown',
                                    transcript: conv.transcript?.map((t: any) => ({
                                      question: t.role === 'assistant' ? t.content : '',
                                      answer: t.role === 'user' ? t.content : '',
                                    })).filter((t: any) => t.question || t.answer) || [],
                                  } as Interview);
                                }}
                                className="text-blue-600 hover:text-blue-700 text-sm"
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {campaignViewTab === 'analyze' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Analysis Reports</h3>
                  <button
                    onClick={async () => {
                      if (completedConversations.length === 0) {
                        alert('No completed conversations to analyze');
                        return;
                      }
                      setIsAnalyzing(true);
                      try {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (!session?.access_token) throw new Error('No session');

                        const response = await fetch(`/api/campaigns/${viewingCampaign.id}/analyze`, {
                          method: 'POST',
                          headers: { 'Authorization': `Bearer ${session.access_token}` },
                        });

                        if (!response.ok) {
                          const data = await response.json();
                          throw new Error(data.error || 'Analysis failed');
                        }

                        await fetchAnalyses();
                      } catch (error: any) {
                        alert(error.message);
                      } finally {
                        setIsAnalyzing(false);
                      }
                    }}
                    disabled={isAnalyzing || completedConversations.length === 0}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {isAnalyzing ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Starting...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        Analyze Conversations
                      </>
                    )}
                  </button>
                </div>

                {selectedAnalysis ? (
                  <AnalysisReportView
                    reportMarkdown={selectedAnalysis.report_markdown || 'No report available'}
                    onBack={() => setSelectedAnalysis(null)}
                  />
                ) : analyses.length === 0 ? (
                  <div className="text-center py-12">
                    <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <p className="text-gray-500">No analysis reports yet. Complete some conversations first, then click &quot;Analyze Conversations&quot;.</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Version</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Conversations</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {analyses.map((analysis) => (
                        <tr key={analysis.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-sm text-gray-900">v{analysis.version_number}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              analysis.status === 'completed' ? 'bg-green-100 text-green-800' :
                              analysis.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                              analysis.status === 'failed' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {analysis.status}
                              {analysis.status === 'processing' && analysis.total_batches > 1 && (
                                <span className="ml-1">({analysis.completed_batches}/{analysis.total_batches})</span>
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-500">{analysis.conversations_analyzed}</td>
                          <td className="px-3 py-2 text-sm text-gray-500">
                            {new Date(analysis.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2">
                            {analysis.status === 'completed' && (
                              <button
                                onClick={() => setSelectedAnalysis(analysis)}
                                className="text-blue-600 hover:text-blue-700 text-sm"
                              >
                                View Report
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    // Show campaign builder - two column layout
    if (showCampaignBuilder) {
      const handleBuilderChatSubmit = async () => {
        if (!builderChatInput.trim() || isCompressingAudience || isGeneratingFocus) return;

        const userMessage = builderChatInput.trim();
        setBuilderChatMessages(prev => [...prev, { role: 'user', text: userMessage }]);
        setBuilderChatInput('');

        if (builderStep === 'audience') {
          setIsCompressingAudience(true);

          try {
            const response = await fetch('/api/compress-audience', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: userMessage }),
            });

            if (!response.ok) throw new Error('Failed to compress audience');

            const data = await response.json();
            setCreateCampaignAudience(data.compressed);

            // Move to focus step and generate categories
            setBuilderStep('focus');
            setIsGeneratingFocus(true);

            // Generate focus categories first
            const focusResponse = await fetch('/api/generate-focus-categories', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: createCampaignTitle, goal: createCampaignGoal }),
            });

            const focusData = await focusResponse.json();
            const categories = focusData.categories || [
              { name: 'Value Perception', description: 'Questions about what users value, don\'t value, or misunderstand about the product.' },
              { name: 'Usage & Habits', description: 'Questions about how/when they use the product, and where usage or value drops off.' },
              { name: 'Motivation & Goals', description: 'Questions about what they\'re trying to achieve with the product and whether it\'s helping them reach those goals.' },
              { name: 'Pain Points & Frustrations', description: 'Questions about moments where the product feels slow, confusing, or annoying, and how that affects their behavior.' },
            ];

            // Set categories first, then add the message
            setFocusCategories(categories);
            setBuilderChatMessages(prev => [...prev, {
              role: 'system',
              text: "Fantastic— now let's shape your user interview. What would you like to understand from these users?"
            }]);
          } catch (error) {
            console.error('Error:', error);
            setCreateCampaignAudience(userMessage.split(' ').slice(0, 5).join(' '));
            setBuilderStep('focus');
            // Set categories first, then add the message
            const fallbackCategories = [
              { name: 'Value Perception', description: 'Questions about what users value, don\'t value, or misunderstand about the product.' },
              { name: 'Usage & Habits', description: 'Questions about how/when they use the product, and where usage or value drops off.' },
              { name: 'Motivation & Goals', description: 'Questions about what they\'re trying to achieve with the product and whether it\'s helping them reach those goals.' },
              { name: 'Pain Points & Frustrations', description: 'Questions about moments where the product feels slow, confusing, or annoying, and how that affects their behavior.' },
            ];
            setFocusCategories(fallbackCategories);
            setBuilderChatMessages(prev => [...prev, {
              role: 'system',
              text: "Fantastic— now let's shape your user interview. What would you like to understand from these users?"
            }]);
          } finally {
            setIsCompressingAudience(false);
            setIsGeneratingFocus(false);
          }
        } else if (builderStep === 'focus') {
          // User typed custom focus instead of selecting an option
          setSelectedFocusCategory(userMessage);
        } else if (builderStep === 'guide') {
          // Handle guide editing via chat
          setIsEditingGuide(true);
          const parsedCommand = parseEditCommand(userMessage);
          const description = getEditDescription(parsedCommand);

          setBuilderChatMessages(prev => [...prev, {
            role: 'system',
            text: description
          }]);

          try {
            const response = await fetch('/api/edit-interview-guide', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                currentTopics: generatedTopics,
                editCommand: userMessage,
                context: {
                  title: createCampaignTitle,
                  goal: createCampaignGoal,
                  audience: createCampaignAudience,
                  focusCategory: selectedFocusCategory
                }
              })
            });

            if (!response.ok) throw new Error('Failed to edit guide');

            const data = await response.json();

            // Mark changed topics for animation
            setEditingIds(new Set(data.changedIds));
            setGeneratedTopics(data.updatedTopics);

            // Remove editing animation after delay
            setTimeout(() => {
              setEditingIds(new Set());
            }, 1200);

            setBuilderChatMessages(prev => [...prev, {
              role: 'system',
              text: data.editType === 'full_regeneration'
                ? "I've regenerated the interview guide based on your feedback."
                : `Done! I've updated ${data.changedIds.length} question(s).`
            }]);
          } catch (error) {
            setBuilderChatMessages(prev => [...prev, {
              role: 'system',
              text: "Sorry, I couldn't apply that edit. Please try rephrasing your request."
            }]);
          } finally {
            setIsEditingGuide(false);
          }
        }
      };

      const handleFocusCategorySelect = async (category: {name: string; description: string}) => {
        setSelectedFocusCategory(category.name);
        setBuilderChatMessages(prev => [...prev, { role: 'user', text: category.name }]);

        // Move to guide step and start generating
        setBuilderStep('guide');
        setIsGeneratingGuide(true);
        setGeneratedTopics([]);
        setAnimatingIds(new Set());
        setTypewriterText(new Map());

        // Add generating message
        setBuilderChatMessages(prev => [...prev, {
          role: 'system',
          text: "Perfect! Generating your interview guide..."
        }]);

        try {
          // Use SSE to stream topics
          const params = new URLSearchParams({
            title: createCampaignTitle,
            goal: createCampaignGoal,
            audience: createCampaignAudience,
            focusCategory: category.name,
            ...(createCampaignTemplate ? { template: createCampaignTemplate } : {})
          });

          const eventSource = new EventSource(`/api/generate-interview-guide?${params.toString()}`);

          let currentStreamingTopicId: string | null = null;
          let streamingBuffer = '';

          eventSource.onmessage = (event) => {
            const { type, data } = JSON.parse(event.data);

            if (type === 'context') {
              setContextFlags(data);
              if (data.isNewFeature) {
                setBuilderChatMessages(prev => [...prev, {
                  role: 'system',
                  text: `I noticed this is about a new feature${data.featureName ? ` (${data.featureName})` : ''}. I'll frame questions around expectations and anticipated value rather than past usage.`
                }]);
              }
            } else if (type === 'text_delta') {
              // Live streaming text - update the typewriter display
              streamingBuffer = data.fullText;
              // Update typewriter text for current streaming topic
              if (currentStreamingTopicId) {
                setTypewriterText(prev => new Map(prev).set(currentStreamingTopicId!, streamingBuffer));
              }
            } else if (type === 'topic') {
              // A complete topic has been parsed
              // Clear typewriter text for this topic since it's now complete
              if (currentStreamingTopicId) {
                setTypewriterText(prev => {
                  const next = new Map(prev);
                  next.delete(currentStreamingTopicId!);
                  return next;
                });
              }

              // Add the complete topic
              setGeneratedTopics(prev => [...prev, data]);
              setAnimatingIds(prev => new Set([...prev, data.id]));

              // Set the next topic as the streaming target
              const nextId = String(Number(data.id) + 1);
              currentStreamingTopicId = nextId;
              streamingBuffer = '';

              // Remove animation after delay
              setTimeout(() => {
                setAnimatingIds(prev => {
                  const next = new Set(prev);
                  next.delete(data.id);
                  return next;
                });
              }, 800);
            } else if (type === 'complete') {
              eventSource.close();
              setIsGeneratingGuide(false);
              setTypewriterText(new Map()); // Clear all typewriter text
              currentStreamingTopicId = null;
              setBuilderChatMessages(prev => [...prev, {
                role: 'system',
                text: `Your interview guide is ready with ${data.topicCount} sections. You can edit it using the chat or click "DONE? PREVIEW STUDY" when ready.`
              }]);
            } else if (type === 'error') {
              eventSource.close();
              setIsGeneratingGuide(false);
              setTypewriterText(new Map());
              currentStreamingTopicId = null;
              setBuilderChatMessages(prev => [...prev, {
                role: 'system',
                text: `Something went wrong: ${data.message}. Please try again.`
              }]);
            }
          };

          eventSource.onerror = () => {
            eventSource.close();
            setIsGeneratingGuide(false);
            setBuilderChatMessages(prev => [...prev, {
              role: 'system',
              text: "Connection lost. Please try again."
            }]);
          };
        } catch (error) {
          setIsGeneratingGuide(false);
          setBuilderChatMessages(prev => [...prev, {
            role: 'system',
            text: "Failed to generate interview guide. Please try again."
          }]);
        }
      };

      return (
        <div className="flex-1 flex bg-white overflow-hidden">
          {/* Left Panel - Chat Area */}
          <div
            className="w-[500px] flex flex-col border-r border-[#e0e0e0] relative"
            style={{
              background: 'linear-gradient(180deg, #ffffff 75%, #e8f4ff 100%)',
            }}
          >
            {/* Header with campaign info */}
            <div className="px-5 pt-4 pb-3 flex items-center gap-2 border-b border-[#eee]">
              {/* Close Button */}
              <button
                onClick={() => {
                  setShowCampaignBuilder(false);
                  setShowCreateModal(true);
                  setBuilderChatMessages([]);
                  setBuilderChatInput('');
                  setCreateCampaignAudience('');
                  setBuilderStep('audience');
                  setFocusCategories([]);
                  setSelectedFocusCategory(null);
                  // Reset guide state
                  setGeneratedTopics([]);
                  setAnimatingIds(new Set());
                  setEditingIds(new Set());
                  setTypewriterText(new Map());
                  setContextFlags(null);
                  setIsGeneratingGuide(false);
                  setIsEditingGuide(false);
                }}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <svg className="w-4 h-4 text-[#888]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold text-[#2c95ff] tracking-wide">CAMPAIGN</span>
                <span className="text-[15px] text-black font-medium">{createCampaignTitle}</span>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 px-5 py-4 overflow-y-auto">
              {/* Sparkle icon - smaller */}
              <div className="flex items-center mb-3">
                <svg className="w-4 h-4 text-[#2c95ff]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
                </svg>
              </div>

              {/* Messages */}
              <div className="flex flex-col gap-3">
                {builderChatMessages.map((msg, idx) => (
                  <div key={idx} className={msg.role === 'system' ? '' : 'flex justify-end'}>
                    <div className={`rounded-lg px-4 py-3 max-w-[340px] ${
                      msg.role === 'system'
                        ? 'bg-[#f5f5f3] border border-[#e8e8e6] text-[#333] text-[14px]'
                        : 'bg-[#1a1a1a] text-white text-[13px]'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {(isCompressingAudience || isGeneratingFocus) && (
                  <div className="flex items-center gap-2 text-[#2c95ff] text-[12px] font-semibold">
                    <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </div>
                )}

                {/* Focus Category Options */}
                {builderStep === 'focus' && focusCategories.length > 0 && !selectedFocusCategory && !isGeneratingFocus && (
                  <div className="mt-4">
                    {/* RECOMMENDED Header */}
                    <div className="bg-white border border-[#2c95ff] rounded-lg px-3 py-2 flex items-center gap-2 mb-4">
                      <svg className="w-4 h-4 text-[#2c95ff]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
                      </svg>
                      <span className="text-[12px] font-bold text-[#2c95ff] tracking-wide">RECOMMENDED</span>
                      <svg className="w-3 h-3 text-[#2c95ff] ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                      </svg>
                    </div>

                    {/* Category Cards - 2x2 Grid */}
                    <div className="grid grid-cols-2 gap-2">
                      {focusCategories.map((category, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleFocusCategorySelect(category)}
                          className="bg-white border border-[#d3d3d3] rounded px-3 py-4 text-center hover:border-[#2c95ff] hover:bg-[#f8fbff] transition-all flex flex-col items-center justify-center gap-1 min-h-[90px]"
                        >
                          <span className="text-[12px] font-bold text-[#2c95ff]">{category.name}</span>
                          <span className="text-[9px] text-[#5c5c5c] leading-tight">{category.description}</span>
                        </button>
                      ))}
                    </div>

                    <p className="text-[10px] text-[#999] mt-4 text-center">
                      Have something else in mind? Type your research focus below
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Chat Input */}
            <div className="px-5 pb-5">
              <div className="bg-[#f0f0f0] rounded-full px-4 py-2.5 flex items-center gap-3">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <input
                  type="text"
                  value={builderChatInput}
                  onChange={(e) => setBuilderChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleBuilderChatSubmit();
                    }
                  }}
                  placeholder={
                    builderStep === 'guide'
                      ? "Edit questions (e.g., 'add follow-up to question 2')..."
                      : builderStep === 'focus'
                      ? "Or type your own focus area..."
                      : "Describe your target audience..."
                  }
                  className="flex-1 bg-transparent text-[14px] text-gray-700 placeholder-[#999] outline-none"
                  disabled={isCompressingAudience || isGeneratingGuide || isEditingGuide}
                />
                <button
                  onClick={handleBuilderChatSubmit}
                  disabled={!builderChatInput.trim() || isCompressingAudience || isGeneratingGuide || isEditingGuide}
                  className="p-1.5 bg-[#2c95ff] rounded-full text-white disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Done Button */}
              <div className="flex justify-center mt-4">
                {builderStep === 'guide' && generatedTopics.length > 0 ? (
                  <button
                    onClick={() => {
                      // Create campaign with generated topics
                      setShowCampaignBuilder(false);
                      setShowCreateForm(true);
                      // Set drafted campaign with the generated topics
                      setDraftedCampaign({
                        id: '',
                        name: createCampaignTitle,
                        title: createCampaignTitle,
                        caption: createCampaignGoal,
                        time_estimate: '',
                        topics: generatedTopics,
                        completion_logic: null,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        workspace: currentWorkspace?.name || '',
                        workspace_id: currentWorkspace?.id || ''
                      });
                    }}
                    disabled={isGeneratingGuide || isEditingGuide}
                    className={`px-6 py-2.5 rounded-lg text-[11px] font-bold tracking-wide transition-all ${
                      !isGeneratingGuide && !isEditingGuide
                        ? 'bg-[#1a1a1a] text-white hover:bg-black shadow-sm'
                        : 'bg-[#e5e5e5] text-[#999] cursor-not-allowed'
                    }`}
                  >
                    DONE? PREVIEW STUDY →
                  </button>
                ) : (
                  <button
                    disabled={!createCampaignAudience || builderStep === 'guide'}
                    className={`px-6 py-2.5 rounded-lg text-[11px] font-bold tracking-wide transition-all ${
                      createCampaignAudience && builderStep !== 'guide'
                        ? 'bg-[#1a1a1a] text-white hover:bg-black shadow-sm'
                        : 'bg-[#e5e5e5] text-[#999] cursor-not-allowed'
                    }`}
                  >
                    CONTINUE →
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel - Form Fields with Interview Questions below */}
          <div className="flex-1 bg-white overflow-y-auto">
            {/* ipg.inc logo */}
            <div className="flex justify-end px-6 pt-4">
              <span className="text-[24px] text-[#ddd]" style={{ fontFamily: 'Georgia, serif' }}>ipg.inc</span>
            </div>

            {/* Form Fields */}
            <div className="px-12 py-6">
              {/* Title */}
              <div className="mb-4">
                <span className="text-[13px] font-bold text-[#2c95ff] tracking-wide">TITLE</span>
                <div className="bg-[#fafaf9] border border-[#eee] rounded-md px-4 py-3 mt-2">
                  <span className="text-[14px] text-[#333]">{createCampaignTitle}</span>
                </div>
              </div>

              {/* Goal */}
              <div className="mb-4">
                <span className="text-[13px] font-bold text-[#2c95ff] tracking-wide">GOAL</span>
                <div className="bg-[#fafaf9] border border-[#eee] rounded-md px-4 py-3 mt-2">
                  <span className="text-[14px] text-[#333]">{createCampaignGoal}</span>
                </div>
              </div>

              {/* Audience */}
              <div className="mb-4">
                <span className={`text-[13px] font-bold tracking-wide transition-colors ${
                  createCampaignAudience ? 'text-[#2c95ff]' : 'text-[#2c95ff]/40'
                }`}>AUDIENCE</span>
                <div className={`border rounded-md px-4 py-3 mt-2 min-h-[44px] transition-all ${
                  createCampaignAudience
                    ? 'bg-[#fafaf9] border-[#eee]'
                    : 'bg-[#f8f8f8] border-dashed border-[#ddd]'
                }`}>
                  {createCampaignAudience ? (
                    <span className="text-[14px] text-[#333]">{createCampaignAudience}</span>
                  ) : (
                    <span className="text-[13px] text-[#bbb] italic">Waiting for input...</span>
                  )}
                </div>
              </div>

              {/* Interview Questions Section */}
              {createCampaignAudience && (
                <div>
                  <span className={`text-[13px] font-bold tracking-wide transition-colors ${
                    selectedFocusCategory ? 'text-[#2c95ff]' : 'text-[#2c95ff]/40'
                  }`}>INTERVIEW QUESTIONS</span>

                  {/* Show generated questions when in guide step, otherwise show placeholder */}
                  {builderStep === 'guide' ? (
                    <div className="mt-4">
                      <InterviewGuidePreview
                        topics={generatedTopics}
                        animatingIds={animatingIds}
                        editingIds={editingIds}
                        typewriterText={typewriterText}
                        isGenerating={isGeneratingGuide}
                      />
                    </div>
                  ) : (
                    <div className={`border rounded-md px-4 py-3 mt-2 min-h-[44px] transition-all ${
                      selectedFocusCategory
                        ? 'bg-[#fafaf9] border-[#eee]'
                        : 'bg-[#f8f8f8] border-dashed border-[#ddd]'
                    }`}>
                      {selectedFocusCategory ? (
                        <span className="text-[14px] text-[#333]">Focus: {selectedFocusCategory}</span>
                      ) : (
                        <span className="text-[13px] text-[#bbb] italic">Select a focus area...</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Show prompt box for create from prompt
    if (showPromptBox) {
      return (
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          {/* Header */}
          <div className="border-b border-gray-200 px-6 py-3">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-light text-gray-800">Create Campaign from Prompt</h2>
              <button
                onClick={() => {
                  setShowPromptBox(false);
                  setShowCreateModal(true);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col p-8 overflow-y-auto">
            <div className="max-w-4xl w-full mx-auto">
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="What are you hoping to learn from your audience? Share your study objective and any context that will help us draft your campaign."
                rows={14}
                className="w-full px-4 py-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-900 bg-white placeholder:text-gray-400 text-base leading-relaxed"
                disabled={isDraftingCampaign}
              />
              <div className="flex justify-end mt-4">
                <button
                  onClick={handleDraftCampaign}
                  disabled={!promptText.trim() || isDraftingCampaign}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isDraftingCampaign ? (
                    <>
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Drafting...
                    </>
                  ) : (
                    'Draft Campaign'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Show create modal in main content area
    if (showCreateModal) {
      return (
        <div
          className="flex-1 overflow-hidden relative flex flex-col"
          style={{
            background: 'linear-gradient(147deg, rgba(243, 243, 243, 1) 75%, rgba(116, 185, 255, 1) 131%)',
          }}
        >
          {/* Close/Home Button */}
          <button
            onClick={() => {
              setShowCreateModal(false);
              setCreateCampaignTitle('');
              setCreateCampaignGoal('');
              setCreateCampaignTemplate(null);
            }}
            className="absolute top-4 left-4 w-10 h-10 bg-[#e5e5e5] rounded flex items-center justify-center hover:bg-gray-300 transition-colors z-10"
          >
            <svg className="w-5 h-5 text-[#bebcbc]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </button>

          {/* Main Content - centered vertically and horizontally */}
          <div className="flex-1 flex items-center justify-center px-6 py-4">
            <div className="w-full max-w-[900px]">
              {/* Header */}
              <div className="mb-5">
                <h1 className="text-2xl font-bold text-black mb-1">Tell us about your project.</h1>
                <p className="text-sm text-[#545454]">We'll help you create a campaign tailored to your needs.</p>
              </div>

              {/* Form Fields */}
              <div className="flex flex-col gap-4">
                {/* Title Field */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold text-black">
                    TITLE <span className="text-[#2c95ff]">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Give us a title for your campaign."
                    value={createCampaignTitle}
                    onChange={(e) => setCreateCampaignTitle(e.target.value)}
                    className="w-full h-11 bg-[#eaeaea] border border-[#c6c6c6] rounded-md px-3 text-sm text-gray-700 placeholder-[#a8a8a8] outline-none focus:border-[#2c95ff] transition-colors"
                  />
                </div>

                {/* Goal Field */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold text-black">
                    GOAL <span className="text-[#2c95ff]">*</span>
                  </label>
                  <textarea
                    placeholder="Explain in detail what your goals are."
                    value={createCampaignGoal}
                    onChange={(e) => setCreateCampaignGoal(e.target.value)}
                    className="w-full h-11 bg-[#eaeaea] border border-[#c6c6c6] rounded-md px-3 py-2.5 text-sm text-gray-700 placeholder-[#a8a8a8] outline-none focus:border-[#2c95ff] transition-colors resize-none"
                  />
                </div>

                {/* Templates */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold text-black">TEMPLATES</label>
                  <div className="flex gap-4">
                    {/* Churn Diagnosis */}
                    <button
                      onClick={() => setCreateCampaignTemplate(createCampaignTemplate === 'churn' ? null : 'churn')}
                      className={`flex-1 h-[100px] bg-white border-2 rounded-lg flex flex-col items-center justify-center gap-1.5 transition-all ${
                        createCampaignTemplate === 'churn'
                          ? 'border-[#2c95ff] shadow-lg'
                          : 'border-[#c6c6c6] hover:border-gray-400'
                      }`}
                    >
                      <svg className="w-7 h-7 text-[#5c5c5c]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      <span className="text-[11px] font-medium text-[#5c5c5c] text-center">Churn Diagnosis</span>
                    </button>

                    {/* Onboarding Optimization */}
                    <button
                      onClick={() => setCreateCampaignTemplate(createCampaignTemplate === 'onboarding' ? null : 'onboarding')}
                      className={`flex-1 h-[100px] bg-white border-2 rounded-lg flex flex-col items-center justify-center gap-1.5 transition-all ${
                        createCampaignTemplate === 'onboarding'
                          ? 'border-[#2c95ff] shadow-lg'
                          : 'border-[#c6c6c6] hover:border-gray-400'
                      }`}
                    >
                      <svg className="w-7 h-7 text-[#5c5c5c]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                      </svg>
                      <span className="text-[11px] font-medium text-[#5c5c5c] text-center leading-tight">Onboarding<br/>Optimization</span>
                    </button>

                    {/* Improve Conversion */}
                    <button
                      onClick={() => setCreateCampaignTemplate(createCampaignTemplate === 'conversion' ? null : 'conversion')}
                      className={`flex-1 h-[100px] bg-white border-2 rounded-lg flex flex-col items-center justify-center gap-1.5 transition-all ${
                        createCampaignTemplate === 'conversion'
                          ? 'border-[#2c95ff] shadow-lg'
                          : 'border-[#c6c6c6] hover:border-gray-400'
                      }`}
                    >
                      <svg className="w-7 h-7 text-[#5c5c5c]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                      <span className="text-[11px] font-medium text-[#5c5c5c] text-center">Improve Conversion</span>
                    </button>

                    {/* Feature Exploration */}
                    <button
                      onClick={() => setCreateCampaignTemplate(createCampaignTemplate === 'feature' ? null : 'feature')}
                      className={`flex-1 h-[100px] bg-white border-2 rounded-lg flex flex-col items-center justify-center gap-1.5 transition-all ${
                        createCampaignTemplate === 'feature'
                          ? 'border-[#2c95ff] shadow-lg'
                          : 'border-[#c6c6c6] hover:border-gray-400'
                      }`}
                    >
                      <svg className="w-7 h-7 text-[#5c5c5c]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                      <span className="text-[11px] font-medium text-[#5c5c5c] text-center">Feature Exploration</span>
                    </button>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex items-center gap-3 mt-3">
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setShowCampaignBuilder(true);
                      setBuilderStep('audience');
                      setFocusCategories([]);
                      setSelectedFocusCategory(null);
                      setCreateCampaignAudience('');
                      setBuilderChatMessages([
                        { role: 'system', text: 'What sort of users are you looking for?' }
                      ]);
                    }}
                    disabled={!createCampaignTitle.trim() || !createCampaignGoal.trim()}
                    className={`px-5 py-2.5 rounded-md text-sm text-white transition-colors ${
                      createCampaignTitle.trim() && createCampaignGoal.trim()
                        ? 'bg-[#2c95ff] hover:bg-blue-600'
                        : 'bg-[#9a9a9a] cursor-not-allowed'
                    }`}
                  >
                    Generate Campaign
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setShowCreateForm(true);
                    }}
                    className="px-5 py-2.5 text-sm text-black underline hover:text-gray-600 transition-colors"
                  >
                    Create from scratch
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Show create/edit form in main content area
    if (showCreateForm || editingCampaign || draftedCampaign) {
      return <CreateCampaignForm
        campaign={editingCampaign || draftedCampaign || undefined}
        workspaceId={currentWorkspace?.id || ''}
        onClose={() => {
          setShowCreateForm(false);
          setEditingCampaign(null);
          setDraftedCampaign(null);
          fetchCampaigns(); // Refresh campaigns list
        }}
        onBack={!editingCampaign ? () => {
          setShowCreateForm(false);
          setDraftedCampaign(null);
          setShowCreateModal(true);
        } : undefined}
      />;
    }

    switch(activeTab) {
      case 'campaigns':
        // Filter campaigns based on search
        const filteredCampaigns = campaigns.filter(campaign => {
          if (!searchQuery.trim()) return true;
          const query = searchQuery.toLowerCase();
          return (
            campaign.title?.toLowerCase().includes(query) ||
            campaign.caption?.toLowerCase().includes(query) ||
            campaign.name?.toLowerCase().includes(query)
          );
        });

        return (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-[#f3f3f3] relative">
            {/* Title */}
            <h1 className="text-[32px] text-[rgba(0,0,0,0.8)] mb-4 tracking-tight">
              <span className="font-bold">Campaigns: </span>
              <span className="font-normal">{currentWorkspace?.name || 'Workspace'}</span>
            </h1>

            {/* Search Bar */}
            <div className="bg-[#f9fafb] border border-[#e6e7eb] rounded h-[33px] flex items-center px-3 mb-2 w-full">
              <svg className="w-4 h-4 text-[#4e4e4e] mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-xs text-[#4e4e4e] outline-none placeholder-[#4e4e4e]"
              />
              <svg className="w-4 h-4 text-[#4e4e4e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* Filter Chips */}
            <div className="flex flex-wrap gap-2 mb-6">
              <button className="bg-[#f9fafb] border border-[#e6e7eb] rounded h-[33px] px-3 flex items-center gap-2 text-xs text-[#4e4e4e]">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 4h18v2H3V4zm0 7h12v2H3v-2zm0 7h18v2H3v-2z"/>
                </svg>
                Name
              </button>
              <button className="bg-[#2c95ff] border border-[#e6e7eb] rounded h-[33px] px-3 flex items-center gap-2 text-xs text-white font-bold">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 4h18v2H3V4zm0 7h12v2H3v-2zm0 7h18v2H3v-2z"/>
                </svg>
                Status
              </button>
              <button className="bg-[#f9fafb] border border-[#e6e7eb] rounded h-[33px] px-3 flex items-center gap-2 text-xs text-[#4e4e4e]">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 4h18v2H3V4zm0 7h12v2H3v-2zm0 7h18v2H3v-2z"/>
                </svg>
                Date
              </button>
            </div>

            {loadingCampaigns ? (
              <div className="flex items-center justify-center flex-1">
                <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-md mx-auto">
                  <div className="w-12 h-12 bg-gray-200 rounded-full mx-auto mb-3 flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <p className="text-gray-600 text-sm">
                    {campaigns.length === 0 ? 'Get started and create your first campaign!' : 'No campaigns match your search.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-6">
                {filteredCampaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    className="w-[380px] h-[280px] rounded-lg border border-[#dadada] cursor-pointer hover:shadow-lg transition-all duration-200 relative overflow-hidden group"
                    style={{
                      background: 'linear-gradient(200deg, rgba(252, 251, 251, 1) 60%, rgba(180, 175, 173, 1) 120%)',
                    }}
                    onClick={() => { setViewingCampaignInsights(campaign); setSidebarCollapsed(true); }}
                  >
                    {/* Manage/Delete buttons - show on hover */}
                    <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingCampaign(campaign);
                          setSidebarCollapsed(true);
                        }}
                        className="w-8 h-8 bg-white/80 rounded-full flex items-center justify-center text-gray-500 hover:text-blue-600 hover:bg-white transition-colors"
                        title="Manage campaign"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteCampaign(campaign.id);
                        }}
                        className="w-8 h-8 bg-white/80 rounded-full flex items-center justify-center text-gray-500 hover:text-red-600 hover:bg-white transition-colors"
                        title="Delete campaign"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>

                    {/* Tags */}
                    <div className="absolute left-5 bottom-[100px] flex gap-2">
                      <div className="bg-[#efefef] rounded px-2 py-1">
                        <span className="text-[11px] font-semibold text-[#2c95ff]">Date: </span>
                        <span className="text-[11px] text-black">{new Date(campaign.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</span>
                      </div>
                      <div className="bg-[#efefef] rounded px-2 py-1">
                        <span className="text-[11px] font-semibold text-[#2c95ff]">Status: </span>
                        <span className="text-[11px] text-black">Active</span>
                      </div>
                    </div>

                    {/* Title */}
                    <div className="absolute left-5 right-5 bottom-4">
                      <h3 className="text-xl font-medium text-black leading-tight">
                        {campaign.title}
                      </h3>
                      {campaign.caption && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{campaign.caption}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Create Campaign Button - Fixed at bottom right */}
            <button
              onClick={() => setShowCreateModal(true)}
              className="fixed bottom-8 right-8 bg-[#2c95ff] text-white rounded-lg px-6 py-4 flex items-center gap-4 font-bold text-lg hover:bg-blue-600 transition-colors shadow-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              CREATE CAMPAIGN
            </button>
          </div>
        );
      case 'interviews':
        // Filter interviews based on search query
        const filteredInterviews = interviews.filter(interview => {
          if (!searchQuery.trim()) return true;
          const query = searchQuery.toLowerCase();
          return (
            interview.name?.toLowerCase().includes(query) ||
            interview.summary?.toLowerCase().includes(query) ||
            interview.country?.toLowerCase().includes(query) ||
            interview.occupation?.toLowerCase().includes(query) ||
            interview.learning_language?.toLowerCase().includes(query) ||
            interview.top_quotes?.some(q => q.toLowerCase().includes(query))
          );
        });

        // Sort interviews
        const sortedInterviews = [...filteredInterviews].sort((a, b) => {
          if (!sortColumn) return 0;

          let aVal: any, bVal: any;

          if (sortColumn === 'name') {
            aVal = a.name?.toLowerCase() || '';
            bVal = b.name?.toLowerCase() || '';
          } else if (sortColumn === 'demographics') {
            // Sort by the selected demographic field
            switch (demographicSortField) {
              case 'age':
                aVal = a.age || 0;
                bVal = b.age || 0;
                break;
              case 'gender':
                aVal = a.gender?.toLowerCase() || '';
                bVal = b.gender?.toLowerCase() || '';
                break;
              case 'country':
                aVal = a.country?.toLowerCase() || '';
                bVal = b.country?.toLowerCase() || '';
                break;
              case 'occupation':
                aVal = a.occupation?.toLowerCase() || '';
                bVal = b.occupation?.toLowerCase() || '';
                break;
              case 'learning_language':
                aVal = a.learning_language?.toLowerCase() || '';
                bVal = b.learning_language?.toLowerCase() || '';
                break;
              default:
                aVal = a.age || 0;
                bVal = b.age || 0;
            }
          } else {
            return 0;
          }

          if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
          return 0;
        });

        // Handle sort
        const handleSort = (column: string, direction: 'asc' | 'desc', demoField?: string) => {
          setSortColumn(column);
          setSortDirection(direction);
          if (demoField) {
            setDemographicSortField(demoField);
          }
          setShowSortDropdown(null);
        };

        // CSV download function
        const downloadCSV = () => {
          const headers = ['Name', 'Age', 'Gender', 'Country', 'Occupation', 'Learning Language', 'Summary', 'Top Quote'];
          const rows = filteredInterviews.map(i => [
            i.name || '',
            i.age?.toString() || '',
            i.gender || '',
            i.country || '',
            i.occupation || '',
            i.learning_language || '',
            (i.summary || '').replace(/"/g, '""'),
            (i.top_quotes?.[0] || '').replace(/"/g, '""')
          ]);

          const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
          ].join('\n');

          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `interviews_${currentWorkspace?.name || 'export'}_${new Date().toISOString().split('T')[0]}.csv`;
          link.click();
        };

        // Toggle fullscreen
        const toggleFullscreen = () => {
          if (!isFullscreen) {
            document.documentElement.requestFullscreen?.();
          } else {
            document.exitFullscreen?.();
          }
          setIsFullscreen(!isFullscreen);
        };

        // Toggle row expansion
        const toggleRowExpansion = (id: string) => {
          setExpandedRows(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
              newSet.delete(id);
            } else {
              newSet.add(id);
            }
            return newSet;
          });
        };

        return (
          <div className={`flex-1 flex flex-col overflow-hidden bg-white ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
              {/* Search Bar - Left Side */}
              <div className="relative">
                <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search interviews..."
                  className="pl-9 pr-8 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-72 text-gray-900 bg-white"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Action Buttons - Right Side */}
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1">
                <button
                  onClick={downloadCSV}
                  className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                  title="Download CSV"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
                <button
                  onClick={toggleFullscreen}
                  className={`p-1.5 hover:bg-gray-100 rounded transition-colors ${isFullscreen ? 'bg-blue-50' : ''}`}
                  title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                >
                  <svg className={`w-4 h-4 ${isFullscreen ? 'text-blue-600' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {isFullscreen ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {loadingInterviews ? (
              <div className="flex items-center justify-center h-full">
                <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : interviews.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-md mx-auto">
                  <div className="w-12 h-12 bg-gray-200 rounded-full mx-auto mb-3 flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <p className="text-gray-600 text-sm">No interviews yet in this workspace.</p>
                </div>
              </div>
            ) : filteredInterviews.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-md mx-auto">
                  <div className="w-12 h-12 bg-gray-200 rounded-full mx-auto mb-3 flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <p className="text-gray-600 text-sm">No interviews match &ldquo;{searchQuery}&rdquo;</p>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-blue-600 hover:text-blue-700 text-sm mt-2"
                  >
                    Clear search
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-auto" onClick={() => setShowSortDropdown(null)}>
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr className="border-b border-gray-200">
                      {/* Name Header with Sort */}
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider relative group/name">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {sortColumn === 'name' && (
                              <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={sortDirection === 'asc' ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                              </svg>
                            )}
                            <span>Name</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowSortDropdown(showSortDropdown === 'name' ? null : 'name');
                            }}
                            className="p-1 rounded hover:bg-gray-200 opacity-0 group-hover/name:opacity-100 transition-opacity"
                          >
                            <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                              <circle cx="12" cy="5" r="2" />
                              <circle cx="12" cy="12" r="2" />
                              <circle cx="12" cy="19" r="2" />
                            </svg>
                          </button>
                        </div>
                        {showSortDropdown === 'name' && (
                          <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px] z-20" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleSort('name', 'asc')}
                              className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 ${sortColumn === 'name' && sortDirection === 'asc' ? 'text-blue-600 bg-blue-50' : 'text-gray-700'}`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                              </svg>
                              Sort ascending
                            </button>
                            <button
                              onClick={() => handleSort('name', 'desc')}
                              className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 ${sortColumn === 'name' && sortDirection === 'desc' ? 'text-blue-600 bg-blue-50' : 'text-gray-700'}`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                              </svg>
                              Sort descending
                            </button>
                          </div>
                        )}
                      </th>

                      {/* Demographics Header */}
                      <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Demographics
                      </th>

                      <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Summary</th>
                      <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Quotes</th>
                      <th className="text-left px-2 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Personality</th>
                      <th className="text-left px-2 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Transcript</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedInterviews.map((interview) => (
                      <tr key={interview.id} className="hover:bg-gray-50 transition-colors">
                        {/* Name */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-900">{interview.name}</span>
                        </td>

                        {/* Demographics */}
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {interview.age && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-700">
                                {interview.age} yo
                              </span>
                            )}
                            {interview.gender && interview.gender.toLowerCase() !== 'unknown' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700">
                                {interview.gender}
                              </span>
                            )}
                            {interview.country && interview.country.toLowerCase() !== 'unknown' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700">
                                {interview.country}
                              </span>
                            )}
                            {interview.occupation && interview.occupation.toLowerCase() !== 'unknown' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700">
                                {interview.occupation}
                              </span>
                            )}
                            {interview.learning_language && interview.learning_language.toLowerCase() !== 'unknown' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-50 text-orange-700">
                                {interview.learning_language}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Summary */}
                        <td className="px-3 py-3">
                          {interview.summary ? (
                            <div
                              onClick={() => toggleRowExpansion(interview.id)}
                              className={`text-xs text-gray-600 cursor-pointer hover:text-gray-900 ${
                                expandedRows.has(interview.id) ? '' : 'line-clamp-2'
                              }`}
                              title={expandedRows.has(interview.id) ? 'Click to collapse' : 'Click to expand'}
                            >
                              {interview.summary}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>

                        {/* Quotes */}
                        <td className="px-3 py-3">
                          {interview.top_quotes && interview.top_quotes.length > 0 ? (
                            <div
                              onClick={() => toggleRowExpansion(interview.id)}
                              className={`text-xs text-gray-600 italic cursor-pointer hover:text-gray-900 ${
                                expandedRows.has(interview.id) ? '' : 'line-clamp-2'
                              }`}
                              title={expandedRows.has(interview.id) ? 'Click to collapse' : 'Click to expand'}
                            >
                              &ldquo;{expandedRows.has(interview.id)
                                ? interview.top_quotes.join('" "')
                                : interview.top_quotes[0]}&rdquo;
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>

                        {/* Personality Button */}
                        <td className="px-2 py-3 whitespace-nowrap">
                          <button
                            onClick={() => { setPersonalityInterview(interview); setSelectedTraitKey(null); }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-md transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            View
                          </button>
                        </td>

                        {/* Transcript Button */}
                        <td className="px-2 py-3 whitespace-nowrap">
                          <button
                            onClick={() => setSelectedInterview(interview)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
      {/* Sidebar */}
      <div
        className={`${sidebarCollapsed ? 'w-16 cursor-pointer' : 'w-64'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300`}
        onClick={sidebarCollapsed ? () => setSidebarCollapsed(false) : undefined}
      >
        {/* Logo */}
        <div className={`${sidebarCollapsed ? 'p-3' : 'p-4'} border-b border-gray-200`}>
          <div className="flex items-center justify-between">
            <h1 className={`font-bold font-serif text-gray-900 ${sidebarCollapsed ? 'text-xl' : 'text-3xl'}`}>
              ipg{!sidebarCollapsed && <><span className="text-blue-500">.</span>inc</>}
            </h1>
            {!sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                title="Collapse sidebar"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            )}
          </div>

          {/* Workspace Selector - hidden when collapsed */}
          {!sidebarCollapsed && (
            <div className="mt-2 relative">
              <button
                onClick={() => setShowWorkspaceMenu(!showWorkspaceMenu)}
                className="flex items-center justify-between w-full bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 transition-colors"
              >
                <span>{currentWorkspace?.name || 'Select Workspace'}</span>
                <svg className={`w-3 h-3 text-gray-400 transition-transform ${showWorkspaceMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Workspace Dropdown Menu */}
              {showWorkspaceMenu && (
                <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 overflow-hidden z-10">
                  <div className="py-1">
                    <div className="px-3 py-2 text-xs text-gray-500 uppercase tracking-wide font-medium border-b border-gray-100">
                      Workspaces
                    </div>
                    {workspaces.map((ws) => (
                      <button
                        key={ws.id}
                        onClick={() => handleWorkspaceChange(ws)}
                        className={`w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 ${
                          currentWorkspace?.id === ws.id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full ${
                          ws.id === DUOLINGO_DEMO_WORKSPACE_ID ? 'bg-green-500' : 'bg-blue-500'
                        }`}></div>
                        {ws.name}
                      </button>
                    ))}
                    <button className="w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-2 border-t border-gray-100">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Add workspace
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3">
          <div className="space-y-1">
            <button
              onClick={(e) => { e.stopPropagation(); handleTabChange('interviews'); }}
              className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 text-sm font-medium rounded transition-colors ${
                activeTab === 'interviews'
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              title={sidebarCollapsed ? 'Interviews' : undefined}
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {!sidebarCollapsed && 'Interviews'}
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); handleTabChange('campaigns'); }}
              className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 text-sm font-medium rounded transition-colors ${
                activeTab === 'campaigns'
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              title={sidebarCollapsed ? 'Campaigns' : undefined}
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {!sidebarCollapsed && 'Campaigns'}
            </button>
          </div>
        </nav>

        {/* Bottom Section - Support and Sign Out icons only when collapsed */}
        <div className="p-3 border-t border-gray-200 space-y-1">
          {/* Support */}
          <button
            onClick={(e) => e.stopPropagation()}
            className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 text-sm font-medium text-gray-700 rounded hover:bg-gray-100 transition-colors`}
            title={sidebarCollapsed ? 'Support' : undefined}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {!sidebarCollapsed && 'Support'}
          </button>

          {/* Sign Out */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowSignOutConfirm(true); }}
            className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 text-sm font-medium text-gray-700 rounded hover:bg-gray-100 transition-colors`}
            title={sidebarCollapsed ? 'Sign out' : undefined}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {!sidebarCollapsed && 'Sign out'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Main Content Area */}
        <main className="flex-1 flex overflow-hidden">
          {renderMainContent()}
        </main>
      </div>

      {/* Interview Transcript Modal */}
      {selectedInterview && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedInterview(null)}>
          <div
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-100">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h2 className="text-lg font-medium text-gray-900">{selectedInterview.name}&apos;s Interview</h2>
                  {selectedInterview.summary && (
                    <p className="text-xs text-gray-500 mt-1">{selectedInterview.summary}</p>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedInterview(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Demographics in modal */}
              <div className="flex flex-wrap gap-2">
                {selectedInterview.age && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-gray-100 text-gray-700">
                    {selectedInterview.age} years old
                  </span>
                )}
                {selectedInterview.occupation && selectedInterview.occupation.toLowerCase() !== 'unknown' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700">
                    {selectedInterview.occupation}
                  </span>
                )}
                {selectedInterview.country && selectedInterview.country.toLowerCase() !== 'unknown' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-green-50 text-green-700">
                    {selectedInterview.country}
                  </span>
                )}
                {selectedInterview.learning_language && selectedInterview.learning_language.toLowerCase() !== 'unknown' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700">
                    Learning {selectedInterview.learning_language}
                  </span>
                )}
                {selectedInterview.learning_goal && selectedInterview.learning_goal.toLowerCase() !== 'unknown' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-orange-50 text-orange-700">
                    Goal: {selectedInterview.learning_goal}
                  </span>
                )}
              </div>
            </div>

            {/* Transcript Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selectedInterview.transcript && selectedInterview.transcript.map((item: any, idx: number) => (
                <div
                  key={idx}
                  className={`space-y-1 ${item.is_followup ? 'ml-6 pl-3 border-l-2 border-orange-300' : ''}`}
                >
                  <p className={`text-xs font-medium ${item.is_followup ? 'text-orange-600' : 'text-gray-500'}`}>
                    {item.is_followup && <span className="text-orange-400 mr-1">↳</span>}
                    {item.question}
                  </p>
                  <p className={`text-sm leading-relaxed ${item.is_followup ? 'text-orange-700' : 'text-gray-700'}`}>
                    {item.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Personality Modal */}
      {personalityInterview && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPersonalityInterview(null)}>
          <div
            className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-100">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-medium text-gray-900">{personalityInterview.name}&apos;s Personality</h2>
                  <p className="text-xs text-gray-500 mt-1">Big Five Personality Traits (0-5 scale)</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPersonalityInterview(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Personality Scores */}
            <div className="p-4 overflow-y-auto flex-1">
              {(() => {
                const personality = personalityInterview.personality as PersonalityData | null;
                const scores = personality?.scores;

                if (!scores) {
                  return (
                    <div className="text-center py-8">
                      <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      <p className="text-sm text-gray-500">No personality data available</p>
                      <p className="text-xs text-gray-400 mt-1">Run the personality batch script to generate scores</p>
                    </div>
                  );
                }

                // Trait definitions with descriptions, communication tips, and advertising recommendations
                const traitDefinitions: Record<string, { label: string; description: string; communication: string; advertising: string }> = {
                  openness: {
                    label: 'Openness',
                    description: 'Creativity, curiosity, and openness to new experiences',
                    communication: 'Use imaginative, future-oriented language and invite them to explore new ideas, features, or possibilities. Emphasize learning, discovery, and novelty rather than routine. Offer context and "why" behind decisions, and be transparent about experiments or iterations. Encourage their input on new concepts and give them room to customize or play with options.',
                    advertising: 'Highlight innovation, originality, and exploration. Use storytelling, rich visuals, and scenarios that showcase trying new things, traveling, learning, or personal growth. Position the product as a way to discover new experiences or unlock new perspectives. Campaigns can feature behind-the-scenes content, beta access, or "early adopter" angles that make them feel part of something new and evolving.'
                  },
                  conscientiousness: {
                    label: 'Conscientiousness',
                    description: 'Organization, reliability, and goal-driven self-discipline',
                    communication: 'Be clear, structured, and precise. Provide timelines, expectations, and concrete next steps. Emphasize reliability, follow-through, and measurable outcomes. Avoid last-minute changes when possible, and explain the rationale when plans shift. Respect their time with concise messages and organized documentation.',
                    advertising: 'Focus on productivity, dependability, and long-term value. Show how the product helps them stay organized, hit goals, and reduce chaos. Use messages around planning, efficiency, checklists, and progress tracking. Testimonials that emphasize consistency ("this helped me stay on track every week") and ROI will resonate. Visuals can include calendars, dashboards, or before/after productivity stories.'
                  },
                  extroversion: {
                    label: 'Extraversion',
                    description: 'Sociability, assertiveness, and emotional expressiveness',
                    communication: 'Use an energetic, engaging tone and invite interaction. Encourage live discussions, feedback, and collaborative sessions. Give them chances to speak, share opinions, and connect with others. Use examples that involve social situations, community, or group activities. Acknowledge their enthusiasm and validate their contributions publicly when appropriate.',
                    advertising: 'Highlight social connection, excitement, and shared experiences. Show the product in group settings—events, parties, meet-ups, or teams working together. Use dynamic visuals, video, and emotionally expressive stories. Emphasize features that enable connection (sharing, referrals, co-creation, communities). Campaigns with social challenges, events, or influencer collaborations are especially effective.'
                  },
                  agreeableness: {
                    label: 'Agreeableness',
                    description: 'Trust, altruism, kindness, and cooperation',
                    communication: 'Use a warm, friendly tone, show empathy through active listening, and avoid unnecessary confrontation. Involve them in collaborative decisions, seek consensus, and highlight win–win outcomes. Acknowledge their efforts to support others and express appreciation openly. Provide reassurance and clarity, and avoid overly aggressive or competitive framing.',
                    advertising: 'Emphasize empathy, community, and positive social impact. Position the product as helping others, strengthening relationships, or supporting fairness and inclusion. Use testimonials, human stories, and imagery that highlight kindness, cooperation, and shared benefit. Lean into cause-based or values-driven messaging (sustainability, charity, inclusivity) and show how choosing this brand "does good" beyond the individual.'
                  },
                  neuroticism: {
                    label: 'Neuroticism',
                    description: 'Sensitivity to stress, moodiness, and emotional reactivity',
                    communication: 'Be reassuring, predictable, and transparent. Offer clear information, set realistic expectations, and proactively address common worries or risks. Avoid overly aggressive deadlines or pressure tactics. Provide safety nets—easy support access, clear refund or cancellation policies, and step-by-step guidance. Acknowledge their concerns and validate their need for security and control.',
                    advertising: 'Highlight comfort, safety, and peace of mind. Focus on reducing stress, simplifying decisions, and preventing problems. Emphasize reliability, guarantees, and strong customer support. Use calming visuals and straightforward copy rather than high-intensity hype. Campaigns can showcase how the product removes friction, protects against loss, or "takes one thing off your plate," helping them feel more secure and in control.'
                  },
                };

                // Radar chart configuration
                const traits = [
                  { key: 'openness', label: 'Openness' },
                  { key: 'conscientiousness', label: 'Conscientiousness' },
                  { key: 'extroversion', label: 'Extraversion' },
                  { key: 'agreeableness', label: 'Agreeableness' },
                  { key: 'neuroticism', label: 'Neuroticism' },
                ];

                // Get top 3 traits sorted by score
                const sortedTraits = Object.entries(scores)
                  .map(([key, value]) => ({ key, score: value, ...traitDefinitions[key] }))
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 3);

                const rankLabels = ['Primary', 'Secondary', 'Tertiary'];

                const centerX = 120;
                const centerY = 105;
                const maxRadius = 70;
                const levels = 5; // Grid levels

                // Calculate point position on pentagon
                const getPoint = (index: number, value: number, max: number = 5) => {
                  const angle = (Math.PI * 2 * index) / 5 - Math.PI / 2; // Start from top
                  const radius = (value / max) * maxRadius;
                  return {
                    x: centerX + radius * Math.cos(angle),
                    y: centerY + radius * Math.sin(angle),
                  };
                };

                // Generate pentagon path for grid levels
                const getPentagonPath = (radius: number) => {
                  const points = [];
                  for (let i = 0; i < 5; i++) {
                    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
                    points.push(`${centerX + radius * Math.cos(angle)},${centerY + radius * Math.sin(angle)}`);
                  }
                  return `M${points.join('L')}Z`;
                };

                // Get score values
                const scoreValues = traits.map(t => scores[t.key as keyof PersonalityScores] || 0);

                // Generate data polygon path
                const dataPoints = scoreValues.map((score, i) => {
                  const point = getPoint(i, score);
                  return `${point.x},${point.y}`;
                });
                const dataPath = `M${dataPoints.join('L')}Z`;

                // Label positions (slightly outside the chart)
                const labelPositions = traits.map((_, i) => {
                  const point = getPoint(i, 6.2);
                  return point;
                });

                return (
                  <div className="flex flex-col items-center">
                    {/* Radar Chart */}
                    <svg width="240" height="220" className="overflow-visible">
                      {/* Grid levels */}
                      {[1, 2, 3, 4, 5].map((level) => (
                        <path
                          key={level}
                          d={getPentagonPath((level / levels) * maxRadius)}
                          fill="none"
                          stroke="#e5e7eb"
                          strokeWidth="1"
                        />
                      ))}

                      {/* Axis lines */}
                      {traits.map((_, i) => {
                        const point = getPoint(i, 5);
                        return (
                          <line
                            key={i}
                            x1={centerX}
                            y1={centerY}
                            x2={point.x}
                            y2={point.y}
                            stroke="#e5e7eb"
                            strokeWidth="1"
                          />
                        );
                      })}

                      {/* Data polygon */}
                      <path
                        d={dataPath}
                        fill="rgba(59, 130, 246, 0.2)"
                        stroke="#3b82f6"
                        strokeWidth="2"
                      />

                      {/* Data points */}
                      {scoreValues.map((score, i) => {
                        const point = getPoint(i, score);
                        return (
                          <circle
                            key={i}
                            cx={point.x}
                            cy={point.y}
                            r="5"
                            fill="#3b82f6"
                          />
                        );
                      })}

                      {/* Labels */}
                      {traits.map((trait, i) => {
                        const pos = labelPositions[i];
                        const score = scoreValues[i];
                        // Adjust text anchor based on position
                        let textAnchor: 'middle' | 'start' | 'end' = 'middle';
                        let dx = 0;
                        if (i === 1) { textAnchor = 'start'; dx = 3; }
                        if (i === 2) { textAnchor = 'start'; dx = 3; }
                        if (i === 3) { textAnchor = 'end'; dx = -3; }
                        if (i === 4) { textAnchor = 'end'; dx = -3; }

                        return (
                          <g key={trait.key}>
                            <text
                              x={pos.x + dx}
                              y={pos.y}
                              textAnchor={textAnchor}
                              className="text-[11px] font-medium fill-gray-700"
                              dy={i === 0 ? -4 : (i === 2 || i === 3) ? 10 : 3}
                            >
                              {trait.label}
                            </text>
                            <text
                              x={pos.x + dx}
                              y={pos.y}
                              textAnchor={textAnchor}
                              className="text-[10px] fill-gray-400"
                              dy={i === 0 ? 7 : (i === 2 || i === 3) ? 21 : 14}
                            >
                              {score.toFixed(2)}
                            </text>
                          </g>
                        );
                      })}
                    </svg>

                    {/* Top 3 Traits - Selectable Horizontal Cards */}
                    <div className="w-full mt-3 pt-3 border-t border-gray-100">
                      <div className="grid grid-cols-3 gap-1.5">
                        {sortedTraits.map((trait, index) => {
                          const isSelected = (selectedTraitKey || sortedTraits[0]?.key) === trait.key;
                          return (
                            <button
                              key={trait.key}
                              onClick={() => setSelectedTraitKey(trait.key)}
                              className={`rounded-lg px-2 py-2 text-center transition-all duration-200 ${
                                isSelected
                                  ? 'bg-blue-50 border-2 border-blue-500'
                                  : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                              }`}
                            >
                              <span className={`text-[8px] font-semibold uppercase tracking-wider ${
                                isSelected ? 'text-blue-500' : 'text-gray-400'
                              }`}>
                                {rankLabels[index]}
                              </span>
                              <p className={`text-[11px] font-semibold mt-0.5 truncate ${
                                isSelected ? 'text-blue-900' : 'text-gray-900'
                              }`}>{trait.label}</p>
                              <p className={`text-base font-bold ${
                                isSelected ? 'text-blue-600' : 'text-gray-600'
                              }`}>{trait.score.toFixed(2)}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Selected Trait Details */}
                    {(() => {
                      const activeKey = selectedTraitKey || sortedTraits[0]?.key;
                      const activeTrait = traitDefinitions[activeKey];
                      if (!activeTrait) return null;

                      return (
                        <div className="w-full mt-3 space-y-2.5">
                          {/* Trait Header */}
                          <div className="text-center pb-2 border-b border-gray-100">
                            <h3 className="text-sm font-semibold text-gray-900">{activeTrait.label}</h3>
                            <p className="text-[10px] text-gray-500 mt-0.5">{activeTrait.description}</p>
                          </div>

                          {/* Communication Tips */}
                          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-3">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                              <h4 className="text-xs font-semibold text-blue-900">Communication Tips</h4>
                            </div>
                            <p className="text-[11px] text-blue-800 leading-relaxed">{activeTrait.communication}</p>
                          </div>

                          {/* Advertising Recommendations */}
                          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-3">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <svg className="w-3.5 h-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                              </svg>
                              <h4 className="text-xs font-semibold text-purple-900">Advertising Recommendations</h4>
                            </div>
                            <p className="text-[11px] text-purple-800 leading-relaxed">{activeTrait.advertising}</p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Simulation Progress Modal */}
      {showSimulationModal && simulationStatus && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-medium text-gray-900">Simulating Conversations</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {simulationStatus.completed} of {simulationStatus.total} completed
                    {simulationStatus.failed > 0 && ` (${simulationStatus.failed} failed)`}
                  </p>
                </div>
                <button
                  onClick={() => setShowSimulationModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Progress Bar */}
              <div className="mt-4 bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-purple-600 h-full transition-all duration-300"
                  style={{
                    width: `${(simulationStatus.completed / simulationStatus.total) * 100}%`
                  }}
                />
              </div>
            </div>

            {/* Participants List */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-2">
                {simulationStatus.conversations?.map((conv: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <span className="text-sm text-gray-700">{conv.participant_name}</span>
                    <div className="flex items-center gap-2">
                      {conv.status === 'completed' && (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Completed
                        </span>
                      )}
                      {conv.status === 'in_progress' && (
                        <span className="flex items-center gap-1 text-xs text-blue-600">
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing...
                        </span>
                      )}
                      {conv.status === 'failed' && (
                        <span className="flex items-center gap-1 text-xs text-red-600">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          Failed
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-100">
              {isSimulating ? (
                <div className="flex gap-3">
                  <button
                    onClick={handleStopSimulation}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                    </svg>
                    Stop Simulation
                  </button>
                  <button
                    onClick={() => setShowSimulationModal(false)}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    Close (Running in Background)
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowSimulationModal(false)}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sign Out Confirmation Modal */}
      {showSignOutConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm Sign Out</h3>
              <p className="text-sm text-gray-600 mb-6">
                Are you sure you want to sign out?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSignOutConfirm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSignOut}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Citation Modal */}
      {citationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => {
          setCitationModal(null);
          setCitationInterview(null);
        }}>
          <div
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-100">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h2 className="text-lg font-medium text-gray-900">
                    {citationInterview?.interview?.name || 'Interview'}
                  </h2>
                  {citationInterview?.interview?.summary && (
                    <p className="text-xs text-gray-500 mt-1">{citationInterview.interview.summary}</p>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCitationModal(null);
                    setCitationInterview(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Demographics in modal */}
              {citationInterview?.interview && (
                <div className="flex flex-wrap gap-2">
                  {citationInterview.interview.age && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-gray-100 text-gray-700">
                      {citationInterview.interview.age} years old
                    </span>
                  )}
                  {citationInterview.interview.occupation && citationInterview.interview.occupation.toLowerCase() !== 'unknown' && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700">
                      {citationInterview.interview.occupation}
                    </span>
                  )}
                  {citationInterview.interview.country && citationInterview.interview.country.toLowerCase() !== 'unknown' && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-green-50 text-green-700">
                      {citationInterview.interview.country}
                    </span>
                  )}
                  {citationInterview.interview.learning_language && citationInterview.interview.learning_language.toLowerCase() !== 'unknown' && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700">
                      Learning {citationInterview.interview.learning_language}
                    </span>
                  )}
                  {citationInterview.interview.learning_goal && citationInterview.interview.learning_goal.toLowerCase() !== 'unknown' && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-orange-50 text-orange-700">
                      Goal: {citationInterview.interview.learning_goal}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Transcript Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {citationInterview?.interview?.transcript ? (
                citationInterview.interview.transcript.map((item: any, idx: number) => {
                  // Use index for matching since blocks don't have IDs
                  const isHighlighted = idx === parseInt(citationModal.blockId);
                  return (
                    <div
                      key={`transcript-${idx}`}
                      id={`block-${idx}`}
                      className={`space-y-1 ${
                        item.is_followup ? 'ml-6 pl-3 border-l-2 border-orange-300' : ''
                      } ${isHighlighted ? 'bg-yellow-100 border-2 border-yellow-400 p-3 rounded-lg' : ''}`}
                    >
                      <p className={`text-xs font-medium ${item.is_followup ? 'text-orange-600' : 'text-gray-500'}`}>
                        {item.is_followup && <span className="text-orange-400 mr-1">↳</span>}
                        {item.question}
                      </p>
                      <p className={`text-sm leading-relaxed ${
                        isHighlighted ? 'text-gray-900 font-medium' : item.is_followup ? 'text-orange-700' : 'text-gray-700'
                      }`}>
                        {item.answer}
                      </p>
                    </div>
                  );
                })
              ) : (
                <div className="flex items-center justify-center h-48">
                  <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Wrapper component with Suspense for useSearchParams
export default function Dashboard() {
  return (
    <Suspense fallback={
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}