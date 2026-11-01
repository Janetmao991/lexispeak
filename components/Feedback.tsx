
import React, { useState } from 'react';
import { FeedbackReport, SessionPlan, GrammarNote, IdiomUpgrade, TargetWordVerdict } from '../types';
import { Award, Mic, Sparkles, Target, Lightbulb, ArrowLeft, RotateCcw, CheckCircle2, XCircle, Volume2, Loader2, BookmarkPlus, BookmarkCheck, Quote } from 'lucide-react';
import { speakSafe } from '../services/geminiService';
import { phrasesService } from '../services/phrasesService';
import { IS_DEMO } from '../services/demo';

interface FeedbackProps {
  report: FeedbackReport;
  plan: SessionPlan;
  /** Everything the learner said, in order (may be empty for pre-transcript history records). */
  transcript?: string[];
  /** Lower-cased target word → its sense from the LexiAI notebook, shown in the green tooltip. */
  wordSenses?: Record<string, string>;
  modeLabel: string;
  onPhrasesChanged?: () => void;
  onNewSession: () => void;
  onHome: () => void;
}

// LexiAI / Writing Station green — "target word used well".
const GREEN = '#3d7a52';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const IRREGULAR: Record<string, string[]> = {
  go: ['go', 'goes', 'going', 'went', 'gone'], be: ['be', 'is', 'am', 'are', 'was', 'were', 'been', 'being'],
  take: ['take', 'takes', 'taking', 'took', 'taken'], make: ['make', 'makes', 'making', 'made'],
  get: ['get', 'gets', 'getting', 'got', 'gotten'], run: ['run', 'runs', 'running', 'ran'],
  come: ['come', 'comes', 'coming', 'came'], give: ['give', 'gives', 'giving', 'gave', 'given'],
  keep: ['keep', 'keeps', 'keeping', 'kept'], put: ['put', 'puts', 'putting'], set: ['set', 'sets', 'setting'],
};
// One word of a target phrase, allowing everyday inflections: mull → mulled, gauge → gauging.
const tokenPattern = (tok: string): string => {
  if (IRREGULAR[tok]) return `(?:${IRREGULAR[tok].join('|')})`;
  if (tok.length <= 3) return `${escapeRe(tok)}(?:s|es)?`;
  const stem = tok.endsWith('e') ? tok.slice(0, -1) : tok.endsWith('y') ? tok.slice(0, -1) : tok;
  const tail = tok.endsWith('e') ? '(?:e|es|ed|ing)' : tok.endsWith('y') ? '(?:y|ies|ied|ying)' : `(?:${escapeRe(tok.slice(-1))}?(?:s|es|ed|ing))?`;
  return escapeRe(stem) + tail;
};
// Find a target word/phrase in a turn. Phrasal verbs may be split by one short word ("mulled it over").
const findTarget = (text: string, word: string): { start: number; end: number } | null => {
  const toks = word.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length || word.trim().length < 3) return null;
  const re = new RegExp(`\\b${toks.map(tokenPattern).join(String.raw`(?:\s+[a-z']{1,6})?\s+`)}\\b`, 'i');
  const m = re.exec(text);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
};

type MarkKind = 'grammar' | 'idiom' | 'target';
type Mark = { start: number; end: number; kind: MarkKind; label: string; tip: string; target?: { label: string; tip: string } };

const MARK_STYLE: Record<MarkKind, string> = {
  grammar: 'bg-red-50 text-red-700 decoration-red-300',
  idiom: 'bg-amber-50 text-amber-800 decoration-amber-300',
  target: 'bg-[#3d7a52]/10 text-[#2f6040] decoration-[#3d7a52]/50',
};
const TIP_LABEL_STYLE: Record<MarkKind, string> = { grammar: 'text-red-300', idiom: 'text-amber-300', target: 'text-[#8fc9a2]' };

// A highlighted span with a tooltip that opens on hover, keyboard focus, or tap.
const Highlight: React.FC<{ mark: Mark; children: React.ReactNode }> = ({ mark, children }) => (
  <span
    tabIndex={0}
    aria-label={`${mark.label}: ${mark.tip}${mark.target ? ` · ${mark.target.label}` : ''}`}
    className={`group relative underline decoration-2 underline-offset-2 rounded-sm px-0.5 cursor-help outline-none focus-visible:ring-2 focus-visible:ring-stone-300 ${MARK_STYLE[mark.kind]}`}
  >
    {children}
    {mark.target && (
      <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full align-super ml-0.5" style={{ backgroundColor: GREEN }} />
    )}
    <span
      role="tooltip"
      className="pointer-events-none invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 transition-opacity absolute left-0 bottom-full mb-2 z-20 w-64 max-w-[80vw] bg-stone-900 text-stone-100 rounded-xl px-3 py-2 shadow-lg font-sans text-xs leading-snug not-italic no-underline whitespace-normal text-left"
    >
      <span className={`block text-[10px] font-bold uppercase tracking-wider mb-0.5 ${TIP_LABEL_STYLE[mark.kind]}`}>{mark.label}</span>
      <span className="block">{mark.tip}</span>
      {mark.target && (
        <span className="block mt-1.5 pt-1.5 border-t border-stone-700">
          <span className={`block text-[10px] font-bold uppercase tracking-wider mb-0.5 ${TIP_LABEL_STYLE.target}`}>{mark.target.label}</span>
          {mark.target.tip && <span className="block">{mark.target.tip}</span>}
        </span>
      )}
    </span>
  </span>
);

// Mark up one spoken turn: grammar errors in red, "a native would say it differently" in amber,
// target words in green. When a target word sits inside an error/amber span, the error wins
// and a small green dot marks the target word. Tooltips carry the fix, so the transcript reads
// as a conclusive review.
const annotateTurn = (
  text: string, grammar: GrammarNote[], idioms: IdiomUpgrade[], targets: TargetWordVerdict[], senses: Record<string, string>,
): React.ReactNode => {
  const marks: Mark[] = [];
  const lower = text.toLowerCase();
  const add = (needle: string, kind: MarkKind, label: string, tip: string) => {
    const n = needle.trim().toLowerCase();
    if (n.length < 3) return;
    const idx = lower.indexOf(n);
    if (idx >= 0) marks.push({ start: idx, end: idx + n.length, kind, label, tip });
  };
  grammar.forEach(g => add(g.quote, 'grammar', 'Error — needs fixing', `→ "${g.fix}" — ${g.why}`));
  idioms.forEach(u => add(u.original, 'idiom', 'A native would say it differently', `→ "${u.upgraded}"${u.why ? ' — ' + u.why : ''}`));
  marks.sort((a, b) => a.start - b.start);
  const kept: Mark[] = [];
  for (const m of marks) if (!kept.length || m.start >= kept[kept.length - 1].end) kept.push(m);

  // Target words: green on their own; a green dot when they overlap an error/amber span.
  targets.filter(t => t.used).forEach(t => {
    const hit = findTarget(text, t.word);
    if (!hit) return;
    const sense = senses[t.word.toLowerCase()];
    const label = t.usedWell ? 'Target word · used well' : 'Target word · not quite right yet';
    const tip = [`"${t.word}"${sense ? ` — ${sense}` : ''}`, t.usedWell ? '' : t.comment].filter(Boolean).join('. ');
    const overlap = kept.find(m => hit.start < m.end && m.start < hit.end);
    if (overlap) { if (!overlap.target) overlap.target = { label, tip }; return; }
    if (!t.usedWell) return; // green highlight is reserved for words used well
    kept.push({ ...hit, kind: 'target', label, tip });
  });
  kept.sort((a, b) => a.start - b.start);

  if (!kept.length) return text;
  const out: React.ReactNode[] = [];
  let pos = 0;
  kept.forEach((m, i) => {
    if (m.start > pos) out.push(text.slice(pos, m.start));
    out.push(<Highlight key={i} mark={m}>{text.slice(m.start, m.end)}</Highlight>);
    pos = m.end;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return out;
};

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

export const Feedback: React.FC<FeedbackProps> = ({ report, plan, transcript, wordSenses, modeLabel, onPhrasesChanged, onNewSession, onHome }) => {
  const senses: Record<string, string> = wordSenses ?? {};
  return (
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

    {/* Everything you said — annotated transcript */}
    {transcript && transcript.length > 0 && (
      <section className="bg-white rounded-2xl border border-stone-100 shadow-sm p-8 space-y-5">
        <div className="space-y-1">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.25em] text-stone-400 flex items-center gap-2">
            <Quote className="w-4 h-4" /> Everything You Said
          </h3>
          <p className="text-sm text-stone-500 font-serif">Your words, marked up by your coach. Hover or tap any highlight for the details.</p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-stone-600 bg-stone-50 rounded-xl px-4 py-3">
          <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-300 shrink-0"></span><span><b className="text-red-700">Error</b> — needs fixing</span></span>
          <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-300 shrink-0"></span><span><b className="text-amber-800">Correct</b>, but a native would say it differently</span></span>
          <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: GREEN }}></span><span><b style={{ color: GREEN }}>Target word</b> used well</span></span>
        </div>
        <div className="space-y-4">
          {transcript.map((t, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="shrink-0 text-[10px] font-bold text-stone-300 font-mono mt-1.5 w-5 text-right">{i + 1}</span>
              <p className="font-serif text-stone-800 leading-relaxed text-[15px]">
                {annotateTurn(t, report.grammar, report.idioms, report.targetWords, senses)}
              </p>
            </div>
          ))}
        </div>
        <p className="text-xs text-stone-400">A small green dot means a target word sits inside an error or amber note — the fix comes first. Details in the sections below.</p>
      </section>
    )}

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
              {t.usedWell && <span className="ml-2 text-[10px] font-bold text-emerald-700 uppercase tracking-wide">🗣️ Can Speak{IS_DEMO ? '' : ' — synced to LexiAI'}</span>}
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
};
