import type { Metadata } from "next";
import LegalNav from "@/components/LegalNav";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy — Aminta",
  description: "How Aminta collects, uses, and protects your data. GDPR-compliant privacy policy for the Aminta Chrome extension and web application.",
};

function Section({ id, label, title, children }: { id: string; label: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="pt-12 border-t border-[#2a2a2e]">
      <p className="font-pixel text-[10px] text-[#74f7b5] uppercase tracking-widest mb-2">{label}</p>
      <h2 className="text-xl font-semibold text-white mb-5">{title}</h2>
      <div className="space-y-4 text-[#b8b8c4] leading-relaxed text-[0.9375rem]">{children}</div>
    </section>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="text-[0.9375rem] font-semibold text-white mb-2">{title}</h3>
      <div className="space-y-3 text-[#b8b8c4] leading-relaxed">{children}</div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-5 border-l-4 border-[#74f7b5] bg-[#0f1a14] rounded-r-xl px-5 py-4 text-[#c8d8cc] text-sm leading-relaxed">
      {children}
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="text-[#74f7b5] shrink-0 mt-0.5">◈</span>
      <span>{children}</span>
    </li>
  );
}

export default function PrivacyPage() {
  return (
    <>
      <LegalNav />

      <main className="bg-[#0d0d0f] min-h-screen">
        {/* Hero */}
        <div className="bg-black border-b border-[#1a1a1e]">
          <div className="mx-auto max-w-3xl px-6 py-14">
            <p className="font-pixel text-[10px] text-[#74f7b5] uppercase tracking-widest mb-3">Legal</p>
            <h1 className="text-3xl sm:text-4xl font-semibold text-white mb-4">Privacy Policy</h1>
            <p className="text-[#666] text-sm">
              Last updated: <span className="text-[#999]">June 15, 2026</span>
            </p>
            <p className="mt-4 text-[#b8b8c4] leading-relaxed">
              This Privacy Policy explains how Aminta collects, uses, stores, and protects your
              information when you use the Aminta Chrome extension and web application. We are
              committed to transparency and to protecting your privacy under applicable law,
              including the EU General Data Protection Regulation (GDPR).
            </p>
          </div>
        </div>

        {/* TOC */}
        <div className="mx-auto max-w-3xl px-6 py-10">
          <div className="bg-[#141418] border border-[#2a2a2e] rounded-2xl p-6">
            <p className="font-pixel text-[10px] text-[#74f7b5] uppercase tracking-widest mb-4">Contents</p>
            <ol className="space-y-1.5 text-sm text-[#888]">
              {[
                ["#controller", "1. Data Controller"],
                ["#information", "2. Information We Collect"],
                ["#use", "3. How We Use Your Information"],
                ["#legal-basis", "4. Legal Basis for Processing (GDPR)"],
                ["#ai", "5. AI Processing Disclosure"],
                ["#extension", "6. Chrome Extension Permissions"],
                ["#storage", "7. Data Storage and Security"],
                ["#third-party", "8. Third-Party Services"],
                ["#cookies", "9. Cookies and Local Storage"],
                ["#retention", "10. Data Retention"],
                ["#rights", "11. Your Rights Under GDPR"],
                ["#transfers", "12. International Data Transfers"],
                ["#children", "13. Children's Privacy"],
                ["#changes", "14. Changes to This Policy"],
                ["#contact", "15. Contact Information"],
              ].map(([href, label]) => (
                <li key={href}>
                  <a href={href} className="hover:text-[#74f7b5] transition-colors">
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Content */}
        <div className="mx-auto max-w-3xl px-6 pb-24 space-y-0">

          <Section id="controller" label="§ 1" title="Data Controller">
            <p>
              Aminta is operated by an individual developer based in Belgium. For the purposes of
              EU data protection law, the data controller is:
            </p>
            <div className="bg-[#141418] border border-[#2a2a2e] rounded-xl px-5 py-4 text-sm space-y-1">
              <p className="text-white font-medium">Aminta</p>
              <p>Country: Belgium</p>
              <p>
                Email:{" "}
                <span className="font-mono text-[#74f7b5]">hello@amintaapp.com</span>
                <span className="text-[#555] text-xs ml-2">← replace before publishing</span>
              </p>
            </div>
            <p>
              If you have any questions about this Privacy Policy or about how we handle your data,
              please contact us at the address above.
            </p>
          </Section>

          <Section id="information" label="§ 2" title="Information We Collect">
            <p>
              We collect the minimum information necessary to provide and improve the Aminta service.
              The categories below describe what we collect, why we collect it, and how.
            </p>

            <Sub title="2.1 Account Information">
              <p>
                When you create an Aminta account, we collect your email address and, if you choose
                to provide it, your display name. We use this to authenticate you, send
                service-related communications, and associate your data with your account.
              </p>
            </Sub>

            <Sub title="2.2 User-Generated Content">
              <p>
                Aminta processes text you provide as input — such as topics, draft posts, reply
                targets, and instructions — to generate AI-assisted content. This input is
                transmitted to your chosen AI provider (see §8) to fulfill the request. We do not
                permanently store the raw text of your prompts or generated outputs unless you
                explicitly save them within the application.
              </p>
            </Sub>

            <Sub title="2.3 Voice Profile Data">
              <p>
                If you configure a Voice Profile, you may provide sample posts and descriptions of
                your tone and writing style. This profile is stored in your account so that the AI
                can write in your voice. You can delete or modify your Voice Profile at any time
                from your account settings.
              </p>
            </Sub>

            <Sub title="2.4 Browser Extension Data">
              <p>
                The Aminta Chrome extension operates locally in your browser. It reads the active
                tab to detect the X (Twitter), LinkedIn, or Reddit composer so it can inject
                generated content on request. We do not collect or transmit your browsing history.
                See §6 for a full list of extension permissions.
              </p>
            </Sub>

            <Sub title="2.5 Usage Analytics">
              <p>
                We collect anonymised, aggregated usage data to understand how Aminta is used and
                to improve the product. This may include feature usage frequency, error rates, and
                session duration. We do not collect your content or personally identifiable
                information through analytics.
              </p>
            </Sub>

            <Sub title="2.6 API Keys">
              <p>
                If you choose to use your own API keys (Bring Your Own Key — BYOK), those keys are
                stored exclusively in your browser&apos;s local storage. They are never transmitted
                to Aminta&apos;s servers. API requests made using your keys go directly from your
                browser to the respective AI provider. You are solely responsible for managing and
                protecting your API keys.
              </p>
            </Sub>

            <Notice>
              <strong className="text-white">We do not sell your personal data.</strong> Your
              information is used only to provide and improve the Aminta service.
            </Notice>
          </Section>

          <Section id="use" label="§ 3" title="How We Use Your Information">
            <p>We use the information we collect for the following purposes:</p>
            <ul className="mt-3 space-y-2.5">
              <Li>Providing, maintaining, and improving the Aminta extension and web application.</Li>
              <Li>Authenticating your identity and managing your account.</Li>
              <Li>Transmitting your prompts to AI providers to generate content on your behalf.</Li>
              <Li>Storing your Voice Profile so Aminta can write in your style.</Li>
              <Li>Sending transactional emails (account confirmation, password reset, billing receipts).</Li>
              <Li>Analysing anonymised usage patterns to improve features and performance.</Li>
              <Li>Preventing fraud, abuse, and violations of our Terms of Service.</Li>
              <Li>Complying with our legal obligations under Belgian and EU law.</Li>
            </ul>
            <p className="mt-4">
              We do not use your content to train AI models. We do not use your data for
              advertising purposes. We do not share your personal data with third parties except
              as described in §8 and as required by law.
            </p>
          </Section>

          <Section id="legal-basis" label="§ 4" title="Legal Basis for Processing (GDPR)">
            <p>
              For users in the European Economic Area and the United Kingdom, we rely on the
              following legal bases under Article 6 GDPR:
            </p>
            <ul className="mt-3 space-y-2.5">
              <Li>
                <span>
                  <strong className="text-white">Contract (Art. 6(1)(b)):</strong> Processing your
                  account information and content to provide the service you signed up for.
                </span>
              </Li>
              <Li>
                <span>
                  <strong className="text-white">Legitimate Interests (Art. 6(1)(f)):</strong>{" "}
                  Processing anonymised analytics data to improve our product, and processing data
                  to detect and prevent abuse.
                </span>
              </Li>
              <Li>
                <span>
                  <strong className="text-white">Legal Obligation (Art. 6(1)(c)):</strong> Retaining
                  billing records as required by Belgian and EU tax law.
                </span>
              </Li>
              <Li>
                <span>
                  <strong className="text-white">Consent (Art. 6(1)(a)):</strong> For any optional
                  communications or data uses beyond what is strictly necessary to provide the
                  service, where we will ask for your explicit consent.
                </span>
              </Li>
            </ul>
          </Section>

          <Section id="ai" label="§ 5" title="AI Processing Disclosure">
            <p>
              Aminta uses third-party AI models to generate content on your behalf. When you use
              a generation feature, your prompt (including any Voice Profile context you have
              enabled) is transmitted to the AI provider you have selected or that we have
              configured as the default.
            </p>
            <p>
              Each AI provider has its own privacy policy and terms of service. You are encouraged
              to review these before using Aminta, in particular regarding how providers handle
              submitted data and whether they use it for model training.
            </p>
            <Notice>
              <strong className="text-white">Generated content belongs to you.</strong> Aminta
              does not claim ownership over content produced using your prompts or Voice Profile.
              You are responsible for reviewing AI-generated content before publishing it.
              AI outputs may be inaccurate, incomplete, or unsuitable — always review before use.
            </Notice>
          </Section>

          <Section id="extension" label="§ 6" title="Chrome Extension Permissions">
            <p>
              The Aminta Chrome extension requests the following browser permissions. We request
              only the permissions necessary for the extension to function.
            </p>
            <ul className="mt-3 space-y-2.5">
              <Li>
                <span>
                  <strong className="text-white">activeTab:</strong> Allows Aminta to read the
                  current tab&apos;s URL and inject content into the X, LinkedIn, or Reddit
                  composer when you activate the extension. We do not read page content unless
                  you explicitly use a feature that requires it (e.g., Reply Generator reading a
                  tweet you are replying to).
                </span>
              </Li>
              <Li>
                <span>
                  <strong className="text-white">storage:</strong> Used to store your settings,
                  Voice Profile, XP progress, and BYOK API keys locally in your browser. This
                  data does not leave your device unless you are logged in and sync is enabled.
                </span>
              </Li>
              <Li>
                <span>
                  <strong className="text-white">Host permissions (x.com, twitter.com,
                  linkedin.com, reddit.com):</strong> Required to detect the active composer and
                  inject generated content into the text field when you click &quot;Insert into
                  X&quot; or equivalent.
                </span>
              </Li>
            </ul>
            <p className="mt-4">
              We do not access your browsing history. We do not read page content on sites you
              visit other than the supported platforms listed above, and only when you have
              activated the Aminta panel.
            </p>
          </Section>

          <Section id="storage" label="§ 7" title="Data Storage and Security">
            <p>
              Your account data and Voice Profile are stored on servers located within the European
              Economic Area. We use industry-standard security measures including:
            </p>
            <ul className="mt-3 space-y-2.5">
              <Li>Encryption in transit (TLS/HTTPS) for all data transmitted to our servers.</Li>
              <Li>Encryption at rest for stored personal data.</Li>
              <Li>Access controls limiting who within the operation can access user data.</Li>
              <Li>Regular security reviews of our infrastructure and dependencies.</Li>
            </ul>
            <p className="mt-4">
              BYOK API keys are stored exclusively in your browser&apos;s local storage and are never
              transmitted to our servers. You are responsible for the security of your own device
              and browser environment.
            </p>
            <p>
              No method of transmission or storage is 100% secure. While we strive to use
              commercially acceptable means to protect your information, we cannot guarantee
              absolute security.
            </p>
          </Section>

          <Section id="third-party" label="§ 8" title="Third-Party Services">
            <p>
              Aminta integrates with the following third-party services. When you use features
              that rely on these services, your data is subject to their respective privacy
              policies in addition to ours.
            </p>

            <Sub title="8.1 AI Providers">
              <p>
                When you generate content, your prompt and relevant Voice Profile context are
                transmitted to the AI provider you have selected. Currently supported providers
                include:
              </p>
              <ul className="mt-2 space-y-2">
                <Li>
                  <span>
                    <strong className="text-white">OpenRouter</strong> — routes requests to various
                    underlying AI models. Privacy policy: openrouter.ai/privacy
                  </span>
                </Li>
                <Li>
                  <span>
                    <strong className="text-white">Groq</strong> — fast inference provider.
                    Privacy policy: groq.com/privacy
                  </span>
                </Li>
                <Li>
                  <span>
                    <strong className="text-white">Google Gemini</strong> — AI models by Google.
                    Privacy policy: policies.google.com/privacy
                  </span>
                </Li>
                <Li>
                  <span>
                    <strong className="text-white">OpenAI</strong> — AI models including GPT
                    series. Privacy policy: openai.com/privacy
                  </span>
                </Li>
              </ul>
              <p className="mt-3">
                If you provide your own API key (BYOK), requests go directly from your browser to
                the provider and are governed entirely by that provider&apos;s terms.
              </p>
            </Sub>

            <Sub title="8.2 Billing">
              <p>
                We use <strong className="text-white">Stripe</strong> to process subscription
                payments. When you enter payment details, those details are transmitted directly
                to Stripe and are never stored on Aminta&apos;s servers. Stripe is PCI-DSS
                compliant. Privacy policy: stripe.com/privacy
              </p>
            </Sub>

            <Sub title="8.3 Analytics">
              <p>
                We may use analytics tools to collect anonymised usage data. Any analytics data
                collected is aggregated and does not identify you personally. We will update this
                section with specific tools as they are deployed.
              </p>
            </Sub>

            <Sub title="8.4 Chrome Web Store">
              <p>
                Distribution of the Aminta extension through the Chrome Web Store is subject to
                Google&apos;s privacy policy. We comply with all Chrome Web Store Developer Program
                Policies, including those relating to data use and disclosure.
              </p>
            </Sub>
          </Section>

          <Section id="cookies" label="§ 9" title="Cookies and Local Storage">
            <p>
              Aminta uses cookies and browser local storage to operate the service.
            </p>
            <ul className="mt-3 space-y-2.5">
              <Li>
                <span>
                  <strong className="text-white">Authentication cookies:</strong> Used to keep you
                  logged in to your Aminta account. These are strictly necessary for the service
                  to function and do not require consent under ePrivacy Directive Article 5(3).
                </span>
              </Li>
              <Li>
                <span>
                  <strong className="text-white">Local storage (extension):</strong> Used to store
                  your preferences, XP progress, Voice Profile, and API keys locally on your
                  device. This data is not transmitted to external servers except as explicitly
                  described in this policy.
                </span>
              </Li>
              <Li>
                <span>
                  <strong className="text-white">Analytics cookies:</strong> If we use
                  analytics, we will only set analytics cookies with your consent, where required
                  by law.
                </span>
              </Li>
            </ul>
            <p className="mt-4">
              You can clear local storage and cookies via your browser settings at any time. Doing
              so will log you out and reset locally stored preferences.
            </p>
          </Section>

          <Section id="retention" label="§ 10" title="Data Retention">
            <p>We retain your personal data only for as long as necessary:</p>
            <ul className="mt-3 space-y-2.5">
              <Li>
                <span>
                  <strong className="text-white">Account data:</strong> Retained for the duration
                  of your account. Deleted within 30 days of account deletion, except where
                  retention is required by law.
                </span>
              </Li>
              <Li>
                <span>
                  <strong className="text-white">Billing records:</strong> Retained for 7 years
                  as required by Belgian accounting and tax law.
                </span>
              </Li>
              <Li>
                <span>
                  <strong className="text-white">Anonymised analytics:</strong> May be retained
                  indefinitely in aggregated form, as they do not identify you.
                </span>
              </Li>
              <Li>
                <span>
                  <strong className="text-white">Prompt data:</strong> Not retained on our servers
                  beyond the time needed to fulfill the AI request (typically seconds). We do not
                  log or store the content of your AI prompts or generated outputs.
                </span>
              </Li>
            </ul>
          </Section>

          <Section id="rights" label="§ 11" title="Your Rights Under GDPR">
            <p>
              If you are located in the European Economic Area or the United Kingdom, you have the
              following rights regarding your personal data:
            </p>
            <ul className="mt-3 space-y-2.5">
              <Li>
                <span>
                  <strong className="text-white">Right of access (Art. 15):</strong> You can
                  request a copy of the personal data we hold about you.
                </span>
              </Li>
              <Li>
                <span>
                  <strong className="text-white">Right to rectification (Art. 16):</strong> You
                  can ask us to correct inaccurate data or complete incomplete data.
                </span>
              </Li>
              <Li>
                <span>
                  <strong className="text-white">Right to erasure (Art. 17):</strong> You can
                  request deletion of your personal data, subject to legal retention requirements.
                </span>
              </Li>
              <Li>
                <span>
                  <strong className="text-white">Right to data portability (Art. 20):</strong> You
                  can request your data in a structured, machine-readable format.
                </span>
              </Li>
              <Li>
                <span>
                  <strong className="text-white">Right to restriction (Art. 18):</strong> You can
                  ask us to restrict processing of your data in certain circumstances.
                </span>
              </Li>
              <Li>
                <span>
                  <strong className="text-white">Right to object (Art. 21):</strong> You can
                  object to processing based on legitimate interests.
                </span>
              </Li>
              <Li>
                <span>
                  <strong className="text-white">Right to withdraw consent:</strong> Where
                  processing is based on consent, you can withdraw it at any time.
                </span>
              </Li>
            </ul>
            <p className="mt-5">
              To exercise any of these rights, contact us at{" "}
              <span className="font-mono text-[#74f7b5]">hello@amintaapp.com</span>. We will
              respond within 30 days. You also have the right to lodge a complaint with your local
              supervisory authority. In Belgium, this is the{" "}
              <strong className="text-white">
                Gegevensbeschermingsautoriteit (GBA) / Autorité de protection des données (APD)
              </strong>
              , reachable at gegevensbeschermingsautoriteit.be.
            </p>
          </Section>

          <Section id="transfers" label="§ 12" title="International Data Transfers">
            <p>
              Some of our third-party service providers — in particular AI model providers such as
              OpenRouter, Groq, and OpenAI — are based in the United States. When you use these
              services, your prompt data is transferred to the United States.
            </p>
            <p>
              We rely on the following safeguards for such transfers:
            </p>
            <ul className="mt-3 space-y-2.5">
              <Li>
                Standard Contractual Clauses (SCCs) adopted by the European Commission, where
                applicable and required.
              </Li>
              <Li>
                The EU-US Data Privacy Framework, where the provider is certified.
              </Li>
            </ul>
            <p className="mt-4">
              If you use your own BYOK API keys, data is transmitted directly from your browser
              to the provider, and you take on the responsibility for that transfer.
            </p>
          </Section>

          <Section id="children" label="§ 13" title="Children's Privacy">
            <p>
              Aminta is not directed at children under the age of 16. We do not knowingly collect
              personal information from anyone under 16. If we become aware that we have
              inadvertently collected personal data from a child under 16, we will delete that
              information promptly.
            </p>
            <p>
              If you are a parent or guardian and believe your child has provided us with personal
              information, please contact us at{" "}
              <span className="font-mono text-[#74f7b5]">hello@amintaapp.com</span>.
            </p>
          </Section>

          <Section id="changes" label="§ 14" title="Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time to reflect changes in our
              practices, technology, or legal requirements. When we make material changes, we will:
            </p>
            <ul className="mt-3 space-y-2.5">
              <Li>Update the &quot;Last updated&quot; date at the top of this page.</Li>
              <Li>
                Notify you by email (if you have an account) or via an in-app notice, where the
                changes are material.
              </Li>
            </ul>
            <p className="mt-4">
              Your continued use of Aminta after the effective date of any changes constitutes
              your acceptance of the updated policy. If you do not agree with the changes, you
              should stop using Aminta and may request deletion of your account.
            </p>
          </Section>

          <Section id="contact" label="§ 15" title="Contact Information">
            <p>
              If you have questions, concerns, or requests relating to this Privacy Policy or to
              how we handle your personal data, please contact us:
            </p>
            <div className="bg-[#141418] border border-[#2a2a2e] rounded-xl px-5 py-5 text-sm space-y-2 mt-4">
              <p className="text-white font-medium">Aminta — Data Controller</p>
              <p>Country of establishment: Belgium</p>
              <p>
                Email:{" "}
                <span className="font-mono text-[#74f7b5]">hello@amintaapp.com</span>
              </p>
              <p className="text-[#555] text-xs pt-1">
                We aim to respond to all enquiries within 5 business days, and to data subject
                requests within 30 calendar days.
              </p>
            </div>
          </Section>

        </div>
      </main>

      <Footer />
    </>
  );
}
