'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

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

export default function CampaignPage() {
  const params = useParams();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentTopic, setCurrentTopic] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch campaign and auto-start interview
  useEffect(() => {
    const initializeInterview = async () => {
      try {
        // Fetch campaign details
        const { data, error: fetchError } = await supabase
          .from('campaigns')
          .select('*')
          .eq('id', campaignId)
          .single();

        if (fetchError) {
          setError('Campaign not found');
          console.error('Error fetching campaign:', fetchError);
          return;
        }

        setCampaign(data);

        // Auto-start interview
        await startInterview(data.id);
      } catch (err) {
        console.error('Error initializing interview:', err);
        setError('Failed to start interview');
      }
    };

    if (campaignId) {
      initializeInterview();
    }
  }, [campaignId]);

  const startInterview = async (campId: string) => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/interview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campId,
          user_id: 'anonymous', // Use anonymous user ID for public campaigns
        }),
      });

      const data = await response.json();
      setSessionId(data.session_id);
      setCurrentTopic(data.current_topic);
      setMessages([{ role: 'assistant', content: data.message, topic: data.current_topic }]);
    } catch (error) {
      console.error('Error starting interview:', error);
      setError('Failed to connect to interview service');
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
      setError('Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full mx-auto mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Oops!</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!campaign || !sessionId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-12 w-12 text-blue-600 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-gray-600">Loading interview...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-semibold text-gray-900">{campaign.title}</h1>
          {campaign.caption && (
            <p className="text-sm text-gray-600 mt-1">{campaign.caption}</p>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col max-w-4xl w-full mx-auto p-6">
        {/* Topic Indicator */}
        {currentTopic && (
          <div className="mb-4 text-sm text-gray-500">
            Current topic: <span className="font-medium text-gray-700">{currentTopic}</span>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 bg-white rounded-lg border border-gray-200 p-6 mb-4 overflow-y-auto space-y-4 max-h-[500px]">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] rounded-lg p-4 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                <div className="text-xs mb-1 opacity-75">
                  {msg.role === 'user' ? 'You' : 'Interviewer'}
                </div>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Input Area */}
        {!isComplete ? (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Type your response..."
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white placeholder:text-gray-400"
                disabled={loading}
                autoFocus
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                {loading ? (
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  'Send'
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full mx-auto mb-3 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Interview Complete!</h3>
            <p className="text-sm text-gray-600">Thank you for participating in this conversation.</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs text-gray-500">
            Powered by{' '}
            <span className="font-semibold">
              ipg<span className="text-blue-600">.</span>inc
            </span>
          </p>
        </div>
      </footer>
    </div>
  );
}
