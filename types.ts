import { ReactElement } from 'react';

export interface Agent {
  id: string;
  name: string;
  description: string;
  systemInstruction: string;
  icon: ReactElement;
}

export interface ChatMessage {
    role: 'user' | 'model';
    content: string;
}

export interface TranscriptionEntry {
    speaker: 'user' | 'model';
    text: string;
}

export interface Voice {
  id: string;
  name: string;
}

export interface Language {
  id: string;
  name: string;
}
