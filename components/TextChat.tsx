import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Chat, GenerateContentResponse, Modality } from '@google/genai';
import { Agent, ChatMessage, Voice, Language } from '../types';
import { SendIcon, SpeakerIcon, StopIcon, SpinnerIcon, ChevronDownIcon, CheckIcon } from './Icons';
import { TTS_VOICES, LANGUAGES } from '../constants';

// --- Audio Helper Functions for TTS ---
function decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

async function decodePCMAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}


// --- Component ---
interface TextChatProps {
    agent: Agent;
}

type AudioState = 'idle' | 'loading' | 'playing' | 'error';

const TextChat: React.FC<TextChatProps> = ({ agent }) => {
    const [chat, setChat] = useState<Chat | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    // TTS State
    const [selectedVoice, setSelectedVoice] = useState<Voice>(TTS_VOICES[0]);
    const [audioState, setAudioState] = useState<AudioState>('idle');
    const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
    const [audioError, setAudioError] = useState<string | null>(null);
    
    // Language Tutor State
    const [selectedLanguage, setSelectedLanguage] = useState<Language>(LANGUAGES[0]);

    const audioContextRef = useRef<AudioContext | null>(null);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const getSystemInstruction = useCallback(() => {
        if (agent.id === 'language_tutor') {
            return agent.systemInstruction.replace(/{language}/g, selectedLanguage.name);
        }
        return agent.systemInstruction;
    }, [agent, selectedLanguage]);

    useEffect(() => {
        const initChat = () => {
            try {
                const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
                const newChat = ai.chats.create({
                    model: 'gemini-2.5-flash',
                    config: {
                        systemInstruction: getSystemInstruction(),
                    },
                });
                setChat(newChat);
                setMessages([]);
            } catch (error) {
                console.error("Failed to initialize chat:", error);
                setMessages([{ role: 'model', content: 'Error: Could not initialize chat session.' }]);
            }
        };
        initChat();
    }, [agent, selectedLanguage, getSystemInstruction]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !chat || isLoading) return;

        const userMessage: ChatMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        const currentInput = input;
        setInput('');
        setIsLoading(true);

        // Add a placeholder for the model's response
        setMessages(prev => [...prev, { role: 'model', content: '' }]);

        try {
            const responseStream = await chat.sendMessageStream({ message: currentInput });
            let accumulatedText = '';
            for await (const chunk of responseStream) {
                accumulatedText += chunk.text;
                setMessages(prev => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1] = { role: 'model', content: accumulatedText };
                    return newMessages;
                });
            }
        } catch (error) {
            console.error("Error sending message:", error);
            const errorMessage: ChatMessage = { role: 'model', content: 'Sorry, something went wrong. Please try again.' };
            setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = errorMessage;
                return newMessages;
            });
        } finally {
            setIsLoading(false);
        }
    };

    const stopAudio = useCallback(() => {
        if (audioSourceRef.current) {
            audioSourceRef.current.stop();
            audioSourceRef.current.disconnect();
            audioSourceRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(console.error);
        }
        setAudioState('idle');
        setPlayingMessageId(null);
    }, []);

    const handlePlayAudio = async (messageContent: string, messageId: string) => {
        if (audioState === 'playing' && playingMessageId === messageId) {
            stopAudio();
            return;
        }
        
        // Stop any currently playing audio before starting a new one
        if(audioState === 'playing') {
            stopAudio();
        }

        setPlayingMessageId(messageId);
        setAudioState('loading');
        setAudioError(null);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const prompt = `Say cheerfully: ${messageContent}`;
            if (agent.id === 'language_tutor' && selectedLanguage.name !== 'English') {
                // When tutoring, just speak the text directly without the cheerful prompt
                 const ttsResponse = await ai.models.generateContent({
                    model: "gemini-2.5-flash-preview-tts",
                    contents: [{ parts: [{ text: messageContent }] }],
                    config: {
                        responseModalities: [Modality.AUDIO],
                        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice.id } } },
                    },
                });
                const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                if (!base64Audio) throw new Error("No audio data received.");
                
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                const audioBuffer = await decodePCMAudioData(decode(base64Audio), audioContextRef.current, 24000, 1);
                
                const source = audioContextRef.current.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioContextRef.current.destination);
                source.onended = stopAudio;
                source.start();
                audioSourceRef.current = source;
                setAudioState('playing');

            } else {
                const ttsResponse = await ai.models.generateContent({
                    model: "gemini-2.5-flash-preview-tts",
                    contents: [{ parts: [{ text: prompt }] }],
                    config: {
                        responseModalities: [Modality.AUDIO],
                        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice.id } } },
                    },
                });
                const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                if (!base64Audio) throw new Error("No audio data received.");
    
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                const audioBuffer = await decodePCMAudioData(decode(base64Audio), audioContextRef.current, 24000, 1);
                
                const source = audioContextRef.current.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioContextRef.current.destination);
                source.onended = stopAudio;
                source.start();
                audioSourceRef.current = source;
                setAudioState('playing');
            }

        } catch (error) {
            console.error("TTS Error:", error);
            setAudioState('error');
            setAudioError("Failed to play audio.");
            setPlayingMessageId(null);
        }
    };
    
    const renderAudioButton = (msg: ChatMessage, index: number) => {
        const messageId = `${msg.role}-${index}`;
        const isCurrent = playingMessageId === messageId;

        if (isCurrent && audioState === 'loading') {
            return <button className="p-1 text-gray-400" disabled><SpinnerIcon className="w-4 h-4" /></button>;
        }
        if (isCurrent && audioState === 'playing') {
            return <button onClick={() => handlePlayAudio(msg.content, messageId)} className="p-1 text-gray-400 hover:text-white" aria-label="Stop audio"><StopIcon className="w-4 h-4"/></button>;
        }
        return <button onClick={() => handlePlayAudio(msg.content, messageId)} className="p-1 text-gray-400 hover:text-white" aria-label="Play audio"><SpeakerIcon className="w-4 h-4"/></button>;
    };

    return (
        <div className="flex flex-col h-full">
             <div className="flex-shrink-0 mb-4 flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                    <label htmlFor="tts-voice" className="block text-sm font-medium text-gray-400 mb-1">TTS Voice</label>
                    <AgentSelectorDropdown items={TTS_VOICES} selectedItem={selectedVoice} onSelectItem={setSelectedVoice} />
                </div>
                {agent.id === 'language_tutor' && (
                    <div className="flex-1">
                        <label htmlFor="language-select" className="block text-sm font-medium text-gray-400 mb-1">Language to Learn</label>
                        <AgentSelectorDropdown items={LANGUAGES} selectedItem={selectedLanguage} onSelectItem={setSelectedLanguage} />
                    </div>
                )}
            </div>
            <div className="flex-grow bg-gray-900/50 rounded-lg p-4 overflow-y-auto mb-4 min-h-[40vh] max-h-[40vh]">
                {messages.length === 0 && !isLoading ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 text-center">
                        <div className="text-4xl mb-4">{agent.icon}</div>
                        <h3 className="text-lg font-semibold text-gray-300">{agent.name}</h3>
                        <p className="text-sm">{agent.description}</p>
                        <p className="mt-4">Start the conversation by typing a message below.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {messages.map((msg, index) => (
                            <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-xs md:max-w-2xl p-3 rounded-lg whitespace-pre-wrap ${msg.role === 'user' ? 'bg-blue-800' : 'bg-gray-700'}`}>
                                    <p className="text-sm text-left">{msg.content || ' '}</p>
                                </div>
                                 {msg.role === 'model' && msg.content && renderAudioButton(msg, index)}
                            </div>
                        ))}
                        {isLoading && messages[messages.length-1]?.role === 'model' && !messages[messages.length-1]?.content && (
                            <div className="flex justify-start">
                                <div className="max-w-xs md:max-w-md p-3 rounded-lg bg-gray-700">
                                   <div className="flex items-center space-x-2">
                                       <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{animationDelay: '-0.3s'}}></div>
                                       <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{animationDelay: '-0.15s'}}></div>
                                       <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                                   </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>
            <div className="flex-shrink-0">
                <form onSubmit={handleSendMessage} className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={agent.id === 'translator' ? "Enter text to translate..." : "Type your message..."}
                        disabled={isLoading}
                        className="flex-grow bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-5 rounded-lg flex items-center justify-center transition-colors"
                    >
                        <SendIcon className="w-5 h-5" />
                    </button>
                </form>
            </div>
        </div>
    );
};

// A generic dropdown for selectors
interface AgentSelectorDropdownProps<T extends { id: string; name: string }> {
    items: T[];
    selectedItem: T;
    onSelectItem: (item: T) => void;
}

const AgentSelectorDropdown = <T extends { id: string; name: string }>({ items, selectedItem, onSelectItem }: AgentSelectorDropdownProps<T>) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <button
                type="button"
                className="relative w-full bg-gray-700 border border-gray-600 rounded-lg shadow-sm pl-3 pr-10 py-2 text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className="block truncate">{selectedItem.name}</span>
                <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                    <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                </span>
            </button>
            {isOpen && (
                <ul className="absolute z-10 mt-1 w-full bg-gray-700 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
                    {items.map((item) => (
                        <li
                            key={item.id}
                            className="text-gray-200 cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-gray-600"
                            onClick={() => {
                                onSelectItem(item);
                                setIsOpen(false);
                            }}
                        >
                            <span className={`block truncate ${item.id === selectedItem.id ? 'font-semibold' : 'font-normal'}`}>{item.name}</span>
                            {item.id === selectedItem.id && (
                                <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-blue-500">
                                    <CheckIcon className="h-5 w-5" />
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default TextChat;
