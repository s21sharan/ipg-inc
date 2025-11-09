'use client';

import { useState } from 'react';

interface CreateCampaignFormProps {
  onClose: () => void;
}

type TopicType = 'statement' | 'conversation' | 'question';

interface Topic {
  id: string;
  name: string;
  type: TopicType;
  content: string;
}

export default function CreateCampaignForm({ onClose }: CreateCampaignFormProps) {
  const [activeSection, setActiveSection] = useState<'details' | 'guide' | 'completion'>('details');
  const [formData, setFormData] = useState({
    name: '',
    title: '',
    caption: '',
    modality: 'Audio + Video',
    timeEstimate: ''
  });

  const [topics, setTopics] = useState<Topic[]>([
    { id: '1', name: 'Kickoff', type: 'statement', content: '' },
    { id: '2', name: 'Add Topic Name', type: 'conversation', content: '' },
    { id: '3', name: 'Signoff', type: 'statement', content: '' }
  ]);

  const [completionLogic, setCompletionLogic] = useState({
    completionAction: 'Show Message',
    completionMessage: '',
    earlyExitAction: 'Show Message',
    exitMessage: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleTopicChange = (id: string, field: string, value: string) => {
    setTopics(prev => prev.map(topic => 
      topic.id === id ? { ...topic, [field]: value } : topic
    ));
  };

  const addTopic = () => {
    const newTopic: Topic = {
      id: Date.now().toString(),
      name: 'New Topic',
      type: 'conversation',
      content: ''
    };
    setTopics(prev => [...prev, newTopic]);
  };

  const removeTopic = (id: string) => {
    setTopics(prev => prev.filter(topic => topic.id !== id));
  };

  const handleNext = () => {
    if (activeSection === 'details') {
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

  const handleSave = () => {
    // Handle save logic here
    console.log('Campaign saved:', { formData, topics, completionLogic });
    onClose();
  };

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 px-8 py-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-light text-gray-800">Create Campaign</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          </div>
          
        </div>
        
        {/* Progress Bar */}
        <div className="px-8 py-6">
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
      <div className="flex-1 overflow-y-auto p-8">
          {/* Campaign Details Section */}
          {activeSection === 'details' && (
            <div className="space-y-6">
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
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
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-900 bg-white"
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
                  className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                />
              </div>

              <button
                onClick={handleNext}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                Next
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          {/* Discussion Guide Section */}
          {activeSection === 'guide' && (
            <div className="space-y-6">
              <div className="space-y-4">
                {topics.map((topic, index) => (
                  <div key={topic.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-red-500 font-medium">{index + 1}</span>
                      <input
                        type="text"
                        value={topic.name}
                        onChange={(e) => handleTopicChange(topic.id, 'name', e.target.value)}
                        className="flex-1 px-3 py-1 text-sm font-medium border-b border-gray-300 focus:border-blue-500 focus:outline-none text-gray-900 bg-transparent"
                      />
                      {topics.length > 3 && (
                        <button
                          onClick={() => removeTopic(topic.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                    
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <select
                          value={topic.type}
                          onChange={(e) => handleTopicChange(topic.id, 'type', e.target.value)}
                          className="text-sm px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                        >
                          <option value="statement">Statement</option>
                          <option value="conversation">Conversation</option>
                          <option value="question">Question</option>
                        </select>
                        <span className="text-sm text-gray-500">
                          - {topic.type === 'statement' 
                            ? 'The AI moderator will state this verbatim to the user' 
                            : topic.type === 'conversation'
                            ? 'Dynamic conversation based on the topic'
                            : 'Direct question to the user'}
                        </span>
                      </div>
                      <textarea
                        value={topic.content}
                        onChange={(e) => handleTopicChange(topic.id, 'content', e.target.value)}
                        placeholder={topic.type === 'statement' ? 'Enter your statement here...' : 'Enter content here...'}
                        rows={3}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-900 bg-white"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={addTopic}
                className="flex items-center gap-2 text-blue-600 hover:text-blue-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Topic
              </button>

              <div className="flex gap-3">
                <button
                  onClick={handleBack}
                  className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleNext}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  Next
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Completion Logic Section */}
          {activeSection === 'completion' && (
            <div className="space-y-8">
              {/* Completion Logic */}
              <div className="border-b border-gray-200 pb-8">
                <h3 className="text-lg font-medium text-gray-800 mb-4">Completion Logic</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Completion Action <span className="text-gray-400 font-normal">- Choose what happens when the interview is completed</span>
                    </label>
                    <select
                      value={completionLogic.completionAction}
                      onChange={(e) => setCompletionLogic(prev => ({ ...prev, completionAction: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-900 bg-white"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Early Exit Logic */}
              <div>
                <h3 className="text-lg font-medium text-gray-800 mb-4">Early Exit Logic</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Early Exit Action <span className="text-gray-400 font-normal">- Choose what happens when the interview is exited early (optional)</span>
                    </label>
                    <select
                      value={completionLogic.earlyExitAction}
                      onChange={(e) => setCompletionLogic(prev => ({ ...prev, earlyExitAction: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-900 bg-white"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Advanced Options */}
              <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                  <svg className="w-4 h-4 group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                  Advanced Options
                </summary>
                <div className="mt-4 pl-6 text-sm text-gray-500">
                  Advanced options coming soon...
                </div>
              </details>

              <div className="flex gap-3">
                <button
                  onClick={handleBack}
                  className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSave}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  Save Campaign
                </button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}