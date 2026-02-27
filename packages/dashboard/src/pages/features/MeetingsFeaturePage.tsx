import { useNavigate } from 'react-router'
import { MarketingLayout, FeatureHero, FeatureCta } from '@/layouts/MarketingLayout'

export function MeetingsFeaturePage() {
  const navigate = useNavigate()
  const goToLogin = () => navigate('/login')

  return (
    <MarketingLayout>
      <FeatureHero
        badge="Real-Time Collaboration"
        title="Talk to Your Agents."
        titleAccent="They Talk Back."
        description="Experience live voice meetings where your AI team joins the conversation. Push-to-talk, raise your hand, and hear your agents think out loud — all in real time."
        primaryCta={{ label: 'Start a Meeting', onClick: goToLogin }}
        secondaryCta={{ label: 'See How It Works', onClick: () => {} }}
      >
        {/* Hero right — meeting visual */}
        <div className="rounded-2xl border border-gray-700 bg-gray-800/60 backdrop-blur-sm p-4 space-y-3">
          {[
            { name: 'SalesBot', icon: 'smart_toy', msg: "I've identified 12 high-value leads from yesterday's campaign.", isAgent: true },
            { name: 'You', icon: 'mic', msg: 'Which ones should we prioritize for outreach today?', isAgent: false },
            { name: 'ResearchBot', icon: 'smart_toy', msg: "Based on intent signals, I'd recommend these top 4...", isAgent: true },
          ].map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.isAgent ? '' : 'justify-end'}`}>
              {m.isAgent && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500/20">
                  <span className="material-symbols-outlined text-[16px] text-green-400">{m.icon}</span>
                </div>
              )}
              <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${m.isAgent ? 'bg-gray-700 text-gray-200' : 'bg-green-600 text-white'}`}>
                {m.msg}
              </div>
              {!m.isAgent && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600">
                  <span className="material-symbols-outlined text-[16px] text-white">{m.icon}</span>
                </div>
              )}
            </div>
          ))}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-700">
            <div className="flex -space-x-2">
              {['smart_toy', 'smart_toy', 'person'].map((icon, i) => (
                <div key={i} className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-gray-800 ${i < 2 ? 'bg-forest-green/20' : 'bg-purple-500/20'}`}>
                  <span className={`material-symbols-outlined text-[12px] ${i < 2 ? 'text-green-400' : 'text-purple-400'}`}>{icon}</span>
                </div>
              ))}
            </div>
            <span className="text-xs text-gray-400">3 participants in meeting</span>
          </div>
        </div>
      </FeatureHero>

      {/* Meet Your Team Face-to-Face */}
      <section className="px-6 py-24 xl:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <span className="text-xs font-bold uppercase tracking-wider text-forest-green">Voice-First</span>
            <h2 className="mt-3 font-display text-3xl font-bold text-text-main md:text-4xl">Meet Your Team Face-to-Face</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-text-secondary">
              Your AI agents have voices. During onboarding, each agent introduces themselves, explains their role, and asks how they can help. It's like a real team standup.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { icon: 'record_voice_over', title: 'Unique Agent Voices', desc: 'Each agent has a distinct voice. Hear them think and respond naturally.' },
              { icon: 'mic', title: 'Push-to-Talk', desc: 'Hold the mic button to speak. Your voice is transcribed instantly and injected into the meeting.' },
              { icon: 'front_hand', title: 'Raise Your Hand', desc: 'Interrupt the speaking queue anytime. Agents pause and yield the floor to you immediately.' },
            ].map((card) => (
              <div key={card.title} className="rounded-2xl border border-border-subtle bg-white p-8 shadow-sm text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-forest-green/10 text-forest-green">
                  <span className="material-symbols-outlined text-[28px]">{card.icon}</span>
                </div>
                <h3 className="text-lg font-bold text-text-main">{card.title}</h3>
                <p className="mt-2 text-sm text-text-muted">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How a Meeting Works */}
      <section className="px-6 py-24 xl:px-12 bg-gray-50">
        <div className="mx-auto max-w-6xl grid gap-16 lg:grid-cols-2 items-center">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-forest-green">The Flow</span>
            <h2 className="mt-3 font-display text-3xl font-bold text-text-main md:text-4xl">How a Meeting Works</h2>
            <p className="mt-4 text-lg text-text-secondary">
              Meetings follow a natural three-phase structure — just like a real team huddle. Your agents introduce themselves, collaborate on your goals, then summarize action items.
            </p>
            <div className="mt-8 space-y-6">
              {[
                { step: '1', icon: 'waving_hand', title: 'Introductions', desc: 'Each agent introduces themselves, their role, and what they can do for your business.' },
                { step: '2', icon: 'psychology', title: 'Collaboration', desc: 'Agents discuss strategy, share insights, and respond to your questions in real time.' },
                { step: '3', icon: 'summarize', title: 'Wrap-Up', desc: 'Action items are assigned, next steps are confirmed, and agents get to work.' },
              ].map((item) => (
                <div key={item.step} className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest-green text-white font-bold text-sm">
                    {item.step}
                  </div>
                  <div>
                    <h3 className="font-bold text-text-main">{item.title}</h3>
                    <p className="mt-1 text-sm text-text-muted">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Meeting phases visual */}
          <div className="space-y-4">
            {[
              { phase: 'Introductions', status: 'Complete', color: 'green', agents: ['LeadGen Pro', 'Support Ox', 'Content Writer'], icon: 'check_circle' },
              { phase: 'Collaboration', status: 'In Progress', color: 'blue', agents: ['Discussing Q3 strategy...'], icon: 'sync' },
              { phase: 'Wrap-Up', status: 'Upcoming', color: 'gray', agents: ['Waiting...'], icon: 'schedule' },
            ].map((p) => (
              <div key={p.phase} className={`rounded-xl border ${p.color === 'blue' ? 'border-blue-200 bg-blue-50' : 'border-border-subtle bg-white'} p-5 shadow-sm`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-text-main">{p.phase}</h4>
                  <span className={`flex items-center gap-1 text-xs font-bold text-${p.color}-600`}>
                    <span className="material-symbols-outlined text-[14px]">{p.icon}</span>
                    {p.status}
                  </span>
                </div>
                <div className="space-y-1">
                  {p.agents.map((a) => (
                    <p key={a} className="text-sm text-text-muted">{a}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live Controls */}
      <section className="px-6 py-24 xl:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl font-bold text-text-main md:text-4xl">You're Always in Control</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-text-secondary">
              Mute agent audio, raise your hand to interject, or type a message instead. The meeting adapts to your style.
            </p>
          </div>
          <div className="mx-auto max-w-2xl rounded-2xl border border-border-subtle bg-white p-8 shadow-lg">
            <div className="flex items-center justify-center gap-6">
              {[
                { icon: 'mic', label: 'Push to Talk', desc: 'Hold to speak', color: 'forest-green' },
                { icon: 'front_hand', label: 'Raise Hand', desc: 'Interrupt queue', color: 'amber-500' },
                { icon: 'volume_up', label: 'Audio Toggle', desc: 'Mute/unmute agents', color: 'blue-500' },
                { icon: 'keyboard', label: 'Type Instead', desc: 'Text fallback', color: 'gray-500' },
              ].map((ctrl) => (
                <div key={ctrl.label} className="text-center">
                  <div className={`mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-${ctrl.color}/10`}>
                    <span className={`material-symbols-outlined text-[24px] text-${ctrl.color}`}>{ctrl.icon}</span>
                  </div>
                  <p className="text-sm font-bold text-text-main">{ctrl.label}</p>
                  <p className="text-xs text-text-muted">{ctrl.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Powered by Real-Time AI */}
      <section className="px-6 py-24 xl:px-12 bg-gray-950">
        <div className="mx-auto max-w-6xl grid gap-12 md:grid-cols-2">
          <div className="rounded-2xl border border-gray-700 bg-gray-800/60 p-8">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/20">
              <span className="material-symbols-outlined text-[24px] text-green-400">graphic_eq</span>
            </div>
            <h3 className="text-xl font-bold text-white">Voice-to-Text (STT)</h3>
            <p className="mt-3 text-sm leading-relaxed text-gray-400">
              Your speech is transcribed in real time using state-of-the-art speech recognition. Just hold the mic button, speak naturally, and your words appear as a message in the meeting.
            </p>
          </div>
          <div className="rounded-2xl border border-gray-700 bg-gray-800/60 p-8">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/20">
              <span className="material-symbols-outlined text-[24px] text-blue-400">spatial_audio_off</span>
            </div>
            <h3 className="text-xl font-bold text-white">Text-to-Speech (TTS)</h3>
            <p className="mt-3 text-sm leading-relaxed text-gray-400">
              Each agent has a unique, natural-sounding voice. Responses are synthesized instantly and played back so you can listen hands-free while your team talks through the plan.
            </p>
          </div>
        </div>
      </section>

      <FeatureCta
        title="Hear Your Agents Think Out Loud"
        description="Start a live meeting with your AI agents and experience the future of team collaboration."
      />
    </MarketingLayout>
  )
}
