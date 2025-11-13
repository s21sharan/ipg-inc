'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Campaign {
  id: string;
  name: string;
  title: string;
  caption: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  topic?: string;
}

export default function InterviewPage() {
  const [user, setUser] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentTopic, setCurrentTopic] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  // Get authenticated user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        fetchCampaigns(user.id);
      }
    };
    getUser();
  }, []);

  const fetchCampaigns = async (userId: string) => {
    try {
      // Fetch directly from Supabase instead of backend
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCampaigns(data || []);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    }
  };

  const startInterview = async () => {
    if (!selectedCampaign || !user) return;

    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/interview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: selectedCampaign,
          user_id: user.id,
        }),
      });

      const data = await response.json();
      setSessionId(data.session_id);
      setCurrentTopic(data.current_topic);
      setMessages([{ role: 'assistant', content: data.message, topic: data.current_topic }]);
    } catch (error) {
      console.error('Error starting interview:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !sessionId) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch('http://localhost:8000/interview/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          message: userMessage,
        }),
      });

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.message, topic: data.current_topic },
      ]);
      setCurrentTopic(data.current_topic);
      setIsComplete(data.is_complete || false);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-black text-white p-8 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl mb-4">Please sign in to use the interview agent</p>
          <a href="/signin" className="text-blue-500 hover:underline">
            Go to Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Interview Agent</h1>

        {!sessionId ? (
          <div className="space-y-4">
            <h2 className="text-xl">Select a Campaign</h2>
            <select
              value={selectedCampaign}
              onChange={(e) => setSelectedCampaign(e.target.value)}
              className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded text-white"
            >
              <option value="">Choose a campaign...</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.title}
                </option>
              ))}
            </select>

            <button
              onClick={startInterview}
              disabled={!selectedCampaign || loading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-800 rounded"
            >
              {loading ? 'Starting...' : 'Start Interview'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-zinc-400">
              Current Topic: <span className="text-white">{currentTopic}</span>
            </div>

            <div className="h-96 overflow-y-auto bg-zinc-900 rounded p-4 space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded ${
                    msg.role === 'user'
                      ? 'bg-blue-900 ml-12'
                      : 'bg-zinc-800 mr-12'
                  }`}
                >
                  <div className="text-xs text-zinc-400 mb-1">
                    {msg.role === 'user' ? 'You' : `AI${msg.topic ? ` - ${msg.topic}` : ''}`}
                  </div>
                  <div>{msg.content}</div>
                </div>
              ))}
            </div>

            {!isComplete ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type your response..."
                  className="flex-1 p-3 bg-zinc-900 border border-zinc-800 rounded text-white"
                  disabled={loading}
                />
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-800 rounded"
                >
                  {loading ? 'Sending...' : 'Send'}
                </button>
              </div>
            ) : (
              <div className="text-center p-4 bg-green-900 rounded">
                Interview Complete! Thank you for participating.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
