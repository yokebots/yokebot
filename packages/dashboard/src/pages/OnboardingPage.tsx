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

const CATEGORIES = [
  'Business / Startup', 'Freelance / Consulting', 'Creative / Content',
  'Student / Academic', 'Personal Productivity', 'Software Development',
  'Marketing / Growth', 'Sales / CRM', 'Community / Nonprofit',
  'Research', 'Other',
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
    title: 'Shared Workspace',
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
  const [noWebsite, setNoWebsite] = useState(false)
  const [hasWebsite, setHasWebsite] = useState(false)
  const [noWebsiteContext, setNoWebsiteContext] = useState('')
  const [noWebsiteCategory, setNoWebsiteCategory] = useState('')
  const [noWebsiteName, setNoWebsiteName] = useState('')
  const [primaryGoal, setPrimaryGoal] = useState('')
  const [autoDeployedAgents, setAutoDeployedAgents] = useState<Array<{ id: string; name: string; templateId: string; icon: string; iconColor: string; department: string }>>([])
  const [agentsDeploying, setAgentsDeploying] = useState(false)
  const [saving, setSaving] = useState(false)

  // Step 3 chat state
  const [, setAdvisorAgentId] = useState<string | null>(null)
  const [advisorReady, setAdvisorReady] = useState(false)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const audioEnabledRef = useRef(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)

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


  // Start word-level highlight timer from a given word index
  // `screens` parameter avoids stale closure over narrationScreens React state
  const startWordTimer = (fromWord: number, totalWords: number, durationMs: number, screens: string[][]) => {
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
          for (let s = 0; s < screens.length; s++) {
            count += screens[s].length
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
      audio.muted = !audioEnabledRef.current

      // Recalibrate word timing when actual audio duration is known
      audio.onloadedmetadata = () => {
        if (audio.duration && isFinite(audio.duration)) {
          const realDurationMs = audio.duration * 1000
          narrationDurationRef.current = realDurationMs
          startWordTimer(0, allWords.length, realDurationMs, screens)
        }
      }

      audio.onended = () => {
        setNarrationPlaying(false)
        setHighlightedWord(allWords.length - 1)
        setCurrentScreen(screens.length - 1)
        if (narrationTimerRef.current) { clearInterval(narrationTimerRef.current); narrationTimerRef.current = null }
      }

      // Only start captions once audio actually begins playing
      audio.play().then(() => {
        setNarrationPlaying(true)
        startWordTimer(0, allWords.length, audioDurationMs, screens)
      }).catch(() => {
        // Audio blocked — show all captions immediately (no animation)
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
  }, [])

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
      startWordTimer(fromWord, totalWords, narrationDurationRef.current, narrationScreens)
      setNarrationPaused(false)
    } else {
      audio.pause()
      if (narrationTimerRef.current) { clearInterval(narrationTimerRef.current); narrationTimerRef.current = null }
      setNarrationPaused(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrationPaused, narrationScreens])

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
        startWordTimer(wordIdx, totalWords, narrationDurationRef.current, narrationScreens)
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

  // Sync mute/unmute with current audio elements (narration + meeting)
  useEffect(() => {
    audioEnabledRef.current = audioEnabled
    if (narrationAudioRef.current) {
      narrationAudioRef.current.muted = !audioEnabled
    }
    if (audioRef.current) {
      audioRef.current.muted = !audioEnabled
    }
  }, [audioEnabled])


  const skipOnboarding = useCallback(async () => {
    if (!activeTeam) return
    try {
      await engine.updateTeamProfile(activeTeam.id, { onboardedAt: new Date().toISOString() } as Partial<engine.TeamProfile>)
    } catch { /* fail silently */ }
    navigate('/dashboard?welcome=1', { replace: true })
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
      let companyName: string | null = null
      let industry: string | null = null
      let businessSummary: string | null = null
      let targetMarket: string | null = null

      if (noWebsite) {
        // No-website path: use simplified fields
        companyName = noWebsiteName || null
        industry = noWebsiteCategory || null
        businessSummary = noWebsiteContext || null
      } else {
        // Website scan path: build combined summary from structured fields
        companyName = scanFields.companyName || null
        industry = scanFields.industry || null
        targetMarket = scanFields.targetMarket || null
        const summaryParts = SCAN_FIELD_ORDER
          .filter((k) => k !== 'companyName' && k !== 'industry' && scanFields[k])
          .map((k) => `${SCAN_FIELD_LABELS[k].label}: ${scanFields[k]}`)
        businessSummary = summaryParts.join('\n') || null
      }

      await engine.updateTeamProfile(activeTeam.id, {
        companyName,
        companyUrl: companyUrl || null,
        industry,
        businessSummary,
        targetMarket,
        primaryGoal: primaryGoal || null,
      } as Partial<engine.TeamProfile>)

      // Deploy AdvisorBot in background
      engine.setupAdvisor(activeTeam.id).then((result) => {
        setAdvisorAgentId(result.agentId)
        setAdvisorReady(true)
      }).catch(() => {
        setAdvisorReady(true)
      })

      // Auto-deploy 3 agents based on industry + goal (runs during tutorial)
      setAgentsDeploying(true)
      engine.autoDeployAgents(activeTeam.id, industry ?? undefined, primaryGoal || undefined).then((result) => {
        setAutoDeployedAgents(result.agents)
        setAgentsDeploying(false)
      }).catch(() => {
        setAgentsDeploying(false)
      })

      setStep(2)
    } catch {
      setStep(2)
    } finally {
      setSaving(false)
    }
  }

  // Step 3: ensure AdvisorBot is set up (background — needed for workspace, not onboarding chat)
  useEffect(() => {
    if (step === 3 && !advisorReady && activeTeam) {
      engine.setupAdvisor(activeTeam.id).then((r) => {
        setAdvisorAgentId(r.agentId)
        setAdvisorReady(true)
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
            {[1, 2, 3].map((s) => (
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
                Tell us a bit about yourself so your AI agents have the right context.
              </p>
            </div>

            <div className="space-y-6 rounded-2xl border border-border-subtle bg-white p-8 shadow-card">
              {/* Path selection — only show when neither path has been chosen */}
              {!scanned && !scanning && !noWebsite && !hasWebsite && (
                <div className="space-y-4">
                  <p className="text-base text-text-secondary text-center">How would you like to get started?</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Option 1: I have a website */}
                    <button
                      onClick={() => setHasWebsite(true)}
                      className="flex flex-col items-center gap-2 rounded-xl border-2 border-forest-green bg-forest-green/5 p-5 text-center transition-colors hover:bg-forest-green/10"
                    >
                      <span className="material-symbols-outlined text-[28px] text-forest-green">language</span>
                      <span className="text-base font-semibold text-text-main">I have a website</span>
                      <span className="text-sm text-text-muted">We'll scan it to auto-fill your profile</span>
                    </button>
                    {/* Option 2: No website */}
                    <button
                      onClick={() => setNoWebsite(true)}
                      className="flex flex-col items-center gap-2 rounded-xl border-2 border-border-subtle p-5 text-center transition-colors hover:border-forest-green hover:bg-forest-green/5"
                    >
                      <span className="material-symbols-outlined text-[28px] text-text-muted">edit_note</span>
                      <span className="text-base font-semibold text-text-main">No website yet</span>
                      <span className="text-sm text-text-muted">Describe what you're working on instead</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Website URL + Scan */}
              {hasWebsite && !noWebsite && !scanned && !scanning && (
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
                      <span className="material-symbols-outlined text-[16px]">search</span>
                      Scan
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-sm text-text-muted">
                      We'll scan your site to auto-fill your profile.
                    </p>
                    <button
                      onClick={() => { setHasWebsite(false); setNoWebsite(true) }}
                      className="text-sm text-text-muted hover:text-forest-green transition-colors"
                    >
                      No website?
                    </button>
                  </div>
                </div>
              )}
              {!noWebsite && scanning && (
                <div>
                  <label className="mb-2 block text-base font-medium text-text-main">Website URL</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={companyUrl}
                      disabled
                      className="flex-1 rounded-lg border border-border-subtle px-3 py-2.5 text-base text-text-main placeholder:text-text-muted focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green disabled:opacity-50"
                    />
                    <button disabled className="flex items-center gap-1.5 rounded-lg bg-forest-green px-5 py-2.5 text-base font-medium text-white disabled:opacity-50">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Scanning...
                    </button>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-border-subtle">
                      <div
                        className="h-full rounded-full bg-forest-green transition-all duration-300 ease-out"
                        style={{ width: `${scanProgress}%` }}
                      />
                    </div>
                    <p className="text-sm text-text-muted">{scanStatus}</p>
                  </div>
                </div>
              )}

              {/* Scanned / manual business fields (website path) */}
              {!noWebsite && scanned && (
                <div className="space-y-4">
                  {scanError ? (
                    <div className="flex items-center gap-2 pb-1">
                      <span className="material-symbols-outlined text-[18px] text-amber-500">warning</span>
                      <p className="text-base font-medium text-amber-600">{scanError}</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pb-1">
                      <span className="material-symbols-outlined text-[18px] text-forest-green">check_circle</span>
                      <p className="text-base font-medium text-forest-green">Profile generated — review and edit as needed</p>
                    </div>
                  )}

                  {SCAN_FIELD_ORDER.map((key) => {
                    const { label, icon } = SCAN_FIELD_LABELS[key]
                    const value = scanFields[key]
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

              {/* No-website path — simplified form */}
              {noWebsite && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-1">
                    <span className="material-symbols-outlined text-[18px] text-forest-green">edit_note</span>
                    <p className="text-base font-medium text-text-main">Tell us about yourself</p>
                    <button
                      onClick={() => { setNoWebsite(false); setHasWebsite(true) }}
                      className="ml-auto text-sm text-text-muted hover:text-forest-green transition-colors"
                    >
                      I have a website instead
                    </button>
                  </div>

                  {/* Name / Project */}
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined mt-2.5 text-[20px] text-text-muted shrink-0">badge</span>
                    <div className="flex-1">
                      <label className="mb-1 block text-sm font-medium text-text-muted uppercase tracking-wide">Your Name or Project Name</label>
                      <input
                        type="text"
                        value={noWebsiteName}
                        onChange={(e) => setNoWebsiteName(e.target.value)}
                        placeholder="e.g., John's Side Project, Acme Startup, My Portfolio..."
                        className="w-full rounded-lg border border-border-subtle px-3 py-2 text-base text-text-main placeholder:text-text-muted focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
                      />
                    </div>
                  </div>

                  {/* Category */}
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined mt-2.5 text-[20px] text-text-muted shrink-0">category</span>
                    <div className="flex-1">
                      <label className="mb-1 block text-sm font-medium text-text-muted uppercase tracking-wide">Category</label>
                      <select
                        value={noWebsiteCategory}
                        onChange={(e) => setNoWebsiteCategory(e.target.value)}
                        className="w-full rounded-lg border border-border-subtle px-3 py-2 text-base text-text-main focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
                      >
                        <option value="">What best describes you?</option>
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Free-form context */}
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined mt-2.5 text-[20px] text-text-muted shrink-0">description</span>
                    <div className="flex-1">
                      <label className="mb-1 block text-sm font-medium text-text-muted uppercase tracking-wide">What are you working on?</label>
                      <textarea
                        value={noWebsiteContext}
                        onChange={(e) => setNoWebsiteContext(e.target.value)}
                        placeholder="Describe what you do, what you're building, or what you need help with. The more context you give, the better your agents will understand you."
                        rows={4}
                        className="w-full resize-none rounded-lg border border-border-subtle px-3 py-2 text-base text-text-main placeholder:text-text-muted focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Goal — shown for both paths */}
              {(scanned || noWebsite) && (
                <>
                  {/* Primary Goal */}
                  <div>
                    <label className="mb-2 block text-base font-medium text-text-main">
                      <span className="material-symbols-outlined text-[20px] align-middle mr-1">flag</span>
                      What's your #1 goal?
                    </label>
                    <input
                      type="text"
                      value={primaryGoal}
                      onChange={(e) => setPrimaryGoal(e.target.value)}
                      placeholder="e.g., Generate more leads, Create content, Build an app..."
                      className="w-full rounded-lg border border-border-subtle px-3 py-2.5 text-base text-text-main placeholder:text-text-muted focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
                    />
                  </div>

                  <button
                    onClick={handleProfileSubmit}
                    disabled={saving}
                    className="w-full rounded-lg bg-forest-green px-4 py-3 text-base font-medium text-white shadow-sm hover:bg-forest-green-hover transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Continue'}
                  </button>

                  <p className="text-center text-sm text-text-muted">
                    Your answers here become the foundation of context for your AI agents.
                    You can always update this later in Settings.
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
                  {slideIndex < TUTORIAL_SLIDES.length - 1 ? 'Next' : 'See My Team'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Your Team is Ready (final step) */}
        {step === 3 && (
          <div className="w-full max-w-lg self-center text-center">
            <div className="mb-6 flex justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-forest-green/10 text-forest-green">
                <span className="material-symbols-outlined text-[40px]">rocket_launch</span>
              </div>
            </div>

            <h2 className="font-display text-3xl font-bold text-text-main">Your team is ready!</h2>
            <p className="mt-2 text-lg text-text-secondary">
              {agentsDeploying
                ? "Setting up your AI agents..."
                : `We deployed ${autoDeployedAgents.length} agents tailored to your goals. They're online and ready to work.`
              }
            </p>

            {/* Deploying spinner */}
            {agentsDeploying && (
              <div className="mt-6 flex justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-3 border-forest-green/20 border-t-forest-green" />
              </div>
            )}

            {/* Deployed agents list */}
            {!agentsDeploying && autoDeployedAgents.length > 0 && (
              <div className="mt-6 space-y-2">
                {autoDeployedAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-3 rounded-xl border border-border-subtle bg-white px-4 py-3.5 text-left shadow-sm"
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${agent.iconColor}20`, color: agent.iconColor }}
                    >
                      <span className="material-symbols-outlined text-[22px]">{agent.icon}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-medium text-text-main truncate">{agent.name}</p>
                      <p className="text-sm text-text-muted">{agent.department}</p>
                    </div>
                    <span className="text-sm text-accent-green font-medium">Online</span>
                  </div>
                ))}
              </div>
            )}

            {/* CTA */}
            {!agentsDeploying && (
              <div className="mt-8 flex flex-col gap-3">
                <button
                  onClick={async () => {
                    if (activeTeam) {
                      await engine.updateTeamProfile(activeTeam.id, { onboardedAt: new Date().toISOString() } as Partial<engine.TeamProfile>).catch(() => {})
                    }
                    navigate('/dashboard?welcome=1', { replace: true })
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-forest-green px-4 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-forest-green-hover transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                  Go to My Workspace
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
