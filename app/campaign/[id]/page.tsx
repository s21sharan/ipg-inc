'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

interface Campaign {
  id: string;
  name: string;
  title: string;
  caption: string;
}

interface RealtimeSession {
  client_secret: string;
  session_id: string;
  model: string;
  campaign_title: string;
  instructions: string;
}

export default function VoiceCampaignPage() {
  const params = useParams();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [realtimeSession, setRealtimeSession] = useState<RealtimeSession | null>(null);
  const [callState, setCallState] = useState<string>('preview'); // preview, connecting, connected, ended
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Device states
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioInput, setSelectedAudioInput] = useState<string>('');
  const [selectedAudioOutput, setSelectedAudioOutput] = useState<string>('');
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>('');

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Enumerate devices
  const enumerateDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
      const videoInputs = devices.filter(d => d.kind === 'videoinput');

      setAudioInputDevices(audioInputs);
      setAudioOutputDevices(audioOutputs);
      setVideoDevices(videoInputs);

      // Set defaults if not already set
      if (!selectedAudioInput && audioInputs.length > 0) {
        setSelectedAudioInput(audioInputs[0].deviceId);
      }
      if (!selectedAudioOutput && audioOutputs.length > 0) {
        setSelectedAudioOutput(audioOutputs[0].deviceId);
      }
      if (!selectedVideoDevice && videoInputs.length > 0) {
        setSelectedVideoDevice(videoInputs[0].deviceId);
      }
    } catch (err) {
      console.error('Error enumerating devices:', err);
    }
  };

  // Fetch campaign on mount
  useEffect(() => {
    const fetchCampaign = async () => {
      try {
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
      } catch (err) {
        console.error('Error fetching campaign:', err);
        setError('Failed to load campaign');
      }
    };

    if (campaignId) {
      fetchCampaign();
      enumerateDevices();
    }
  }, [campaignId]);

  // Set up video preview
  useEffect(() => {
    const setupPreview = async () => {
      try {
        // Stop existing stream if any
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => track.stop());
        }

        const constraints: MediaStreamConstraints = {
          video: selectedVideoDevice ? { deviceId: { exact: selectedVideoDevice } } : true,
          audio: selectedAudioInput ? { deviceId: { exact: selectedAudioInput } } : true
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        // Re-enumerate devices after getting permissions
        enumerateDevices();
      } catch (err) {
        console.error('Error accessing media devices:', err);
        setError('Please allow camera and microphone access');
      }
    };

    if (callState === 'preview' || callState === 'connected') {
      setupPreview();
    }

    return () => {
      if (localStreamRef.current && callState !== 'connected') {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [callState, selectedVideoDevice, selectedAudioInput]);

  // Change audio output device
  const changeAudioOutput = async (deviceId: string) => {
    setSelectedAudioOutput(deviceId);
    if (audioElementRef.current && 'setSinkId' in audioElementRef.current) {
      try {
        await (audioElementRef.current as any).setSinkId(deviceId);
      } catch (err) {
        console.error('Error setting audio output:', err);
      }
    }
  };

  // Start interview when user clicks "Get Started"
  const startInterview = async () => {
    try {
      setCallState('connecting');

      // Start Realtime session
      const response = await fetch('http://localhost:8000/interview/realtime/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          user_id: 'anonymous',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start Realtime session');
      }

      const sessionData: RealtimeSession = await response.json();
      setRealtimeSession(sessionData);

      // Set up WebRTC connection
      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      // Debug: Log connection state changes
      pc.onconnectionstatechange = () => {
        console.log('WebRTC Connection State:', pc.connectionState);
      };

      pc.oniceconnectionstatechange = () => {
        console.log('ICE Connection State:', pc.iceConnectionState);
      };

      // Set up audio element for playback
      const audioEl = new Audio();
      audioEl.autoplay = true;
      audioElementRef.current = audioEl;
      pc.ontrack = (e) => {
        console.log('Received remote track:', e.track.kind);
        audioEl.srcObject = e.streams[0];
      };

      // Add local audio and video tracks
      if (localStreamRef.current) {
        const tracks = localStreamRef.current.getTracks();
        console.log('Local tracks:', tracks.map(t => `${t.kind} - enabled: ${t.enabled}`));

        tracks.forEach(track => {
          const sender = pc.addTrack(track, localStreamRef.current!);
          console.log(`Added ${track.kind} track to peer connection`);
        });
      } else {
        console.error('No local stream available!');
      }

      // Set up data channel for events
      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;

      dc.addEventListener('open', () => {
        console.log('Data channel opened');

        // Send initial greeting message to trigger the AI
        // Use response.create without custom instructions to follow session instructions
        const greetingEvent = {
          type: 'response.create'
        };

        dc.send(JSON.stringify(greetingEvent));
        console.log('Sent greeting event');
      });

      dc.addEventListener('message', (e) => {
        const msg = JSON.parse(e.data);

        // Log important events
        if (msg.type === 'input_audio_buffer.speech_started') {
          console.log('🎤 SPEECH DETECTED - User started speaking');
        } else if (msg.type === 'input_audio_buffer.speech_stopped') {
          console.log('🎤 SPEECH STOPPED - User stopped speaking');
        } else if (msg.type === 'conversation.item.created' && msg.item?.role === 'user') {
          console.log('💬 USER MESSAGE:', msg.item);
        } else if (msg.type === 'error') {
          console.error('❌ ERROR:', msg);
        } else {
          console.log('Received message:', e.data);
        }
      });

      // Create and set local offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send offer to OpenAI Realtime API
      const sdpResponse = await fetch('https://api.openai.com/v1/realtime', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionData.client_secret}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      });

      if (!sdpResponse.ok) {
        throw new Error('Failed to connect to OpenAI Realtime API');
      }

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });

      console.log('Connected to OpenAI Realtime API');
      setCallState('connected');

    } catch (err) {
      console.error('Error starting interview:', err);
      setError('Failed to start interview');
      setCallState('preview');
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOn(videoTrack.enabled);
      }
    }
  };

  const endCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    setCallState('ended');
  };

  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full mx-auto mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Connection Error</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-12 w-12 text-indigo-600 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (callState === 'ended') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-green-100 rounded-full mx-auto mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Interview Complete!</h1>
          <p className="text-gray-600">Thank you for participating in this interview.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-8 relative">
      {/* Main Container - Two Column Layout */}
      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

        {/* Left Side - Instructions Box */}
        <div className="space-y-8">
          {/* Title & Caption */}
          <div>
            <h1 className="text-5xl font-bold text-gray-900 mb-4 leading-tight">
              {campaign.title}
            </h1>
            {campaign.caption && (
              <p className="text-lg text-gray-600 leading-relaxed">
                {campaign.caption}
              </p>
            )}
          </div>

          {/* Instructions Box */}
          <div className="bg-gray-50 rounded-2xl p-8 space-y-6 border border-gray-100">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">How does Pulse work?</h3>
              <p className="text-gray-600 leading-relaxed">
                You'll be asked a few simple questions by our AI moderator. Just answer in your normal,
                conversational voice—no need to overthink it.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Do I need to prepare?</h3>
              <p className="text-gray-600 leading-relaxed">
                Not at all. Just find a quiet spot with good lighting and you're ready to go.
              </p>
            </div>
          </div>
        </div>

        {/* Right Side - Video & Controls */}
        <div className="flex flex-col items-center space-y-6">
          {/* Video Container */}
          <div className="relative w-full max-w-lg">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full aspect-video rounded-3xl bg-gray-900 object-cover shadow-2xl transform scale-x-[-1]"
            />

            {/* Settings Button - Top Right */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm hover:bg-white text-gray-700 flex items-center justify-center transition-all shadow-lg"
              title="Settings"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Settings Dropdown */}
            {showSettings && (
              <div className="absolute top-16 right-4 bg-white rounded-2xl shadow-2xl p-6 w-80 z-10 border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Device Settings</h3>

                {/* Camera Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Camera</label>
                  <select
                    value={selectedVideoDevice}
                    onChange={(e) => setSelectedVideoDevice(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {videoDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Camera ${device.deviceId.slice(0, 5)}`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Microphone Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Microphone</label>
                  <select
                    value={selectedAudioInput}
                    onChange={(e) => setSelectedAudioInput(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {audioInputDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Microphone ${device.deviceId.slice(0, 5)}`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Speaker Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Speaker</label>
                  <select
                    value={selectedAudioOutput}
                    onChange={(e) => changeAudioOutput(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {audioOutputDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Speaker ${device.deviceId.slice(0, 5)}`}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => setShowSettings(false)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2 rounded-lg transition-all"
                >
                  Done
                </button>
              </div>
            )}

            {/* Control Buttons Overlay */}
            <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-3">
              {/* Microphone Button */}
              <button
                onClick={toggleMute}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-xl ${
                  isMuted
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-white/90 backdrop-blur-sm hover:bg-white text-gray-700'
                }`}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  {isMuted ? (
                    <path fillRule="evenodd" d="M8 5a2 2 0 00-2 2v6a2 2 0 104 0V7a2 2 0 00-2-2zM6 7a4 4 0 118 0v6a4 4 0 11-8 0V7zm11 4a1 1 0 10-2 0 5 5 0 01-10 0 1 1 0 10-2 0 7 7 0 1014 0z" clipRule="evenodd" />
                  ) : (
                    <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                  )}
                </svg>
              </button>

              {/* Camera Button */}
              <button
                onClick={toggleCamera}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-xl ${
                  !isCameraOn
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-white/90 backdrop-blur-sm hover:bg-white text-gray-700'
                }`}
                title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  {isCameraOn ? (
                    <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                  ) : (
                    <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                  )}
                </svg>
              </button>

              {/* Speaker Button */}
              <button
                className="w-14 h-14 rounded-full bg-white/90 backdrop-blur-sm hover:bg-white text-gray-700 flex items-center justify-center transition-all shadow-xl"
                title="Volume"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>

          {/* Action Button */}
          {callState === 'preview' && (
            <button
              onClick={startInterview}
              className="w-full max-w-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 py-5 rounded-2xl text-lg transition-all shadow-lg hover:shadow-xl"
            >
              Get Started
            </button>
          )}

          {callState === 'connecting' && (
            <div className="text-center w-full max-w-lg py-5">
              <svg className="animate-spin h-10 w-10 text-indigo-600 mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-gray-600 text-lg font-medium">Connecting...</p>
            </div>
          )}

          {callState === 'connected' && (
            <button
              onClick={endCall}
              className="w-full max-w-lg bg-red-500 hover:bg-red-600 text-white font-semibold px-8 py-5 rounded-2xl text-lg transition-all shadow-lg hover:shadow-xl"
            >
              End Interview
            </button>
          )}
        </div>
      </div>

      {/* Footer - ipg.inc branding at bottom right */}
      <div className="absolute bottom-8 right-10">
        <span className="text-3xl font-bold text-gray-900">
          ipg<span className="text-indigo-600">.</span>inc
        </span>
      </div>
    </div>
  );
}
