
import React, { useState } from 'react';
import { FeedbackReport, SessionPlan } from '../types';
import { Award, Mic, Sparkles, Target, Lightbulb, ArrowLeft, RotateCcw, CheckCircle2, XCircle, Volume2, Loader2, BookmarkPlus, BookmarkCheck } from 'lucide-react';
import { speakSafe } from '../services/geminiService';
import { phrasesService } from '../services/phrasesService';

interface FeedbackProps {
  report: FeedbackReport;
  plan: SessionPlan;
  modeLabel: string;
  onPhrasesChanged?: () => void;
  onNewSession: () => void;
  onHome: () => void;
}

// Speak a word/phrase in a clear, neutral voice so the learner can hear the correct pronunciation.
const SayButton: React.FC<{ text: string; label?: string }> = ({ text, label }) => {
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => { if (busy) return; setBusy(true); try { await speakSafe(text, 'Kore'); } finally { setBusy(false); } }}
      className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-stone-500 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 px-2 py-1 rounded-full transition-colors"
      title="Hear the correct pronunciation"
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume2 className="w-3 h-3" />}
      {label || 'Hear it'}
    </button>
  );
};

const SavePhraseButton: React.FC<{ original: string; upgraded: string; why?: string; topic?: string; mode?: string; onChanged?: () => void }> =
  ({ original, upgraded, why, topic, mode, onChanged }) => {
  const [saved, setSaved] = useState(() => phrasesService.has(upgraded));
  return (
    <button
      onClick={() => { if (saved) return; phrasesService.add({ original, upgraded, why, topic, mode }); setSaved(true); onChanged?.(); }}
      className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border transition-colors ${
        saved ? 'bg-emerald-50 border-emerald-100 text-emerald-700 cursor-default' : 'bg-white border-stone-200 text-stone-500 hover:border-stone-900 hover:text-stone-900'
      }`}
      title={saved ? 'In your Phrase Notebook' : 'Save to Phrase Notebook'}
    >
      {saved ? <BookmarkCheck className="w-3 h-3" /> : <BookmarkPlus className="w-3 h-3" />}
      {saved ? 'Saved' : 'Save'}
    </button>
  );
};

export const Feedback: React.FC<FeedbackProps> = ({ report, plan, modeLabel, onPhrasesChanged, onNewSession, onHome }) => (
  <div className="max-w-3xl mx-auto px-4 space-y-6 animate-fade-in-up pb-16">
    {/* Score header */}
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-8 flex items-center justify-between gap-6 flex-wrap">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">{modeLabel} · Coaching Report</p>
        <h2 className="text-2xl font-serif font-bold text-stone-900">{plan.topic}</h2>
        <p className="text-stone-600 font-serif mt-3 leading-relaxed max-w-xl">{report.overall}</p>
      </div>
      <div className="text-center shrink-0">
        <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center ${
          report.score >= 80 ? 'border-emerald-400 text-emerald-700' : report.score >= 60 ? 'border-amber-400 text-amber-700' : 'border-red-300 text-red-600'
        }`}>
          <span className="text-3xl font-serif font-bold">{report.score}</span>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mt-2">/ 100</p>
      </div>
    </div>

    {/* Focus tip */}
    <div className="bg-stone-900 text-stone-100 rounded-2xl p-6 flex items-start gap-4">
      <Lightbulb className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Focus Next</p>
        <p className="font-serif leading-relaxed">{report.focusTip}</p>
      </div>
    </div>

    {/* Grammar & expression */}
    {report.grammar.length > 0 && (
      <section className="bg-white rounded-2xl border border-stone-100 shadow-sm p-8 space-y-5">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.25em] text-stone-400 flex items-center gap-2">
          <Award className="w-4 h-4" /> Grammar & Expression
        </h3>
        {report.grammar.map((g, i) => (
          <div key={i} className="border-l-2 border-amber-300 pl-4 space-y-1">
            <p className="text-stone-400 font-serif italic line-through decoration-stone-300">"{g.quote}"</p>
            <p className="text-stone-900 font-serif font-semibold">"{g.fix}"</p>
            <p className="text-xs text-stone-500">{g.why}</p>
          </div>
        ))}
      </section>
    )}

    {/* Pronunciation */}
    <section className="bg-white rounded-2xl border border-stone-100 shadow-sm p-8 space-y-5">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.25em] text-stone-400 flex items-center gap-2">
        <Mic className="w-4 h-4" /> Pronunciation — from your actual audio
      </h3>
      {report.pronunciation.length === 0 ? (
        <p className="text-stone-500 font-serif italic">Clean and clear — no notable pronunciation issues in the reviewed clips. 🎉</p>
      ) : (
        report.pronunciation.map((p, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="shrink-0 text-xs font-bold bg-stone-100 text-stone-500 px-2 py-1 rounded-full">clip {p.clipIndex + 1}</span>
            <div className="text-sm text-stone-700 leading-relaxed space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-serif font-bold text-stone-900 text-base">{p.word}</span>
                {p.ipa && <span className="font-mono text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">{p.ipa}</span>}
                <SayButton text={p.word} />
              </div>
              {p.heardAs && <p className="text-xs text-stone-400">You said: <span className="font-mono line-through decoration-stone-300">{p.heardAs}</span></p>}
              <p className="text-stone-500">{p.note}</p>
            </div>
          </div>
        ))
      )}
    </section>

    {/* Idiomatic upgrades */}
    {report.idioms.length > 0 && (
      <section className="bg-white rounded-2xl border border-stone-100 shadow-sm p-8 space-y-5">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.25em] text-stone-400 flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Say It Like a Native
        </h3>
        {report.idioms.map((u, i) => (
          <div key={i} className="border-b border-stone-50 pb-4 last:border-0 last:pb-0 space-y-2">
            <div className="grid md:grid-cols-2 gap-2 md:gap-6 items-start">
              <p className="text-stone-500 font-serif italic">"{u.original}"</p>
              <p className="text-stone-900 font-serif font-semibold">"{u.upgraded}"</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap md:pl-[calc(50%+0.75rem)]">
              {u.why && <p className="text-xs text-stone-500 basis-full">{u.why}</p>}
              <SayButton text={u.upgraded} />
              <SavePhraseButton original={u.original} upgraded={u.upgraded} why={u.why} topic={plan.topic} mode={modeLabel} onChanged={onPhrasesChanged} />
            </div>
          </div>
        ))}
      </section>
    )}

    {/* Target words */}
    <section className="bg-white rounded-2xl border border-stone-100 shadow-sm p-8 space-y-4">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.25em] text-stone-400 flex items-center gap-2">
        <Target className="w-4 h-4" /> Target Words
      </h3>
      {report.targetWords.map(t => (
        <div key={t.word} className="flex items-start gap-3">
          {t.usedWell
            ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            : <XCircle className={`w-5 h-5 shrink-0 mt-0.5 ${t.used ? 'text-amber-500' : 'text-stone-300'}`} />}
          <div>
            <p className="font-serif font-bold text-stone-900 capitalize text-sm">
              {t.word}
              {t.usedWell && <span className="ml-2 text-[10px] font-bold text-emerald-700 uppercase tracking-wide">🗣️ Can Speak — synced to LexiAI</span>}
            </p>
            <p className="text-sm text-stone-500">{t.comment}</p>
          </div>
        </div>
      ))}
    </section>

    <div className="flex gap-3 justify-center pt-2">
      <button onClick={onHome} className="px-6 py-3 border border-stone-300 rounded-full text-sm font-bold text-stone-600 hover:border-stone-500 transition-colors flex items-center gap-2">
        <ArrowLeft className="w-4 h-4" /> Home
      </button>
      <button onClick={onNewSession} className="px-6 py-3 bg-stone-900 text-white rounded-full text-sm font-bold hover:bg-black transition-colors flex items-center gap-2">
        <RotateCcw className="w-4 h-4" /> Another Round
      </button>
    </div>
  </div>
);
