/**
 * services.ts — Static registry of external services that skills can connect to
 *
 * Each service defines what credential type it needs and how to set it up.
 * The dashboard Integrations page uses this to show available connectors.
 */

export interface ServiceDefinition {
  id: string
  name: string
  description: string
  category: 'search' | 'communication' | 'crm' | 'productivity' | 'development' | 'analytics' | 'finance' | 'media' | 'ai'
  credentialType: 'api_key' | 'oauth_token' | 'webhook_url'
  setupUrl: string
  setupInstructions: string
  icon: string
}

const SERVICES: ServiceDefinition[] = [
  // Search & Research
  {
    id: 'brave',
    name: 'Brave Search',
    description: 'Web search for agents via Brave Search API',
    category: 'search',
    credentialType: 'api_key',
    setupUrl: 'https://brave.com/search/api/',
    setupInstructions: 'Create a Brave Search API account and copy your API key from the dashboard.',
    icon: 'search',
  },
  {
    id: 'tavily',
    name: 'Tavily',
    description: 'Web scraping and content extraction (default provider)',
    category: 'search',
    credentialType: 'api_key',
    setupUrl: 'https://tavily.com',
    setupInstructions: 'Sign up at Tavily and copy your API key from the dashboard. Tavily is the default scraping provider — bring your own key to avoid credit charges.',
    icon: 'web',
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    description: 'Web scraping and content extraction (alternative provider)',
    category: 'search',
    credentialType: 'api_key',
    setupUrl: 'https://firecrawl.dev',
    setupInstructions: 'Sign up at Firecrawl and copy your API key from the dashboard.',
    icon: 'web',
  },
  {
    id: 'newsapi',
    name: 'NewsAPI',
    description: 'News monitoring and industry trend tracking',
    category: 'search',
    credentialType: 'api_key',
    setupUrl: 'https://newsapi.org',
    setupInstructions: 'Register at NewsAPI.org and copy your API key.',
    icon: 'newspaper',
  },
  // Communication
  {
    id: 'slack',
    name: 'Slack',
    description: 'Send messages to Slack channels and users',
    category: 'communication',
    credentialType: 'api_key',
    setupUrl: 'https://api.slack.com/apps',
    setupInstructions: 'Create a Slack App, add Bot Token Scopes (chat:write), install to workspace, and copy the Bot User OAuth Token.',
    icon: 'chat',
  },
  {
    id: 'resend',
    name: 'Resend',
    description: 'Send transactional and marketing emails via Resend',
    category: 'communication',
    credentialType: 'api_key',
    setupUrl: 'https://resend.com/api-keys',
    setupInstructions: 'Create an API key at resend.com/api-keys. Verify your sending domain for best deliverability.',
    icon: 'mail',
  },
  {
    id: 'sendgrid',
    name: 'SendGrid',
    description: 'Send transactional and marketing emails (legacy)',
    category: 'communication',
    credentialType: 'api_key',
    setupUrl: 'https://app.sendgrid.com/settings/api_keys',
    setupInstructions: 'Create an API key in SendGrid Settings → API Keys with Mail Send permissions.',
    icon: 'mail',
  },
  {
    id: 'twilio',
    name: 'Twilio',
    description: 'Send SMS and MMS messages',
    category: 'communication',
    credentialType: 'api_key',
    setupUrl: 'https://console.twilio.com',
    setupInstructions: 'Copy your Account SID and Auth Token from the Twilio Console. Format: SID:TOKEN',
    icon: 'sms',
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Post messages and manage Discord servers',
    category: 'communication',
    credentialType: 'api_key',
    setupUrl: 'https://discord.com/developers/applications',
    setupInstructions: 'Create a Bot in Discord Developer Portal, copy the Bot Token. For webhooks, use the webhook URL.',
    icon: 'forum',
  },
  // CRM & Sales
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'CRM contacts, deals, and email tracking',
    category: 'crm',
    credentialType: 'api_key',
    setupUrl: 'https://app.hubspot.com/private-apps/',
    setupInstructions: 'Create a Private App in HubSpot Settings → Integrations → Private Apps. Grant CRM scopes and copy the access token.',
    icon: 'contacts',
  },
  {
    id: 'apollo',
    name: 'Apollo.io',
    description: 'Lead enrichment and contact discovery',
    category: 'crm',
    credentialType: 'api_key',
    setupUrl: 'https://app.apollo.io/#/settings/integrations/api',
    setupInstructions: 'Go to Apollo Settings → Integrations → API and copy your API key.',
    icon: 'person_search',
  },
  {
    id: 'hunter',
    name: 'Hunter.io',
    description: 'Find email addresses and verify contacts',
    category: 'crm',
    credentialType: 'api_key',
    setupUrl: 'https://hunter.io/api-keys',
    setupInstructions: 'Log into Hunter.io and copy your API key from the API Keys page.',
    icon: 'email',
  },
  // Productivity
  {
    id: 'google',
    name: 'Google Workspace',
    description: 'Calendar, Docs, and Search Console access',
    category: 'productivity',
    credentialType: 'api_key',
    setupUrl: 'https://console.cloud.google.com/apis/credentials',
    setupInstructions: 'Create a Service Account in Google Cloud Console, download the JSON key file, and paste its contents here.',
    icon: 'cloud',
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Create and update Notion pages and databases',
    category: 'productivity',
    credentialType: 'api_key',
    setupUrl: 'https://www.notion.so/my-integrations',
    setupInstructions: 'Create an Internal Integration at notion.so/my-integrations and copy the API secret. Share target pages with the integration.',
    icon: 'description',
  },
  // Development
  {
    id: 'github',
    name: 'GitHub',
    description: 'Manage issues, PRs, and repositories',
    category: 'development',
    credentialType: 'api_key',
    setupUrl: 'https://github.com/settings/tokens',
    setupInstructions: 'Generate a Fine-grained Personal Access Token at GitHub Settings → Developer Settings → Personal Access Tokens.',
    icon: 'code',
  },
  // Analytics & SEO
  {
    id: 'google-analytics',
    name: 'Google Analytics',
    description: 'Pull GA4 traffic and conversion reports',
    category: 'analytics',
    credentialType: 'api_key',
    setupUrl: 'https://console.cloud.google.com/apis/credentials',
    setupInstructions: 'Enable the Google Analytics Data API, create a Service Account, and paste the JSON key. Grant Viewer access in GA4 Admin.',
    icon: 'analytics',
  },
  // Finance
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Customer, invoice, and payment data',
    category: 'finance',
    credentialType: 'api_key',
    setupUrl: 'https://dashboard.stripe.com/apikeys',
    setupInstructions: 'Copy your Restricted API key from Stripe Dashboard → Developers → API Keys. Use read-only permissions for safety.',
    icon: 'payments',
  },
  // Media
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Whisper transcription and other OpenAI APIs',
    category: 'ai',
    credentialType: 'api_key',
    setupUrl: 'https://platform.openai.com/api-keys',
    setupInstructions: 'Create an API key at platform.openai.com/api-keys.',
    icon: 'smart_toy',
  },
  // Reviews & Reputation
  {
    id: 'google-places',
    name: 'Google Places',
    description: 'Monitor Google reviews and business listings',
    category: 'analytics',
    credentialType: 'api_key',
    setupUrl: 'https://console.cloud.google.com/apis/credentials',
    setupInstructions: 'Enable Places API in Google Cloud Console and create an API key.',
    icon: 'star',
  },
  // Events
  {
    id: 'eventbrite',
    name: 'Eventbrite',
    description: 'Create events and manage attendees',
    category: 'productivity',
    credentialType: 'api_key',
    setupUrl: 'https://www.eventbrite.com/platform/api-keys',
    setupInstructions: 'Create an API key in Eventbrite Developer settings.',
    icon: 'event',
  },
]

/** Get all available services, optionally merged with team credential status. */
export function listServices(): ServiceDefinition[] {
  return SERVICES
}

/** Get a single service definition by ID. */
export function getService(serviceId: string): ServiceDefinition | undefined {
  return SERVICES.find((s) => s.id === serviceId)
}
