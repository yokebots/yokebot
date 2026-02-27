export type AgentStatus = 'active' | 'paused' | 'error' | 'offline'

export type ChannelType = 'mail' | 'chat' | 'work' | 'event' | 'language' | 'table_view'

export interface Agent {
  id: string
  name: string
  department: string
  status: AgentStatus
  model: string
  icon: {
    symbol: string
    bgColor: string
    textColor: string
    borderColor: string
  }
  channels: { icon: string; title: string }[]
  lastActive: string
  metricLabel: string
  metricValue: string
  metricColor?: string
  progressPercent: number
  progressColor: string
}
