/**
 * OnboardingPage.tsx — 4-step guided onboarding for new hosted users
 *
 * Steps:
 *   1. Welcome & business context (URL scan + editable fields)
 *   2. Quick tutorial walkthrough (3 slides)
 *   3. AdvisorBot chat (recommends & deploys agents)
 *   4. Completion summary
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '@/lib/auth'
import { useTeam } from '@/lib/team-context'
import * as engine from '@/lib/engine'

const INDUSTRIES = [
  'Technology', 'E-commerce', 'SaaS', 'Agency', 'Healthcare',
  'Finance', 'Education', 'Real Estate', 'Hospitality',
  'Manufacturing', 'Professional Services', 'Other',
]


const TUTORIAL_SLIDES = [
  {
    icon: 'smart_toy',
    title: 'Your AI Agents',
    bullets: [
      'Deploy specialized workers from 40+ templates',
      'Each agent has its own skills, personality, and department',
      'Agents can use tools like web search, email, CRM, and more',
    ],
  },
  {
    icon: 'dashboard',
    title: 'Mission Control',
    bullets: [
      'Create and assign tasks to your agent workforce',
      'Review and approve high-risk actions before they execute',
      'Track activity, performance, and audit logs in real time',
    ],
  },
  {
    icon: 'forum',
    title: 'Chat & Collaborate',
    bullets: [
      'DM any agent for instant help or task updates',
      'Create group channels with multiple agents',
      'Agents can collaborate on tasks together',
    ],
  },
]

// Structured fields from website scan, in logical display order
interface ScanFields {
  companyName: string
  industry: string
  problemSolved: string
  solution: string
  targetMarket: string
  geographicFocus: string
  productsServices: string
  uniqueDifferentiators: string
  buyingMotivations: string
}

const SCAN_FIELD_LABELS: Record<keyof ScanFields, { label: string; icon: string }> = {
  companyName: { label: 'Company Name', icon: 'business' },
  industry: { label: 'Industry', icon: 'category' },
  problemSolved: { label: 'Problem Solved', icon: 'report_problem' },
  solution: { label: 'Solution', icon: 'lightbulb' },
  targetMarket: { label: 'Target Market', icon: 'groups' },
  geographicFocus: { label: 'Geographic Focus', icon: 'public' },
  productsServices: { label: 'Products / Services', icon: 'inventory_2' },
  uniqueDifferentiators: { label: 'Unique Differentiators', icon: 'star' },
  buyingMotivations: { label: 'Buying Motivations', icon: 'psychology' },
}

const SCAN_FIELD_ORDER: (keyof ScanFields)[] = [
  'companyName', 'industry', 'problemSolved', 'solution',
  'targetMarket', 'geographicFocus', 'productsServices',
  'uniqueDifferentiators', 'buyingMotivations',
]

const THINKING_PHRASES = [
  'Analyzing your business context...',
  'Reviewing your goals and priorities...',
  'Matching agent capabilities to your needs...',
  'Evaluating the best team composition...',
  'Cross-referencing 40+ agent templates...',
  'Ranking recommendations by impact...',
  'Considering your industry specifics...',
  'Almost there, finalizing suggestions...',
]

const EMPTY_SCAN: ScanFields = {
  companyName: '', industry: '', problemSolved: '', solution: '',
  targetMarket: '', geographicFocus: '', productsServices: '',
  uniqueDifferentiators: '', buyingMotivations: '',
}

export function OnboardingPage() {
  const { user } = useAuth()
  const { activeTeam } = useTeam()
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [slideIndex, setSlideIndex] = useState(0)

  // Step 1 form state
  const [companyUrl, setCompanyUrl] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scanStatus, setScanStatus] = useState('')
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [scanned, setScanned] = useState(false)
  const [scanError, setScanError] = useState('')
  const [scanFields, setScanFields] = useState<ScanFields>(EMPTY_SCAN)
  const [primaryGoal, setPrimaryGoal] = useState('')
  const [secondaryGoals, setSecondaryGoals] = useState('')
  const [saving, setSaving] = useState(false)

  // Step 3 chat state
  const [advisorAgentId, setAdvisorAgentId] = useState<string | null>(null)
  const [advisorReady, setAdvisorReady] = useState(false)
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'agent'; content: string }>>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [thinkingPhrase, setThinkingPhrase] = useState(THINKING_PHRASES[0])
  const thinkingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [agentsDeployed, setAgentsDeployed] = useState(false)
  const [deploying, setDeploying] = useState(false)

  // Meet-and-greet state
  const [meetingId, setMeetingId] = useState<string | null>(null)
  const [meetingMessages, setMeetingMessages] = useState<Array<{
    id: string
    type: 'agent' | 'human'
    agentName?: string
    agentIcon?: string
    agentIconColor?: string
    content: string
  }>>([])
  const [meetingActive, setMeetingActive] = useState(false)
  const [meetingEnded, setMeetingEnded] = useState(false)
  const [speakingAgent, setSpeakingAgent] = useState<{ name: string; icon: string; iconColor: string } | null>(null)
  const [meetingInput, setMeetingInput] = useState('')
  const [audioEnabled, setAudioEnabled] = useState(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const meetingEndRef = useRef<HTMLDivElement>(null)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // AdvisorBot narration state
  const [narrationText, setNarrationText] = useState('')
  const [narrationPlaying, setNarrationPlaying] = useState(false)
  const [revealedWords, setRevealedWords] = useState(0)
  const narrationAudioRef = useRef<HTMLAudioElement | null>(null)
  const narrationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Step 4 state
  const [deployedAgents, setDeployedAgents] = useState<engine.EngineAgent[]>([])

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] ?? 'there'

  // AdvisorBot narration — fetch and play on each step change
  useEffect(() => {
    if (!activeTeam) {
      console.warn('[onboarding] Narration skipped: activeTeam not yet available (step', step, ')')
      return
    }
    let cancelled = false

    // Clean up previous narration
    if (narrationAudioRef.current) {
      narrationAudioRef.current.pause()
      narrationAudioRef.current = null
    }
    if (narrationTimerRef.current) {
      clearInterval(narrationTimerRef.current)
      narrationTimerRef.current = null
    }
    setNarrationText('')
    setRevealedWords(0)
    setNarrationPlaying(false)

    engine.getAdvisorNarration(activeTeam.id, step, firstName).then(({ text, audioBase64, audioDurationMs }) => {
      if (cancelled) return
      setNarrationText(text)
      const words = text.split(/\s+/)

      if (audioBase64 && audioEnabled) {
        const audio = new Audio(`data:audio/mpeg;base64,${audioBase64}`)
        narrationAudioRef.current = audio
        setNarrationPlaying(true)

        // Animate captions word-by-word synced to audio duration
        const msPerWord = audioDurationMs / words.length
        let i = 0
        narrationTimerRef.current = setInterval(() => {
          if (++i <= words.length) setRevealedWords(i)
          else { clearInterval(narrationTimerRef.current!); narrationTimerRef.current = null }
        }, msPerWord)

        audio.onended = () => {
          setNarrationPlaying(false)
          setRevealedWords(words.length)
          if (narrationTimerRef.current) { clearInterval(narrationTimerRef.current); narrationTimerRef.current = null }
        }
        audio.play().catch(() => {
          setNarrationPlaying(false)
          setRevealedWords(words.length)
        })
      } else {
        // No audio — reveal all text immediately
        setRevealedWords(words.length)
      }
    }).catch((err) => {
      console.error('[onboarding] Narration fetch failed for step', step, ':', err)
    })

    return () => {
      cancelled = true
      if (narrationTimerRef.current) clearInterval(narrationTimerRef.current)
    }
  }, [step, activeTeam?.id])

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Rotate thinking phrases while loading
  useEffect(() => {
    if (chatLoading) {
      let idx = 0
      setThinkingPhrase(THINKING_PHRASES[0])
      thinkingTimerRef.current = setInterval(() => {
        idx = (idx + 1) % THINKING_PHRASES.length
        setThinkingPhrase(THINKING_PHRASES[idx])
      }, 2500)
    } else if (thinkingTimerRef.current) {
      clearInterval(thinkingTimerRef.current)
      thinkingTimerRef.current = null
    }
    return () => {
      if (thinkingTimerRef.current) clearInterval(thinkingTimerRef.current)
    }
  }, [chatLoading])

  const skipOnboarding = useCallback(async () => {
    if (!activeTeam) return
    try {
      await engine.updateTeamProfile(activeTeam.id, { onboardedAt: new Date().toISOString() } as Partial<engine.TeamProfile>)
    } catch { /* fail silently */ }
    navigate('/dashboard', { replace: true })
  }, [activeTeam, navigate])

  // Step 1: Scan website
  const startScanProgress = () => {
    setScanProgress(0)
    setScanStatus('Fetching website content...')
    let progress = 0
    const steps = [
      { at: 15, msg: 'Fetching website content...' },
      { at: 40, msg: 'Analyzing business model...' },
      { at: 65, msg: 'Extracting key details...' },
      { at: 85, msg: 'Building your profile...' },
    ]
    scanTimerRef.current = setInterval(() => {
      progress += Math.random() * 3 + 1
      if (progress > 92) progress = 92 // Cap at 92% until real completion
      setScanProgress(Math.min(progress, 92))
      const step = [...steps].reverse().find((s) => progress >= s.at)
      if (step) setScanStatus(step.msg)
    }, 200)
  }

  const stopScanProgress = (success: boolean) => {
    if (scanTimerRef.current) clearInterval(scanTimerRef.current)
    scanTimerRef.current = null
    if (success) {
      setScanProgress(100)
      setScanStatus('Done!')
    }
  }

  const handleScanWebsite = async () => {
    if (!activeTeam || !companyUrl.trim()) return
    setScanning(true)
    setScanError('')
    startScanProgress()
    try {
      let url = companyUrl.trim()
      if (!url.startsWith('http')) url = `https://${url}`
      setCompanyUrl(url)

      const result = await engine.scanWebsite(activeTeam.id, url)

      // Check if we actually got data back
      const hasData = result.companyName || result.industry || result.targetMarket || result.problemSolved
      if (!hasData) {
        setScanError('Could not extract business info from that URL. You can fill in the fields manually.')
        stopScanProgress(false)
      } else {
        stopScanProgress(true)
      }

      setScanFields({
        companyName: result.companyName ?? '',
        industry: result.industry ?? '',
        problemSolved: result.problemSolved ?? '',
        solution: result.solution ?? '',
        targetMarket: result.targetMarket ?? '',
        geographicFocus: result.geographicFocus ?? '',
        productsServices: result.productsServices ?? '',
        uniqueDifferentiators: result.uniqueDifferentiators ?? '',
        buyingMotivations: result.buyingMotivations ?? '',
      })
      if (result.primaryGoal) setPrimaryGoal(result.primaryGoal)
      if (result.secondaryGoals) setSecondaryGoals(result.secondaryGoals)
      setScanned(true)
    } catch {
      stopScanProgress(false)
      setScanError('Scan failed — please fill in the fields manually.')
      setScanned(true)
    } finally {
      setScanning(false)
    }
  }

  // Step 1: Save profile + start deploying advisor
  const handleProfileSubmit = async () => {
    if (!activeTeam) return
    setSaving(true)
    try {
      // Build a combined business summary from structured fields for storage
      const summaryParts = SCAN_FIELD_ORDER
        .filter((k) => k !== 'companyName' && k !== 'industry' && scanFields[k])
        .map((k) => `${SCAN_FIELD_LABELS[k].label}: ${scanFields[k]}`)
      const businessSummary = summaryParts.join('\n')

      await engine.updateTeamProfile(activeTeam.id, {
        companyName: scanFields.companyName || null,
        companyUrl: companyUrl || null,
        industry: scanFields.industry || null,
        businessSummary: businessSummary || null,
        targetMarket: scanFields.targetMarket || null,
        primaryGoal: [primaryGoal, secondaryGoals].filter(Boolean).join(' | Secondary: ') || null,
      } as Partial<engine.TeamProfile>)

      // Deploy AdvisorBot in background
      engine.setupAdvisor(activeTeam.id).then((result) => {
        setAdvisorAgentId(result.agentId)
        setAdvisorReady(true)
      }).catch(() => {
        setAdvisorReady(true)
      })

      setStep(2)
    } catch {
      setStep(2)
    } finally {
      setSaving(false)
    }
  }

  // Step 3: Send chat to AdvisorBot
  const sendAdvisorMessage = async (message: string) => {
    if (!advisorAgentId || chatLoading) return
    setChatLoading(true)
    setMessages((prev) => [...prev, { role: 'user', content: message }])
    setChatInput('')

    try {
      const result = await engine.chatWithAgent(advisorAgentId, message)
      if (result.response) {
        setMessages((prev) => [...prev, { role: 'agent', content: result.response }])
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'agent', content: "Sorry, I had trouble processing that. Let's try again — what would you like help with?" }])
    } finally {
      setChatLoading(false)
    }
  }

  // Step 3: Auto-send context on mount
  useEffect(() => {
    if (step === 3 && advisorReady && advisorAgentId && messages.length === 0) {
      const contextLines = [
        `New user just joined! Here's their business context:`,
        scanFields.companyName ? `Company: ${scanFields.companyName}` : '',
        scanFields.industry ? `Industry: ${scanFields.industry}` : '',
        scanFields.problemSolved ? `Problem solved: ${scanFields.problemSolved}` : '',
        scanFields.solution ? `Solution: ${scanFields.solution}` : '',
        scanFields.targetMarket ? `Target market: ${scanFields.targetMarket}` : '',
        scanFields.geographicFocus ? `Geographic focus: ${scanFields.geographicFocus}` : '',
        scanFields.productsServices ? `Products/services: ${scanFields.productsServices}` : '',
        scanFields.uniqueDifferentiators ? `Differentiators: ${scanFields.uniqueDifferentiators}` : '',
        scanFields.buyingMotivations ? `Buying motivations: ${scanFields.buyingMotivations}` : '',
        primaryGoal ? `Primary goal: ${primaryGoal}` : '',
        secondaryGoals ? `Secondary goals: ${secondaryGoals}` : '',
        ``,
        `Based on this business context, recommend 2-3 agents that would help them most. Use the recommend_agents tool.`,
      ].filter(Boolean).join('\n')

      sendAdvisorMessage(contextLines)
    }
  }, [step, advisorReady, advisorAgentId])

  // Scroll meeting chat to bottom
  useEffect(() => {
    meetingEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [meetingMessages, speakingAgent])

  // SSE connection for meet-and-greet
  useEffect(() => {
    if (!meetingId || !meetingActive || !activeTeam) return

    const cleanup = engine.connectMeetingStream(
      activeTeam.id,
      meetingId,
      (event) => {
        switch (event.type) {
          case 'agent_speaking':
            setSpeakingAgent({
              name: event.data.agentName ?? 'Agent',
              icon: event.data.agentIcon ?? 'smart_toy',
              iconColor: event.data.agentIconColor ?? '#0F4D26',
            })
            break

          case 'agent_message':
            setSpeakingAgent(null)
            setMeetingMessages((prev) => [...prev, {
              id: `agent-${event.data.messageId ?? Date.now()}`,
              type: 'agent',
              agentName: event.data.agentName,
              agentIcon: event.data.agentIcon ?? 'smart_toy',
              agentIconColor: event.data.agentIconColor ?? '#0F4D26',
              content: event.data.content ?? '',
            }])
            // Play audio if enabled
            if (audioEnabled && event.data.audioBase64) {
              try {
                if (audioRef.current) audioRef.current.pause()
                const audio = new Audio(`data:audio/mpeg;base64,${event.data.audioBase64}`)
                audioRef.current = audio
                audio.play().catch(() => {})
              } catch { /* ignore audio errors */ }
            }
            break

          case 'human_message':
            setMeetingMessages((prev) => [...prev, {
              id: `human-${event.data.messageId ?? Date.now()}`,
              type: 'human',
              content: event.data.content ?? '',
            }])
            break

          case 'human_raised_hand':
            // Pause agent audio when hand is raised
            if (audioRef.current) audioRef.current.pause()
            break

          case 'meeting_ended':
            setMeetingEnded(true)
            setMeetingActive(false)
            setSpeakingAgent(null)
            break

          case 'error':
            console.error('[meeting] Error:', event.data.content)
            break
        }
      },
      (err) => {
        console.error('[meeting] SSE connection error:', err)
      },
    )

    return cleanup
  }, [meetingId, meetingActive, activeTeam, audioEnabled])

  // Send message during meeting
  const sendMeetingMsg = useCallback(async (content: string) => {
    if (!meetingId || !activeTeam || !content.trim()) return
    setMeetingInput('')
    try {
      await engine.sendMeetingMessage(activeTeam.id, meetingId, content.trim())
    } catch (err) {
      console.error('[meeting] Failed to send message:', err)
    }
  }, [meetingId, activeTeam])

  // Start push-to-talk recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      })
      audioChunksRef.current = []
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      mediaRecorder.onstop = async () => {
        // Stop all tracks to release mic
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        if (blob.size === 0 || !meetingId || !activeTeam) return
        setTranscribing(true)
        try {
          const result = await engine.sendMeetingVoice(activeTeam.id, meetingId, blob)
          if (!result.text) {
            console.warn('[meeting] STT returned empty text')
          }
        } catch (err) {
          console.error('[meeting] Voice send failed:', err)
        } finally {
          setTranscribing(false)
        }
      }
      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setRecording(true)
    } catch (err) {
      console.error('[meeting] Mic access denied:', err)
    }
  }, [meetingId, activeTeam])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
    setRecording(false)
  }, [])

  // Raise hand — pause audio + tell orchestrator
  const handleRaiseHand = useCallback(async () => {
    if (!meetingId || !activeTeam) return
    if (audioRef.current) audioRef.current.pause()
    try {
      await engine.raiseMeetingHand(activeTeam.id, meetingId)
    } catch (err) {
      console.error('[meeting] Raise hand failed:', err)
    }
  }, [meetingId, activeTeam])

  // Step 4: Load deployed agents
  useEffect(() => {
    if (step === 4) {
      engine.listAgents().then(setDeployedAgents).catch(() => {})
      if (activeTeam) {
        engine.updateTeamProfile(activeTeam.id, { onboardedAt: new Date().toISOString() } as Partial<engine.TeamProfile>).catch(() => {})
      }
    }
  }, [step, activeTeam])

  // If no advisor ready and we hit step 3, wait
  useEffect(() => {
    if (step === 3 && !advisorReady && activeTeam) {
      engine.listAgents().then((agents) => {
        const advisor = agents.find((a) => a.templateId === 'advisor-bot')
        if (advisor) {
          setAdvisorAgentId(advisor.id)
          setAdvisorReady(true)
        } else {
          engine.setupAdvisor(activeTeam.id).then((r) => {
            setAdvisorAgentId(r.agentId)
            setAdvisorReady(true)
          }).catch(() => setAdvisorReady(true))
        }
      }).catch(() => setAdvisorReady(true))
    }
  }, [step, advisorReady, activeTeam])

  // Helper to update a single scan field
  const updateField = (key: keyof ScanFields, value: string) => {
    setScanFields((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="flex min-h-screen flex-col bg-light-bg">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border-subtle bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <img src="/logo-full-color.png" alt="YokeBot" className="h-8 object-contain" />
        </div>
        <div className="flex items-center gap-4">
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all ${
                  s === step ? 'w-6 bg-forest-green' : s < step ? 'w-2 bg-forest-green/40' : 'w-2 bg-border-subtle'
                }`}
              />
            ))}
          </div>
          <button
            onClick={skipOnboarding}
            className="text-sm text-text-muted hover:text-text-main transition-colors"
          >
            Skip
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex flex-1 flex-col items-center overflow-y-auto p-6">
        {/* AdvisorBot Narration Banner */}
        {narrationText && (
          <div className="mb-6 w-full max-w-2xl">
            <div className="flex items-start gap-4 rounded-2xl bg-gray-900 px-5 py-4 shadow-lg">
              {/* Avatar */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
                <span className="material-symbols-outlined text-[22px] text-amber-400">lightbulb</span>
              </div>
              {/* Caption text */}
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-400">AdvisorBot</p>
                <p className="text-sm leading-relaxed">
                  {narrationText.split(/\s+/).map((word, i) => (
                    <span
                      key={i}
                      className={`transition-colors duration-200 ${
                        i < revealedWords ? 'text-white' : 'text-white/15'
                      }`}
                    >
                      {i > 0 ? ' ' : ''}{word}
                    </span>
                  ))}
                </p>
              </div>
              {/* Speaker icon + mute */}
              <div className="flex shrink-0 items-center gap-2">
                {narrationPlaying && (
                  <span className="material-symbols-outlined animate-pulse text-[18px] text-amber-400">graphic_eq</span>
                )}
                <button
                  onClick={() => {
                    setAudioEnabled((prev) => {
                      if (prev && narrationAudioRef.current) narrationAudioRef.current.pause()
                      return !prev
                    })
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                  title={audioEnabled ? 'Mute' : 'Unmute'}
                >
                  <span className="material-symbols-outlined text-[16px] text-white/70">
                    {audioEnabled ? 'volume_up' : 'volume_off'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Welcome & Business Context */}
        {step === 1 && (
          <div className="w-full max-w-2xl">
            <div className="mb-8 text-center">
              <h1 className="font-display text-3xl font-bold text-text-main">
                Welcome, {firstName}!
              </h1>
              <p className="mt-2 text-lg text-text-secondary">
                Let's learn about your business so your AI agents have the right context.
              </p>
            </div>

            <div className="space-y-6 rounded-2xl border border-border-subtle bg-white p-8 shadow-card">
              {/* Website URL + Scan */}
              <div>
                <label className="mb-2 block text-base font-medium text-text-main">Website URL</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={companyUrl}
                    onChange={(e) => setCompanyUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && companyUrl.trim()) handleScanWebsite() }}
                    placeholder="https://yourcompany.com"
                    disabled={scanning}
                    className="flex-1 rounded-lg border border-border-subtle px-3 py-2.5 text-base text-text-main placeholder:text-text-muted focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green disabled:opacity-50"
                  />
                  <button
                    onClick={handleScanWebsite}
                    disabled={scanning || !companyUrl.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-forest-green px-5 py-2.5 text-base font-medium text-white hover:bg-forest-green-hover transition-colors disabled:opacity-50"
                  >
                    {scanning ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Scanning...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[16px]">search</span>
                        Scan
                      </>
                    )}
                  </button>
                </div>
                {scanning && (
                  <div className="mt-3 space-y-1.5">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-border-subtle">
                      <div
                        className="h-full rounded-full bg-forest-green transition-all duration-300 ease-out"
                        style={{ width: `${scanProgress}%` }}
                      />
                    </div>
                    <p className="text-sm text-text-muted">{scanStatus}</p>
                  </div>
                )}
                {!scanned && !scanning && (
                  <p className="mt-2 text-sm text-text-muted">
                    We'll scan your site to auto-fill your business profile. Or skip and fill in manually below.
                  </p>
                )}
              </div>

              {/* Scanned / manual fields */}
              {scanned && (
                <div className="space-y-4">
                  {scanError ? (
                    <div className="flex items-center gap-2 pb-1">
                      <span className="material-symbols-outlined text-[18px] text-amber-500">warning</span>
                      <p className="text-base font-medium text-amber-600">{scanError}</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pb-1">
                      <span className="material-symbols-outlined text-[18px] text-forest-green">check_circle</span>
                      <p className="text-base font-medium text-forest-green">Business profile generated — review and edit as needed</p>
                    </div>
                  )}

                  {SCAN_FIELD_ORDER.map((key) => {
                    const { label, icon } = SCAN_FIELD_LABELS[key]
                    const value = scanFields[key]
                    // Industry uses a dropdown
                    if (key === 'industry') {
                      return (
                        <div key={key} className="flex items-start gap-3">
                          <span className="material-symbols-outlined mt-2.5 text-[20px] text-text-muted shrink-0">{icon}</span>
                          <div className="flex-1">
                            <label className="mb-1 block text-sm font-medium text-text-muted uppercase tracking-wide">{label}</label>
                            <select
                              value={value}
                              onChange={(e) => updateField(key, e.target.value)}
                              className="w-full rounded-lg border border-border-subtle px-3 py-2 text-base text-text-main focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
                            >
                              <option value="">Select an industry</option>
                              {INDUSTRIES.map((ind) => (
                                <option key={ind} value={ind}>{ind}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div key={key} className="flex items-start gap-3">
                        <span className="material-symbols-outlined mt-2.5 text-[20px] text-text-muted shrink-0">{icon}</span>
                        <div className="flex-1">
                          <label className="mb-1 block text-sm font-medium text-text-muted uppercase tracking-wide">{label}</label>
                          <input
                            type="text"
                            value={value}
                            onChange={(e) => updateField(key, e.target.value)}
                            placeholder={`Enter ${label.toLowerCase()}...`}
                            className="w-full rounded-lg border border-border-subtle px-3 py-2 text-base text-text-main placeholder:text-text-muted focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Manual entry when not scanned */}
              {!scanned && !scanning && (
                <button
                  onClick={() => setScanned(true)}
                  className="text-base text-forest-green hover:text-forest-green-hover transition-colors"
                >
                  Or fill in manually without scanning
                </button>
              )}

              {/* Goals */}
              {scanned && (
                <>
                  {/* Primary Goal */}
                  <div>
                    <label className="mb-2 block text-base font-medium text-text-main">
                      <span className="material-symbols-outlined text-[20px] align-middle mr-1">flag</span>
                      Primary Goal
                    </label>
                    <input
                      type="text"
                      value={primaryGoal}
                      onChange={(e) => setPrimaryGoal(e.target.value)}
                      placeholder="e.g., Drive global brand awareness through automated content distribution"
                      className="w-full rounded-lg border border-border-subtle px-3 py-2.5 text-base text-text-main placeholder:text-text-muted focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
                    />
                  </div>

                  {/* Secondary Goals */}
                  <div>
                    <label className="mb-2 block text-base font-medium text-text-main">
                      <span className="material-symbols-outlined text-[20px] align-middle mr-1">checklist</span>
                      Secondary Goals
                    </label>
                    <input
                      type="text"
                      value={secondaryGoals}
                      onChange={(e) => setSecondaryGoals(e.target.value)}
                      placeholder="e.g., Build community on Discord, Increase user acquisition, Automate support"
                      className="w-full rounded-lg border border-border-subtle px-3 py-2.5 text-base text-text-main placeholder:text-text-muted focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
                    />
                    <p className="mt-1.5 text-sm text-text-muted">Comma-separated — what else should your AI workforce tackle?</p>
                  </div>

                  <button
                    onClick={handleProfileSubmit}
                    disabled={saving}
                    className="w-full rounded-lg bg-forest-green px-4 py-3 text-base font-medium text-white shadow-sm hover:bg-forest-green-hover transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Continue'}
                  </button>

                  <p className="text-center text-sm text-text-muted">
                    Your answers here become the foundation of business context for your team of agents.
                    If you have multiple businesses, you can create more teams later.
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Tutorial Walkthrough */}
        {step === 2 && (
          <div className="w-full max-w-lg self-center">
            <div className="rounded-2xl border border-border-subtle bg-white p-8 shadow-card">
              <div className="mb-8 flex justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-forest-green/10 text-forest-green">
                  <span className="material-symbols-outlined text-[40px]">
                    {TUTORIAL_SLIDES[slideIndex].icon}
                  </span>
                </div>
              </div>

              <h2 className="mb-4 text-center font-display text-2xl font-bold text-text-main">
                {TUTORIAL_SLIDES[slideIndex].title}
              </h2>

              <ul className="mb-8 space-y-3">
                {TUTORIAL_SLIDES[slideIndex].bullets.map((bullet, i) => (
                  <li key={i} className="flex items-start gap-3 text-base text-text-secondary">
                    <span className="material-symbols-outlined mt-0.5 text-[18px] text-forest-green">check_circle</span>
                    {bullet}
                  </li>
                ))}
              </ul>

              {/* Slide dots */}
              <div className="mb-6 flex justify-center gap-2">
                {TUTORIAL_SLIDES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSlideIndex(i)}
                    className={`h-2 rounded-full transition-all ${
                      i === slideIndex ? 'w-6 bg-forest-green' : 'w-2 bg-border-subtle'
                    }`}
                  />
                ))}
              </div>

              <div className="flex gap-3">
                {slideIndex > 0 && (
                  <button
                    onClick={() => setSlideIndex(slideIndex - 1)}
                    className="flex-1 rounded-lg border border-border-subtle px-4 py-3 text-base font-medium text-text-secondary hover:bg-light-surface-alt transition-colors"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={() => {
                    if (slideIndex < TUTORIAL_SLIDES.length - 1) {
                      setSlideIndex(slideIndex + 1)
                    } else {
                      setStep(3)
                    }
                  }}
                  className="flex-1 rounded-lg bg-forest-green px-4 py-3 text-base font-medium text-white shadow-sm hover:bg-forest-green-hover transition-colors"
                >
                  {slideIndex < TUTORIAL_SLIDES.length - 1 ? 'Next' : 'Meet Your Advisor'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: AdvisorBot Chat → Meet-and-Greet */}
        {step === 3 && (
          <div className="flex w-full max-w-2xl flex-col" style={{ height: 'calc(100vh - 140px)' }}>
            {/* Chat container with header */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-border-subtle shadow-lg">
              {/* Header — switches between AdvisorBot and Meeting */}
              <div className="flex items-center gap-3 border-b border-border-subtle bg-gradient-to-r from-gray-800 to-gray-700 px-5 py-4">
                {meetingActive || meetingEnded ? (
                  <>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
                      <span className="material-symbols-outlined text-[22px] text-white">groups</span>
                    </div>
                    <div className="flex-1">
                      <h2 className="font-display text-lg font-bold text-white">Team Meet & Greet</h2>
                      <p className="text-sm text-gray-400">
                        {meetingEnded ? 'Meeting complete' : speakingAgent ? `${speakingAgent.name} is speaking...` : 'Live'}
                      </p>
                    </div>
                    <button
                      onClick={() => setAudioEnabled(!audioEnabled)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                      title={audioEnabled ? 'Mute audio' : 'Unmute audio'}
                    >
                      <span className="material-symbols-outlined text-[18px] text-white">
                        {audioEnabled ? 'volume_up' : 'volume_off'}
                      </span>
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
                      <span className="material-symbols-outlined text-[22px] text-white">smart_toy</span>
                    </div>
                    <div className="flex-1">
                      <h2 className="font-display text-lg font-bold text-white">AdvisorBot</h2>
                      <p className="text-sm text-gray-400">
                        {chatLoading ? 'Thinking...' : advisorReady ? 'Online — ready to help' : 'Connecting...'}
                      </p>
                    </div>
                    {chatLoading && (
                      <div className="flex gap-1">
                        <div className="h-2 w-2 animate-pulse rounded-full bg-white/50" style={{ animationDelay: '0ms' }} />
                        <div className="h-2 w-2 animate-pulse rounded-full bg-white/50" style={{ animationDelay: '300ms' }} />
                        <div className="h-2 w-2 animate-pulse rounded-full bg-white/50" style={{ animationDelay: '600ms' }} />
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto bg-gradient-to-b from-gray-50 to-white p-5">
                {meetingActive || meetingEnded ? (
                  /* ── Meeting messages ── */
                  <div className="space-y-5">
                    {meetingMessages.map((msg) => (
                      <div key={msg.id} className={`flex gap-3 ${msg.type === 'human' ? 'justify-end' : ''}`}>
                        {msg.type === 'agent' && (
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm"
                            style={{ backgroundColor: msg.agentIconColor ?? '#0F4D26' }}
                          >
                            <span className="material-symbols-outlined text-[18px] text-white">
                              {msg.agentIcon ?? 'smart_toy'}
                            </span>
                          </div>
                        )}
                        <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-base leading-relaxed whitespace-pre-wrap shadow-sm ${
                          msg.type === 'human'
                            ? 'bg-forest-green text-white rounded-br-md'
                            : 'bg-white border border-gray-100 text-text-main rounded-bl-md'
                        }`}>
                          {msg.type === 'agent' && msg.agentName && (
                            <p className="mb-1 text-sm font-semibold" style={{ color: msg.agentIconColor ?? '#0F4D26' }}>
                              {msg.agentName}
                            </p>
                          )}
                          {msg.content}
                        </div>
                        {msg.type === 'human' && (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200">
                            <span className="material-symbols-outlined text-[18px] text-gray-600">person</span>
                          </div>
                        )}
                      </div>
                    ))}
                    {speakingAgent && (
                      <div className="flex gap-3">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm"
                          style={{ backgroundColor: speakingAgent.iconColor }}
                        >
                          <span className="material-symbols-outlined text-[18px] text-white animate-pulse">
                            {speakingAgent.icon}
                          </span>
                        </div>
                        <div className="rounded-2xl rounded-bl-md bg-white border border-gray-100 px-4 py-3 shadow-sm">
                          <p className="text-sm font-semibold" style={{ color: speakingAgent.iconColor }}>
                            {speakingAgent.name}
                          </p>
                          <div className="mt-1 flex gap-0.5">
                            <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-forest-green/50" style={{ animationDelay: '0ms' }} />
                            <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-forest-green/50" style={{ animationDelay: '150ms' }} />
                            <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-forest-green/50" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={meetingEndRef} />
                  </div>
                ) : !advisorReady ? (
                  /* ── AdvisorBot loading ── */
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center">
                      <div className="mb-4 flex justify-center">
                        <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-forest-green/10">
                          <span className="material-symbols-outlined text-[28px] text-forest-green">smart_toy</span>
                          <div className="absolute -inset-1 animate-ping rounded-full bg-forest-green/10" />
                        </div>
                      </div>
                      <p className="text-base font-medium text-text-main">Waking up AdvisorBot...</p>
                      <p className="mt-1 text-sm text-text-muted">This only takes a moment</p>
                    </div>
                  </div>
                ) : (
                  /* ── AdvisorBot 1:1 chat messages ── */
                  <div className="space-y-5">
                    {messages.map((msg, i) => (
                      <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                        {msg.role === 'agent' && (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest-green shadow-sm">
                            <span className="material-symbols-outlined text-[18px] text-white">smart_toy</span>
                          </div>
                        )}
                        <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-base leading-relaxed whitespace-pre-wrap shadow-sm ${
                          msg.role === 'user'
                            ? 'bg-forest-green text-white rounded-br-md'
                            : 'bg-white border border-gray-100 text-text-main rounded-bl-md'
                        }`}>
                          {msg.content}
                        </div>
                        {msg.role === 'user' && (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200">
                            <span className="material-symbols-outlined text-[18px] text-gray-600">person</span>
                          </div>
                        )}
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest-green shadow-sm">
                          <span className="material-symbols-outlined text-[18px] text-white animate-pulse">psychology</span>
                        </div>
                        <div className="rounded-2xl rounded-bl-md bg-white border border-gray-100 px-4 py-3 shadow-sm">
                          <div className="flex items-center gap-2">
                            <div className="flex gap-0.5">
                              <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-forest-green/50" style={{ animationDelay: '0ms' }} />
                              <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-forest-green/50" style={{ animationDelay: '150ms' }} />
                              <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-forest-green/50" style={{ animationDelay: '300ms' }} />
                            </div>
                          </div>
                          <p className="mt-1.5 text-sm text-text-muted italic transition-all duration-300">{thinkingPhrase}</p>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}
              </div>

              {/* Input area */}
              <div className="border-t border-border-subtle bg-white px-4 py-3">
                {meetingEnded ? (
                  /* Meeting ended → Go to Dashboard */
                  <button
                    onClick={async () => {
                      if (activeTeam) {
                        await engine.updateTeamProfile(activeTeam.id, { onboardedAt: new Date().toISOString() } as Partial<engine.TeamProfile>).catch(() => {})
                      }
                      navigate('/dashboard', { replace: true })
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-forest-green px-4 py-3.5 text-base font-medium text-white shadow-sm hover:bg-forest-green-hover transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px]">dashboard</span>
                    Go to My Dashboard
                    <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                  </button>
                ) : meetingActive ? (
                  /* During meeting → mic (push-to-talk) + raise hand + text fallback */
                  <div className="space-y-3">
                    {/* Primary row: Raise Hand + Mic + Audio Toggle */}
                    <div className="flex items-center justify-center gap-4">
                      {/* Raise hand */}
                      <button
                        onClick={handleRaiseHand}
                        title="Raise hand to speak"
                        className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-text-secondary shadow-sm hover:bg-amber-50 hover:border-amber-300 hover:text-amber-600 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[22px]">front_hand</span>
                      </button>

                      {/* Mic — push-to-talk */}
                      <button
                        onMouseDown={startRecording}
                        onMouseUp={stopRecording}
                        onMouseLeave={() => recording && stopRecording()}
                        onTouchStart={(e) => { e.preventDefault(); startRecording() }}
                        onTouchEnd={(e) => { e.preventDefault(); stopRecording() }}
                        disabled={transcribing}
                        className={`flex h-16 w-16 items-center justify-center rounded-full shadow-md transition-all ${
                          recording
                            ? 'bg-red-500 text-white scale-110 animate-pulse'
                            : transcribing
                              ? 'bg-amber-500 text-white'
                              : 'bg-forest-green text-white hover:bg-forest-green-hover'
                        }`}
                        title={recording ? 'Release to send' : transcribing ? 'Transcribing...' : 'Hold to speak'}
                      >
                        <span className="material-symbols-outlined text-[28px]">
                          {recording ? 'mic' : transcribing ? 'hourglass_top' : 'mic'}
                        </span>
                      </button>

                      {/* Audio toggle */}
                      <button
                        onClick={() => {
                          setAudioEnabled((prev) => !prev)
                          if (audioEnabled && audioRef.current) audioRef.current.pause()
                        }}
                        title={audioEnabled ? 'Mute agent voices' : 'Unmute agent voices'}
                        className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-sm transition-colors ${
                          audioEnabled
                            ? 'border-gray-200 bg-white text-text-secondary hover:bg-gray-50'
                            : 'border-red-200 bg-red-50 text-red-500'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[22px]">
                          {audioEnabled ? 'volume_up' : 'volume_off'}
                        </span>
                      </button>
                    </div>

                    {/* Status label */}
                    <p className="text-center text-sm text-text-muted">
                      {recording ? 'Listening... release to send' : transcribing ? 'Transcribing your message...' : 'Hold mic to speak'}
                    </p>

                    {/* Text fallback */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={meetingInput}
                        onChange={(e) => setMeetingInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && meetingInput.trim()) {
                            sendMeetingMsg(meetingInput.trim())
                          }
                        }}
                        placeholder="Or type a message..."
                        className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-text-main placeholder:text-text-muted focus:border-forest-green focus:bg-white focus:outline-none focus:ring-1 focus:ring-forest-green transition-colors"
                      />
                      <button
                        onClick={() => meetingInput.trim() && sendMeetingMsg(meetingInput.trim())}
                        disabled={!meetingInput.trim()}
                        className="rounded-xl bg-forest-green px-4 py-2.5 text-white shadow-sm hover:bg-forest-green-hover transition-colors disabled:opacity-40"
                      >
                        <span className="material-symbols-outlined text-[18px]">send</span>
                      </button>
                    </div>
                  </div>
                ) : agentsDeployed && !meetingId ? (
                  /* Agents deployed but meeting didn't start (error fallback) */
                  <button
                    onClick={async () => {
                      if (activeTeam) {
                        await engine.updateTeamProfile(activeTeam.id, { onboardedAt: new Date().toISOString() } as Partial<engine.TeamProfile>).catch(() => {})
                      }
                      navigate('/dashboard', { replace: true })
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-forest-green px-4 py-3.5 text-base font-medium text-white shadow-sm hover:bg-forest-green-hover transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px]">dashboard</span>
                    Go to My Dashboard
                    <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                  </button>
                ) : !chatLoading && messages.some((m) => m.role === 'agent') && !deploying ? (
                  /* Deploy button */
                  <button
                    onClick={async () => {
                      setDeploying(true)
                      await sendAdvisorMessage('Yes, deploy all of the recommended agents for me now.')
                      setDeploying(false)
                      setAgentsDeployed(true)
                      // Start meet-and-greet after agents are deployed
                      if (activeTeam) {
                        try {
                          const { meetingId: mid } = await engine.startMeetAndGreet(activeTeam.id)
                          setMeetingId(mid)
                          setMeetingActive(true)
                        } catch (err) {
                          console.error('[onboarding] Failed to start meet-and-greet:', err)
                        }
                      }
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-forest-green px-4 py-3.5 text-base font-medium text-white shadow-sm hover:bg-forest-green-hover transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px]">rocket_launch</span>
                    Deploy Agents Now
                  </button>
                ) : (
                  /* AdvisorBot text input */
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && chatInput.trim() && !chatLoading) {
                          sendAdvisorMessage(chatInput.trim())
                        }
                      }}
                      placeholder="Ask AdvisorBot anything..."
                      disabled={!advisorReady || chatLoading}
                      className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-text-main placeholder:text-text-muted focus:border-forest-green focus:bg-white focus:outline-none focus:ring-1 focus:ring-forest-green disabled:opacity-50 transition-colors"
                    />
                    <button
                      onClick={() => chatInput.trim() && sendAdvisorMessage(chatInput.trim())}
                      disabled={!advisorReady || chatLoading || !chatInput.trim()}
                      className="rounded-xl bg-forest-green px-5 py-3 text-white shadow-sm hover:bg-forest-green-hover transition-colors disabled:opacity-40"
                    >
                      <span className="material-symbols-outlined text-[20px]">send</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Skip link — only when not in meeting */}
            {!agentsDeployed && !meetingActive && !meetingEnded && (
              <button
                onClick={() => setStep(4)}
                className="mt-3 text-sm text-text-muted hover:text-text-secondary transition-colors"
              >
                Skip — I'll set up agents later
              </button>
            )}
          </div>
        )}

        {/* Step 4: Completion */}
        {step === 4 && (
          <div className="w-full max-w-lg self-center text-center">
            <div className="mb-6 flex justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-forest-green/10 text-forest-green">
                <span className="material-symbols-outlined text-[40px]">celebration</span>
              </div>
            </div>

            <h2 className="font-display text-3xl font-bold text-text-main">You're all set!</h2>
            <p className="mt-2 text-lg text-text-secondary">
              Your AI workforce is ready to go. Here's what we set up for you:
            </p>

            {/* Deployed agents list */}
            {deployedAgents.length > 0 && (
              <div className="mt-6 space-y-2">
                {deployedAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-3 rounded-xl border border-border-subtle bg-white px-4 py-3.5 text-left shadow-sm"
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${agent.iconColor}20`, color: agent.iconColor ?? '#0F4D26' }}
                    >
                      <span className="material-symbols-outlined text-[22px]">{agent.iconName ?? 'smart_toy'}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-medium text-text-main truncate">{agent.name}</p>
                      <p className="text-sm text-text-muted">{agent.department ?? 'General'}</p>
                    </div>
                    <span className="text-sm text-accent-green font-medium">Ready</span>
                  </div>
                ))}
              </div>
            )}

            {/* Quick links */}
            <div className="mt-8 flex flex-col gap-3">
              <button
                onClick={() => navigate('/dashboard', { replace: true })}
                className="w-full rounded-lg bg-forest-green px-4 py-3 text-base font-medium text-white shadow-sm hover:bg-forest-green-hover transition-colors"
              >
                Go to Dashboard
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/chat', { replace: true })}
                  className="flex-1 rounded-lg border border-border-subtle px-4 py-3 text-base font-medium text-text-secondary hover:bg-light-surface-alt transition-colors"
                >
                  Chat with Agents
                </button>
                <button
                  onClick={() => navigate('/templates', { replace: true })}
                  className="flex-1 rounded-lg border border-border-subtle px-4 py-3 text-base font-medium text-text-secondary hover:bg-light-surface-alt transition-colors"
                >
                  Browse Templates
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
