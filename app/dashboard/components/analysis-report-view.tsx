'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '@/lib/db/supabase';

interface AnalysisReportViewProps {
  reportMarkdown: string;
  onBack: () => void;
}

interface TOCItem {
  id: string;
  text: string;
  level: number;
}

interface CitationModalData {
  conversationId: string;
  blockIndex: number;
}

export default function AnalysisReportView({ reportMarkdown, onBack }: AnalysisReportViewProps) {
  const [citationModal, setCitationModal] = useState<CitationModalData | null>(null);
  const [citationConversation, setCitationConversation] = useState<any | null>(null);
  const [loadingCitation, setLoadingCitation] = useState(false);
  const [activeHeading, setActiveHeading] = useState<string>('');
  const contentRef = useRef<HTMLDivElement>(null);

  // Extract headings for table of contents
  const tocItems = useMemo(() => {
    const items: TOCItem[] = [];
    const lines = reportMarkdown.split('\n');
    let headingIndex = 0;

    lines.forEach((line) => {
      // Match headings - need to check for ### before ## before #
      const h3Match = line.match(/^### (.+)$/);
      const h2Match = line.match(/^## (.+)$/);
      const h1Match = line.match(/^# (.+)$/);

      if (h3Match) {
        items.push({ id: `heading-${headingIndex}`, text: h3Match[1].trim(), level: 3 });
        headingIndex++;
      } else if (h2Match) {
        items.push({ id: `heading-${headingIndex}`, text: h2Match[1].trim(), level: 2 });
        headingIndex++;
      } else if (h1Match) {
        items.push({ id: `heading-${headingIndex}`, text: h1Match[1].trim(), level: 1 });
        headingIndex++;
      }
    });

    return items;
  }, [reportMarkdown]);

  // Fetch conversation for citation modal
  const fetchCitationConversation = useCallback(async (conversationId: string) => {
    setLoadingCitation(true);
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*, interviews(name, country, occupation, age, gender)')
        .eq('id', conversationId)
        .single();

      if (error) throw error;
      setCitationConversation(data);
    } catch (error) {
      console.error('Error fetching conversation:', error);
      setCitationConversation(null);
    } finally {
      setLoadingCitation(false);
    }
  }, []);

  // Handle citation click
  const handleCitationClick = useCallback((conversationId: string, blockIndex: number) => {
    setCitationModal({ conversationId, blockIndex });
    fetchCitationConversation(conversationId);
  }, [fetchCitationConversation]);

  // Close citation modal
  const closeCitationModal = () => {
    setCitationModal(null);
    setCitationConversation(null);
  };

  // Auto-scroll to highlighted block when citation loads
  useEffect(() => {
    if (citationConversation && citationModal) {
      setTimeout(() => {
        const highlightedBlock = document.getElementById(`block-${citationModal.blockIndex}`);
        if (highlightedBlock) {
          highlightedBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [citationConversation, citationModal]);

  // Scroll to heading when clicking TOC item
  const scrollToHeading = (headingId: string) => {
    const element = document.getElementById(headingId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Update active heading after a short delay to let scroll complete
      setTimeout(() => setActiveHeading(headingId), 100);
    }
  };

  // Parse citations in text and convert to clickable elements
  const parseCitations = useCallback((text: string): React.ReactNode => {
    const citationRegex = /\[INT:([a-f0-9-]+)\|BLK:(\d+)\]/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let keyIndex = 0;

    while ((match = citationRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }

      const conversationId = match[1];
      const blockIndex = parseInt(match[2], 10);

      parts.push(
        <button
          key={`citation-${keyIndex++}`}
          onClick={() => handleCitationClick(conversationId, blockIndex)}
          className="inline-flex items-center justify-center w-5 h-5 ml-1 text-xs bg-gray-100 hover:bg-blue-100 text-gray-500 hover:text-blue-600 rounded-full border border-gray-300 hover:border-blue-400 transition-colors cursor-pointer"
          title="View source"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  }, [handleCitationClick]);

  // Process children to find and replace citations
  const processChildren = useCallback((children: React.ReactNode): React.ReactNode => {
    if (typeof children === 'string') {
      return parseCitations(children);
    }
    if (Array.isArray(children)) {
      return children.map((child, index) => (
        <React.Fragment key={index}>{processChildren(child)}</React.Fragment>
      ));
    }
    if (React.isValidElement(children)) {
      const props = children.props as { children?: React.ReactNode };
      return React.cloneElement(children, {
        children: processChildren(props.children),
      } as React.Attributes);
    }
    return children;
  }, [parseCitations]);

  // Track scroll position to highlight active TOC item
  useEffect(() => {
    const container = contentRef.current;
    if (!container || tocItems.length === 0) return;

    const handleScroll = () => {
      // Find the heading that's currently at the top of the visible area
      let currentHeading = tocItems[0]?.id || '';

      for (let i = 0; i < tocItems.length; i++) {
        const element = document.getElementById(tocItems[i].id);
        if (element) {
          const rect = element.getBoundingClientRect();
          // If this heading is above or near the top of the viewport (within 150px)
          if (rect.top <= 150) {
            currentHeading = tocItems[i].id;
          }
        }
      }

      setActiveHeading(currentHeading);
    };

    // Use passive listener for better scroll performance
    container.addEventListener('scroll', handleScroll, { passive: true });

    // Also listen to window scroll in case the container is the window
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Initial check after headings are rendered
    setTimeout(handleScroll, 200);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [tocItems]);

  // Counter for heading IDs - reset before each render
  const headingCounterRef = useRef(0);
  headingCounterRef.current = 0;

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div
        ref={contentRef}
        className={`flex-1 overflow-y-auto ${citationModal ? 'pr-96' : ''}`}
      >
        {/* Back Button */}
        <button
          onClick={onBack}
          className="text-sm text-blue-600 hover:text-blue-700 mb-6 flex items-center gap-1 sticky top-0 bg-white py-2 z-10"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back to reports
        </button>

        {/* Report Content */}
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => {
                const id = `heading-${headingCounterRef.current++}`;
                return (
                  <h1 id={id} className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
                    {processChildren(children)}
                  </h1>
                );
              },
              h2: ({ children }) => {
                const id = `heading-${headingCounterRef.current++}`;
                return (
                  <h2 id={id} className="text-xl font-semibold text-gray-900 mt-6 mb-3">
                    {processChildren(children)}
                  </h2>
                );
              },
              h3: ({ children }) => {
                const id = `heading-${headingCounterRef.current++}`;
                return (
                  <h3 id={id} className="text-lg font-semibold text-gray-900 mt-4 mb-2">
                    {processChildren(children)}
                  </h3>
                );
              },
              p: ({ children }) => (
                <p className="text-gray-700 leading-relaxed mb-4">
                  {processChildren(children)}
                </p>
              ),
              li: ({ children }) => (
                <li className="text-gray-700">
                  {processChildren(children)}
                </li>
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-4 border-blue-200 pl-4 py-2 my-4 bg-blue-50 rounded-r-lg italic text-gray-700">
                  {processChildren(children)}
                </blockquote>
              ),
              table: ({ children }) => (
                <div className="overflow-x-auto my-4">
                  <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-gray-50">{children}</thead>
              ),
              th: ({ children }) => (
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="px-4 py-3 text-sm text-gray-700 border-t border-gray-100">
                  {processChildren(children)}
                </td>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-gray-900">{children}</strong>
              ),
              code: ({ children, className }) => {
                const isInline = !className;
                return isInline ? (
                  <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
                    {children}
                  </code>
                ) : (
                  <code className={className}>{children}</code>
                );
              },
              ul: ({ children }) => (
                <ul className="list-disc list-inside space-y-1 my-3 text-gray-700">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal list-inside space-y-1 my-3 text-gray-700">
                  {children}
                </ol>
              ),
            }}
          >
            {reportMarkdown}
          </ReactMarkdown>
        </div>
      </div>

      {/* Right Side - Table of Contents */}
      <div className={`w-64 border-l border-gray-200 bg-gray-50 overflow-y-auto sticky top-0 h-full ${citationModal ? 'hidden' : ''}`}>
        <div className="p-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            On this page
          </h4>
          <nav className="space-y-1">
            {tocItems.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToHeading(item.id)}
                className={`block w-full text-left text-sm py-1.5 px-2 rounded transition-colors ${
                  item.level === 1 ? 'font-medium' : ''
                } ${
                  item.level === 2 ? 'pl-4 text-gray-600' : ''
                } ${
                  item.level === 3 ? 'pl-6 text-gray-500 text-xs' : ''
                } ${
                  activeHeading === item.id
                    ? 'bg-blue-100 text-blue-700'
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                {item.text}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Citation Modal */}
      {citationModal && (
        <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-xl border-l border-gray-200 z-50 overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
            <h3 className="font-medium text-gray-900">Source Reference</h3>
            <button
              onClick={closeCitationModal}
              className="text-gray-400 hover:text-gray-600 p-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-4">
            {loadingCitation ? (
              <div className="flex items-center justify-center py-12">
                <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : citationConversation ? (
              <>
                <div className="mb-4">
                  <h4 className="font-medium text-gray-900 mb-1">
                    {citationConversation.interviews?.name || 'Participant'}
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {citationConversation.interviews?.age && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        {citationConversation.interviews.age} y/o
                      </span>
                    )}
                    {citationConversation.interviews?.gender && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                        {citationConversation.interviews.gender}
                      </span>
                    )}
                    {citationConversation.interviews?.country && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                        {citationConversation.interviews.country}
                      </span>
                    )}
                    {citationConversation.interviews?.occupation && (
                      <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                        {citationConversation.interviews.occupation}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {(citationConversation.transcript || []).map((block: any, index: number) => {
                    const isHighlighted = index === citationModal.blockIndex;
                    return (
                      <div
                        key={index}
                        id={`block-${index}`}
                        className={`rounded-lg p-3 ${
                          isHighlighted
                            ? 'bg-yellow-100 border-2 border-yellow-400 ring-2 ring-yellow-200'
                            : 'bg-gray-50'
                        }`}
                      >
                        <p className="text-xs font-medium text-gray-500 mb-1">
                          Q: {block.question}
                        </p>
                        <p className={`text-sm ${isHighlighted ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>
                          {block.answer}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                Could not load conversation
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
