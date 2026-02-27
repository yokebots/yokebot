import { Link } from 'react-router'

export function TermsPage() {
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
        <h1 className="font-display text-4xl font-bold text-text-main">Terms of Service</h1>
        <p className="mt-2 text-sm text-text-muted">Last updated: February 26, 2026</p>

        <div className="mt-10 space-y-8 text-base leading-relaxed text-text-secondary">
          <section>
            <h2 className="text-xl font-semibold text-text-main">1. Acceptance of Terms</h2>
            <p className="mt-3">
              By accessing or using YokeBot ("the Service"), operated by YokeBot ("we," "us," or "our"),
              you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">2. Description of Service</h2>
            <p className="mt-3">
              YokeBot is an AI agent workforce platform that allows you to deploy, manage, and collaborate
              with AI agents. The Service includes a hosted cloud platform and an open-source self-hosted option.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">3. Accounts and Registration</h2>
            <p className="mt-3">
              You must provide accurate information when creating an account. You are responsible for maintaining
              the security of your account credentials and for all activity under your account. You must notify us
              immediately of any unauthorized use.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">4. Acceptable Use</h2>
            <p className="mt-3">You agree not to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Use the Service for any unlawful purpose or to violate any laws</li>
              <li>Attempt to gain unauthorized access to the Service or related systems</li>
              <li>Use AI agents to generate spam, harassing content, or misleading material</li>
              <li>Reverse engineer, decompile, or disassemble the Service (except as permitted by the open-source license)</li>
              <li>Resell, sublicense, or redistribute the hosted Service without our written consent</li>
              <li>Interfere with or disrupt the Service or servers</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">5. Subscriptions and Billing</h2>
            <p className="mt-3">
              Paid plans are billed on a monthly recurring basis. You authorize us to charge your payment method
              on file. You may cancel at any time; cancellation takes effect at the end of the current billing period.
              Refunds are provided at our discretion. Credit balances are non-transferable and non-refundable.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">6. Your Data</h2>
            <p className="mt-3">
              You retain ownership of all data you upload to the Service, including documents, knowledge base content,
              and agent configurations. We do not use your data to train AI models. You may export or delete your data
              at any time. Upon account termination, we will delete your data within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">7. AI Agent Outputs</h2>
            <p className="mt-3">
              AI agents may generate content, take actions, or make recommendations on your behalf. You are
              responsible for reviewing and approving agent actions. We are not liable for decisions made based
              on AI-generated outputs. The approval system exists to give you control over high-risk agent actions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">8. Third-Party Services</h2>
            <p className="mt-3">
              The Service integrates with third-party APIs and services (e.g., email providers, search engines, CRMs).
              Your use of these integrations is subject to those third parties' own terms and policies. We are not
              responsible for the availability or accuracy of third-party services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">9. Open-Source License</h2>
            <p className="mt-3">
              The core YokeBot engine and dashboard are licensed under the GNU Affero General Public License v3.0 (AGPLv3).
              Enterprise features in the <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">/ee</code> directory
              are licensed under the YokeBot Enterprise License. The self-hosted version is subject to the applicable
              open-source license terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">10. Limitation of Liability</h2>
            <p className="mt-3">
              To the maximum extent permitted by law, YokeBot shall not be liable for any indirect, incidental,
              special, consequential, or punitive damages, including loss of profits, data, or business opportunities,
              arising from your use of the Service. Our total liability shall not exceed the amounts paid by you
              in the twelve months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">11. Disclaimer of Warranties</h2>
            <p className="mt-3">
              The Service is provided "as is" without warranties of any kind, express or implied. We do not
              guarantee that the Service will be uninterrupted, error-free, or that AI agent outputs will be
              accurate or complete.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">12. Modifications</h2>
            <p className="mt-3">
              We may update these Terms from time to time. We will notify you of material changes by posting the
              updated Terms on this page and updating the "Last updated" date. Continued use of the Service after
              changes constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">13. Termination</h2>
            <p className="mt-3">
              We may suspend or terminate your account if you violate these Terms. You may terminate your account
              at any time by contacting us. Upon termination, your right to use the Service ceases immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-main">14. Contact</h2>
            <p className="mt-3">
              If you have questions about these Terms, contact us at{' '}
              <a href="mailto:legal@yokebot.com" className="text-forest-green hover:underline">legal@yokebot.com</a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
