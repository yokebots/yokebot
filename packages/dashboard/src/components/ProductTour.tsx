import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router'

const TOUR_STORAGE_KEY = 'yokebot:tourComplete'

interface TourStep {
  title: string
  description: string
  /** CSS selector for the element to highlight */
  target: string
  /** Position of the tooltip relative to the target */
  position: 'top' | 'bottom' | 'left' | 'right'
  /** If set, navigate to this path before showing the step */
  navigateTo?: string
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to YokeBot',
    description: 'This is your Dashboard. It gives you a quick overview of your agents, tasks, and recent activity.',
    target: '[data-tour="dashboard"]',
    position: 'bottom',
    navigateTo: '/dashboard',
  },
  {
    title: 'Team Chat',
    description: 'This is your team chat. @mention an agent to assign work or ask questions. Type "/" for quick commands like /status, /assign, or /workflow.',
    target: '[data-tour="chat-panel"]',
    position: 'left',
    navigateTo: '/workspace',
  },
  {
    title: 'Files & Documents',
    description: 'Your workspace files live here. Agents can create and update files as they work. Upload documents to the knowledge base for agents to reference.',
    target: '[data-tour="files-panel"]',
    position: 'right',
    navigateTo: '/workspace',
  },
  {
    title: 'Tasks & Workflows',
    description: 'Track tasks and run workflows from this panel. When Plan Mode is on, agents request your approval before acting. Switch to the Workflows tab to run multi-step automations.',
    target: '[data-tour="tasks-panel"]',
    position: 'left',
    navigateTo: '/workspace',
  },
  {
    title: 'Manage Your Agents',
    description: 'Configure each agent here: choose a model, set the heartbeat frequency, install skills, and customize system instructions. Use the top bar toggle to start or stop all agents at once.',
    target: 'a[href="/agents"]',
    position: 'right',
  },
  {
    title: 'Universal Search',
    description: 'Press Cmd+K anytime to search across agents, tasks, files, and more. It works from any page. You\'re all set!',
    target: '[data-tour="search"]',
    position: 'bottom',
  },
]

interface ProductTourProps {
  /** If true, force-start the tour (e.g. from Help menu "Restart Tutorial") */
  forceStart?: boolean
  onComplete?: () => void
}

export function ProductTour({ forceStart, onComplete }: ProductTourProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [visible, setVisible] = useState(false)
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 })
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (forceStart) {
      setVisible(true)
      setCurrentStep(0)
      return
    }
    // Auto-show for first-time users
    const completed = localStorage.getItem(TOUR_STORAGE_KEY)
    if (!completed) {
      const timer = setTimeout(() => setVisible(true), 1000)
      return () => clearTimeout(timer)
    }
  }, [forceStart])

  // Navigate to the correct page when step changes
  useEffect(() => {
    if (!visible) return
    const step = TOUR_STEPS[currentStep]
    if (step?.navigateTo && location.pathname !== step.navigateTo) {
      navigate(step.navigateTo)
    }
  }, [visible, currentStep, navigate, location.pathname])

  const positionTooltip = useCallback(() => {
    const step = TOUR_STEPS[currentStep]
    if (!step) return

    const el = document.querySelector(step.target)
    if (!el) {
      // Target not rendered yet (page still loading) — retry shortly
      setHighlightRect(null)
      setTooltipPos({
        top: window.innerHeight / 2 - 100,
        left: window.innerWidth / 2 - 160,
      })
      return
    }

    const rect = el.getBoundingClientRect()
    setHighlightRect(rect)

    const tooltipW = 320
    const tooltipH = 180
    const gap = 12

    let top = 0
    let left = 0

    switch (step.position) {
      case 'bottom':
        top = rect.bottom + gap
        left = rect.left + rect.width / 2 - tooltipW / 2
        break
      case 'top':
        top = rect.top - tooltipH - gap
        left = rect.left + rect.width / 2 - tooltipW / 2
        break
      case 'right':
        top = rect.top + rect.height / 2 - tooltipH / 2
        left = rect.right + gap
        break
      case 'left':
        top = rect.top + rect.height / 2 - tooltipH / 2
        left = rect.left - tooltipW - gap
        break
    }

    // Clamp to viewport
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipW - 16))
    top = Math.max(16, Math.min(top, window.innerHeight - tooltipH - 16))

    setTooltipPos({ top, left })
  }, [currentStep])

  // Reposition when visible, step changes, or page navigates
  // Use a short interval to catch elements that render after navigation
  useEffect(() => {
    if (!visible) return
    positionTooltip()
    // Retry positioning a few times after navigation to catch late-rendering elements
    const retries = [100, 300, 600]
    const timers = retries.map(ms => setTimeout(positionTooltip, ms))
    window.addEventListener('resize', positionTooltip)
    return () => {
      timers.forEach(clearTimeout)
      window.removeEventListener('resize', positionTooltip)
    }
  }, [visible, currentStep, positionTooltip, location.pathname])

  const completeTour = useCallback(() => {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true')
    setVisible(false)
    onComplete?.()
  }, [onComplete])

  const next = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      completeTour()
    }
  }

  const prev = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1)
  }

  const skip = () => {
    completeTour()
  }

  if (!visible) return null

  const step = TOUR_STEPS[currentStep]
  const isLast = currentStep === TOUR_STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Overlay with cutout */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {highlightRect && (
              <rect
                x={highlightRect.left - 4}
                y={highlightRect.top - 4}
                width={highlightRect.width + 8}
                height={highlightRect.height + 8}
                rx="8"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%"
          fill="rgba(0,0,0,0.5)"
          mask="url(#tour-mask)"
          style={{ pointerEvents: 'all' }}
        />
      </svg>

      {/* Highlight ring + click target — clicking the highlighted element navigates and advances */}
      {highlightRect && (
        <div
          className="absolute rounded-lg ring-2 ring-forest-green ring-offset-2 cursor-pointer"
          style={{
            top: highlightRect.top - 4,
            left: highlightRect.left - 4,
            width: highlightRect.width + 8,
            height: highlightRect.height + 8,
            zIndex: 10000,
          }}
          onClick={() => {
            // Click the actual element underneath so navigation/actions happen
            const el = document.querySelector(step.target) as HTMLElement | null
            el?.click()
            // Small delay to let navigation render before repositioning tooltip
            setTimeout(next, 300)
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="absolute w-80 rounded-xl bg-white border border-border-subtle shadow-xl p-4 z-[10000]"
        style={{ top: tooltipPos.top, left: tooltipPos.left }}
      >
        {/* Step indicator */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">
            Step {currentStep + 1} of {TOUR_STEPS.length}
          </span>
          <button
            onClick={skip}
            className="text-[11px] text-text-muted hover:text-text-main transition-colors"
          >
            Skip tour
          </button>
        </div>

        {/* Content */}
        <h3 className="text-sm font-bold text-text-main mb-1">{step.title}</h3>
        <p className="text-xs text-text-secondary leading-relaxed mb-4">{step.description}</p>

        {/* Progress dots + nav buttons */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === currentStep ? 'bg-forest-green' : i < currentStep ? 'bg-forest-green/40' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <button
                onClick={prev}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-light-surface-alt transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              className="rounded-lg bg-forest-green px-4 py-1.5 text-xs font-medium text-white hover:bg-forest-green/90 transition-colors"
            >
              {isLast ? 'Get Started' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Helper to reset the tour (for "Restart Tutorial" in Help menu) */
export function resetProductTour() {
  localStorage.removeItem(TOUR_STORAGE_KEY)
}

/** Check if the tour has been completed */
export function isTourComplete(): boolean {
  return localStorage.getItem(TOUR_STORAGE_KEY) === 'true'
}
