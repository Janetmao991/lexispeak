
import React, { useState, useEffect, useRef } from 'react';
import { ModeDef, SessionPlan, Turn, FeedbackReport } from '../types';
import { planSession, nextTurns, transcribeAudio, gradeSession, speakSafe, stopSpeech, friendlyError } from '../services/geminiService';
import { startRecording, RecorderHandle } from '../services/recorderService';
import { Mic, Square, Send, Loader2, Volume2, VolumeX, Flag, Shuffle, ArrowLeft } from 'lucide-react';

interface SessionProps {
  mode: ModeDef;
  role?: string;
  candidateWords: string[];
  onFinished: (plan: SessionPlan, history: Turn[], report: FeedbackReport) => void;
  onExit: () => void;
}

type Phase = 'planning' | 'chatting' | 'grading' | 'error';

const personaColor = (mode: ModeDef, speaker: string): string => {
  const idx = mode.personas.findIndex(p => p.name === speaker);
  return idx === 1 ? 'bg-amber-50 text-stone-800 rounded-bl-sm border border-amber-100' : 'bg-stone-100 text-stone-800 rounded-bl-sm';
};

export const Session: React.FC<SessionProps> = ({ mode, role, candidateWords, onFinished, onExit }) => {
  const [phase, setPhase] = useState<Phase>('planning');
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [history, setHistory] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<RecorderHandle | null>(null);
  const pendingAudio = useRef<{ base64: string; mime: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;

  const voiceOf = (speaker: string) => mode.personas.find(p => p.name === speaker)?.voice || 'Puck';

  const speakTurns = async (turns: { speaker: string; text: string }[]) => {
    if (!voiceOnRef.current) return;
    for (const t of turns) {
      await speakSafe(t.text, voiceOf(t.speaker));
    }
  };

  const start = async () => {
    setPhase('planning');
    setHistory([]);
    setError(null);
    try {
      const newPlan = await planSession(mode, candidateWords, role);
      setPlan(newPlan);
      const opener: Turn = { speaker: newPlan.opener.speaker, text: newPlan.opener.text };
      setHistory([opener]);
      setPhase('chatting');
      speakTurns([opener]);
    } catch (e: any) {
      setError(friendlyError(String(e?.message || '')));
      setPhase('error');
    }
  };

  useEffect(() => {
    start();
    return () => { recRef.current?.cancel(); stopSpeech(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [history, sending, transcribing]);

  const userTurns = history.filter(t => t.speaker === 'You').length;

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !plan || sending) return;
    stopSpeech();
    setInput('');
    const audio = pendingAudio.current;
    pendingAudio.current = null;
    const userTurn: Turn = { speaker: 'You', text: trimmed, audioBase64: audio?.base64, audioMime: audio?.mime };
    const newHistory = [...history, userTurn];
    setHistory(newHistory);
    setSending(true);
    setError(null);
    try {
      const replies = await nextTurns(mode, plan, newHistory, role);
      setHistory(prev => [...prev, ...replies]);
      speakTurns(replies);
    } catch (e: any) {
      setError(friendlyError(String(e?.message || '')));
    } finally {
      setSending(false);
    }
  };

  const toggleMic = async () => {
    if (recording) {
      setRecording(false);
      setTranscribing(true);
      try {
        const rec = await recRef.current!.stop();
        const text = await transcribeAudio(rec.base64, rec.mimeType);
        if (!text) throw new Error("Didn't catch any speech — try again, a bit louder.");
        pendingAudio.current = { base64: rec.base64, mime: rec.mimeType };
        setInput(prev => (prev ? prev + ' ' : '') + text);
      } catch (e: any) {
        setError(friendlyError(String(e?.message || '')));
      } finally {
        setTranscribing(false);
        recRef.current = null;
      }
    } else {
      setError(null);
      stopSpeech();
      try {
        recRef.current = await startRecording();
        setRecording(true);
      } catch {
        setError('Could not access the microphone. Please allow mic access and try again.');
      }
    }
  };

  const finish = async () => {
    if (!plan) return;
    stopSpeech();
    setPhase('grading');
    try {
      const report = await gradeSession(history, plan.targetWords);
      onFinished(plan, history, report);
    } catch (e: any) {
      setError(friendlyError(String(e?.message || '')));
      setPhase('chatting');
    }
  };

  const wordUsed = (w: string) => {
    const all = history.filter(t => t.speaker === 'You').map(t => t.text).join(' ').toLowerCase();
    const pattern = w.toLowerCase().trim().split(/\s+/)
      .map(t => (t.length > 4 ? t.slice(0, t.length - 2) : t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "[a-z']*")
      .join('\\s+');
    return new RegExp(`\\b${pattern}`, 'i').test(all);
  };

  if (phase === 'planning') {
    return (
      <div className="max-w-2xl mx-auto py-24 text-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-stone-400 mx-auto" />
        <p className="text-stone-500 font-serif">Setting up your {mode.label.toLowerCase()} session…</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="max-w-md mx-auto py-24 text-center space-y-5">
        <p className="text-amber-700 text-sm">{error}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={onExit} className="px-5 py-2.5 border border-stone-300 rounded-full text-sm font-bold text-stone-600 hover:border-stone-500">Back</button>
          <button onClick={start} className="px-5 py-2.5 bg-stone-900 text-white rounded-full text-sm font-bold hover:bg-black">Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 px-4">
      {/* Header: topic + targets */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-stone-100 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <button onClick={onExit} className="p-2 rounded-full text-stone-400 hover:text-stone-900 hover:bg-stone-100" title="Leave session">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{mode.label}{role ? ` · ${role}` : ''}</p>
              <p className="font-serif font-bold text-stone-900">{plan?.topic}</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (userTurns > 0 && !window.confirm('Start over with a new topic?')) return;
              stopSpeech();
              start();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-stone-200 bg-stone-50 text-xs font-bold text-stone-500 hover:text-stone-900 hover:border-stone-400 transition-all"
          >
            <Shuffle className="w-3 h-3" /> New Topic
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {plan?.targetWords.map(w => (
            <span key={w} className={`text-xs font-bold px-3 py-1 rounded-full border capitalize transition-all ${
              wordUsed(w) ? 'bg-emerald-50 text-emerald-700 border-emerald-200 line-through decoration-2' : 'bg-stone-50 text-stone-600 border-stone-200'
            }`}>
              {wordUsed(w) ? '✓ ' : ''}{w}
            </span>
          ))}
        </div>
      </div>

      {/* Chat */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 flex flex-col" style={{ height: 'min(30rem, 55vh)' }}>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
          {history.map((t, i) => (
            <div key={i} className={`flex ${t.speaker === 'You' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[82%]">
                {t.speaker !== 'You' && mode.personas.length > 1 && (
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1 ml-1">{t.speaker}</p>
                )}
                <div className={`px-4 py-3 rounded-2xl text-[15px] leading-relaxed font-serif ${
                  t.speaker === 'You' ? 'bg-stone-900 text-white rounded-br-sm' : personaColor(mode, t.speaker)
                }`}>
                  {t.text}
                </div>
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-stone-100 px-4 py-3 rounded-2xl rounded-bl-sm">
                <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-stone-100 p-4 space-y-2">
          {error && <p className="text-xs text-amber-700">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMic}
              disabled={transcribing || sending}
              className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                recording ? 'bg-red-600 text-white animate-pulse' : 'bg-stone-900 text-white hover:bg-black'
              } disabled:opacity-40`}
              title={recording ? 'Stop and transcribe' : 'Speak'}
            >
              {transcribing ? <Loader2 className="w-5 h-5 animate-spin" /> : recording ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send(input); }}
              placeholder={recording ? 'Listening… tap the square when done' : transcribing ? 'Transcribing…' : 'Speak (preferred) or type…'}
              className="flex-1 p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-1 focus:ring-stone-400 text-[15px]"
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || sending}
              className="shrink-0 w-12 h-12 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center hover:bg-stone-200 disabled:opacity-40 transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <button onClick={() => { setVoiceOn(!voiceOn); if (voiceOn) stopSpeech(); }} className="text-xs text-stone-400 hover:text-stone-700 flex items-center gap-1">
              {voiceOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              {voiceOn ? 'Voices on' : 'Voices off'}
            </button>
            <button
              onClick={finish}
              disabled={userTurns < 3 || phase === 'grading'}
              title={userTurns < 3 ? 'Speak at least 3 times first' : 'End and get your coaching report'}
              className="text-xs font-bold text-stone-500 hover:text-stone-900 disabled:opacity-40 flex items-center gap-1"
            >
              {phase === 'grading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flag className="w-3.5 h-3.5" />} End & Get Coaching Report
            </button>
          </div>
        </div>
      </div>

      {phase === 'grading' && (
        <p className="text-center text-sm text-stone-400 animate-pulse">Your coach is reviewing the transcript and listening to your audio…</p>
      )}
    </div>
  );
};
