import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Rocket, Globe2, Clock3, Wallet, Sparkles, LineChart, ShieldCheck } from 'lucide-react';
import { useAuth } from '../store/auth';
import api from '../lib/api';
import { useToasts } from '../store/ui';
import { money } from '../lib/format';
import { Logo } from '../components/Bits';
import { NewProfileForm } from '../components/ProfileForm';

const TEACH = [
  { icon: Globe2, color: 'var(--brand-1)', bg: 'var(--brand-soft)', title: 'Real market data', text: 'Prices stream from the real markets — US, Europe, Asia, ETFs and crypto.' },
  { icon: Wallet, color: 'var(--up)', bg: 'var(--up-soft)', title: 'Paper money only', text: 'Every profile starts with the pretend balance you choose. Nothing is ever real.' },
  { icon: Clock3, color: '#8a63ff', bg: 'rgba(138,99,255,0.14)', title: 'The Time Machine', text: 'Invest in the past and watch the outcome replay with real prices, day by day.' },
];

export default function OnboardingPage() {
  const { profiles, user, applyProfiles } = useAuth();
  const nav = useNavigate();
  const toasts = useToasts();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  // If profiles already exist, this page is used to add more — jump to the form step.
  useEffect(() => {
    if (profiles.length > 0 && step === 0) setStep(1);
  }, [profiles.length, step]);

  const createProfile = async (values) => {
    setBusy(true);
    try {
      const { profile } = await api.post('/profiles', values);
      applyProfiles([...profiles, profile]);
      useAuth.getState().setActiveProfile(profile.id);
      toasts.ok(`“${profile.name}” is ready with ${money(profile.cash, profile.baseCurrency)}.`);
      if (profiles.length === 0) setStep(2);
      else nav('/app');
    } finally {
      setBusy(false);
    }
  };

  const finish = () => nav('/app');

  return (
    <div className="ob-wrap">
      <LinkWrapper onClick={step === 0 ? null : () => setStep(step - 1)}>
        <Logo size={30} />
      </LinkWrapper>

      <div className="ob-card">
        <div className="ob-progress">
          <i className={step >= 0 ? 'on' : ''} />
          <i className={step >= 1 ? 'on' : ''} />
          <i className={step >= 2 ? 'on' : ''} />
        </div>

        {step === 0 && (
          <div className="ob-body">
            <div className="ob-step-head">
              <span className="badge brand"><Sparkles size={12} /> Welcome{user ? `, ${user.username}` : ''}!</span>
              <h2 className="ob-title">Let’s set up your first practice profile</h2>
              <p className="ob-sub">
                Think of a profile as a paper account. You decide its name, its currency and how much
                pretend money to start with. You can create more profiles any time.
              </p>
            </div>
            <div className="teach">
              {TEACH.map((t) => (
                <div className="card teach-card" key={t.title}>
                  <div className="t-ico" style={{ color: t.color, background: t.bg }}><t.icon size={19} /></div>
                  <h4>{t.title}</h4>
                  <p>{t.text}</p>
                </div>
              ))}
            </div>
            <div className="ob-actions">
              <span />
              <button className="btn btn-primary btn-lg" onClick={() => setStep(1)}>
                Sounds good — let’s go <ArrowRight size={17} />
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="ob-body">
            <div className="ob-step-head">
              <span className="badge brand"><Rocket size={12} /> Step 2 of 3</span>
              <h2 className="ob-title">Create your profile</h2>
              <p className="ob-sub">You can rename it, reset it or make new ones later — this is your sandbox.</p>
            </div>
            <NewProfileForm onSubmit={createProfile} busy={busy} embedded />
            <div className="ob-actions" style={{ marginTop: -6 }}>
              <button className="btn btn-ghost" onClick={() => (profiles.length ? nav('/app') : setStep(0))}>
                <ArrowLeft size={16} /> {profiles.length ? 'Back to app' : 'Back'}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="ob-body">
            <div className="ob-finish card card-pad">
              <div className="ob-check"><ShieldCheck size={34} /></div>
              <h2 className="ob-title">You’re all set!</h2>
              <p className="ob-sub" style={{ textAlign: 'center', margin: '0 auto' }}>
                Your first profile is ready with real market data and pretend money.
                Here’s a friendly way to start: <b>open the Markets page, pick any asset you know,
                and buy a little of it.</b> Or jump straight into the Time Machine and finally settle
                that “I should have bought…” argument.
              </p>
              <div className="row center">
                <button className="btn btn-primary btn-lg" onClick={finish}>
                  <LineChart size={17} /> Take me to my dashboard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LinkWrapper({ children, onClick }) {
  if (!onClick) return <div style={{ alignSelf: 'flex-start' }}>{children}</div>;
  return (
    <button type="button" onClick={onClick} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer' }}>
      {children}
    </button>
  );
}
