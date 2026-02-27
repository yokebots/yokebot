/**
 * OnboardingPage.tsx — 4-step guided onboarding for new hosted users
 *
 * Steps:
 *   1. Welcome & business context form
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

const COMPANY_SIZES = ['Solo', '2-10', '11-50', '51-200', '200+']

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

export function OnboardingPage() {
  const { user } = useAuth()
  const { activeTeam } = useTeam()
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [slideIndex, setSlideIndex] = useState(0)

  // Step 1 form state
  const [companyName, setCompanyName] = useState('')
  const [industry, setIndustry] = useState('')
  const [companySize, setCompanySize] = useState('')
  const [primaryGoal, setPrimaryGoal] = useState('')
  const [saving, setSaving] = useState(false)

  // Step 3 chat state
  const [advisorAgentId, setAdvisorAgentId] = useState<string | null>(null)
  const [advisorReady, setAdvisorReady] = useState(false)
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'agent'; content: string }>>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Step 4 state
  const [deployedAgents, setDeployedAgents] = useState<engine.EngineAgent[]>([])

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] ?? 'there'

  // Pre-fill company name from team name
  useEffect(() => {
    if (activeTeam?.name && !companyName) {
      setCompanyName(activeTeam.name === 'My Team' ? '' : activeTeam.name)
    }
  }, [activeTeam])

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const skipOnboarding = useCallback(async () => {
    if (!activeTeam) return
    try {
      await engine.updateTeamProfile(activeTeam.id, { onboardedAt: new Date().toISOString() } as Partial<engine.TeamProfile>)
    } catch { /* fail silently */ }
    navigate('/dashboard', { replace: true })
  }, [activeTeam, navigate])

  // Step 1: Save profile + start deploying advisor
  const handleProfileSubmit = async () => {
    if (!activeTeam) return
    setSaving(true)
    try {
      await engine.updateTeamProfile(activeTeam.id, {
        companyName: companyName || null,
        industry: industry || null,
        companySize: companySize || null,
        primaryGoal: primaryGoal || null,
      } as Partial<engine.TeamProfile>)

      // Deploy AdvisorBot in background
      engine.setupAdvisor(activeTeam.id).then((result) => {
        setAdvisorAgentId(result.agentId)
        setAdvisorReady(true)
      }).catch(() => {
        // AdvisorBot may already be deployed
        setAdvisorReady(true)
      })

      setStep(2)
    } catch {
      // Continue anyway
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
      const context = [
        `New user just joined! Here's their context:`,
        companyName ? `Company: ${companyName}` : '',
        industry ? `Industry: ${industry}` : '',
        companySize ? `Company size: ${companySize}` : '',
        primaryGoal ? `Primary goal: ${primaryGoal}` : '',
        ``,
        `Please introduce yourself briefly, then recommend 2-3 agents that would help them most based on their goal. Use the recommend_agents tool.`,
      ].filter(Boolean).join('\n')

      sendAdvisorMessage(context)
    }
  }, [step, advisorReady, advisorAgentId])

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
      // Try to find existing advisor
      engine.listAgents().then((agents) => {
        const advisor = agents.find((a) => a.templateId === 'advisor-bot')
        if (advisor) {
          setAdvisorAgentId(advisor.id)
          setAdvisorReady(true)
        } else {
          // Try deploying
          engine.setupAdvisor(activeTeam.id).then((r) => {
            setAdvisorAgentId(r.agentId)
            setAdvisorReady(true)
          }).catch(() => setAdvisorReady(true))
        }
      }).catch(() => setAdvisorReady(true))
    }
  }, [step, advisorReady, activeTeam])

  return (
    <div className="flex min-h-screen flex-col bg-light-bg">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border-subtle bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-forest-green text-white shadow-md">
            <span className="text-xl">🐂</span>
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-text-main">YokeBot</span>
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
      <main className="flex flex-1 items-center justify-center p-6">
        {/* Step 1: Welcome & Context */}
        {step === 1 && (
          <div className="w-full max-w-lg">
            <div className="mb-8 text-center">
              <h1 className="font-display text-3xl font-bold text-text-main">
                Welcome, {firstName}!
              </h1>
              <p className="mt-2 text-text-secondary">
                Tell us a bit about your business so we can set up the right AI workforce for you.
              </p>
            </div>

            <div className="space-y-5 rounded-2xl border border-border-subtle bg-white p-6 shadow-card">
              {/* Company Name */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-main">Company Name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
                />
              </div>

              {/* Industry */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-main">Industry</label>
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm text-text-main focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
                >
                  <option value="">Select an industry</option>
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </div>

              {/* Company Size */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-main">Company Size</label>
                <div className="flex flex-wrap gap-2">
                  {COMPANY_SIZES.map((size) => (
                    <button
                      key={size}
                      onClick={() => setCompanySize(size)}
                      className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
                        companySize === size
                          ? 'border-forest-green bg-forest-green/10 text-forest-green font-medium'
                          : 'border-border-subtle text-text-secondary hover:border-forest-green/30'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Primary Goal */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-main">
                  What would you like your AI workforce to help with?
                </label>
                <textarea
                  value={primaryGoal}
                  onChange={(e) => setPrimaryGoal(e.target.value)}
                  placeholder="e.g., Generate more B2B leads, automate customer support, scale content marketing..."
                  rows={3}
                  className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green resize-none"
                />
              </div>

              <button
                onClick={handleProfileSubmit}
                disabled={saving}
                className="w-full rounded-lg bg-forest-green px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-forest-green-hover transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Tutorial Walkthrough */}
        {step === 2 && (
          <div className="w-full max-w-lg">
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
                  <li key={i} className="flex items-start gap-3 text-sm text-text-secondary">
                    <span className="material-symbols-outlined mt-0.5 text-[16px] text-forest-green">check_circle</span>
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
                    className="flex-1 rounded-lg border border-border-subtle px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-light-surface-alt transition-colors"
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
                  className="flex-1 rounded-lg bg-forest-green px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-forest-green-hover transition-colors"
                >
                  {slideIndex < TUTORIAL_SLIDES.length - 1 ? 'Next' : 'Meet Your Advisor'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: AdvisorBot Chat */}
        {step === 3 && (
          <div className="flex w-full max-w-2xl flex-col" style={{ height: 'calc(100vh - 140px)' }}>
            <div className="mb-4 text-center">
              <h2 className="font-display text-2xl font-bold text-text-main">Chat with AdvisorBot</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Tell AdvisorBot what you need — it'll recommend and set up agents for you.
              </p>
            </div>

            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto rounded-2xl border border-border-subtle bg-white p-4 shadow-card">
              {!advisorReady ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <div className="mb-3 flex justify-center">
                      <div className="h-10 w-10 animate-spin rounded-full border-2 border-border-subtle border-t-forest-green" />
                    </div>
                    <p className="text-sm text-text-muted">Setting up AdvisorBot...</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                      {msg.role === 'agent' && (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-green/10 text-forest-green">
                          <span className="material-symbols-outlined text-[16px]">smart_toy</span>
                        </div>
                      )}
                      <div className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-forest-green/10 text-text-main'
                          : 'border border-border-subtle bg-white text-text-main'
                      }`}>
                        {msg.role === 'agent' && (
                          <p className="mb-1 text-[11px] font-bold text-forest-green">AdvisorBot</p>
                        )}
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-green/10 text-forest-green">
                        <span className="material-symbols-outlined text-[16px]">smart_toy</span>
                      </div>
                      <div className="rounded-xl border border-border-subtle bg-white px-4 py-2.5 text-sm text-text-muted">
                        <span className="inline-flex gap-1">
                          <span className="animate-bounce">.</span>
                          <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>.</span>
                          <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>.</span>
                        </span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>

            {/* Chat input */}
            <div className="mt-3 flex gap-2">
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
                className="flex-1 rounded-lg border border-border-subtle px-4 py-2.5 text-sm text-text-main placeholder:text-text-muted focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green disabled:opacity-50"
              />
              <button
                onClick={() => chatInput.trim() && sendAdvisorMessage(chatInput.trim())}
                disabled={!advisorReady || chatLoading || !chatInput.trim()}
                className="rounded-lg bg-forest-green px-4 py-2.5 text-white hover:bg-forest-green-hover transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
              </button>
            </div>

            {/* Finish button */}
            <button
              onClick={() => setStep(4)}
              className="mt-3 w-full rounded-lg border border-border-subtle px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-light-surface-alt transition-colors"
            >
              Finish Setup
            </button>
          </div>
        )}

        {/* Step 4: Completion */}
        {step === 4 && (
          <div className="w-full max-w-lg text-center">
            <div className="mb-6 flex justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-forest-green/10 text-forest-green">
                <span className="material-symbols-outlined text-[40px]">celebration</span>
              </div>
            </div>

            <h2 className="font-display text-3xl font-bold text-text-main">You're all set!</h2>
            <p className="mt-2 text-text-secondary">
              Your AI workforce is ready to go. Here's what we set up for you:
            </p>

            {/* Deployed agents list */}
            {deployedAgents.length > 0 && (
              <div className="mt-6 space-y-2">
                {deployedAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-3 rounded-xl border border-border-subtle bg-white px-4 py-3 text-left shadow-sm"
                  >
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${agent.iconColor}20`, color: agent.iconColor ?? '#0F4D26' }}
                    >
                      <span className="material-symbols-outlined text-[20px]">{agent.iconName ?? 'smart_toy'}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-main truncate">{agent.name}</p>
                      <p className="text-xs text-text-muted">{agent.department ?? 'General'}</p>
                    </div>
                    <span className="text-xs text-accent-green font-medium">Ready</span>
                  </div>
                ))}
              </div>
            )}

            {/* Quick links */}
            <div className="mt-8 flex flex-col gap-3">
              <button
                onClick={() => navigate('/dashboard', { replace: true })}
                className="w-full rounded-lg bg-forest-green px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-forest-green-hover transition-colors"
              >
                Go to Dashboard
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/chat', { replace: true })}
                  className="flex-1 rounded-lg border border-border-subtle px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-light-surface-alt transition-colors"
                >
                  Chat with Agents
                </button>
                <button
                  onClick={() => navigate('/templates', { replace: true })}
                  className="flex-1 rounded-lg border border-border-subtle px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-light-surface-alt transition-colors"
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
