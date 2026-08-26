import type { Metadata } from 'next';
import { Suspense } from 'react';
import BrandTextType from '../components/brand-text-type';
import PaymentCard from '../components/payment-card';
import TactileGlareLink from '../components/tactile-glare-link';

export const metadata: Metadata = {
  title: 'RailSetu Prototype Checkout',
  description: 'Review a RailSetu journey and preview its mock payment experience.',
};

export default function PaymentPage() {
  return (
    <main className="payment-page">
      <span className="payment-ambient payment-ambient-one" aria-hidden="true" />
      <span className="payment-ambient payment-ambient-two" aria-hidden="true" />
      <nav className="nav-wrap payment-nav" aria-label="Payment navigation">
        <a className="brand" href="/" aria-label="RailSetu landing page">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <BrandTextType />
        </a>
        <span className="payment-nav-context"><i /> Prototype checkout</span>
        <TactileGlareLink
          className="nav-cta"
          wrapperClassName="nav-about-wrap"
          href="/planner"
          baseColor="#aebfdf"
          depth={4}
          glareOpacity={0.2}
        >
          Back to journey <span>↙</span>
        </TactileGlareLink>
      </nav>
      <section className="payment-stage">
        <header className="payment-heading">
          <p className="eyebrow"><span /> One last step</p>
          <h1>Your confirmed path,<br /><span>ready to review.</span></h1>
          <p>Choose a mock payment mode and preview the final step of the RailSetu journey.</p>
        </header>
        <Suspense fallback={<div className="payment-card payment-card-fallback" aria-label="Loading payment details" />}>
          <PaymentCard />
        </Suspense>
      </section>
    </main>
  );
}
