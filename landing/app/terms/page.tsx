import type { Metadata } from "next";
import LegalNav from "@/components/LegalNav";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Terms of Service — Aminta",
  description: "Terms and conditions for using the Aminta Chrome extension and web application. Governed by Belgian law.",
};

function Section({ id, label: _label, title, children }: { id: string; label: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="pt-9 border-t border-[#1e1e22]">
      <h2 className="text-[1.0625rem] font-semibold text-white mb-4">{title}</h2>
      <div className="space-y-4 text-[#888] leading-relaxed text-[0.9375rem]">{children}</div>
    </section>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="text-[0.9375rem] font-semibold text-[#ccc] mb-2">{title}</h3>
      <div className="space-y-3 text-[#888] leading-relaxed">{children}</div>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 border-l-2 border-[#f7a074]/30 pl-4 text-[#777] text-sm leading-relaxed">
      {children}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 border-l-2 border-[#74f7b5]/30 pl-4 text-[#777] text-sm leading-relaxed">
      {children}
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="text-[#444] shrink-0 mt-[0.3rem]">–</span>
      <span>{children}</span>
    </li>
  );
}

function ProhibitedLi({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="text-[#444] shrink-0 mt-[0.3rem]">–</span>
      <span>{children}</span>
    </li>
  );
}

export default function TermsPage() {
  return (
    <>
      <LegalNav />

      <main className="bg-[#0d0d0f] min-h-screen">
        {/* Hero */}
        <div className="mx-auto max-w-3xl px-6 pt-12 pb-8">
          <h1 className="text-2xl font-semibold text-white mb-3">Terms of Service</h1>
          <p className="text-[#555] text-sm mb-4">
            Last updated: June 15, 2026
          </p>
          <p className="text-[#888] leading-relaxed text-[0.9375rem]">
            These Terms of Service (&quot;Terms&quot;) govern your access to and use of the Aminta
            Chrome extension and web application (&quot;Service&quot;), operated by an individual
            developer based in Belgium (&quot;Aminta,&quot; &quot;we,&quot; &quot;us,&quot; or
            &quot;our&quot;). By using Aminta, you agree to these Terms. Please read them carefully.
          </p>
        </div>

        {/* TOC */}
        <div className="mx-auto max-w-3xl px-6 pb-8 border-b border-[#1e1e22]">
          <ol className="space-y-1 text-sm text-[#555]">
            {[
              ["#acceptance", "1. Acceptance of Terms"],
              ["#service", "2. Description of Service"],
              ["#accounts", "3. User Accounts"],
              ["#acceptable-use", "4. Acceptable Use"],
              ["#ai-disclaimer", "5. AI Content Disclaimer"],
              ["#user-responsibility", "6. User Responsibility for Content"],
              ["#ip", "7. Intellectual Property"],
              ["#billing", "8. Subscription and Billing"],
              ["#refunds", "9. Refund Policy"],
              ["#api-keys", "10. API Key Usage"],
              ["#liability", "11. Limitation of Liability"],
              ["#warranties", "12. Disclaimer of Warranties"],
              ["#termination", "13. Termination"],
              ["#changes", "14. Changes to Terms"],
              ["#governing-law", "15. Governing Law and Disputes"],
              ["#contact", "16. Contact Information"],
            ].map(([href, label]) => (
              <li key={href}>
                <a href={href} className="hover:text-[#888] transition-colors">
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </div>

        {/* Content */}
        <div className="mx-auto max-w-3xl px-6 pb-20 space-y-0">

          <Section id="acceptance" label="§ 1" title="Acceptance of Terms">
            <p>
              By installing the Aminta Chrome extension, creating an account, or otherwise using
              the Service, you confirm that you are at least 16 years old, that you have read and
              understood these Terms, and that you agree to be bound by them.
            </p>
            <p>
              If you are using the Service on behalf of a company or other legal entity, you
              represent that you have the authority to bind that entity to these Terms. In that
              case, &quot;you&quot; and &quot;your&quot; refer to that entity.
            </p>
            <p>
              If you do not agree to these Terms, do not install or use the Service.
            </p>
          </Section>

          <Section id="service" label="§ 2" title="Description of Service">
            <p>
              Aminta is an AI-assisted content creation tool delivered as a Chrome browser
              extension and companion web application. The Service helps users draft, polish, and
              publish content for social platforms including X (Twitter), LinkedIn, and Reddit.
            </p>
            <p>Key features include, but are not limited to:</p>
            <ul className="mt-3 space-y-2">
              <Li>Tweet Generator, Reply Generator, and Post Polisher</Li>
              <Li>Voice Profile — personalised tone and style configuration</Li>
              <Li>Content Ideas and inspiration tools</Li>
              <Li>One-click insertion into social platform composers</Li>
              <Li>XP system and Aminta companion progression</Li>
              <Li>Bring Your Own Key (BYOK) support for AI providers</Li>
            </ul>
            <p className="mt-4">
              The Service uses third-party AI models to generate content. Aminta acts as an
              interface and orchestration layer; the underlying AI capabilities are provided by
              third parties and are subject to their respective terms and limitations.
            </p>
            <Notice>
              The Service may change over time. We reserve the right to add, modify, suspend, or
              remove features at any time, with or without notice. We will make reasonable efforts
              to communicate significant changes.
            </Notice>
          </Section>

          <Section id="accounts" label="§ 3" title="User Accounts">
            <Sub title="3.1 Registration">
              <p>
                To access most features of the Service, you must create an account. You agree to
                provide accurate, current, and complete information during registration and to keep
                your account information updated.
              </p>
            </Sub>

            <Sub title="3.2 Account Security">
              <p>
                You are responsible for maintaining the confidentiality of your account credentials
                and for all activity that occurs under your account. You agree to notify us
                immediately of any unauthorised use of your account. We are not liable for any
                loss or damage arising from your failure to secure your account.
              </p>
            </Sub>

            <Sub title="3.3 One Account Per Person">
              <p>
                Each account is for a single individual user. Creating multiple accounts to
                circumvent usage limits, trials, or bans is prohibited and may result in
                termination of all associated accounts.
              </p>
            </Sub>
          </Section>

          <Section id="acceptable-use" label="§ 4" title="Acceptable Use">
            <p>
              You agree to use the Service only for lawful purposes and in accordance with these
              Terms. The following uses are strictly prohibited:
            </p>
            <ul className="mt-4 space-y-2.5">
              <ProhibitedLi>
                Using the Service to generate, distribute, or publish content that is illegal,
                defamatory, harassing, threatening, hateful, discriminatory, obscene, or
                otherwise harmful.
              </ProhibitedLi>
              <ProhibitedLi>
                Using the Service to generate spam, coordinated inauthentic behaviour, astroturfing,
                or mass automated posting at scale.
              </ProhibitedLi>
              <ProhibitedLi>
                Attempting to scrape, crawl, reverse-engineer, decompile, or extract source code
                from the Aminta extension or web application.
              </ProhibitedLi>
              <ProhibitedLi>
                Using automated tools, bots, or scripts to interact with the Service in ways not
                intended or permitted by its interface.
              </ProhibitedLi>
              <ProhibitedLi>
                Attempting to gain unauthorised access to any part of the Service, its servers,
                databases, or connected systems.
              </ProhibitedLi>
              <ProhibitedLi>
                Violating the terms of service of any social platform (X, LinkedIn, Reddit, etc.)
                through the use of Aminta.
              </ProhibitedLi>
              <ProhibitedLi>
                Using the Service to generate content that impersonates any person or entity, or
                that misrepresents your affiliation with any person or entity.
              </ProhibitedLi>
              <ProhibitedLi>
                Reselling, sublicensing, or commercially redistributing access to the Service
                without our prior written consent.
              </ProhibitedLi>
              <ProhibitedLi>
                Using the Service in any way that could damage, disable, overburden, or impair
                the Service or interfere with other users&apos; access.
              </ProhibitedLi>
              <ProhibitedLi>
                Generating content that constitutes disinformation, coordinated manipulation, or
                political influence operations.
              </ProhibitedLi>
            </ul>
            <p className="mt-5">
              We reserve the right to determine, at our sole discretion, what constitutes a
              violation of this section and to take appropriate action, including suspension or
              termination of your account.
            </p>
          </Section>

          <Section id="ai-disclaimer" label="§ 5" title="AI Content Disclaimer">
            <Warning>
              <strong className="text-white">AI outputs may be inaccurate, incomplete, biased,
              or inappropriate.</strong> Aminta provides AI-assisted writing tools, not verified
              facts, professional advice, or guaranteed results. Do not rely on AI-generated
              content as a substitute for professional, legal, medical, financial, or any other
              form of expert advice.
            </Warning>
            <p>
              AI language models can produce content that is:
            </p>
            <ul className="mt-3 space-y-2">
              <Li>Factually incorrect, outdated, or misleading</Li>
              <Li>Stylistically unsuitable for your audience or context</Li>
              <Li>In conflict with the terms of service of the platform you are posting on</Li>
              <Li>Potentially offensive or inappropriate despite best efforts by filters</Li>
            </ul>
            <p className="mt-4">
              Aminta provides tools to assist your creative and communication process. The final
              decision to publish any content rests entirely with you. We strongly encourage you
              to review, edit, and take responsibility for all content before it is published.
            </p>
            <p>
              Aminta does not guarantee that AI-generated content will achieve any particular
              outcome, including engagement, reach, follower growth, or business results.
            </p>
          </Section>

          <Section id="user-responsibility" label="§ 6" title="User Responsibility for Content">
            <p>
              You are solely responsible for all content you generate using the Service and
              subsequently publish on any platform. This includes:
            </p>
            <ul className="mt-3 space-y-2.5">
              <Li>
                Ensuring that content you publish complies with applicable laws in your
                jurisdiction and the jurisdiction of your audience.
              </Li>
              <Li>
                Ensuring compliance with the terms of service, community guidelines, and
                advertising policies of any platform on which you publish content.
              </Li>
              <Li>
                Verifying the accuracy of any factual claims in AI-generated content before
                publishing.
              </Li>
              <Li>
                Obtaining any necessary rights, licences, or permissions if generated content
                incorporates or references third-party material.
              </Li>
            </ul>
            <p className="mt-4">
              Aminta is a tool, not a publisher. We are not responsible for the content you create
              or publish using the Service. By publishing content, you represent and warrant that
              you have the right to do so and that the content complies with all applicable laws
              and platform policies.
            </p>
          </Section>

          <Section id="ip" label="§ 7" title="Intellectual Property">
            <Sub title="7.1 Your Content">
              <p>
                Content you generate using Aminta belongs to you. We do not claim ownership of
                prompts, Voice Profile data, or AI-generated outputs produced under your account.
                You grant us a limited, non-exclusive licence to process your content solely to
                provide the Service.
              </p>
            </Sub>

            <Sub title="7.2 Aminta Platform">
              <p>
                The Aminta name, logo, mascot (Aminta), pixel art, brand identity, software,
                source code, design, XP system, and all related intellectual property are the
                exclusive property of Aminta and its operator. Nothing in these Terms transfers
                any ownership of these assets to you.
              </p>
              <p className="mt-2">
                You may not copy, reproduce, distribute, modify, create derivative works of, or
                publicly display any part of the Aminta brand, design, or software without our
                prior written consent.
              </p>
            </Sub>

            <Sub title="7.3 Feedback">
              <p>
                If you provide feedback, suggestions, or ideas about the Service, you grant us an
                irrevocable, royalty-free, worldwide licence to use that feedback for any purpose,
                including improving the Service, without any obligation to you.
              </p>
            </Sub>
          </Section>

          <Section id="billing" label="§ 8" title="Subscription and Billing">
            <Sub title="8.1 Subscription Plans">
              <p>
                Aminta may offer free and paid subscription tiers. Paid plans are billed on a
                recurring basis (monthly or annually, as selected). The current pricing for each
                plan is displayed on our pricing page at the time of purchase.
              </p>
            </Sub>

            <Sub title="8.2 Payment Processing">
              <p>
                Payments are processed by Stripe. By providing payment details, you authorise us
                to charge your payment method on a recurring basis for the selected plan. All
                prices are in the currency displayed at checkout and are exclusive of applicable
                taxes unless stated otherwise.
              </p>
            </Sub>

            <Sub title="8.3 Tax">
              <p>
                Depending on your location, VAT or other applicable taxes may be added to your
                subscription price. Belgian VAT rules apply to purchases within the EU where
                applicable.
              </p>
            </Sub>

            <Sub title="8.4 Renewals and Cancellation">
              <p>
                Subscriptions renew automatically at the end of each billing period. You may
                cancel your subscription at any time through your account settings. Cancellation
                takes effect at the end of the current billing period; you retain access until
                then. We do not prorate partial billing periods.
              </p>
            </Sub>

            <Sub title="8.5 Price Changes">
              <p>
                We reserve the right to change subscription prices. We will notify you of price
                changes at least 30 days in advance. Your continued use of a paid plan after
                the effective date constitutes acceptance of the new price.
              </p>
            </Sub>
          </Section>

          <Section id="refunds" label="§ 9" title="Refund Policy">
            <p>
              All subscription fees are non-refundable except as required by applicable law.
            </p>
            <p>
              However, if you experience a significant technical failure attributable to Aminta
              that renders the Service substantially unusable for a period exceeding 72 consecutive
              hours, you may contact us to request a pro-rata credit or refund for the affected
              period.
            </p>
            <p>
              EU consumers have a statutory 14-day right of withdrawal for digital services
              purchased online. By accessing digital content or starting to use the Service before
              the 14-day period expires, you acknowledge that you waive this right, as permitted
              under the EU Consumer Rights Directive (Article 16(m)).
            </p>
            <p>
              Refund requests should be sent to{" "}
              <span className="font-mono text-[#74f7b5]">hello@amintaapp.com</span>. We evaluate
              all requests on a case-by-case basis.
            </p>
          </Section>

          <Section id="api-keys" label="§ 10" title="API Key Usage">
            <p>
              Aminta supports Bring Your Own Key (BYOK), allowing you to use your own API keys
              from providers such as OpenRouter, Groq, Google Gemini, and OpenAI. The following
              conditions apply:
            </p>
            <ul className="mt-3 space-y-2.5">
              <Li>
                Your API keys are stored locally in your browser and are never transmitted to
                Aminta&apos;s servers. You are responsible for their security.
              </Li>
              <Li>
                You are solely responsible for compliance with the terms of service of each AI
                provider whose API you use.
              </Li>
              <Li>
                You are solely responsible for any costs, overages, or fees incurred through
                your API usage.
              </Li>
              <Li>
                You must not use API keys that you are not authorised to use (e.g., stolen or
                shared keys).
              </Li>
              <Li>
                Aminta is not liable for service interruptions, errors, or data loss arising
                from third-party API provider outages, rate limits, or policy changes.
              </Li>
            </ul>
          </Section>

          <Section id="liability" label="§ 11" title="Limitation of Liability">
            <p>
              To the fullest extent permitted by applicable law, Aminta and its operator shall
              not be liable for any indirect, incidental, special, consequential, exemplary, or
              punitive damages, including but not limited to loss of profits, loss of data, loss
              of goodwill, business interruption, or reputational harm, arising out of or related
              to your use of or inability to use the Service.
            </p>
            <p>
              In no event shall Aminta&apos;s total aggregate liability to you for all claims arising
              out of or related to these Terms or the Service exceed the greater of (a) the total
              fees paid by you to Aminta in the 12 months preceding the event giving rise to the
              claim, or (b) €50.
            </p>
            <p>
              These limitations apply regardless of the legal theory (contract, tort, negligence,
              strict liability, or otherwise) and even if Aminta has been advised of the possibility
              of such damages. Some jurisdictions do not allow certain limitations on liability;
              in such cases, the limitation will apply to the maximum extent permitted by law.
            </p>
            <Warning>
              <strong className="text-white">Specifically:</strong> Aminta is not liable for
              content published by you on any social platform, for account penalties or
              suspensions imposed on you by those platforms, for the accuracy or quality of
              AI-generated content, or for any consequences of your use of the Service.
            </Warning>
          </Section>

          <Section id="warranties" label="§ 12" title="Disclaimer of Warranties">
            <p>
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF
              ANY KIND, EITHER EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY LAW,
              AMINTA DISCLAIMS ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO:
            </p>
            <ul className="mt-3 space-y-2">
              <Li>IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE</Li>
              <Li>WARRANTIES OF TITLE, NON-INFRINGEMENT, AND ACCURACY</Li>
              <Li>WARRANTIES THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE</Li>
              <Li>WARRANTIES THAT DEFECTS WILL BE CORRECTED</Li>
              <Li>WARRANTIES REGARDING THE QUALITY, ACCURACY, OR SUITABILITY OF AI-GENERATED CONTENT</Li>
            </ul>
            <p className="mt-4">
              We do not warrant that the Service will meet your specific requirements or
              expectations, or that results obtained from using the Service will be accurate or
              reliable.
            </p>
            <p>
              Consumer protection laws in Belgium and the EU may grant you statutory rights that
              cannot be excluded by these Terms. Nothing in this section limits those statutory
              rights.
            </p>
          </Section>

          <Section id="termination" label="§ 13" title="Termination">
            <Sub title="13.1 Termination by You">
              <p>
                You may close your account at any time by visiting account settings and selecting
                the option to delete your account. Upon deletion, your personal data will be
                removed in accordance with our Privacy Policy. Paid subscriptions must be
                cancelled separately before account deletion to avoid further charges.
              </p>
            </Sub>

            <Sub title="13.2 Termination by Us">
              <p>
                We may suspend or terminate your account immediately, without notice, if we
                determine in our sole discretion that:
              </p>
              <ul className="mt-2 space-y-1.5">
                <Li>You have violated these Terms or our Acceptable Use Policy.</Li>
                <Li>Your account has been involved in fraud, abuse, or illegal activity.</Li>
                <Li>Continuing to provide you with the Service would expose us to legal risk.</Li>
                <Li>You have created multiple accounts to circumvent restrictions.</Li>
              </ul>
            </Sub>

            <Sub title="13.3 Effect of Termination">
              <p>
                Upon termination, your right to access and use the Service ceases immediately.
                Provisions that by their nature should survive termination — including Sections 6,
                7, 11, 12, and 15 — will survive. We are not obligated to provide you with your
                data following termination for cause, but we will fulfil any legal data access
                obligations.
              </p>
            </Sub>
          </Section>

          <Section id="changes" label="§ 14" title="Changes to Terms">
            <p>
              We reserve the right to modify these Terms at any time. When we make material
              changes, we will notify you by email and/or by prominently displaying a notice
              within the Service at least 14 days before the changes take effect.
            </p>
            <p>
              If you object to any change, you may cancel your account before the effective date.
              Your continued use of the Service after the effective date constitutes your
              acceptance of the updated Terms.
            </p>
            <p>
              For non-material changes (such as corrections, clarifications, or administrative
              updates), we may update the Terms without prior notice beyond updating the
              &quot;Last updated&quot; date.
            </p>
          </Section>

          <Section id="governing-law" label="§ 15" title="Governing Law and Disputes">
            <Sub title="15.1 Governing Law">
              <p>
                These Terms and any disputes arising out of or related to them or the Service are
                governed by and construed in accordance with the laws of <strong className="text-white">Belgium</strong>,
                without regard to conflict-of-law principles.
              </p>
            </Sub>

            <Sub title="15.2 Jurisdiction">
              <p>
                Any legal dispute arising under these Terms shall be subject to the exclusive
                jurisdiction of the courts of <strong className="text-white">Belgium</strong>.
                If you are a consumer resident in another EU member state, you also retain the
                right to bring claims before the courts of your country of residence under EU
                consumer protection law.
              </p>
            </Sub>

            <Sub title="15.3 EU Online Dispute Resolution">
              <p>
                If you are a consumer in the EU, you have the right to use the European
                Commission&apos;s Online Dispute Resolution (ODR) platform for disputes relating
                to online purchases:{" "}
                <span className="text-[#74f7b5] font-mono text-sm">ec.europa.eu/consumers/odr</span>.
                Our contact email for ODR purposes is{" "}
                <span className="font-mono text-[#74f7b5]">hello@amintaapp.com</span>.
              </p>
            </Sub>

            <Sub title="15.4 Informal Resolution">
              <p>
                Before initiating any formal dispute, we encourage you to contact us directly.
                Many issues can be resolved quickly and informally. We commit to responding to
                all good-faith complaints within 5 business days.
              </p>
            </Sub>
          </Section>

          <Section id="contact" label="§ 16" title="Contact Information">
            <p>
              For questions about these Terms, to report a violation, or for any other enquiries
              regarding the Service:
            </p>
            <div className="mt-4 text-sm space-y-1.5">
              <p className="text-[#888]">Aminta — Belgium</p>
              <p className="text-[#888]">
                Email:{" "}
                <span className="font-mono text-[#74f7b5]">hello@amintaapp.com</span>
              </p>
              <p className="text-[#555] text-xs pt-1">
                We aim to respond within 5 business days. For urgent matters relating to abuse,
                illegal content, or security, please mark your subject line accordingly.
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-[#1e1e22]">
              <p className="text-[#555] text-sm">
                By using Aminta, you acknowledge that you have read, understood, and agree to
                these Terms of Service.
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-sm">
                <a href="/privacy" className="text-[#74f7b5] hover:text-white transition-colors">
                  Privacy Policy →
                </a>
                <a href="/" className="text-[#666] hover:text-[#74f7b5] transition-colors">
                  Back to Aminta →
                </a>
              </div>
            </div>
          </Section>

        </div>
      </main>

      <Footer />
    </>
  );
}
