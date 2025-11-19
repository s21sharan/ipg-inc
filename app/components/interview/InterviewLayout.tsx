'use client'

import { useState } from 'react'
import ParticipantInfo from './ParticipantInfo'
import CameraView from './CameraView'

interface Campaign {
  id: string
  name: string
  title: string
  caption?: string
  modality: string
  time_estimate?: string
  [key: string]: any
}

interface InterviewLayoutProps {
  campaign: Campaign
}

export default function InterviewLayout({ campaign }: InterviewLayoutProps) {
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerOn, setIsSpeakerOn] = useState(true)

  const handleMuteToggle = () => setIsMuted(!isMuted)
  const handleSpeakerToggle = () => setIsSpeakerOn(!isSpeakerOn)

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col">
      {/* Main Content - no header */}
      <div className="flex-1 flex flex-col lg:flex-row px-8 py-8">
        {/* Left Panel - Participant Info */}
        <div className="lg:w-2/5 pr-8 flex flex-col justify-center">
          <ParticipantInfo campaign={campaign} />
        </div>

        {/* Right Panel - Camera View with Controls */}
        <div className="lg:w-3/5 flex flex-col items-center justify-center">
          <CameraView
            isMuted={isMuted}
            isSpeakerOn={isSpeakerOn}
            onMuteToggle={handleMuteToggle}
            onSpeakerToggle={handleSpeakerToggle}
            campaign={campaign}
          />
        </div>
      </div>

      {/* Logo Bottom Right */}
      <div className="absolute bottom-8 right-8">
        <div className="text-2xl font-light tracking-wider text-gray-400" style={{ fontFamily: 'Georgia, serif' }}>
          ipg<span style={{ color: '#11766E' }}>.</span>inc
        </div>
      </div>
    </div>
  )
}