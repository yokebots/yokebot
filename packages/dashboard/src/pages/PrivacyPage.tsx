import { Link } from 'react-router'

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-light-bg">
      {/* Header */}
      <header className="border-b border-border-subtle bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo-full.png" alt="YokeBot" className="h-8" />
          </Link>
          <Link to="/login" className="text-sm font-medium text-forest-green hover:text-forest-green-hover transition-colors">
            Sign In
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="font-display text-4xl font-bold text-text-main">Privacy Policy</h1>
        <p className="mt-2 text-sm text-text-muted">Last updated: February 26, 2026</p>

        <div className="mt-10 space-y-8 text-base leading-relaxed text-text-secondary">
          <section>
            <h2 className="text-xl font-semibold text-text-main">1. Introduction</h2>
            <p className="mt-3">
              YokeBot ("we," "us," or "our") is committed to protecting your privacy. This Privacy Policy
              explains how we collect, use, and safeguard your information when you use our AI agent workforce
              platform at yokebot.com ("the Service").
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">2. Information We Collect</h2>
            <h3 className="mt-4 text-lg font-medium text-text-main">Account Information</h3>
            <p className="mt-2">
              When you sign up, we collect your name, email address, and profile picture from your
              Google or GitHub account via OAuth. We do not store your password.
            </p>

            <h3 className="mt-4 text-lg font-medium text-text-main">Business Context</h3>
            <p className="mt-2">
              During onboarding, you may provide your company name, website URL, industry, and business goals.
              This information is used to personalize your AI agent recommendations.
            </p>

            <h3 className="mt-4 text-lg font-medium text-text-main">Usage Data</h3>
            <p className="mt-2">
              We collect information about how you use the Service, including agent configurations,
              chat messages, task activity, and knowledge base uploads. This data is stored to provide
              the Service and is not shared with third parties.
            </p>

            <h3 className="mt-4 text-lg font-medium text-text-main">Payment Information</h3>
            <p className="mt-2">
              Payment processing is handled by Stripe. We do not store your credit card number or
              banking details. Stripe's privacy policy governs the handling of your payment data.
            </p>

            <h3 className="mt-4 text-lg font-medium text-text-main">Analytics</h3>
            <p className="mt-2">
              We use Google Analytics to understand how visitors interact with our website. This collects
              anonymized data such as page views, referral sources, and device information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">3. How We Use Your Information</h2>
            <ul className="mt-3 list-disc space-y-1 pl-6">
              <li>To provide and maintain the Service</li>
              <li>To personalize your AI agent recommendations and configurations</li>
              <li>To process payments and manage your subscription</li>
              <li>To send important account notifications (billing, security, service updates)</li>
              <li>To improve the Service based on aggregate usage patterns</li>
              <li>To respond to your support requests</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">4. What We Do NOT Do</h2>
            <ul className="mt-3 list-disc space-y-1 pl-6">
              <li>We do <strong>not</strong> use your data to train AI models</li>
              <li>We do <strong>not</strong> sell your personal information to third parties</li>
              <li>We do <strong>not</strong> share your business data, knowledge base content, or agent conversations with other users</li>
              <li>We do <strong>not</strong> send marketing emails without your consent</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">5. AI Processing</h2>
            <p className="mt-3">
              When your AI agents process tasks, your data is sent to third-party AI model providers to generate
              responses. These providers process your data according to their own privacy policies and data processing
              agreements. We select providers that commit to not using customer data for model training.
            </p>
            <p className="mt-3">
              With the self-hosted version, you control which AI providers handle your data and can use
              local models for complete data isolation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">6. Data Storage and Security</h2>
            <p className="mt-3">
              Your data is stored securely in managed cloud infrastructure. We use encryption in transit (TLS)
              and at rest. API credentials and integration keys you store in YokeBot are encrypted using
              AES-256 before storage.
            </p>
            <p className="mt-3">
              Authentication is handled by Supabase using industry-standard JWT tokens with ES256 signing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">7. Data Retention</h2>
            <p className="mt-3">
              We retain your data for as long as your account is active. You may delete individual items
              (agents, documents, messages) at any time. If you delete your account, we will remove all
              your data within 30 days, except where retention is required by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">8. Your Rights</h2>
            <p className="mt-3">Depending on your jurisdiction, you may have the right to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Export your data in a machine-readable format</li>
              <li>Object to processing of your data</li>
              <li>Withdraw consent at any time</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, contact us at{' '}
              <a href="mailto:privacy@yokebot.com" className="text-forest-green hover:underline">privacy@yokebot.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">9. Cookies</h2>
            <p className="mt-3">
              We use essential cookies for authentication and session management. Google Analytics uses
              cookies for anonymous usage tracking. We do not use advertising or tracking cookies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">10. Children's Privacy</h2>
            <p className="mt-3">
              The Service is not intended for use by anyone under 18 years of age. We do not knowingly
              collect personal information from children.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">11. Changes to This Policy</h2>
            <p className="mt-3">
              We may update this Privacy Policy from time to time. We will notify you of material changes
              by posting the updated policy on this page. Continued use of the Service after changes
              constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">12. Contact</h2>
            <p className="mt-3">
              For privacy-related questions or requests, contact us at{' '}
              <a href="mailto:privacy@yokebot.com" className="text-forest-green hover:underline">privacy@yokebot.com</a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
