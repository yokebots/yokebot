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
      'Deploy specialized workers from 40+ pre-built agents',
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
  'Cross-referencing 40+ pre-built agents...',
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
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'agent'; content: string; upgradeLink?: boolean }>>([])
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
  const meetingAudioUrlRef = useRef<string | null>(null)
  const meetingEndRef = useRef<HTMLDivElement>(null)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)

  // Meeting speaker banner captions (word-highlighted like narration)
  const [mtgCaptionScreens, setMtgCaptionScreens] = useState<string[][]>([])
  const [mtgCaptionScreen, setMtgCaptionScreen] = useState(0)
  const [mtgCaptionWord, setMtgCaptionWord] = useState(0)
  const [mtgCaptionPlaying, setMtgCaptionPlaying] = useState(false)
  const mtgCaptionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mtgCaptionWordsRef = useRef<string[]>([])
  const mtgCaptionDurationRef = useRef(0)
  const audioChunksRef = useRef<Blob[]>([])

  // Audio unlock: browsers block autoplay without a user gesture.
  // We show a quick splash screen; clicking it unlocks audio permanently.
  const [audioUnlocked, setAudioUnlocked] = useState(false)

  // Narration state: screens of text with word-level highlighting
  const [narrationScreens, setNarrationScreens] = useState<string[][]>([]) // each screen = array of words
  const [currentScreen, setCurrentScreen] = useState(0)
  const [highlightedWord, setHighlightedWord] = useState(0) // global word index across all screens
  const [narrationPlaying, setNarrationPlaying] = useState(false)
  const [narrationPaused, setNarrationPaused] = useState(false)
  const narrationAudioRef = useRef<HTMLAudioElement | null>(null)
  const narrationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const narrationAudioUrlRef = useRef<string | null>(null)
  const narrationWordsRef = useRef<string[]>([]) // flat word list for timing
  const narrationDurationRef = useRef(0)
  const prefetchedNarrationRef = useRef<{ text: string; audioBase64: string; audioDurationMs: number } | null>(null)
  const prefetchPromiseRef = useRef<Promise<{ text: string; audioBase64: string; audioDurationMs: number }> | null>(null)
  const step1PlayedRef = useRef(false)

  // Step 4 state
  const [deployedAgents, setDeployedAgents] = useState<engine.EngineAgent[]>([])

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] ?? 'there'

  // Split text into screens (~2-3 sentences, ~20-30 words each)
  const buildScreens = (text: string): string[][] => {
    const sentences = text.split(/(?<=[.!?])\s+/)
    const screens: string[][] = []
    let currentWords: string[] = []
    for (const sentence of sentences) {
      const words = sentence.split(/\s+/)
      currentWords.push(...words)
      // Start a new screen every 2-3 sentences or ~25 words
      if (currentWords.length >= 20) {
        screens.push([...currentWords])
        currentWords = []
      }
    }
    if (currentWords.length > 0) screens.push(currentWords)
    return screens
  }

  // Get the global word index where a given screen starts
  const screenStartWord = (screenIdx: number): number => {
    let count = 0
    for (let i = 0; i < screenIdx; i++) count += (narrationScreens[i]?.length ?? 0)
    return count
  }

  // Clean up narration resources
  const cleanupNarration = () => {
    if (narrationAudioRef.current) { narrationAudioRef.current.pause(); narrationAudioRef.current = null }
    if (narrationAudioUrlRef.current) { URL.revokeObjectURL(narrationAudioUrlRef.current); narrationAudioUrlRef.current = null }
    if (narrationTimerRef.current) { clearInterval(narrationTimerRef.current); narrationTimerRef.current = null }
  }

  // Clean up meeting audio/caption resources
  const cleanupMeetingCaption = () => {
    if (mtgCaptionTimerRef.current) { clearInterval(mtgCaptionTimerRef.current); mtgCaptionTimerRef.current = null }
    setMtgCaptionPlaying(false)
  }

  // Get the global word index where a meeting caption screen starts
  const mtgScreenStartWord = (screenIdx: number): number => {
    let count = 0
    for (let i = 0; i < screenIdx; i++) count += (mtgCaptionScreens[i]?.length ?? 0)
    return count
  }

  // Play meeting agent message with captions + audio
  const playMeetingAgentMessage = useCallback((text: string, audioBase64: string | undefined, audioDurationMs: number | undefined) => {
    cleanupMeetingCaption()
    const screens = buildScreens(text)
    const allWords = screens.flat()
    mtgCaptionWordsRef.current = allWords
    const durationMs = audioDurationMs ?? (allWords.length * 250) // fallback: ~250ms per word
    mtgCaptionDurationRef.current = durationMs
    setMtgCaptionScreens(screens)
    setMtgCaptionScreen(0)
    setMtgCaptionWord(0)
    setMtgCaptionPlaying(true)

    // Helper to start/restart the word highlight timer with a given duration
    const startMtgWordTimer = (totalDurationMs: number) => {
      if (mtgCaptionTimerRef.current) clearInterval(mtgCaptionTimerRef.current)
      const msPerWord = totalDurationMs / allWords.length
      let wordIdx = 0
      setMtgCaptionWord(0)
      setMtgCaptionScreen(0)
      mtgCaptionTimerRef.current = setInterval(() => {
        wordIdx++
        if (wordIdx < allWords.length) {
          setMtgCaptionWord(wordIdx)
          // Auto-advance caption screen
          setMtgCaptionScreen(() => {
            let count = 0
            for (let s = 0; s < screens.length; s++) {
              count += screens[s].length
              if (wordIdx < count) return s
            }
            return screens.length - 1
          })
        } else {
          clearInterval(mtgCaptionTimerRef.current!)
          mtgCaptionTimerRef.current = null
          setMtgCaptionPlaying(false)
        }
      }, msPerWord)
    }

    // Play audio as blob URL (not base64 data URI)
    if (audioEnabled && audioBase64) {
      try {
        if (audioRef.current) audioRef.current.pause()
        if (meetingAudioUrlRef.current) URL.revokeObjectURL(meetingAudioUrlRef.current)
        const bytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))
        const blob = new Blob([bytes], { type: 'audio/mpeg' })
        const url = URL.createObjectURL(blob)
        meetingAudioUrlRef.current = url
        const audio = new Audio(url)
        audioRef.current = audio
        // When we know the real audio duration, restart the word timer to sync perfectly
        audio.onloadedmetadata = () => {
          if (audio.duration && isFinite(audio.duration)) {
            const realDurationMs = audio.duration * 1000
            startMtgWordTimer(realDurationMs)
          }
        }
        audio.onended = () => {
          if (mtgCaptionTimerRef.current) clearInterval(mtgCaptionTimerRef.current)
          mtgCaptionTimerRef.current = null
          setMtgCaptionPlaying(false)
          setMtgCaptionWord(allWords.length - 1)
          setMtgCaptionScreen(screens.length - 1)
        }
        audio.play().catch(() => {})
      } catch { /* ignore audio errors */ }
    }

    // Start word timer with estimated duration (will be recalibrated when audio loads)
    startMtgWordTimer(durationMs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioEnabled])

  // Start word-level highlight timer from a given word index
  const startWordTimer = (fromWord: number, totalWords: number, durationMs: number) => {
    if (narrationTimerRef.current) clearInterval(narrationTimerRef.current)
    const msPerWord = durationMs / totalWords
    let wordIdx = fromWord
    setHighlightedWord(wordIdx)

    narrationTimerRef.current = setInterval(() => {
      wordIdx++
      if (wordIdx < totalWords) {
        setHighlightedWord(wordIdx)
        // Auto-advance screen when highlighted word enters next screen
        setCurrentScreen((prev) => {
          let count = 0
          for (let s = 0; s < narrationScreens.length; s++) {
            count += narrationScreens[s].length
            if (wordIdx < count) return s
          }
          return prev
        })
      } else {
        clearInterval(narrationTimerRef.current!)
        narrationTimerRef.current = null
      }
    }, msPerWord)
  }

  // Play narration from data
  const playNarration = useCallback((text: string, audioBase64: string, audioDurationMs: number) => {
    cleanupNarration()
    const screens = buildScreens(text)
    const allWords = screens.flat()
    narrationWordsRef.current = allWords
    narrationDurationRef.current = audioDurationMs
    setNarrationScreens(screens)
    setCurrentScreen(0)
    setHighlightedWord(0)
    setNarrationPaused(false)

    if (audioBase64) {
      const bytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      narrationAudioUrlRef.current = url

      const audio = new Audio(url)
      narrationAudioRef.current = audio
      audio.muted = !audioEnabled

      startWordTimer(0, allWords.length, audioDurationMs)

      setNarrationPlaying(true)
      audio.onended = () => {
        setNarrationPlaying(false)
        setHighlightedWord(allWords.length - 1)
        setCurrentScreen(screens.length - 1)
        if (narrationTimerRef.current) { clearInterval(narrationTimerRef.current); narrationTimerRef.current = null }
      }
      audio.play().catch(() => {
        setNarrationPlaying(false)
        setHighlightedWord(allWords.length - 1)
        setCurrentScreen(screens.length - 1)
        if (narrationTimerRef.current) { clearInterval(narrationTimerRef.current); narrationTimerRef.current = null }
      })
    } else {
      setHighlightedWord(allWords.length - 1)
      setCurrentScreen(screens.length - 1)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioEnabled])

  // Pause / resume narration
  const toggleNarrationPause = useCallback(() => {
    const audio = narrationAudioRef.current
    if (!audio) return
    if (narrationPaused) {
      audio.play()
      // Restart word timer from current position
      const totalWords = narrationWordsRef.current.length
      const fraction = audio.currentTime / audio.duration
      const fromWord = Math.floor(fraction * totalWords)
      startWordTimer(fromWord, totalWords, narrationDurationRef.current)
      setNarrationPaused(false)
    } else {
      audio.pause()
      if (narrationTimerRef.current) { clearInterval(narrationTimerRef.current); narrationTimerRef.current = null }
      setNarrationPaused(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrationPaused])

  // Navigate to a specific screen (prev/next arrows)
  const goToScreen = useCallback((screenIdx: number) => {
    if (screenIdx < 0 || screenIdx >= narrationScreens.length) return
    setCurrentScreen(screenIdx)
    const wordIdx = screenStartWord(screenIdx)
    setHighlightedWord(wordIdx)

    // Seek audio to match
    const audio = narrationAudioRef.current
    if (audio && audio.duration) {
      const totalWords = narrationWordsRef.current.length
      const fraction = wordIdx / totalWords
      audio.currentTime = fraction * audio.duration
      if (!narrationPaused) {
        startWordTimer(wordIdx, totalWords, narrationDurationRef.current)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrationScreens, narrationPaused])

  // Prefetch step 1 narration while splash is showing
  useEffect(() => {
    if (!activeTeam || audioUnlocked) return
    const promise = engine.getAdvisorNarration(activeTeam.id, 1, firstName)
    prefetchPromiseRef.current = promise
    promise.then((data) => {
      prefetchedNarrationRef.current = data
    }).catch((err) => {
      console.error('[onboarding] Narration prefetch failed:', err)
    })
  }, [activeTeam?.id, audioUnlocked, firstName])

  // User clicks "Let's Go" → unlock audio and play narration
  const handleAudioUnlock = useCallback(async () => {
    const ctx = new AudioContext()
    if (ctx.state === 'suspended') ctx.resume()
    step1PlayedRef.current = true
    setAudioUnlocked(true)

    // If prefetch already resolved, play instantly
    if (prefetchedNarrationRef.current) {
      const { text, audioBase64, audioDurationMs } = prefetchedNarrationRef.current
      prefetchedNarrationRef.current = null
      playNarration(text, audioBase64, audioDurationMs)
      return
    }

    // User clicked before prefetch finished — await the in-flight request
    if (prefetchPromiseRef.current) {
      try {
        const data = await prefetchPromiseRef.current
        playNarration(data.text, data.audioBase64, data.audioDurationMs)
      } catch (err) {
        console.error('[onboarding] Narration prefetch await failed:', err)
      }
    }
  }, [playNarration])

  // Cache for prefetched narration by step number
  const narrationCacheRef = useRef<Map<number, { text: string; audioBase64: string; audioDurationMs: number }>>(new Map())

  // Prefetch the next step's narration while current step plays
  useEffect(() => {
    if (!activeTeam || !audioUnlocked || step < 1 || step >= 4) return
    const nextStep = step + 1
    if (narrationCacheRef.current.has(nextStep)) return // already cached
    engine.getAdvisorNarration(activeTeam.id, nextStep, firstName).then((data) => {
      narrationCacheRef.current.set(nextStep, data)
    }).catch(() => {}) // silent — will be fetched on demand if prefetch fails
  }, [step, activeTeam?.id, audioUnlocked, firstName])

  // Fetch and play narration for steps 2-4 (step 1 is always handled by handleAudioUnlock)
  useEffect(() => {
    if (!activeTeam || !audioUnlocked) return
    if (step === 1) return // step 1 is handled by handleAudioUnlock + prefetch
    let cancelled = false
    cleanupNarration()
    setNarrationScreens([])
    setCurrentScreen(0)
    setHighlightedWord(0)
    setNarrationPlaying(false)
    setNarrationPaused(false)

    // Check cache first (prefetched during previous step)
    const cached = narrationCacheRef.current.get(step)
    if (cached) {
      playNarration(cached.text, cached.audioBase64, cached.audioDurationMs)
      return
    }

    // Fallback: fetch on demand
    engine.getAdvisorNarration(activeTeam.id, step, firstName).then((data) => {
      if (cancelled) return
      playNarration(data.text, data.audioBase64, data.audioDurationMs)
    }).catch((err) => {
      console.error('[onboarding] Narration fetch failed for step', step, ':', err)
    })

    return () => { cancelled = true; if (narrationTimerRef.current) clearInterval(narrationTimerRef.current) }
  }, [step, activeTeam?.id, audioUnlocked, firstName, playNarration])

  // Sync mute/unmute with current audio element
  useEffect(() => {
    if (narrationAudioRef.current) {
      narrationAudioRef.current.muted = !audioEnabled
    }
  }, [audioEnabled])

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
            // Add to chat thread
            setMeetingMessages((prev) => [...prev, {
              id: `agent-${event.data.messageId ?? Date.now()}`,
              type: 'agent',
              agentName: event.data.agentName,
              agentIcon: event.data.agentIcon ?? 'smart_toy',
              agentIconColor: event.data.agentIconColor ?? '#0F4D26',
              content: event.data.content ?? '',
            }])
            // Play audio + word-highlighted captions in speaker banner
            playMeetingAgentMessage(
              event.data.content ?? '',
              event.data.audioBase64,
              event.data.audioDurationMs,
            )
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
            // Show the dashboard CTA immediately, but let current audio/captions
            // finish naturally — don't cut off the wrap-up message
            setMeetingEnded(true)
            setMeetingActive(false)
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

  // Audio unlock splash — shown before onboarding starts
  if (!audioUnlocked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/20">
            <span className="material-symbols-outlined text-[44px] text-amber-400">lightbulb</span>
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold text-white">
              Hey {firstName}!
            </h1>
            <p className="mt-3 text-lg text-gray-400">
              Your AI advisor is ready to walk you through setup.
            </p>
          </div>
          <button
            onClick={handleAudioUnlock}
            className="flex items-center gap-2 rounded-xl bg-forest-green px-8 py-4 text-lg font-semibold text-white shadow-lg hover:bg-forest-green-hover transition-colors"
          >
            <span className="material-symbols-outlined text-[22px]">play_circle</span>
            Let's Go
          </button>
          <button
            onClick={() => { setAudioUnlocked(true); setAudioEnabled(false) }}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            Continue without audio
          </button>
        </div>
      </div>
    )
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
        {/* AdvisorBot Narration — screen-based captions with word highlighting */}
        {narrationScreens.length > 0 && (
          <div className="mb-6 w-full max-w-2xl">
            <div className="rounded-2xl bg-gray-900 shadow-lg">
              {/* Header row */}
              <div className="flex items-center gap-3 px-5 pt-4 pb-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
                  <span className="material-symbols-outlined text-[20px] text-amber-400">lightbulb</span>
                </div>
                <p className="flex-1 text-xs font-semibold uppercase tracking-wider text-amber-400">AdvisorBot</p>
                {/* Controls */}
                <div className="flex items-center gap-1">
                  {narrationPlaying && (
                    <span className="material-symbols-outlined animate-pulse text-[16px] text-amber-400 mr-1">graphic_eq</span>
                  )}
                  {/* Pause / Play */}
                  {narrationPlaying && (
                    <button
                      onClick={toggleNarrationPause}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                      title={narrationPaused ? 'Resume' : 'Pause'}
                    >
                      <span className="material-symbols-outlined text-[16px] text-white/70">
                        {narrationPaused ? 'play_arrow' : 'pause'}
                      </span>
                    </button>
                  )}
                  {/* Mute */}
                  <button
                    onClick={() => setAudioEnabled((prev) => !prev)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                    title={audioEnabled ? 'Mute' : 'Unmute'}
                  >
                    <span className="material-symbols-outlined text-[16px] text-white/70">
                      {audioEnabled ? 'volume_up' : 'volume_off'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Caption text with word highlighting */}
              <div className="px-5 pb-3">
                <p className="text-[15px] leading-relaxed">
                  {narrationScreens[currentScreen]?.map((word, i) => {
                    const globalIdx = screenStartWord(currentScreen) + i
                    const isActive = globalIdx === highlightedWord
                    const isSpoken = globalIdx < highlightedWord
                    return (
                      <span
                        key={i}
                        className={`transition-colors duration-150 ${
                          isActive
                            ? 'text-amber-400 font-semibold'
                            : isSpoken
                              ? 'text-white'
                              : 'text-white/30'
                        }`}
                      >
                        {i > 0 ? ' ' : ''}{word}
                      </span>
                    )
                  })}
                </p>
              </div>

              {/* Screen navigation */}
              {narrationScreens.length > 1 && (
                <div className="flex items-center justify-between border-t border-white/10 px-5 py-2">
                  <button
                    onClick={() => goToScreen(currentScreen - 1)}
                    disabled={currentScreen === 0}
                    className="flex items-center gap-1 text-xs text-white/50 hover:text-white/80 transition-colors disabled:opacity-30 disabled:cursor-default"
                  >
                    <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                    Previous
                  </button>
                  <span className="text-[11px] text-white/30">
                    {currentScreen + 1} / {narrationScreens.length}
                  </span>
                  <button
                    onClick={() => goToScreen(currentScreen + 1)}
                    disabled={currentScreen === narrationScreens.length - 1}
                    className="flex items-center gap-1 text-xs text-white/50 hover:text-white/80 transition-colors disabled:opacity-30 disabled:cursor-default"
                  >
                    Next
                    <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                  </button>
                </div>
              )}
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
        {step === 3 && (meetingActive || meetingEnded) && (
          /* ── MEETING: Split-view layout ── */
          <div data-testid="meeting-container" className="flex w-full flex-col" style={{ height: 'calc(100vh - 140px)' }}>
            {/* ── TOP: Speaker Banner with Word-Highlighted Captions ── */}
            {(speakingAgent || mtgCaptionPlaying) && (
              <div className="shrink-0 bg-gray-900 px-6 py-5">
                {/* Agent identity row */}
                <div className="mb-3 flex items-center gap-3">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full shadow-lg"
                    style={{ backgroundColor: speakingAgent?.iconColor ?? '#0F4D26' }}
                  >
                    <span className="material-symbols-outlined text-[24px] text-white">
                      {speakingAgent?.icon ?? 'smart_toy'}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="font-display text-lg font-bold text-white">{speakingAgent?.name ?? 'Agent'}</p>
                    <p className="text-sm text-amber-400">Speaking</p>
                  </div>
                  {/* Audio equalizer animation */}
                  <div className="flex items-end gap-0.5 h-6">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="w-1 rounded-full bg-amber-400"
                        style={{
                          animation: mtgCaptionPlaying ? `eq-bar 0.6s ease-in-out ${i * 0.1}s infinite alternate` : 'none',
                          height: mtgCaptionPlaying ? undefined : '4px',
                        }}
                      />
                    ))}
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
                </div>
                {/* Word-highlighted captions */}
                {mtgCaptionScreens.length > 0 && (
                  <div className="min-h-[60px]">
                    <p className="text-lg leading-relaxed">
                      {(mtgCaptionScreens[mtgCaptionScreen] ?? []).map((word, wi) => {
                        const globalIdx = mtgScreenStartWord(mtgCaptionScreen) + wi
                        const isActive = globalIdx === mtgCaptionWord
                        const isSpoken = globalIdx < mtgCaptionWord
                        return (
                          <span
                            key={wi}
                            className={`transition-colors duration-150 ${
                              isActive ? 'text-amber-400 font-semibold' : isSpoken ? 'text-white' : 'text-white/30'
                            }`}
                          >
                            {word}{' '}
                          </span>
                        )
                      })}
                    </p>
                    {mtgCaptionScreens.length > 1 && (
                      <p className="mt-2 text-center text-xs text-gray-500">
                        {mtgCaptionScreen + 1} / {mtgCaptionScreens.length}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Meeting header (when no one is speaking) ── */}
            {!speakingAgent && !mtgCaptionPlaying && (
              <div className="flex shrink-0 items-center gap-3 bg-gradient-to-r from-gray-800 to-gray-700 px-5 py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
                  <span className="material-symbols-outlined text-[22px] text-white">groups</span>
                </div>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-white">Team Meet & Greet</h2>
                  <p className="text-sm text-gray-400">
                    {meetingEnded ? 'Meeting complete' : 'Live'}
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
              </div>
            )}

            {/* ── BOTTOM: Scrolling Chat Thread ── */}
            <div className="flex flex-1 flex-col overflow-hidden border-t border-gray-700">
              <div className="flex-1 overflow-y-auto bg-gradient-to-b from-gray-50 to-white p-5">
                <div className="mx-auto max-w-2xl space-y-5">
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
                  {speakingAgent && !mtgCaptionPlaying && (
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
              </div>

              {/* ── Controls Bar ── */}
              <div className="shrink-0 border-t border-border-subtle bg-white px-4 py-3">
                <div className="mx-auto max-w-2xl">
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
                  ) : (
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
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: AdvisorBot Chat (pre-meeting) */}
        {step === 3 && !meetingActive && !meetingEnded && (
          <div className="flex w-full max-w-2xl flex-col" style={{ height: 'calc(100vh - 140px)' }}>
            <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-border-subtle shadow-lg">
              {/* Header */}
              <div className="flex items-center gap-3 border-b border-border-subtle bg-gradient-to-r from-gray-800 to-gray-700 px-5 py-4">
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
              </div>

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto bg-gradient-to-b from-gray-50 to-white p-5">
                {!advisorReady ? (
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
                          {msg.upgradeLink && (
                            <a
                              href="/settings/billing"
                              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-forest-green px-3 py-1.5 text-sm font-medium text-white hover:bg-forest-green-hover transition-colors no-underline"
                            >
                              <span className="material-symbols-outlined text-[16px]">upgrade</span>
                              Upgrade Plan
                            </a>
                          )}
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
                {agentsDeployed && !meetingId ? (
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
                        let retries = 0
                        const tryStart = async (): Promise<void> => {
                          try {
                            const { meetingId: mid } = await engine.startMeetAndGreet(activeTeam.id)
                            setMeetingId(mid)
                            setMeetingActive(true)
                          } catch (err) {
                            const errMsg = err instanceof Error ? err.message : String(err)
                            console.error(`[onboarding] Meet-and-greet start failed (attempt ${retries + 1}):`, err)
                            // Meeting limit reached — show the server message directly, don't retry
                            if (errMsg.includes('plan includes')) {
                              setMessages(prev => [...prev, {
                                role: 'agent',
                                content: `${errMsg} Your agents are deployed and ready — head to the dashboard to chat with them!`,
                                upgradeLink: true,
                              }])
                              return
                            }
                            if (retries < 2) {
                              retries++
                              await new Promise(r => setTimeout(r, 2000))
                              return tryStart()
                            }
                            // After 3 failures, show error in chat
                            setMessages(prev => [...prev, {
                              role: 'agent',
                              content: "I had trouble starting the team meeting. Don't worry — your agents are deployed! Head to the dashboard to meet them there.",
                            }])
                          }
                        }
                        await tryStart()
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

            {/* Skip link */}
            {!agentsDeployed && (
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
                  Browse Pre-Built Agents
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
