'use client'

interface Campaign {
  id: string
  name: string
  title: string
  caption?: string
  modality: string
  time_estimate?: string
  [key: string]: any
}

interface ParticipantInfoProps {
  campaign: Campaign
}

export default function ParticipantInfo({ campaign }: ParticipantInfoProps) {
  return (
    <div className="space-y-6">
      {/* Campaign Name */}
      <div>
        <h1 className="text-4xl font-light text-gray-900 mb-2" style={{ fontFamily: 'Georgia, serif' }}>
          {campaign.name || 'Untitled Campaign'}
        </h1>
      </div>

      {/* Campaign Title */}
      <div>
        <h2 className="text-xl text-gray-600" style={{ fontFamily: 'Georgia, serif' }}>
          {campaign.title || 'No title provided'}
        </h2>
      </div>

      {/* Campaign Caption */}
      {campaign.caption && (
        <div className="pt-4">
          <p className="text-gray-500 leading-relaxed" style={{ fontFamily: 'Georgia, serif' }}>
            {campaign.caption}
          </p>
        </div>
      )}

      {/* Status Indicator */}
      <div className="pt-6 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-gray-600">Ready to begin</span>
        </div>

        {/* Additional Info */}
        <div className="space-y-2 text-sm text-gray-500">
          {campaign.modality && (
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>{campaign.modality}</span>
            </div>
          )}

          {campaign.time_estimate && (
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Estimated time: {campaign.time_estimate}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}