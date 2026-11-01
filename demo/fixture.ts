// Demo fixture: everything a ?demo=1 visitor sees. Pre-written, so the demo makes no
// network calls. Loaded with a dynamic import (see services/demo.ts) — its own chunk.
import type { FeedbackReport, ModeId, SavedPhrase, SessionPlan, SessionRecord, Turn, WordLite } from '../types';

export interface DemoScript {
  mode: ModeId;
  role?: string;
  plan: SessionPlan;
  /** The whole conversation, played back one line at a time. Free Talk lines carry live fixes. */
  turns: Turn[];
  report: FeedbackReport;
}

export interface DemoFixture {
  words: WordLite[];
  scripts: DemoScript[];
  history: SessionRecord[];
  phrases: SavedPhrase[];
}

// A sample LexiAI notebook — three are already "Can Speak".
const WORDS: WordLite[] = [
  { word: 'bludgeon', definition: 'to force someone into doing something, especially by bullying them', speakingPassed: true, inRotation: true },
  { word: 'mull over', definition: 'to think carefully about something over a period of time', speakingPassed: false, inRotation: true },
  { word: 'stretched thin', definition: 'having too much to do with too few resources', speakingPassed: false, inRotation: true },
  { word: 'appall', definition: 'to make someone feel shocked and disgusted', speakingPassed: true, inRotation: true },
  { word: 'go against the grain', definition: 'to be different from what is normal or expected', speakingPassed: false, inRotation: true },
  { word: 'gauge', definition: 'to judge or estimate something, such as a feeling or a situation', speakingPassed: false, inRotation: true },
  { word: 'headwind', definition: 'a force or situation that slows progress', speakingPassed: true, inRotation: false },
  { word: 'clip', definition: 'speed (e.g. "at a rapid clip")', speakingPassed: false, inRotation: false },
];

// ---- Free Talk: weekend hiking trip, with live grammar fixes under each line ----
const FREE_TURNS: Turn[] = [
  { speaker: 'Alex', text: 'Hey! What have you been up to lately?' },
  {
    speaker: 'You',
    text: 'I just come back from a hiking trip in Yosemite last weekend. It was so much fun but very tired.',
    fixes: [
      { quote: 'I just come back', fix: 'I just got back', why: 'the trip is finished, so use the past' },
      { quote: 'but very tired', fix: 'but really tiring', why: 'the trip was tiring; you were tired' },
    ],
  },
  { speaker: 'Alex', text: 'Oh nice, Yosemite! Which trail did you do? And did you camp, or stay somewhere comfy?' },
  {
    speaker: 'You',
    text: "We did the Mist Trail. We camped two nights, honestly the tent was not very comfortable and I didn't sleep good.",
    fixes: [
      { quote: "I didn't sleep good", fix: "I didn't sleep well", why: '"well" is the adverb for how you did something' },
    ],
  },
  { speaker: 'Alex', text: 'Ha, the classic camping trade-off — gorgeous views, terrible sleep. Was it crowded?' },
  {
    speaker: 'You',
    text: 'Yes, very crowded. There were so many peoples on the trail that we had to wait in line on the stairs.',
    fixes: [
      { quote: 'so many peoples', fix: 'so many people', why: '"people" is already plural' },
    ],
  },
  { speaker: 'Alex', text: "That's Yosemite in the fall for you. Would you go back, or are you more of a beach person now?" },
  {
    speaker: 'You',
    text: "I would go back, but next time I want to go on weekday to avoid the crowd. Also I'm mulling over to buy a better sleeping pad.",
    fixes: [
      { quote: 'on weekday', fix: 'on a weekday', why: 'a singular countable noun needs "a"' },
      { quote: 'mulling over to buy', fix: 'mulling over buying', why: '"mull over" takes a noun or an -ing form' },
    ],
  },
  { speaker: 'Alex', text: 'Smart — weekdays are a totally different park. And yes, a good pad changes everything. Any brand in mind?' },
  { speaker: 'You', text: "Not yet, I'm still comparing. My friend recommended one but it's quite expensive, so I need to think about it." },
  { speaker: 'Alex', text: 'Totally fair — sleep on it. On your old pad, I guess!' },
];

const FREE_REPORT: FeedbackReport = {
  score: 78,
  overall: 'Easy, natural storytelling — you kept the conversation going and answered every follow-up with real detail. The slips were small and mostly about verb forms, not vocabulary.',
  focusTip: 'When you talk about something that already happened, lock in the past tense from the first verb: "I just got back", "it was really tiring", "I didn\'t sleep well".',
  grammar: FREE_TURNS.flatMap(t => t.fixes ?? []),
  pronunciation: [
    { clipIndex: 1, word: 'comfortable', ipa: '/ˈkʌmf.tə.bəl/', heardAs: '/kʌmˈfɔːr.teɪ.bəl/', note: 'Natives squeeze it to three syllables — KUMF-tuh-bul. Stress the first syllable, and the "or" almost disappears.' },
    { clipIndex: 2, word: 'crowded', ipa: '/ˈkraʊ.dɪd/', heardAs: '/kraʊd/', note: 'After a "d" sound, the -ed ending is its own syllable: CROW-did. Without it, it sounds like "crowd".' },
  ],
  idioms: [
    { original: 'It was so much fun', upgraded: 'It was a blast', why: 'Casual and warm — the go-to way to say a trip or party was great.' },
    { original: 'very crowded', upgraded: 'absolutely packed', why: '"Packed" is what people actually say about trails, bars and trains.' },
    { original: 'I need to think about it', upgraded: 'I need to sleep on it', why: 'Natural for a decision you want to make tomorrow, not right now.' },
  ],
  targetWords: [],
};

// ---- Interview: investment banking analyst, with target words from the notebook ----
const INTERVIEW_TURNS: Turn[] = [
  { speaker: 'Morgan', text: 'Thanks for coming in. To start, walk me through why you want to be an investment banking analyst.' },
  { speaker: 'You', text: 'Sure. During my internship at a mid-size advisory firm, I worked on two sell-side deals and I really enjoyed to build the models and see how they shape the negotiation.' },
  { speaker: 'Morgan', text: 'Good. Banking hours are brutal, though. Tell me about a time you had too much on your plate.' },
  { speaker: 'You', text: 'Last summer I was stretched thin — I was supporting two deal teams at the same time, and one of them had a deadline moved up by a week.' },
  { speaker: 'Morgan', text: 'How did you decide what came first?' },
  { speaker: 'You', text: 'I mulled over it for a moment, then I asked both VPs so I could gauge which deliverable was more urgent. I made a clear schedule and shared it with them.' },
  { speaker: 'Morgan', text: 'Makes sense. Tell me about a time you disagreed with the rest of the team.' },
  { speaker: 'You', text: 'In a pitch for a software client, everyone want to show a higher valuation range. I knew my number would go against the grain, so I make sure the comps backed it up before I said anything.' },
  { speaker: 'Morgan', text: 'And what happened?' },
  { speaker: 'You', text: 'The MD agreed to show both ranges. Later the client told us the lower range was more realistic, because of the rate headwinds in their sector.' },
  { speaker: 'Morgan', text: 'Nice. Last one — where do you see yourself in three years?' },
  { speaker: 'You', text: 'I hope to be a strong associate who can run the process end to end and also teach the new analysts.' },
  { speaker: 'Morgan', text: "Great — that's all from me. Thanks, this was a really good conversation." },
];

const INTERVIEW_REPORT: FeedbackReport = {
  score: 84,
  overall: 'Structured, specific answers with real deal detail — exactly what an interviewer wants. "Stretched thin" and "go against the grain" landed naturally. Tighten a few verb forms and you will sound fully polished.',
  focusTip: 'Your stories are strong; keep every verb in the past once the story starts ("everyone wanted", "I made sure"). Tense slips are what an interviewer notices first.',
  grammar: [
    { quote: 'enjoyed to build', fix: 'enjoyed building', why: '"enjoy" is always followed by an -ing form' },
    { quote: 'I mulled over it', fix: 'I mulled it over', why: 'with a pronoun, the object goes in the middle of a phrasal verb' },
    { quote: 'everyone want', fix: 'everyone wanted', why: 'past story, and "everyone" takes a singular verb' },
    { quote: 'I make sure', fix: 'I made sure', why: 'keep the story in the past tense' },
  ],
  pronunciation: [
    { clipIndex: 0, word: 'negotiation', ipa: '/nɪˌɡoʊ.ʃiˈeɪ.ʃən/', heardAs: '/nɪˌɡoʊ.siˈeɪ.ʃən/', note: 'The middle is "sh", not "s": ne-GO-shee-AY-shun.' },
    { clipIndex: 2, word: 'gauge', ipa: '/ɡeɪdʒ/', heardAs: '/ɡɔːdʒ/', note: 'Spelled with "au" but rhymes with "page" — one syllable, long A.' },
    { clipIndex: 5, word: 'associate', ipa: '/əˈsoʊ.ʃi.ət/', heardAs: '/əˈsoʊ.ʃi.eɪt/', note: 'As a noun (the job title) it ends in a soft "-ut". The "-ate" ending is the verb.' },
  ],
  idioms: [
    { original: 'I made a clear schedule and shared it with them', upgraded: 'I laid out a clear timeline and looped them both in', why: '"Loop someone in" is everyday office English for keeping people informed.' },
    { original: 'The MD agreed to show both ranges', upgraded: 'The MD agreed to put both ranges in front of the client', why: 'Sounds like someone who has actually sat in a pitch meeting.' },
    { original: 'run the process end to end', upgraded: 'quarterback a deal from kickoff to close', why: 'Common banking shorthand for owning a whole transaction.' },
  ],
  targetWords: [
    { word: 'stretched thin', used: true, usedWell: true, comment: 'Perfect — natural, and exactly the right situation for it.' },
    { word: 'go against the grain', used: true, usedWell: true, comment: '"My number would go against the grain" — idiomatic and well placed.' },
    { word: 'gauge', used: true, usedWell: true, comment: 'Used correctly to mean "judge" — watch the pronunciation (rhymes with "page").' },
    { word: 'mull over', used: true, usedWell: false, comment: 'Right meaning, but with "it" say "I mulled it over", not "mulled over it".' },
  ],
};

const SCRIPTS: DemoScript[] = [
  {
    mode: 'free',
    plan: { topic: 'Free talk', opener: FREE_TURNS[0], targetWords: [] },
    turns: FREE_TURNS,
    report: FREE_REPORT,
  },
  {
    mode: 'interview',
    role: 'Investment Banking Analyst',
    plan: {
      topic: 'Why banking — and how you handle pressure',
      opener: INTERVIEW_TURNS[0],
      targetWords: ['stretched thin', 'go against the grain', 'mull over', 'gauge'],
    },
    turns: INTERVIEW_TURNS,
    report: INTERVIEW_REPORT,
  },
];

const spoken = (turns: Turn[]) => turns.filter(t => t.speaker === 'You').map(t => t.text);

export const buildDemoFixture = (): DemoFixture => {
  const daysAgo = (n: number) => Date.now() - n * 86400000;
  return {
    words: WORDS,
    scripts: SCRIPTS,
    history: [
      { id: 'demo_interview', mode: 'interview', topic: SCRIPTS[1].plan.topic, date: new Date(daysAgo(2)).toISOString(),
        userTurns: spoken(INTERVIEW_TURNS).length, report: INTERVIEW_REPORT, transcript: spoken(INTERVIEW_TURNS) },
      { id: 'demo_free', mode: 'free', topic: 'Free talk', date: new Date(daysAgo(5)).toISOString(),
        userTurns: spoken(FREE_TURNS).length, report: FREE_REPORT, transcript: spoken(FREE_TURNS) },
    ],
    phrases: [
      { id: 'demo_p1', original: 'I made a clear schedule and shared it with them', upgraded: 'I laid out a clear timeline and looped them both in',
        why: INTERVIEW_REPORT.idioms[0].why, savedAt: daysAgo(2), topic: SCRIPTS[1].plan.topic, mode: 'Interview' },
      { id: 'demo_p2', original: 'It was so much fun', upgraded: 'It was a blast',
        why: FREE_REPORT.idioms[0].why, savedAt: daysAgo(5), topic: 'Free talk', mode: 'Free Talk' },
      { id: 'demo_p3', original: 'I need to think about it', upgraded: 'I need to sleep on it',
        why: FREE_REPORT.idioms[2].why, savedAt: daysAgo(5), topic: 'Free talk', mode: 'Free Talk' },
      { id: 'demo_p4', original: 'We are short on people', upgraded: "We're stretched thin right now",
        why: 'Admits the team is overloaded without sounding like a complaint.', savedAt: daysAgo(9), topic: 'Staffing a new launch', mode: 'Business Talk' },
    ],
  };
};
