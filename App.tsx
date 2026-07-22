
import React, { useState, useEffect } from 'react';
import { MODES } from './modes';
import { ModeDef, WordLite, SessionPlan, Turn, FeedbackReport, SessionRecord } from './types';
import { Session } from './components/Session';
import { Feedback } from './components/Feedback';
import { supabase, isCloudConfigured } from './services/supabaseClient';
import { wordsService } from './services/wordsService';
import { historyService } from './services/historyService';
import { hasApiKey } from './services/geminiService';
import { Mic2, X, Loader2, LogOut, Settings as SettingsIcon, KeyRound, Eye, EyeOff, Check, ExternalLink, History as HistoryIcon, MessagesSquare, Briefcase, Users, Coffee, Cloud, CloudOff } from 'lucide-react';
import type { Session as SupaSession } from '@supabase/supabase-js';

type Screen = 'home' | 'session' | 'feedback' | 'history';

const MODE_ICONS: Record<string, React.ReactNode> = {
  casual: <Coffee className="w-6 h-6" />,
  interview: <Briefcase className="w-6 h-6" />,
  business: <MessagesSquare className="w-6 h-6" />,
  group: <Users className="w-6 h-6" />,
};

const App: React.FC = () => {
  const [screen, setScreen] = useState<Screen>('home');
  const [session, setSession] = useState<SupaSession | null>(null);
  const [words, setWords] = useState<WordLite[]>([]);
  const [wordsLoading, setWordsLoading] = useState(false);

  const [activeMode, setActiveMode] = useState<ModeDef | null>(null);
  const [role, setRole] = useState('Investment Banking Analyst');
  const [lastPlan, setLastPlan] = useState<SessionPlan | null>(null);
  const [lastReport, setLastReport] = useState<FeedbackReport | null>(null);

  // Auth modal
  const [showAuth, setShowAuth] = useState(false);
  const [authView, setAuthView] = useState<'signin' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  // Password recovery (arrived via reset-email link)
  const [showReset, setShowReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  // Settings modal
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(() => localStorage.getItem('lexiai_api_key') || '');
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [keyConfigured, setKeyConfigured] = useState(() => hasApiKey());

  const [history, setHistory] = useState<SessionRecord[]>(() => historyService.getAll());

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setShowReset(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Recovery links can be processed before the listener above subscribes, and
  // expired/used links come back as #error_description=… — handle both from the URL.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    if (/type=recovery/.test(hash)) setShowReset(true);
    const err = hash.match(/error_description=([^&]+)/);
    if (err) {
      setShowAuth(true);
      setAuthView('forgot');
      setAuthMessage(`This reset link no longer works (${decodeURIComponent(err[1].replace(/\+/g, ' '))}). Links are single-use — send yourself a fresh one below and open it right away.`);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!session) { setWords([]); return; }
    setWordsLoading(true);
    wordsService.fetchWords(session.user.id)
      .then(setWords)
      .catch(e => console.warn('words fetch failed', e))
      .finally(() => setWordsLoading(false));
  }, [session?.user.id]);

  const candidateWords = () => {
    // Prefer words in SRS rotation that aren't Can Speak yet; top up with the rest.
    const notSpoken = words.filter(w => !w.speakingPassed);
    const rotation = notSpoken.filter(w => w.inRotation);
    const pool = [...rotation, ...notSpoken.filter(w => !w.inRotation)].slice(0, 400);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    if (shuffled.length >= 8) return shuffled.slice(0, 24).map(w => w.word);
    // Guest / empty library: a starter set of conversation-worthy expressions.
    return ['mull over', 'touch base', 'trade-off', 'push back', 'leverage', 'wind down',
            'on the fence', 'take the plunge', 'in hindsight', 'silver lining', 'follow up on', 'level with'];
  };

  const startMode = (mode: ModeDef) => {
    if (!keyConfigured) { setShowSettings(true); return; }
    setActiveMode(mode);
    setScreen('session');
  };

  const handleFinished = async (plan: SessionPlan, hist: Turn[], report: FeedbackReport) => {
    setLastPlan(plan);
    setLastReport(report);
    setScreen('feedback');
    const record: SessionRecord = {
      id: `sess_${Date.now()}`,
      mode: activeMode!.id,
      topic: plan.topic,
      date: new Date().toISOString(),
      userTurns: hist.filter(t => t.speaker === 'You').length,
      report,
    };
    historyService.add(record);
    setHistory(historyService.getAll());
    // Write mastery back to the shared LexiAI vocabulary.
    const wellUsed = report.targetWords.filter(t => t.usedWell).map(t => t.word);
    if (session && wellUsed.length) {
      wordsService.markSpokenWell(session.user.id, wellUsed).catch(() => {});
      setWords(prev => prev.map(w => wellUsed.some(x => x.toLowerCase() === w.word.toLowerCase()) ? { ...w, speakingPassed: true } : w));
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      if (authView === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw error;
        setAuthMessage('Reset link sent — check your inbox (and spam folder), then open the link in this browser.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setShowAuth(false);
        setPassword('');
      }
    } catch (err: any) {
      setAuthMessage(err.message || 'Sign in failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setResetBusy(true);
    setResetMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setShowReset(false);
      setResetMessage(null);
    } catch (err: any) {
      setResetMessage(err.message || 'Could not update password.');
    } finally {
      setResetBusy(false);
    }
  };

  const spokenCount = words.filter(w => w.speakingPassed).length;

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-stone-900">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-stone-200 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 h-16 flex justify-between items-center">
          <button className="flex items-center gap-2.5" onClick={() => setScreen('home')}>
            <div className="p-2 rounded-lg bg-stone-900 text-white"><Mic2 className="w-4 h-4" /></div>
            <span className="text-xl font-serif font-bold tracking-tight">LexiSpeak</span>
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => setScreen('history')} className={`p-2 rounded-lg transition-colors ${screen === 'history' ? 'bg-stone-900 text-white' : 'text-stone-400 hover:text-stone-900'}`} title="Session history">
              <HistoryIcon className="w-4 h-4" />
            </button>
            <button onClick={() => setShowSettings(true)} className="p-2 rounded-lg text-stone-400 hover:text-stone-900" title="Settings">
              <SettingsIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => session ? (window.confirm('Sign out?') && supabase?.auth.signOut()) : setShowAuth(true)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wider transition-all ${
                session ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-stone-100 border-stone-200 text-stone-400'
              }`}
            >
              {session ? <Cloud className="w-3 h-3" /> : <CloudOff className="w-3 h-3" />}
              {session ? (session.user.email || '').split('@')[0] : 'Sign In'}
            </button>
          </div>
        </div>
      </header>

      <main className="py-10">
        {screen === 'home' && (
          <div className="max-w-4xl mx-auto px-4 space-y-10 animate-fade-in">
            <div className="text-center space-y-3">
              <h1 className="text-5xl font-serif font-bold tracking-tight">Speaking Studio</h1>
              <p className="text-stone-500 font-serif italic">Real conversation practice, coached like a pro.</p>
              {session ? (
                <p className="text-xs text-stone-400 font-bold uppercase tracking-widest">
                  {wordsLoading ? 'Loading your vocabulary…' : `${words.length} words in your library · ${spokenCount} can-speak 🗣️`}
                </p>
              ) : (
                <button onClick={() => setShowAuth(true)} className="text-xs text-stone-500 underline underline-offset-4 hover:text-stone-900">
                  Sign in with your LexiAI account to train with your own vocabulary
                </button>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {MODES.map(mode => (
                <div key={mode.id} className="bg-white rounded-2xl border-2 border-transparent hover:border-stone-800 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all p-7 space-y-4 group">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-stone-50 text-stone-500 group-hover:bg-stone-900 group-hover:text-white transition-colors">
                      {MODE_ICONS[mode.id]}
                    </div>
                    <div>
                      <h3 className="font-serif font-bold text-xl text-stone-900">{mode.label}</h3>
                      <p className="text-xs text-stone-400 uppercase tracking-widest font-bold">{mode.tagline}</p>
                    </div>
                  </div>
                  <p className="text-sm text-stone-500">
                    {mode.personas.length > 1
                      ? `With ${mode.personas.map(p => p.name).join(' & ')} — two voices, two viewpoints.`
                      : `With ${mode.personas[0].name} — ${mode.personas[0].style.split(';')[0]}.`}
                  </p>
                  {mode.needsRole && (
                    <input
                      value={role}
                      onChange={e => setRole(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      placeholder="Target role, e.g. Investment Banking Analyst"
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-sm outline-none focus:ring-1 focus:ring-stone-400"
                    />
                  )}
                  <button
                    onClick={() => startMode(mode)}
                    className="w-full py-3 bg-stone-900 text-white rounded-full text-sm font-bold hover:bg-black transition-colors"
                  >
                    Start Session
                  </button>
                </div>
              ))}
            </div>

            {!keyConfigured && (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center justify-between gap-4">
                <p className="text-sm text-amber-800">Sessions need a Gemini API key (free) — it stays in this browser only.</p>
                <button onClick={() => setShowSettings(true)} className="shrink-0 px-4 py-1.5 bg-stone-900 text-white rounded-full text-xs font-bold hover:bg-black">Open Settings</button>
              </div>
            )}
          </div>
        )}

        {screen === 'session' && activeMode && (
          <Session
            mode={activeMode}
            role={activeMode.needsRole ? role : undefined}
            candidateWords={candidateWords()}
            onFinished={handleFinished}
            onExit={() => setScreen('home')}
          />
        )}

        {screen === 'feedback' && lastReport && lastPlan && activeMode && (
          <Feedback
            report={lastReport}
            plan={lastPlan}
            modeLabel={activeMode.label}
            onNewSession={() => setScreen('session')}
            onHome={() => setScreen('home')}
          />
        )}

        {screen === 'history' && (
          <div className="max-w-3xl mx-auto px-4 space-y-4 animate-fade-in">
            <h2 className="text-2xl font-serif font-bold">Session History</h2>
            {history.length === 0 && <p className="text-stone-400 font-serif italic py-10 text-center">No sessions yet — your coaching reports will collect here.</p>}
            {history.map(r => (
              <button
                key={r.id}
                onClick={() => {
                  setLastReport(r.report);
                  setLastPlan({ topic: r.topic, opener: { speaker: '', text: '' }, targetWords: r.report.targetWords.map(t => t.word) });
                  setActiveMode(MODES.find(m => m.id === r.mode) || MODES[0]);
                  setScreen('feedback');
                }}
                className="w-full text-left bg-white rounded-2xl border border-stone-100 shadow-sm hover:shadow-md transition-shadow p-5 flex items-center justify-between gap-4"
              >
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                    {MODES.find(m => m.id === r.mode)?.label} · {new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {r.userTurns} turns
                  </p>
                  <p className="font-serif font-bold text-stone-900">{r.topic}</p>
                </div>
                <span className={`shrink-0 w-12 h-12 rounded-full border-2 flex items-center justify-center font-serif font-bold ${
                  r.report.score >= 80 ? 'border-emerald-300 text-emerald-700' : 'border-amber-300 text-amber-700'
                }`}>
                  {r.report.score}
                </span>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Auth modal */}
      {showAuth && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAuth(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-8 space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-serif font-bold">{authView === 'signin' ? 'Sign In' : 'Reset Password'}</h3>
              <button onClick={() => setShowAuth(false)} className="text-stone-400 hover:text-stone-900"><X /></button>
            </div>
            <p className="text-stone-500 text-sm">
              {authView === 'signin'
                ? 'Use the same account as LexiAI — your vocabulary comes with you, and words you master here light up 🗣️ there.'
                : "Enter your account email and we'll send you a link to set a new password."}
            </p>
            {!isCloudConfigured && <p className="text-amber-700 text-sm">Cloud is not configured (missing SUPABASE_* env).</p>}
            <form onSubmit={handleAuth} className="space-y-4">
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Email"
                className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-stone-900" />
              {authView === 'signin' && (
                <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Password"
                  className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-stone-900" />
              )}
              {authMessage && <p className="text-sm text-amber-700">{authMessage}</p>}
              <button type="submit" disabled={authBusy}
                className="w-full py-4 bg-stone-900 text-white rounded-xl font-bold hover:bg-black transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {authBusy && <Loader2 className="w-4 h-4 animate-spin" />} {authView === 'signin' ? 'Sign In' : 'Email Me a Reset Link'}
              </button>
              <button
                type="button"
                onClick={() => { setAuthView(authView === 'signin' ? 'forgot' : 'signin'); setAuthMessage(null); }}
                className="w-full text-sm text-stone-500 hover:text-stone-900"
              >
                {authView === 'signin' ? 'Forgot password?' : '← Back to sign in'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Set-new-password modal (opened by the reset-email link) */}
      {showReset && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-8 space-y-5">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-serif font-bold">Set New Password</h3>
              <button onClick={() => setShowReset(false)} className="text-stone-400 hover:text-stone-900"><X /></button>
            </div>
            <p className="text-stone-500 text-sm">Your reset link signed you in. Choose a new password to finish.</p>
            <form onSubmit={handleSetNewPassword} className="space-y-4">
              <input type="password" required minLength={6} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="New password (min 6 characters)" autoFocus
                className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-stone-900" />
              {resetMessage && <p className="text-sm text-amber-700">{resetMessage}</p>}
              <button type="submit" disabled={resetBusy}
                className="w-full py-4 bg-stone-900 text-white rounded-xl font-bold hover:bg-black transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {resetBusy && <Loader2 className="w-4 h-4 animate-spin" />} Save New Password
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowSettings(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-8 space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-serif font-bold">Settings</h3>
              <button onClick={() => setShowSettings(false)} className="text-stone-400 hover:text-stone-900"><X /></button>
            </div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-400">
              <KeyRound className="w-3.5 h-3.5 inline mr-1" /> Gemini API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                placeholder="Paste your API key"
                className="w-full p-4 pr-12 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-stone-900 font-mono text-sm"
              />
              <button onClick={() => setShowKey(!showKey)} className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-900">
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-stone-400">
              Stored only in this browser.{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-stone-700 underline inline-flex items-center gap-0.5">
                Get a free key <ExternalLink className="w-3 h-3" />
              </a>
            </p>
            <button
              onClick={() => {
                if (apiKeyInput.trim()) localStorage.setItem('lexiai_api_key', apiKeyInput.trim());
                else localStorage.removeItem('lexiai_api_key');
                setKeyConfigured(hasApiKey());
                setKeySaved(true);
                setTimeout(() => setShowSettings(false), 600);
              }}
              className="w-full py-4 bg-stone-900 text-white rounded-xl font-bold hover:bg-black transition-colors flex items-center justify-center gap-2"
            >
              {keySaved ? <><Check className="w-4 h-4" /> Saved</> : 'Save Settings'}
            </button>
            {session && (
              <button onClick={() => { supabase?.auth.signOut(); setShowSettings(false); }} className="w-full py-3 border border-stone-200 rounded-xl text-sm font-bold text-stone-500 hover:border-stone-400 flex items-center justify-center gap-2">
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
