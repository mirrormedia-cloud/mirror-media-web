import React from 'react';
import { Mail, Clock, LifeBuoy } from 'lucide-react';
import { PublicLayout } from '../../components/public/PublicLayout';
import { SITE_NAME, CONTACT_EMAIL } from '../../lib/site';

const Contact: React.FC = () => (
  <PublicLayout>
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <h1 className="text-4xl font-bold text-center">Contact us</h1>
      <p className="text-text-muted text-center mt-4">
        Questions about {SITE_NAME}, account requests, data deletion or privacy enquiries: we're here to help.
      </p>
      <div className="mt-10 grid gap-5 sm:grid-cols-3">
        <div className="glass-card p-6 space-y-2">
          <Mail className="text-brand-emerald" />
          <p className="font-semibold">Email</p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-sm text-brand-emerald break-all">{CONTACT_EMAIL}</a>
        </div>
        <div className="glass-card p-6 space-y-2">
          <Clock className="text-brand-emerald" />
          <p className="font-semibold">Response time</p>
          <p className="text-sm text-text-muted">Within 2 business days.</p>
        </div>
        <div className="glass-card p-6 space-y-2">
          <LifeBuoy className="text-brand-emerald" />
          <p className="font-semibold">Data requests</p>
          <p className="text-sm text-text-muted">Send account or data deletion requests from your registered email.</p>
        </div>
      </div>
    </section>
  </PublicLayout>
);

export default Contact;
