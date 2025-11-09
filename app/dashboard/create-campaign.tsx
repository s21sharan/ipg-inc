'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type TopicType = 'statement' | 'conversation' | 'question';

interface Topic {
  id: string;
  name: string;
  type: TopicType;
  content: string;
  // Conversation-specific fields
  persona?: string;
  goals?: string;
  maxDuration?: string;
  // Question-specific fields
  question?: string;
  probeQuestions?: string;
  probeDepth?: string;
}

interface CompletionLogic {
  completionAction: string;
  completionMessage: string;
  completionUrl: string;
  earlyExitAction: string;
  exitMessage: string;
  exitUrl: string;
}

interface Campaign {
  id?: string;
  name: string;
  title: string;
  caption: string;
  modality: string;
  time_estimate: string;
  topics: Topic[];
  completion_logic: CompletionLogic;
}

interface CreateCampaignFormProps {
  onClose: () => void;
  campaign?: Campaign;
}

export default function CreateCampaignForm({ onClose, campaign }: CreateCampaignFormProps) {
  const [activeSection, setActiveSection] = useState<'details' | 'guide' | 'completion'>('details');
  const [formData, setFormData] = useState({
    name: campaign?.name || '',
    title: campaign?.title || '',
    caption: campaign?.caption || '',
    modality: campaign?.modality || 'Audio + Video',
    timeEstimate: campaign?.time_estimate || ''
  });

  const [topics, setTopics] = useState<Topic[]>(
    campaign?.topics || [
      { id: '1', name: 'Kickoff', type: 'statement', content: 'Thanks so much for meeting with us today! We\'re looking forward to hearing your thoughts and experiences—please feel free to be open and honest. Your feedback is valuable and will help us make things better.' },
      { id: '3', name: 'Signoff', type: 'statement', content: '' }
    ]
  );

  const [selectedTopicId, setSelectedTopicId] = useState<string>('1');
  const [draggedTopicId, setDraggedTopicId] = useState<string | null>(null);
  const [showTopicTypeModal, setShowTopicTypeModal] = useState(false);
  const [editingTopicName, setEditingTopicName] = useState(false);

  const [completionLogic, setCompletionLogic] = useState<CompletionLogic>(
    campaign?.completion_logic || {
      completionAction: 'Show Message',
      completionMessage: '',
      completionUrl: '',
      earlyExitAction: 'Show Message',
      exitMessage: '',
      exitUrl: ''
    }
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [lastGeneratedCaption, setLastGeneratedCaption] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Validation state for inline errors
  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({
    name: false,
    title: false,
    caption: false,
    timeEstimate: false,
    completionUrl: false,
    exitUrl: false
  });
  const [triggerWiggle, setTriggerWiggle] = useState(false);

  // Debounce timer for auto-generating content
  const [captionDebounceTimer, setCaptionDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  // URL validation function
  const isValidUrl = (urlString: string): boolean => {
    if (!urlString.trim()) return false;
    try {
      const url = new URL(urlString);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear validation error for this field when user types
    if (validationErrors[name]) {
      setValidationErrors(prev => ({
        ...prev,
        [name]: false
      }));
    }

    // Auto-generate kickoff/signoff when caption changes (with debouncing)
    if (name === 'caption' && value.trim()) {
      // Reset hasGenerated if caption changed from what was previously generated
      if (value.trim() !== lastGeneratedCaption) {
        setHasGenerated(false);
      }

      // Clear existing timer
      if (captionDebounceTimer) {
        clearTimeout(captionDebounceTimer);
      }

      // Set new timer to generate after 1.5 seconds of no typing
      const timer = setTimeout(() => {
        if (value.trim() !== lastGeneratedCaption) {
          generateContent(value);
        }
      }, 1500);

      setCaptionDebounceTimer(timer);
    }
  };

  const generateContent = async (caption: string) => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ caption }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate content');
      }

      const data = await response.json();

      // Update kickoff and signoff topics
      setTopics(prev => prev.map(topic => {
        if (topic.name === 'Kickoff') {
          return { ...topic, content: data.kickoff };
        }
        if (topic.name === 'Signoff') {
          return { ...topic, content: data.signoff };
        }
        return topic;
      }));

      setHasGenerated(true);
      setLastGeneratedCaption(caption);
    } catch (error) {
      console.error('Error generating content:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTopicChange = (id: string, field: string, value: string) => {
    setTopics(prev => prev.map(topic =>
      topic.id === id ? { ...topic, [field]: value } : topic
    ));
  };

  const autoResizeTextarea = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    element.style.height = element.scrollHeight + 'px';
  };

  // Auto-resize textarea on mount and when content changes
  useEffect(() => {
    const textareas = document.querySelectorAll<HTMLTextAreaElement>('textarea[data-auto-resize]');
    textareas.forEach(textarea => autoResizeTextarea(textarea));
  }, [selectedTopicId, topics]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (captionDebounceTimer) {
        clearTimeout(captionDebounceTimer);
      }
    };
  }, [captionDebounceTimer]);

  const addTopic = (type: TopicType) => {
    const newTopic: Topic = {
      id: Date.now().toString(),
      name: type === 'statement' ? 'New Statement' : type === 'conversation' ? 'Topic Name' : 'Topic Name',
      type: type,
      content: '',
      // Initialize conversation-specific fields
      ...(type === 'conversation' && {
        persona: 'Jordan – The Empathetic Listener',
        goals: 'Example Goal 1\nExample Goal 2',
        maxDuration: ''
      }),
      // Initialize question-specific fields
      ...(type === 'question' && {
        question: '',
        probeQuestions: '',
        probeDepth: 'No probe questions'
      })
    };
    setTopics(prev => [...prev.slice(0, -1), newTopic, prev[prev.length - 1]]);
    setSelectedTopicId(newTopic.id);
    setShowTopicTypeModal(false);
  };

  const removeTopic = (id: string) => {
    setTopics(prev => prev.filter(topic => topic.id !== id));
    if (selectedTopicId === id && topics.length > 1) {
      setSelectedTopicId(topics[0].id);
    }
  };

  const handleDragStart = (id: string) => {
    setDraggedTopicId(id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedTopicId || draggedTopicId === targetId) return;

    const draggedIndex = topics.findIndex(t => t.id === draggedTopicId);
    const targetIndex = topics.findIndex(t => t.id === targetId);

    const newTopics = [...topics];
    const [draggedTopic] = newTopics.splice(draggedIndex, 1);
    newTopics.splice(targetIndex, 0, draggedTopic);

    setTopics(newTopics);
  };

  const handleDragEnd = () => {
    setDraggedTopicId(null);
  };

  const getTopicIcon = (type: TopicType) => {
    switch (type) {
      case 'statement':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        );
      case 'conversation':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        );
      case 'question':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const handleNext = async () => {
    if (activeSection === 'details') {
      // Validate all required fields are filled
      const errors: Record<string, boolean> = {
        name: !formData.name.trim(),
        title: !formData.title.trim(),
        caption: !formData.caption.trim(),
        timeEstimate: !formData.timeEstimate.trim()
      };

      // Check if any field has errors
      const hasErrors = Object.values(errors).some(error => error);

      if (hasErrors) {
        // Set validation errors to show red borders
        setValidationErrors(errors);

        // Trigger wiggle animation
        setTriggerWiggle(true);

        // Reset wiggle trigger after animation completes
        setTimeout(() => setTriggerWiggle(false), 500);

        return;
      }

      // Clear all validation errors if validation passes
      setValidationErrors({
        name: false,
        title: false,
        caption: false,
        timeEstimate: false,
        completionUrl: false,
        exitUrl: false
      });

      // Generate kickoff and signoff if caption changed or not yet generated
      if (!isGenerating && formData.caption.trim() && formData.caption.trim() !== lastGeneratedCaption) {
        generateContent(formData.caption);
      }

      // Navigate immediately to guide section
      setActiveSection('guide');
    } else if (activeSection === 'guide') {
      setActiveSection('completion');
    }
  };

  const handleBack = () => {
    if (activeSection === 'guide') {
      setActiveSection('details');
    } else if (activeSection === 'completion') {
      setActiveSection('guide');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);

    try {
      // Get the current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('You must be logged in to save campaigns');
      }

      // Prepare campaign data
      const campaignData = {
        user_id: user.id,
        name: formData.name,
        title: formData.title,
        caption: formData.caption,
        modality: formData.modality,
        time_estimate: formData.timeEstimate,
        topics: topics,
        completion_logic: completionLogic
      };

      if (campaign?.id) {
        // Update existing campaign
        const { error: updateError } = await supabase
          .from('campaigns')
          .update(campaignData)
          .eq('id', campaign.id);

        if (updateError) {
          throw updateError;
        }
      } else {
        // Insert new campaign
        const { error: insertError } = await supabase
          .from('campaigns')
          .insert(campaignData);

        if (insertError) {
          throw insertError;
        }
      }

      // Success! Close the form
      onClose();
    } catch (error) {
      console.error('Error saving campaign:', error);
      setSaveError(error instanceof Error ? error.message : 'Failed to save campaign');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-3">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-light text-gray-800">{campaign ? 'Edit Campaign' : 'Create Campaign'}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          </div>

        </div>

        {/* Progress Bar */}
        <div className="px-6 py-2">
          <div className="grid grid-cols-3 gap-4">
            {/* Campaign details */}
            <button
              onClick={() => setActiveSection('details')}
              className="text-left"
            >
              <span className={`text-sm font-medium transition-colors ${
                activeSection === 'details' ? 'text-blue-600' : 'text-gray-500'
              }`}>
                Campaign details
              </span>
              <div className="h-1 mt-2 bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-300 ${
                  activeSection === 'details' ? 'bg-blue-600' : 
                  activeSection === 'guide' || activeSection === 'completion' ? 'bg-blue-600' : 'bg-gray-200'
                }`} style={{ width: '100%' }} />
              </div>
            </button>
            
            {/* Discussion guide */}
            <button
              onClick={() => setActiveSection('guide')}
              className="text-left"
            >
              <span className={`text-sm font-medium transition-colors ${
                activeSection === 'guide' ? 'text-blue-600' : 'text-gray-500'
              }`}>
                Discussion guide
              </span>
              <div className="h-1 mt-2 bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-300 ${
                  activeSection === 'guide' ? 'bg-blue-600' : 
                  activeSection === 'completion' ? 'bg-blue-600' : 'bg-gray-200'
                }`} style={{ width: '100%' }} />
              </div>
            </button>
            
            {/* Completion logic */}
            <button
              onClick={() => setActiveSection('completion')}
              className="text-left"
            >
              <span className={`text-sm font-medium transition-colors ${
                activeSection === 'completion' ? 'text-blue-600' : 'text-gray-500'
              }`}>
                Completion logic
              </span>
              <div className="h-1 mt-2 bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-300 ${
                  activeSection === 'completion' ? 'bg-blue-600' : 'bg-gray-200'
                }`} style={{ width: '100%' }} />
              </div>
            </button>
          </div>
        </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
          {/* Campaign Details Section */}
          {activeSection === 'details' && (
            <div className="p-8 overflow-y-auto">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-gray-400 font-normal">- Identifier for the Campaign, used for internal reference</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Your name"
                  className={`w-full px-3 py-1.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white ${
                    validationErrors.name
                      ? 'border-red-500 border-2'
                      : 'border-gray-300'
                  } ${triggerWiggle && validationErrors.name ? 'wiggle' : ''}`}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title <span className="text-gray-400 font-normal">- Rendered on the respondent Campaign screen</span>
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  placeholder="Interview title"
                  className={`w-full px-3 py-1.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white ${
                    validationErrors.title
                      ? 'border-red-500 border-2'
                      : 'border-gray-300'
                  } ${triggerWiggle && validationErrors.title ? 'wiggle' : ''}`}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Caption <span className="text-gray-400 font-normal">- Rendered on the respondent Campaign screen prior to the user starting Campaign</span>
                </label>
                <textarea
                  name="caption"
                  value={formData.caption}
                  onChange={handleInputChange}
                  onBlur={() => {
                    // Trigger generation when user leaves the caption field
                    if (formData.caption.trim() && formData.caption.trim() !== lastGeneratedCaption) {
                      if (captionDebounceTimer) {
                        clearTimeout(captionDebounceTimer);
                      }
                      generateContent(formData.caption);
                    }
                  }}
                  rows={3}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-900 bg-white ${
                    validationErrors.caption
                      ? 'border-red-500 border-2'
                      : 'border-gray-300'
                  } ${triggerWiggle && validationErrors.caption ? 'wiggle' : ''}`}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Modality <span className="text-gray-400 font-normal">- Choose whether to collect audio and video or audio only</span>
                </label>
                <select
                  name="modality"
                  value={formData.modality}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg%20xmlns%3d%22http%3a%2f%2fwww.w3.org%2f2000%2fsvg%22%20width%3d%2212%22%20height%3d%2212%22%20viewBox%3d%220%200%2012%2012%22%3e%3cpath%20fill%3d%22%23333%22%20d%3d%22M10.293%203.293%206%207.586%201.707%203.293A1%201%200%200%200%20.293%204.707l5%205a1%201%200%200%200%201.414%200l5-5a1%201%200%201%200-1.414-1.414z%22%2f%3e%3c%2fsvg%3e')] bg-[length:12px] bg-[right_1rem_center] bg-no-repeat pr-10"
                >
                  <option value="Audio + Video">Audio + Video</option>
                  <option value="Audio Only">Audio Only</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Time Estimate <span className="text-gray-400 font-normal">- Estimated time for the Campaign in minutes</span>
                </label>
                <input
                  type="number"
                  name="timeEstimate"
                  value={formData.timeEstimate}
                  onChange={handleInputChange}
                  className={`w-32 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white ${
                    validationErrors.timeEstimate
                      ? 'border-red-500 border-2'
                      : 'border-gray-300'
                  } ${triggerWiggle && validationErrors.timeEstimate ? 'wiggle' : ''}`}
                />
              </div>

              <button
                onClick={handleNext}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                Next
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            </div>
          )}

          {/* Discussion Guide Section */}
          {activeSection === 'guide' && (
            <div className="flex gap-0 flex-1 relative">
              {/* Left Sidebar - Topics List */}
              <div className="w-64 bg-white border-r border-gray-200 flex flex-col pb-12">
                <div className="p-4 space-y-1 flex-1">
                  {topics.map((topic, index) => (
                    <div
                      key={topic.id}
                      draggable
                      onDragStart={() => handleDragStart(topic.id)}
                      onDragOver={(e) => handleDragOver(e, topic.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => setSelectedTopicId(topic.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all text-sm ${
                        selectedTopicId === topic.id
                          ? 'bg-blue-50 border border-blue-200 text-blue-900'
                          : 'hover:bg-gray-50 text-gray-700'
                      } ${draggedTopicId === topic.id ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={`text-xs ${selectedTopicId === topic.id ? 'text-blue-600' : 'text-gray-500'}`}>
                          {getTopicIcon(topic.type)}
                        </span>
                        <span className="font-medium text-xs">{index + 1}</span>
                        <span className="truncate">{topic.name}</span>
                      </div>
                      <svg className="w-3 h-3 text-gray-400 cursor-move flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16" />
                      </svg>
                    </div>
                  ))}

                  <button
                    onClick={() => setShowTopicTypeModal(true)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors mt-2 border border-dashed border-blue-300"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Add Topic
                  </button>
                </div>

              </div>

              {/* Right Content - Topic Editor */}
              <div className="flex-1 flex flex-col pb-12">
                {(() => {
                  const selectedTopic = topics.find(t => t.id === selectedTopicId);
                  if (!selectedTopic) return null;

                  return (
                    <div className="flex-1 flex flex-col p-4">
                      {/* Topic Header */}
                      {(selectedTopic.type === 'conversation' || selectedTopic.type === 'question') ? (
                        // Conversation/Question header - just shows "Topic Name" label
                        <div className="mb-3">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Topic Name</label>
                          {editingTopicName ? (
                            <input
                              type="text"
                              value={selectedTopic.name}
                              onChange={(e) => handleTopicChange(selectedTopic.id, 'name', e.target.value)}
                              onBlur={() => setEditingTopicName(false)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') setEditingTopicName(false);
                              }}
                              autoFocus
                              className="text-lg font-normal text-gray-900 border-b-2 border-blue-500 focus:outline-none bg-transparent w-full"
                            />
                          ) : (
                            <div className="flex items-center gap-2">
                              <h2 className="text-lg font-normal text-gray-900">{selectedTopic.name}</h2>
                              <button
                                onClick={() => setEditingTopicName(true)}
                                className="text-gray-400 hover:text-blue-600 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        // Statement header - shows name and type
                        <div className="mb-4 pb-3 border-b border-gray-200">
                          <div className="flex items-center gap-3 mb-3">
                            {editingTopicName ? (
                              <input
                                type="text"
                                value={selectedTopic.name}
                                onChange={(e) => handleTopicChange(selectedTopic.id, 'name', e.target.value)}
                                onBlur={() => setEditingTopicName(false)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') setEditingTopicName(false);
                                }}
                                autoFocus
                                className="text-3xl font-light text-gray-900 border-b-2 border-blue-500 focus:outline-none bg-transparent flex-1"
                              />
                            ) : (
                              <>
                                <h2 className="text-3xl font-light text-gray-900">{selectedTopic.name}</h2>
                                <button
                                  onClick={() => setEditingTopicName(true)}
                                  className="text-gray-400 hover:text-blue-600 transition-colors"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                </button>
                              </>
                            )}
                          </div>

                          <div className="flex items-start gap-2">
                            <span className="text-sm px-3 py-1.5 bg-gray-100 rounded-lg text-gray-700 font-medium">
                              {selectedTopic.type.charAt(0).toUpperCase() + selectedTopic.type.slice(1)}
                            </span>
                            <span className="text-sm text-gray-500 pt-1.5">
                              - The AI moderator will state this statement verbatim to the user
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Topic Content */}
                      <div className="flex-1 flex flex-col">
                        {selectedTopic.type === 'conversation' ? (
                          // Conversation-specific fields
                          <div className="space-y-3">
                            {/* Persona Field */}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Persona <span className="text-gray-400 font-normal text-xs">- Guide how you would like the AI moderator to conduct the topic</span>
                                <button className="ml-1 text-gray-400 hover:text-gray-600">
                                  <svg className="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                </button>
                              </label>
                              <select
                                value={selectedTopic.persona || 'Jordan – The Empathetic Listener'}
                                onChange={(e) => handleTopicChange(selectedTopic.id, 'persona', e.target.value)}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg%20xmlns%3d%22http%3a%2f%2fwww.w3.org%2f2000%2fsvg%22%20width%3d%2212%22%20height%3d%2212%22%20viewBox%3d%220%200%2012%2012%22%3e%3cpath%20fill%3d%22%23333%22%20d%3d%22M10.293%203.293%206%207.586%201.707%203.293A1%201%200%200%200%20.293%204.707l5%205a1%201%200%200%200%201.414%200l5-5a1%201%200%201%200-1.414-1.414z%22%2f%3e%3c%2fsvg%3e')] bg-[length:12px] bg-[right_0.75rem_center] bg-no-repeat pr-10"
                              >
                                <option value="Jordan – The Empathetic Listener">Jordan – The Empathetic Listener</option>
                                <option value="Riley – The Energetic Product Researcher">Riley – The Energetic Product Researcher</option>
                                <option value="Sam – The Analytical Moderator">Sam – The Analytical Moderator</option>
                                <option value="David - The Curious Friend">David - The Curious Friend</option>
                              </select>
                            </div>

                            {/* Goals Field */}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center justify-between">
                                <span>
                                  Goals <span className="text-gray-400 font-normal text-xs">- The AI moderator will guide the conversation toward your objectives.</span>
                                </span>
                                <button className="text-gray-400 hover:text-gray-600">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                                  </svg>
                                </button>
                              </label>
                              <textarea
                                value={selectedTopic.goals || ''}
                                onChange={(e) => handleTopicChange(selectedTopic.id, 'goals', e.target.value)}
                                placeholder="Example Goal 1&#10;Example Goal 2"
                                rows={3}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-900 bg-white"
                              />
                            </div>

                            {/* Max Duration Field */}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Max Duration <span className="text-gray-400 font-normal text-xs">- Optional maximum time in minutes for the topic</span>
                              </label>
                              <input
                                type="number"
                                value={selectedTopic.maxDuration || ''}
                                onChange={(e) => handleTopicChange(selectedTopic.id, 'maxDuration', e.target.value)}
                                className="w-24 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                              />
                            </div>
                          </div>
                        ) : selectedTopic.type === 'question' ? (
                          // Question-specific fields
                          <div className="space-y-3">
                            {/* Question Field */}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center justify-between">
                                <span>
                                  Question <span className="text-gray-400 font-normal text-xs">- The AI moderator will ask this question verbatim to the user</span>
                                </span>
                                <button className="text-gray-400 hover:text-gray-600">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                                  </svg>
                                </button>
                              </label>
                              <textarea
                                value={selectedTopic.question || ''}
                                onChange={(e) => handleTopicChange(selectedTopic.id, 'question', e.target.value)}
                                rows={2}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-900 bg-white"
                              />
                            </div>

                            {/* Probe Questions Field */}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center justify-between">
                                <span>
                                  Probe Questions <span className="text-gray-400 font-normal text-xs">- Based on the response, the AI moderator can ask follow-up questions</span>
                                </span>
                                <button className="text-gray-400 hover:text-gray-600">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                                  </svg>
                                </button>
                              </label>
                              <textarea
                                value={selectedTopic.probeQuestions || ''}
                                onChange={(e) => handleTopicChange(selectedTopic.id, 'probeQuestions', e.target.value)}
                                rows={3}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-900 bg-white"
                              />
                            </div>

                            {/* Probe Depth Field */}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Probe Depth <span className="text-gray-400 font-normal text-xs">- The # of probing questions asked after the initial question</span>
                              </label>
                              <select
                                value={selectedTopic.probeDepth || 'No probe questions'}
                                onChange={(e) => handleTopicChange(selectedTopic.id, 'probeDepth', e.target.value)}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg%20xmlns%3d%22http%3a%2f%2fwww.w3.org%2f2000%2fsvg%22%20width%3d%2212%22%20height%3d%2212%22%20viewBox%3d%220%200%2012%2012%22%3e%3cpath%20fill%3d%22%23333%22%20d%3d%22M10.293%203.293%206%207.586%201.707%203.293A1%201%200%200%200%20.293%204.707l5%205a1%201%200%200%200%201.414%200l5-5a1%201%200%201%200-1.414-1.414z%22%2f%3e%3c%2fsvg%3e')] bg-[length:12px] bg-[right_0.75rem_center] bg-no-repeat pr-10"
                              >
                                <option value="No probe questions">No probe questions</option>
                                <option value="1-2">1-2 questions</option>
                                <option value="3-5">3-5 questions</option>
                                <option value="5-10">5-10 questions</option>
                              </select>
                            </div>
                          </div>
                        ) : (
                          // Statement content
                          <textarea
                            data-auto-resize
                            value={selectedTopic.content}
                            onChange={(e) => {
                              handleTopicChange(selectedTopic.id, 'content', e.target.value);
                              autoResizeTextarea(e.target);
                            }}
                            onInput={(e) => autoResizeTextarea(e.currentTarget)}
                            placeholder="Enter your statement here..."
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-900 bg-white overflow-hidden"
                            style={{ minHeight: '80px' }}
                          />
                        )}
                      </div>

                      {/* Delete Topic Button */}
                      {selectedTopic.name !== 'Kickoff' && selectedTopic.name !== 'Signoff' && (
                        <div className="pt-4 mt-4 border-t border-gray-200">
                          <button
                            onClick={() => {
                              if (window.confirm('Are you sure you want to delete this topic?')) {
                                removeTopic(selectedTopic.id);
                              }
                            }}
                            className="w-10 h-10 border-2 border-red-500 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Bottom Navigation - At the bottom of entire section */}
              <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200">
                <div className="flex gap-2 p-3">
                  <button
                    onClick={handleBack}
                    className="px-3 py-1 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleNext}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors flex items-center gap-1"
                  >
                    Next
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Completion Logic Section */}
          {activeSection === 'completion' && (
            <div className="p-8 overflow-y-auto">
              <div className="space-y-6">
              {/* Completion Logic */}
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-lg font-medium text-gray-800 mb-3">Completion Logic</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Completion Action <span className="text-gray-400 font-normal">- Choose what happens when the interview is completed</span>
                    </label>
                    <select
                      value={completionLogic.completionAction}
                      onChange={(e) => setCompletionLogic(prev => ({ ...prev, completionAction: e.target.value }))}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                    >
                      <option value="Show Message">Show Message</option>
                      <option value="Redirect">Redirect to URL</option>
                    </select>
                  </div>

                  {completionLogic.completionAction === 'Show Message' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Completion Message <span className="text-gray-400 font-normal">- Message to display as text upon completing an interview</span>
                      </label>
                      <textarea
                        value={completionLogic.completionMessage}
                        onChange={(e) => setCompletionLogic(prev => ({ ...prev, completionMessage: e.target.value }))}
                        placeholder="Enter the completion message here..."
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-900 bg-white"
                      />
                    </div>
                  )}

                  {completionLogic.completionAction === 'Redirect' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Redirect URL <span className="text-gray-400 font-normal">- URL to redirect to upon completing the interview</span>
                      </label>
                      <input
                        type="url"
                        value={completionLogic.completionUrl}
                        onChange={(e) => {
                          setCompletionLogic(prev => ({ ...prev, completionUrl: e.target.value }));
                          // Clear validation error when user types
                          if (validationErrors.completionUrl) {
                            setValidationErrors(prev => ({ ...prev, completionUrl: false }));
                          }
                        }}
                        onBlur={(e) => {
                          // Validate on blur
                          if (e.target.value && !isValidUrl(e.target.value)) {
                            setValidationErrors(prev => ({ ...prev, completionUrl: true }));
                          }
                        }}
                        placeholder="https://example.com/thank-you"
                        className={`w-full px-3 py-1.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white ${
                          validationErrors.completionUrl
                            ? 'border-red-500 border-2'
                            : 'border-gray-300'
                        }`}
                      />
                      {validationErrors.completionUrl && (
                        <p className="text-sm text-red-600 mt-1">Please enter a valid URL starting with http:// or https://</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Early Exit Logic */}
              <div>
                <h3 className="text-lg font-medium text-gray-800 mb-3">Early Exit Logic</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Early Exit Action <span className="text-gray-400 font-normal">- Choose what happens when the interview is exited early (optional)</span>
                    </label>
                    <select
                      value={completionLogic.earlyExitAction}
                      onChange={(e) => setCompletionLogic(prev => ({ ...prev, earlyExitAction: e.target.value }))}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                    >
                      <option value="Show Message">Show Message</option>
                      <option value="Redirect">Redirect to URL</option>
                    </select>
                  </div>

                  {completionLogic.earlyExitAction === 'Show Message' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Exit Message <span className="text-gray-400 font-normal">- Message to display as text upon exiting the interview early</span>
                      </label>
                      <textarea
                        value={completionLogic.exitMessage}
                        onChange={(e) => setCompletionLogic(prev => ({ ...prev, exitMessage: e.target.value }))}
                        placeholder="Enter the exit message here..."
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-900 bg-white"
                      />
                    </div>
                  )}

                  {completionLogic.earlyExitAction === 'Redirect' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Redirect URL <span className="text-gray-400 font-normal">- URL to redirect to upon exiting the interview early</span>
                      </label>
                      <input
                        type="url"
                        value={completionLogic.exitUrl}
                        onChange={(e) => {
                          setCompletionLogic(prev => ({ ...prev, exitUrl: e.target.value }));
                          // Clear validation error when user types
                          if (validationErrors.exitUrl) {
                            setValidationErrors(prev => ({ ...prev, exitUrl: false }));
                          }
                        }}
                        onBlur={(e) => {
                          // Validate on blur
                          if (e.target.value && !isValidUrl(e.target.value)) {
                            setValidationErrors(prev => ({ ...prev, exitUrl: true }));
                          }
                        }}
                        placeholder="https://example.com/exit"
                        className={`w-full px-3 py-1.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white ${
                          validationErrors.exitUrl
                            ? 'border-red-500 border-2'
                            : 'border-gray-300'
                        }`}
                      />
                      {validationErrors.exitUrl && (
                        <p className="text-sm text-red-600 mt-1">Please enter a valid URL starting with http:// or https://</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {saveError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {saveError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleBack}
                  disabled={isSaving}
                  className="px-4 py-1.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Back
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </>
                  ) : (
                    'Save Campaign'
                  )}
                </button>
              </div>
            </div>
            </div>
          )}
      </div>


      {/* Topic Type Selection Modal */}
      {showTopicTypeModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 p-8">
            <h2 className="text-2xl font-light text-gray-900 mb-6">Choose Topic Type</h2>

            <div className="space-y-4 mb-8">
              {/* Statement Option */}
              <button
                onClick={() => addTopic('statement')}
                className="w-full text-left p-6 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:shadow-lg transition-all group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center group-hover:bg-blue-50 transition-colors flex-shrink-0">
                    <svg className="w-5 h-5 text-gray-600 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-gray-900 mb-1">Statement</h3>
                    <p className="text-sm text-gray-700 mb-2">A statement shared with the user.</p>
                    <p className="text-sm text-gray-500 italic">Best for introductions, briefings, or sign-offs</p>
                  </div>
                </div>
              </button>

              {/* Conversation Option */}
              <button
                onClick={() => addTopic('conversation')}
                className="w-full text-left p-6 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:shadow-lg transition-all group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center group-hover:bg-blue-50 transition-colors flex-shrink-0">
                    <svg className="w-5 h-5 text-gray-600 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-gray-900 mb-1">Conversation</h3>
                    <p className="text-sm text-gray-700 mb-2">An open-ended discussion with the user using a defined persona</p>
                    <p className="text-sm text-gray-500 italic">Best for exploring experiences, stories, and perspectives to uncover deeper insights or unknowns</p>
                  </div>
                </div>
              </button>

              {/* Question Option */}
              <button
                onClick={() => addTopic('question')}
                className="w-full text-left p-6 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:shadow-lg transition-all group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center group-hover:bg-blue-50 transition-colors flex-shrink-0">
                    <svg className="w-5 h-5 text-gray-600 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-gray-900 mb-1">Question</h3>
                    <p className="text-sm text-gray-700 mb-2">A verbatim question asked to the user with specific follow-up probes.</p>
                    <p className="text-sm text-gray-500 italic">Best for structured interviews, benchmarking, or quantitative follow-ups where consistency matters</p>
                  </div>
                </div>
              </button>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowTopicTypeModal(false)}
                className="px-6 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}