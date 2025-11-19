'use client'

import { useState, useEffect, useRef } from 'react'

interface CameraViewProps {
  isMuted: boolean
  isSpeakerOn: boolean
  onMuteToggle: () => void
  onSpeakerToggle: () => void
  campaign?: any  // Campaign data from Supabase
}

export default function CameraView({
  isMuted,
  isSpeakerOn,
  onMuteToggle,
  onSpeakerToggle,
  campaign
}: CameraViewProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [showSettingsPopup, setShowSettingsPopup] = useState(false)
  const [interviewStarted, setInterviewStarted] = useState(false)
  const [devices, setDevices] = useState<{
    cameras: MediaDeviceInfo[]
    microphones: MediaDeviceInfo[]
    speakers: MediaDeviceInfo[]
  }>({ cameras: [], microphones: [], speakers: [] })
  const [selectedDevices, setSelectedDevices] = useState({
    camera: '',
    microphone: '',
    speaker: ''
  })
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const settingsRef = useRef<HTMLDivElement>(null)

  // Get available devices
  const enumerateDevices = async () => {
    try {
      const deviceList = await navigator.mediaDevices.enumerateDevices()
      const cameras = deviceList.filter(device => device.kind === 'videoinput')
      const microphones = deviceList.filter(device => device.kind === 'audioinput')
      const speakers = deviceList.filter(device => device.kind === 'audiooutput')

      setDevices({ cameras, microphones, speakers })

      // Set default selections
      if (cameras.length > 0 && !selectedDevices.camera) {
        setSelectedDevices(prev => ({ ...prev, camera: cameras[0].deviceId }))
      }
      if (microphones.length > 0 && !selectedDevices.microphone) {
        setSelectedDevices(prev => ({ ...prev, microphone: microphones[0].deviceId }))
      }
      if (speakers.length > 0 && !selectedDevices.speaker) {
        setSelectedDevices(prev => ({ ...prev, speaker: speakers[0].deviceId }))
      }
    } catch (error) {
      console.error('Error enumerating devices:', error)
    }
  }

  // Auto-initialize camera on mount
  useEffect(() => {
    const initCamera = async () => {
      console.log('Initializing camera...')
      setIsLoading(true)
      setCameraError(null)

      try {
        // Request camera and microphone access
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          },
          audio: true
        })

        console.log('Got media stream:', stream)
        streamRef.current = stream

        // Enumerate devices after getting permission
        await enumerateDevices()

        // Set the video element source
        if (videoRef.current) {
          console.log('Setting video srcObject...')
          videoRef.current.srcObject = stream

          try {
            await videoRef.current.play()
            console.log('Video playing successfully')
          } catch (playError) {
            console.error('Error playing video:', playError)
          }
        } else {
          console.error('Video ref not available')
        }

        // Set initial mute state
        const audioTracks = stream.getAudioTracks()
        audioTracks.forEach(track => {
          track.enabled = !isMuted
        })

        // Mark loading as complete
        setIsLoading(false)
      } catch (error) {
        console.error('Error accessing camera/microphone:', error)
        setCameraError('Unable to access camera or microphone. Please check your permissions.')
        setIsLoading(false)
      }
    }

    // Small delay to ensure DOM is ready
    const timer = setTimeout(initCamera, 100)

    // Cleanup function
    return () => {
      clearTimeout(timer)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  // Start Interview with Voice Agent
  const startInterview = async () => {
    if (!campaign?.id) {
      console.error('No campaign ID available')
      return
    }

    try {
      console.log('Starting interview with voice agent...')
      setIsLoading(true)

      // Create session with voice agent backend
      const response = await fetch('http://localhost:8001/api/sessions/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          campaign_id: campaign.id,
          participant_name: null,  // Could be collected from a form
          participant_email: null,  // Could be collected from a form
          enable_recording: false
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create interview session')
      }

      const session = await response.json()
      console.log('Interview session created:', session)

      // Load Daily.co script dynamically
      const script = document.createElement('script')
      script.src = 'https://unpkg.com/@daily-co/daily-js'
      script.onload = async () => {
        // Create Daily call frame
        const DailyIframe = (window as any).DailyIframe
        const callFrame = DailyIframe.createCallObject({
          showLeaveButton: false,
          showFullscreenButton: false,
          iframeStyle: {
            display: 'none'
          }
        })

        // Join the Daily room
        await callFrame.join({
          url: session.room_url,
          token: session.participant_token,
          userName: 'Participant'
        })

        console.log('Joined Daily room successfully')
        setInterviewStarted(true)
      }
      document.head.appendChild(script)

    } catch (error) {
      console.error('Failed to start interview:', error)
      setCameraError('Failed to start interview. Make sure the voice agent backend is running.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    // Update audio track mute state when isMuted changes
    if (streamRef.current) {
      const audioTracks = streamRef.current.getAudioTracks()
      audioTracks.forEach(track => {
        track.enabled = !isMuted
      })
    }
  }, [isMuted])

  // Click outside handler for settings popup
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettingsPopup(false)
      }
    }

    if (showSettingsPopup) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showSettingsPopup])

  return (
    <div className="w-full max-w-3xl flex flex-col">
      <div className="relative aspect-video bg-gray-100 rounded-2xl overflow-hidden">
        {/* Video element - always present */}
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover ${isLoading || cameraError ? 'hidden' : 'block'}`}
          style={{ transform: 'scaleX(-1)' }}
          autoPlay
          playsInline
          muted
        />

        {/* Loading state */}
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100">
            <div className="mb-4">
              <svg className="w-16 h-16 text-gray-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-gray-500">Initializing camera...</p>
            <div className="mt-4 flex gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        )}

        {/* Error state */}
        {cameraError && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <div className="text-center p-4">
              <svg className="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-600 mb-2">Camera Error</p>
              <p className="text-sm text-gray-500">{cameraError}</p>
            </div>
          </div>
        )}

        {/* Settings button - top right */}
        <div className="absolute top-4 right-4" ref={settingsRef}>
          <button
            onClick={() => setShowSettingsPopup(!showSettingsPopup)}
            className="flex items-center justify-center w-10 h-10 bg-white/80 backdrop-blur-sm rounded-full hover:bg-white transition-colors duration-200"
            title="Settings"
          >
            <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {/* Settings Popup */}
          {showSettingsPopup && (
            <div className="absolute top-12 right-0 bg-white rounded-lg shadow-lg p-4 w-80 z-50">
              <h3 className="font-medium text-gray-900 mb-4">Device Settings</h3>

              {/* Camera Selection */}
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Camera
                </label>
                <select
                  value={selectedDevices.camera}
                  onChange={(e) => {
                    setSelectedDevices(prev => ({ ...prev, camera: e.target.value }))
                    // TODO: Restart stream with new camera
                  }}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {devices.cameras.map((camera) => (
                    <option key={camera.deviceId} value={camera.deviceId}>
                      {camera.label || `Camera ${camera.deviceId.substring(0, 8)}`}
                    </option>
                  ))}
                  {devices.cameras.length === 0 && (
                    <option value="">No cameras found</option>
                  )}
                </select>
              </div>

              {/* Microphone Selection */}
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Microphone
                </label>
                <select
                  value={selectedDevices.microphone}
                  onChange={(e) => {
                    setSelectedDevices(prev => ({ ...prev, microphone: e.target.value }))
                    // TODO: Restart stream with new microphone
                  }}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {devices.microphones.map((mic) => (
                    <option key={mic.deviceId} value={mic.deviceId}>
                      {mic.label || `Microphone ${mic.deviceId.substring(0, 8)}`}
                    </option>
                  ))}
                  {devices.microphones.length === 0 && (
                    <option value="">No microphones found</option>
                  )}
                </select>
              </div>

              {/* Speaker Selection */}
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Speaker
                </label>
                <select
                  value={selectedDevices.speaker}
                  onChange={async (e) => {
                    setSelectedDevices(prev => ({ ...prev, speaker: e.target.value }))
                    // Set audio output device if supported
                    if (videoRef.current && 'setSinkId' in videoRef.current) {
                      try {
                        await (videoRef.current as any).setSinkId(e.target.value)
                      } catch (error) {
                        console.error('Error setting speaker:', error)
                      }
                    }
                  }}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {devices.speakers.map((speaker) => (
                    <option key={speaker.deviceId} value={speaker.deviceId}>
                      {speaker.label || `Speaker ${speaker.deviceId.substring(0, 8)}`}
                    </option>
                  ))}
                  {devices.speakers.length === 0 && (
                    <option value="">No speakers found</option>
                  )}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Media Controls - Bottom of camera */}
        {!isLoading && !cameraError && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-4">
            {/* Mute Button */}
            <button
              onClick={onMuteToggle}
              className={`group flex items-center justify-center w-12 h-12 rounded-full backdrop-blur-sm transition-all duration-200 ${
                isMuted
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-white/80 hover:bg-white'
              }`}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? (
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
            </button>

            {/* Speaker Button */}
            <button
              onClick={onSpeakerToggle}
              className={`group flex items-center justify-center w-12 h-12 rounded-full backdrop-blur-sm transition-all duration-200 ${
                isSpeakerOn
                  ? 'bg-white/80 hover:bg-white'
                  : 'bg-orange-500 hover:bg-orange-600'
              }`}
              title={isSpeakerOn ? 'Mute speaker' : 'Unmute speaker'}
            >
              {isSpeakerOn ? (
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Start Interview Button - only show when not started */}
      {!interviewStarted && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={startInterview}
            className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors duration-200 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Start Interview
          </button>
        </div>
      )}
    </div>
  )
}