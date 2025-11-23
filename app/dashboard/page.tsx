'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import CreateCampaignForm from './create-campaign';

interface Campaign {
  id: string;
  name: string;
  title: string;
  caption: string;
  modality: string;
  time_estimate: string;
  topics: any[];
  completion_logic: any;
  created_at: string;
  updated_at: string;
}

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('campaigns');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPromptBox, setShowPromptBox] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [isDraftingCampaign, setIsDraftingCampaign] = useState(false);
  const [draftedCampaign, setDraftedCampaign] = useState<Campaign | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [viewingCampaign, setViewingCampaign] = useState<Campaign | null>(null);
  const [campaignViewTab, setCampaignViewTab] = useState<'summary' | 'conversations' | 'share' | 'analyze'>('summary');
  const router = useRouter();

  useEffect(() => {
    // Get current user
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      // Fetch campaigns for this user
      if (user) {
        fetchCampaigns();
      }
    };

    getCurrentUser();
  }, []);

  const fetchCampaigns = async () => {
    setLoadingCampaigns(true);
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setCampaigns(data || []);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    } finally {
      setLoadingCampaigns(false);
    }
  };

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

      // Create a campaign object from the drafted data
      const drafted: Campaign = {
        id: crypto.randomUUID(),
        name: data.basicDetails.name,
        title: data.basicDetails.title,
        caption: data.basicDetails.caption,
        modality: 'Audio + Video',
        time_estimate: data.basicDetails.timeEstimate,
        topics: data.topics,
        completion_logic: data.completionLogic,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
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
    // Show campaign view
    if (viewingCampaign) {
      const renderCampaignTabContent = () => {
        switch (campaignViewTab) {
          case 'summary':
            return (
              <div className="p-8">
                <div className="max-w-3xl space-y-8">
                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
                    <p className="text-base text-gray-900">{viewingCampaign.name}</p>
                  </div>

                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
                    <p className="text-base text-gray-900">{viewingCampaign.title}</p>
                  </div>

                  {/* Status */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                      Live
                    </span>
                  </div>

                  {/* URL */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">URL</label>
                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <a
                        href={`${window.location.origin}/campaign/${viewingCampaign.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-700 underline break-all flex-1"
                      >
                        {`${window.location.origin}/campaign/${viewingCampaign.id}`}
                      </a>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/campaign/${viewingCampaign.id}`);
                        }}
                        className="text-gray-400 hover:text-gray-600 flex-shrink-0 transition-colors"
                        title="Copy URL"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Conversations */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Conversations</label>
                    <p className="text-base text-gray-900">0 completed (0 total)</p>
                  </div>
                </div>
              </div>
            );

          case 'conversations':
            return (
              <div className="p-8">
                <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-16 text-center">
                  <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p className="text-sm text-gray-500">No conversations yet</p>
                  <p className="text-xs text-gray-400 mt-2">Share your campaign link to start collecting responses</p>
                </div>
              </div>
            );

          case 'share':
            return (
              <div className="p-8">
                <div className="max-w-3xl">
                  <div className="bg-white border border-gray-200 rounded-lg p-8 shadow-sm">
                    <h3 className="text-lg font-medium text-gray-900 mb-3">Ready to recruit conversations?</h3>
                    <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                      Your interview is live — now it's time to start collecting responses. Share this link with
                      customers, panelists, or teammates to start capturing meaningful feedback.
                    </p>

                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                      <div className="flex items-center justify-between gap-3">
                        <code className="text-sm text-blue-600 break-all flex-1">
                          {`${window.location.origin}/campaign/${viewingCampaign.id}`}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/campaign/${viewingCampaign.id}`);
                          }}
                          className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                          title="Copy URL"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-gray-500">
                      Or explore options to embed, leverage research panels, or integrate with CRM tools →
                    </p>
                  </div>
                </div>
              </div>
            );

          case 'analyze':
            return (
              <div className="p-8">
                <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-16 text-center">
                  <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <p className="text-sm text-gray-500">No data to analyze yet</p>
                  <p className="text-xs text-gray-400 mt-2">Analytics will appear once you have conversations</p>
                </div>
              </div>
            );

          default:
            return null;
        }
      };

      return (
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          {/* Header */}
          <div className="border-b border-gray-200 px-8 py-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setViewingCampaign(null);
                    setCampaignViewTab('summary');
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h1 className="text-xl font-light text-gray-900">{viewingCampaign.title}</h1>
              </div>
              <button
                onClick={() => {
                  setViewingCampaign(null);
                  setEditingCampaign(viewingCampaign);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
              >
                Edit Pulse
              </button>
            </div>

            {/* Tabs */}
            <nav className="flex gap-6 -mb-px">
              <button
                onClick={() => setCampaignViewTab('summary')}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  campaignViewTab === 'summary'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Summary
              </button>
              <button
                onClick={() => setCampaignViewTab('conversations')}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  campaignViewTab === 'conversations'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Conversations
              </button>
              <button
                onClick={() => setCampaignViewTab('share')}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  campaignViewTab === 'share'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Share
              </button>
              <button
                onClick={() => setCampaignViewTab('analyze')}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  campaignViewTab === 'analyze'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Analyze
              </button>
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto bg-gray-50">
            {renderCampaignTabContent()}
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
        <div className="flex-1 bg-white p-6 overflow-y-auto">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-light text-gray-800">How do you want to create your Campaign?</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Create from Scratch */}
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setShowCreateForm(true);
                }}
                className="bg-gray-50 border-2 border-gray-300 rounded-lg p-6 hover:border-blue-500 hover:shadow-lg transition-all duration-200 text-left group"
              >
                <div className="w-12 h-12 bg-gray-100 rounded-full mx-auto mb-3 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                  <svg className="w-6 h-6 text-gray-600 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <h3 className="text-base font-medium text-gray-800 mb-2 text-center">Create from Scratch</h3>
                <p className="text-sm text-gray-600 text-center">
                  Start with a blank slate and build your Campaign from the ground up.
                </p>
              </button>

              {/* Create from Prompt */}
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setShowPromptBox(true);
                }}
                className="bg-gray-50 border-2 border-gray-300 rounded-lg p-6 hover:border-blue-500 hover:shadow-lg transition-all duration-200 text-left group"
              >
                <div className="w-12 h-12 bg-gray-100 rounded-full mx-auto mb-3 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                  <svg className="w-6 h-6 text-gray-600 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <h3 className="text-base font-medium text-gray-800 mb-2 text-center">Create from Prompt</h3>
                <p className="text-sm text-gray-600 text-center">
                  Quickly describe what you want to learn and we'll build the Campaign for you.
                </p>
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Show create/edit form in main content area
    if (showCreateForm || editingCampaign || draftedCampaign) {
      return <CreateCampaignForm
        campaign={editingCampaign || draftedCampaign || undefined}
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
        return (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            {loadingCampaigns ? (
              <div className="flex items-center justify-center h-full">
                <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : campaigns.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-md mx-auto">
                  <div className="w-12 h-12 bg-gray-200 rounded-full mx-auto mb-3 flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <p className="text-gray-600 text-sm">Get started and create your first campaign!</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {campaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow duration-200 cursor-pointer"
                    onClick={() => setViewingCampaign(campaign)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-base font-medium text-gray-900 mb-1">{campaign.title}</h3>
                        <p className="text-sm text-gray-500">{campaign.name}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCampaign(campaign);
                          }}
                          className="text-gray-400 hover:text-blue-600 transition-colors p-1"
                          title="Edit campaign"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteCampaign(campaign.id);
                          }}
                          className="text-gray-400 hover:text-red-600 transition-colors p-1"
                          title="Delete campaign"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700">
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        {campaign.modality}
                      </span>
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {campaign.time_estimate} min
                      </span>
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-50 text-green-700">
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        {campaign.topics.length} topics
                      </span>
                    </div>

                    <div className="text-xs text-gray-400 text-right">
                      {new Date(campaign.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case 'simulated-agents':
        return (
          <div className="p-6">
            <h1 className="text-lg font-light text-gray-800 mb-3">Simulated Agents</h1>
            <div className="bg-gray-50 rounded border-2 border-dashed border-gray-300 p-8 text-center">
              <p className="text-sm text-gray-500">No simulated agents created yet. Create campaigns to generate simulated agents!</p>
            </div>
          </div>
        );
      case 'conversations':
        return (
          <div className="p-6">
            <h1 className="text-lg font-light text-gray-800 mb-3">Conversations</h1>
            <div className="bg-gray-50 rounded border-2 border-dashed border-gray-300 p-8 text-center">
              <p className="text-sm text-gray-500">No conversations yet. Start a campaign to begin conversations!</p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-3xl font-bold font-serif text-gray-900">
            ipg<span className="text-blue-500">.</span>inc
          </h1>
          <div className="mt-2 relative">
            <button
              onClick={() => setShowWorkspaceMenu(!showWorkspaceMenu)}
              className="flex items-center justify-between w-full bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 transition-colors"
            >
              <span>Personal Workspace</span>
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
                  <button className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    Personal Workspace
                  </button>
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
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3">
          <div className="space-y-1">

            <button
              onClick={() => setActiveTab('campaigns')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded transition-colors ${
                activeTab === 'campaigns'
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Campaigns
            </button>

            <button
              onClick={() => setActiveTab('conversations')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded transition-colors ${
                activeTab === 'conversations'
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Conversations
            </button>

            <button
              onClick={() => setActiveTab('simulated-agents')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded transition-colors ${
                activeTab === 'simulated-agents'
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Simulated Agents
            </button>
          </div>
        </nav>

        {/* Support */}
        <div className="p-3 border-t border-gray-200">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-gray-700 rounded hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Support
          </button>
        </div>

        {/* User Menu */}
        <div className="relative p-3 border-t border-gray-200">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-gray-700 rounded hover:bg-gray-100 transition-colors"
          >
            <div className="w-5 h-5 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-medium text-gray-600">
                {user?.email?.charAt(0).toUpperCase()}
              </span>
            </div>
            <p className="text-sm text-gray-700 truncate flex-1 text-left">{user?.email}</p>
            <svg className={`w-3 h-3 text-gray-400 transition-transform flex-shrink-0 ${showUserMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown Menu */}
          {showUserMenu && (
            <div className="absolute bottom-full left-3 right-3 bg-white border border-gray-200 rounded-lg shadow-lg mb-1 overflow-hidden">
              <button
                onClick={handleSignOut}
                className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        {!showCreateModal && !showCreateForm && !editingCampaign && !showPromptBox && !viewingCampaign && (
          <header className="bg-white border-b border-gray-200 px-6 py-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-light text-gray-800">Personal Workspace</h2>
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm transition-colors flex items-center gap-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
                Create Campaign
              </button>
            </div>
          </header>
        )}

        {/* Main Content Area */}
        <main className="flex-1 flex overflow-hidden">
          {renderMainContent()}
        </main>
      </div>
    </div>
  );
}