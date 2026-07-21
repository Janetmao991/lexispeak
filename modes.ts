import { ModeDef } from './types';

export const MODES: ModeDef[] = [
  {
    id: 'casual',
    label: 'Casual Chat',
    tagline: 'Everyday conversation with a curious friend',
    personas: [
      { name: 'Alex', voice: 'Puck', style: 'warm, curious, playful friend who asks good follow-ups' },
    ],
  },
  {
    id: 'interview',
    label: 'Interview',
    tagline: 'Mock interview for your target role',
    needsRole: true,
    personas: [
      { name: 'Morgan', voice: 'Charon', style: 'professional, structured interviewer; friendly but probing, asks one question at a time' },
    ],
  },
  {
    id: 'business',
    label: 'Business Talk',
    tagline: 'Debate a real workplace decision',
    personas: [
      { name: 'Sam', voice: 'Kore', style: 'sharp, data-minded colleague who respectfully pushes back and plays devil\'s advocate' },
    ],
  },
  {
    id: 'group',
    label: 'Group Discussion',
    tagline: 'Three-way roundtable — hold your ground',
    personas: [
      { name: 'Alex', voice: 'Puck', style: 'optimistic, big-picture thinker' },
      { name: 'Jordan', voice: 'Kore', style: 'skeptical pragmatist who challenges assumptions' },
    ],
  },
];
