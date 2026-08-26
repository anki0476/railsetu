'use client';

import { useState } from 'react';

const questions = [
  {
    id: 'how-it-works',
    question: 'How does RailSetu find a route when the direct train is waitlisted?',
    answer: 'RailSetu checks confirmed availability across smaller, continuous segments of the same train. It joins those segments into one complete journey and clearly shows every seat or coach change.',
  },
  {
    id: 'change-trains',
    question: 'Will I need to change trains?',
    answer: 'No. The core RailSetu journey keeps you on the same train. Depending on availability, you may only need to change your seat—or occasionally your coach—at a clearly identified station.',
  },
  {
    id: 'traveller-needs',
    question: 'Can RailSetu plan for elderly travellers, families, or heavy luggage?',
    answer: 'Yes. Traveller preferences are treated as route constraints. RailSetu can prioritise fewer changes, the same or nearby coaches, lower berths, and simpler transitions for mobility or luggage needs.',
  },
  {
    id: 'booking',
    question: 'Does RailSetu book the tickets for me?',
    answer: 'Not in the current prototype. RailSetu simplifies and ranks the segmented journey so you know exactly which confirmed legs to choose. A verified booking integration is part of the product roadmap.',
  },
  {
    id: 'live-data',
    question: 'Is the availability shown live?',
    answer: 'The hackathon prototype uses representative inventory to demonstrate the complete experience. Live railway availability will be connected during the data-integration phase.',
  },
];

export default function LandingFaq() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section className="faq-section" aria-labelledby="faq-title">
      <div className="faq-heading">
        <p className="section-kicker">Questions, made clear</p>
        <h2 id="faq-title">Before you board.</h2>
        <p>Everything you need to know about how RailSetu turns a waitlist into a journey.</p>
      </div>

      <div className="faq-list">
        {questions.map((item, index) => {
          const isExpanded = expanded === item.id;
          const panelId = `faq-panel-${item.id}`;

          return (
            <article className={`faq-item ${isExpanded ? 'is-expanded' : ''}`} key={item.id}>
              <button
                type="button"
                aria-expanded={isExpanded}
                aria-controls={panelId}
                onClick={() => setExpanded((current) => current === item.id ? null : item.id)}
              >
                <span className="faq-number">0{index + 1}</span>
                <span className="faq-question">{item.question}</span>
                <span className="faq-chevron" aria-hidden="true">›</span>
              </button>
              <div className="faq-answer" id={panelId} aria-hidden={!isExpanded}>
                <div><p>{item.answer}</p></div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
