'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import CreateCampaignForm from './create-campaign';

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('campaigns');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Get current user
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };

    getCurrentUser();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const renderMainContent = () => {
    // Show create modal in main content area
    if (showCreateModal) {
      return (
        <div className="flex-1 bg-white p-8 overflow-y-auto">
          <div>
            <h2 className="text-3xl font-light text-gray-800 mb-8">How do you want to create your Campaign?</h2>
            
            <div className="grid grid-cols-2 gap-6">
              {/* Create from Prompt */}
              <button className="bg-gray-50 border-2 border-gray-300 rounded-xl p-8 hover:border-blue-500 hover:shadow-lg transition-all duration-200 text-left group">
                <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-6 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                  <svg className="w-8 h-8 text-gray-600 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <h3 className="text-xl font-medium text-gray-800 mb-3 text-center">Create from Prompt</h3>
                <p className="text-gray-600 text-center">
                  Quickly describe what you want to learn and we'll build the Campaign for you.
                </p>
              </button>
              
              {/* Create from Scratch */}
              <button 
                onClick={() => {
                  setShowCreateModal(false);
                  setShowCreateForm(true);
                }}
                className="bg-gray-50 border-2 border-gray-300 rounded-xl p-8 hover:border-blue-500 hover:shadow-lg transition-all duration-200 text-left group"
              >
                <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-6 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                  <svg className="w-8 h-8 text-gray-600 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <h3 className="text-xl font-medium text-gray-800 mb-3 text-center">Create from Scratch</h3>
                <p className="text-gray-600 text-center">
                  Start with a blank slate and build your Campaign from the ground up.
                </p>
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Show create form in main content area
    if (showCreateForm) {
      return <CreateCampaignForm onClose={() => setShowCreateForm(false)} />;
    }

    switch(activeTab) {
      case 'campaigns':
        return (
          <div className="flex-1 flex flex-col">
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md mx-auto">
                <div className="w-16 h-16 bg-gray-200 rounded-full mx-auto mb-6 flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <p className="text-gray-600 text-lg">Get started and create your first campaign!</p>
              </div>
            </div>
          </div>
        );
      case 'simulated-agents':
        return (
          <div className="p-8">
            <h1 className="text-2xl font-light text-gray-800 mb-4">Simulated Agents</h1>
            <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
              <p className="text-gray-500">No simulated agents created yet. Create campaigns to generate simulated agents!</p>
            </div>
          </div>
        );
      case 'conversations':
        return (
          <div className="p-8">
            <h1 className="text-2xl font-light text-gray-800 mb-4">Conversations</h1>
            <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
              <p className="text-gray-500">No conversations yet. Start a campaign to begin conversations!</p>
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
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-3xl font-bold font-serif text-gray-900">
            ipg<span className="text-blue-500">.</span>inc
          </h1>
          <div className="mt-3 relative">
            <button 
              onClick={() => setShowWorkspaceMenu(!showWorkspaceMenu)}
              className="flex items-center justify-between w-full bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors"
            >
              <span>Personal Workspace</span>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${showWorkspaceMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <nav className="flex-1 p-4">
          <div className="space-y-1">

            <button
              onClick={() => setActiveTab('campaigns')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
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
              onClick={() => setActiveTab('simulated-agents')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
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

            <button
              onClick={() => setActiveTab('conversations')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
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
          </div>
        </nav>

        {/* Support */}
        <div className="p-4 border-t border-gray-200">
          <button className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Support
          </button>
        </div>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="w-full p-4 text-left border-t border-gray-200 hover:bg-gray-50 transition-colors flex items-center justify-between"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-medium text-gray-600">
                  {user?.email?.charAt(0).toUpperCase()}
                </span>
              </div>
              <p className="text-sm text-gray-900 truncate">{user?.email}</p>
            </div>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown Menu */}
          {showUserMenu && (
            <div className="absolute bottom-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mb-1 overflow-hidden">
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
        {!showCreateModal && !showCreateForm && (
          <header className="bg-white border-b border-gray-200 px-8 py-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-light text-gray-800">Personal Workspace</h2>
              <button 
                onClick={() => setShowCreateModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
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