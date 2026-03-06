export const PLANS = [
  {
    tier: 'team', name: 'Starter Crew', price: '$29', period: '/mo',
    subtitle: 'Hire your first three AI agents!',
    features: [
      '3 Agent Team Members',
      '30-Min Heartbeat Interval',
      '24/7 Always Available',
      '50,000 Universal Credits/Mo',
    ],
    workHours: 'Avg 144 work hrs/week',
    workHoursTooltip: 'Based on 3 agents working 24/7 at 30-min heartbeats',
    envKey: 'VITE_STRIPE_PRICE_TEAM',
  },
  {
    tier: 'business', name: 'Growth Crew', price: '$59', period: '/mo', popular: true,
    subtitle: 'A full-time team that never calls in sick',
    features: [
      '9 Agent Team Members',
      '15-Min Heartbeat Interval',
      '24/7 Always Available',
      '150,000 Universal Credits/Mo',
    ],
    workHours: 'Avg 840 work hrs/week',
    workHoursTooltip: 'Based on 9 agents working 24/7 at 15-min heartbeats',
    envKey: 'VITE_STRIPE_PRICE_BUSINESS',
  },
  {
    tier: 'enterprise', name: 'Power Crew', price: '$149', period: '/mo',
    subtitle: 'An always-on workforce that never sleeps',
    features: [
      '30 Agent Team Members',
      '5-Min Heartbeat Interval',
      '24/7 Always Available',
      '500,000 Universal Credits/Mo',
    ],
    workHours: 'Avg 2,520 work hrs/week',
    workHoursTooltip: 'Based on 15 agents working 24/7 at 5-min heartbeats',
    envKey: 'VITE_STRIPE_PRICE_ENTERPRISE',
  },
]

export const CREDIT_PACKS = [
  { amount: 20000, price: '$10', perCredit: '$0.0005', envKey: 'VITE_STRIPE_PRICE_CREDITS_20K' },
  { amount: 55000, price: '$25', perCredit: '$0.00045', envKey: 'VITE_STRIPE_PRICE_CREDITS_55K' },
  { amount: 120000, price: '$50', perCredit: '$0.00042', envKey: 'VITE_STRIPE_PRICE_CREDITS_120K' },
  { amount: 260000, price: '$100', perCredit: '$0.00038', envKey: 'VITE_STRIPE_PRICE_CREDITS_260K' },
]
