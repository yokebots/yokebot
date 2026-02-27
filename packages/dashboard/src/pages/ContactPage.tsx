import { useState, type FormEvent } from 'react'
import { MarketingLayout } from '@/layouts/MarketingLayout'

const ENGINE_URL = import.meta.env.VITE_ENGINE_URL || 'http://localhost:3001'

export function ContactPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setStatus('sending')
    try {
      const res = await fetch(`${ENGINE_URL}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error || 'Failed to send')
      }
      setStatus('sent')
      setName('')
      setEmail('')
      setMessage('')
    } catch {
      setStatus('error')
    }
  }

  return (
    <MarketingLayout>
      <section className="bg-white px-6 py-20 xl:px-24">
        <div className="mx-auto max-w-xl">
          <div className="mb-10 text-center">
            <h1 className="mb-3 font-display text-4xl font-bold text-text-main">Contact Us</h1>
            <p className="text-text-muted">Have a question or want to learn more? Drop us a line and we'll get back to you soon.</p>
          </div>

          {status === 'sent' ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
              <span className="material-symbols-outlined mb-2 text-3xl text-green-600">check_circle</span>
              <p className="font-bold text-green-800">Thanks! We'll get back to you soon.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="contact-name" className="mb-1 block text-sm font-bold text-text-main">Name</label>
                <input
                  id="contact-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-white px-4 py-2.5 text-sm text-text-main outline-none focus:border-forest-green focus:ring-1 focus:ring-forest-green"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label htmlFor="contact-email" className="mb-1 block text-sm font-bold text-text-main">Email</label>
                <input
                  id="contact-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-white px-4 py-2.5 text-sm text-text-main outline-none focus:border-forest-green focus:ring-1 focus:ring-forest-green"
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <label htmlFor="contact-message" className="mb-1 block text-sm font-bold text-text-main">Message</label>
                <textarea
                  id="contact-message"
                  required
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-white px-4 py-2.5 text-sm text-text-main outline-none focus:border-forest-green focus:ring-1 focus:ring-forest-green resize-none"
                  placeholder="How can we help?"
                />
              </div>
              {status === 'error' && (
                <p className="text-sm text-red-600">Something went wrong. Please try again.</p>
              )}
              <button
                type="submit"
                disabled={status === 'sending'}
                className="w-full rounded-lg bg-forest-green py-3 font-bold text-white transition-colors hover:bg-forest-green-hover disabled:opacity-50"
              >
                {status === 'sending' ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          )}
        </div>
      </section>
    </MarketingLayout>
  )
}
