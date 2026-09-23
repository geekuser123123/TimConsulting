import Link from "next/link";
import { RequestSection } from "./RequestSection";

export const metadata = {
  title: { absolute: "Work With Tim Berry | Roth Academy" },
  description: "Request a discovery call with Tim Berry for a matter that may require attorney-level work. Requests are reviewed before scheduling.",
};

const FAQ = [
  {
    q: "Will I get a scheduling link right away?",
    a: "No. Tim reviews each request first. If he accepts your request for a discovery call, the team sends a private link for a 15-minute appointment.",
  },
  {
    q: "Will the discovery call solve my entire situation?",
    a: "The call is meant to understand your goal and determine whether attorney-level work is needed. It is not a complete legal analysis or strategy session.",
  },
  {
    q: "Does submitting a request make me a client?",
    a: "No. Submitting a request does not guarantee an appointment, acceptance of a matter, or an attorney-client relationship. Any proposed work and fee would be shared separately for your review.",
  },
  {
    q: "What happens after the call?",
    a: "If further work is appropriate, the team prepares a proposed scope of work. Tim reviews it before you receive a private proposal to accept or decline.",
  },
];

export default function WorkWithTim() {
  return (
    <main className="wwt" id="top">
      <section className="hero" aria-labelledby="hero-title">
        <div className="wrap hero-inner">
          <div>
            <div className="eyebrow">Private consulting · By request</div>
            <h1 id="hero-title">
              Work with <em>Tim Berry.</em>
            </h1>
            <p className="hero-lead">
              Some decisions call for more than general education. Tell us what you are trying to accomplish, and Tim will review whether a short
              discovery call is the right next step.
            </p>
            <Link className="button button-gold" href="#request">
              Request a Discovery Call <span className="arrow" aria-hidden="true">→</span>
            </Link>
            <p className="hero-note">Every request is reviewed before scheduling.</p>
          </div>
          <aside className="hero-panel" aria-label="The discovery process">
            <p className="panel-kicker">A thoughtful first step</p>
            <h2>Get clarity on the work your situation may require.</h2>
            <div className="panel-step">
              <b>01</b>
              <div>
                <strong>Share your situation</strong>
                <span>Give us the context behind your decision.</span>
              </div>
            </div>
            <div className="panel-step">
              <b>02</b>
              <div>
                <strong>Tim reviews your request</strong>
                <span>He decides whether a discovery call is appropriate.</span>
              </div>
            </div>
            <div className="panel-step">
              <b>03</b>
              <div>
                <strong>Schedule privately if approved</strong>
                <span>Only accepted requests receive a 15-minute scheduling link.</span>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <div className="ribbon">
        <div className="wrap ribbon-inner">
          <div className="ribbon-item">
            <small>Call length</small>
            <strong>15-minute discovery</strong>
          </div>
          <div className="ribbon-item">
            <small>Access</small>
            <strong>Reviewed before scheduling</strong>
          </div>
          <div className="ribbon-item">
            <small>Purpose</small>
            <strong>Determine the next step</strong>
          </div>
        </div>
      </div>

      <section className="section" id="about">
        <div className="wrap intro-grid">
          <div>
            <div className="eyebrow">What this is</div>
            <h2>A place to start when the usual answers are not enough.</h2>
          </div>
          <div className="intro-copy">
            <p>
              If your situation requires more than general education, you can request a short discovery call with Tim. The purpose is to understand
              what you are trying to accomplish, determine whether attorney-level work is required, and identify the appropriate next step.
            </p>
            <p>
              <strong>The discovery call is not intended to provide a complete legal analysis or strategy.</strong> Tim will use the call to
              determine what work, if any, is required.
            </p>
          </div>
        </div>
      </section>

      <section className="section fit">
        <div className="wrap">
          <div className="fit-head">
            <div>
              <div className="eyebrow">A focused conversation</div>
              <h2>Built for a real question in front of you.</h2>
            </div>
            <p>A short request helps Tim understand the decision and whether his involvement makes sense.</p>
          </div>
          <div className="fit-grid">
            <article className="fit-card">
              <span className="number">01 / Your goal</span>
              <h3>What are you trying to do?</h3>
              <p>Describe the outcome you are working toward and the reason you are seeking help now.</p>
            </article>
            <article className="fit-card">
              <span className="number">02 / The uncertainty</span>
              <h3>What is standing in the way?</h3>
              <p>Tell us what remains unclear, including any transaction or decision you need to make.</p>
            </article>
            <article className="fit-card">
              <span className="number">03 / The context</span>
              <h3>What should Tim know?</h3>
              <p>Share timing, plan type, and relevant entities so the request can be reviewed in context.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section" id="process">
        <div className="wrap">
          <div className="process-head">
            <div className="eyebrow">The path forward</div>
            <h2>A clear process, one step at a time.</h2>
            <p>You explain your situation once. Tim reviews the request before any scheduling link is sent.</p>
          </div>
          <div className="process-list">
            <article className="process-item">
              <span className="number">01 / Request</span>
              <h3>Tell us about it</h3>
              <p>Complete the short intake with the goal, question, and timing behind your request.</p>
            </article>
            <article className="process-item">
              <span className="number">02 / Review</span>
              <h3>Tim decides</h3>
              <p>He reviews whether a discovery call is the appropriate next step.</p>
            </article>
            <article className="process-item">
              <span className="number">03 / Conversation</span>
              <h3>Meet privately</h3>
              <p>If approved, you receive a private link to schedule a 15-minute discovery call.</p>
            </article>
            <article className="process-item">
              <span className="number">04 / Next step</span>
              <h3>Know the scope</h3>
              <p>If work is appropriate, the team prepares a proposed scope and fee for your review.</p>
            </article>
          </div>
          <div className="notice">
            <span className="icon" aria-hidden="true">
              ✳
            </span>
            <p>
              <strong>Before you apply:</strong> Submitting a request does not guarantee an appointment, acceptance of a matter, or an
              attorney-client relationship. Each request is reviewed before scheduling.
            </p>
          </div>
        </div>
      </section>

      <RequestSection />

      <section className="section faq" id="questions">
        <div className="wrap faq-grid">
          <div>
            <div className="eyebrow">Common questions</div>
            <h2>Know what to expect.</h2>
          </div>
          <div>
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="closing">
        <div className="wrap closing-inner">
          <div>
            <div className="eyebrow">When the decision matters</div>
            <h2>Start with the right conversation.</h2>
          </div>
          <Link className="button button-gold" href="#request">
            Request a Discovery Call <span className="arrow" aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
