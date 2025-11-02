import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality, Blob } from '@google/genai';
import { Agent, TranscriptionEntry } from '../types';
import { MicrophoneIcon, SpinnerIcon } from './Icons';

// --- Audio Helper Functions ---
function encode(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

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

function createBlob(data: Float32Array): Blob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        int16[i] = data[i] * 32768;
    }
    return {
        data: encode(new Uint8Array(int16.buffer)),
        mimeType: 'audio/pcm;rate=16000',
    };
}

/**
 * Simulates fetching contextual data from a Cloudflare R2 bucket.
 * In a real application, this would be a network request.
 * @param agentId The ID of the agent to fetch context for.
 * @returns A promise that resolves with the contextual string.
 */
async function fetchContextFromR2(agentId: string): Promise<string> {
    console.log(`Fetching R2 context for agent: ${agentId}`);
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    switch (agentId) {
        case 'blog_writer':
            return `
- Recent Blog Post Title: "The Future of AI in Web Development"
- Upcoming Topic Idea: "Exploring Gemini 2.5 Pro's Advanced Features"
- User's preferred tone: Casual and informative.
            `;
        case 'language_tutor':
            return `
- User's last session focus: Practicing past tense verbs in Spanish.
- Common mistake: Confusing 'por' and 'para'.
- Next learning goal: Introduce subjunctive mood.
            `;
        default:
            return ''; // No specific context for other agents
    }
}


// --- Component ---
type SessionState = 'idle' | 'fetching_context' | 'connecting' | 'connected' | 'error';

interface LiveChatProps {
    agent: Agent;
}

const LiveChat: React.FC<LiveChatProps> = ({ agent }) => {
    const [sessionState, setSessionState] = useState<SessionState>('idle');
    const [transcriptionHistory, setTranscriptionHistory] = useState<TranscriptionEntry[]>([]);
    const [currentUserTranscription, setCurrentUserTranscription] = useState('');
    const [currentModelTranscription, setCurrentModelTranscription] = useState('');

    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const microphoneStreamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    
    const outputAudioSources = useRef<Set<AudioBufferSourceNode>>(new Set());
    const nextAudioStartTime = useRef(0);
    const userTranscriptRef = useRef('');
    const modelTranscriptRef = useRef('');

    const cleanup = useCallback(() => {
        if (sessionPromiseRef.current) {
            sessionPromiseRef.current.then(session => session.close()).catch(console.error);
            sessionPromiseRef.current = null;
        }
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        if (sourceNodeRef.current) {
            sourceNodeRef.current.disconnect();
            sourceNodeRef.current = null;
        }
        if (microphoneStreamRef.current) {
            microphoneStreamRef.current.getTracks().forEach(track => track.stop());
            microphoneStreamRef.current = null;
        }
        if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
            inputAudioContextRef.current.close().catch(console.error);
            inputAudioContextRef.current = null;
        }
        if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
            outputAudioContextRef.current.close().catch(console.error);
            outputAudioContextRef.current = null;
        }
        outputAudioSources.current.forEach(source => source.stop());
        outputAudioSources.current.clear();
        nextAudioStartTime.current = 0;
        setSessionState('idle');
        userTranscriptRef.current = '';
        modelTranscriptRef.current = '';
        setCurrentUserTranscription('');
        setCurrentModelTranscription('');
    }, []);

    useEffect(() => {
        return () => {
            cleanup();
        };
    }, [cleanup]);

    const handleConnect = async () => {
        if (sessionState !== 'idle' && sessionState !== 'error') return;

        setTranscriptionHistory([]);
        
        try {
            setSessionState('fetching_context');
            const r2Context = await fetchContextFromR2(agent.id);
            const finalSystemInstruction = r2Context 
                ? `${agent.systemInstruction}\n\n--- Additional Context from R2 ---\n${r2Context}`
                : agent.systemInstruction;
            
            console.log("Final System Instruction:", finalSystemInstruction);

            setSessionState('connecting');

            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

            const onMessage = async (message: LiveServerMessage) => {
                if (message.serverContent?.outputTranscription) {
                    const text = message.serverContent.outputTranscription.text;
                    modelTranscriptRef.current += text;
                    setCurrentModelTranscription(modelTranscriptRef.current);
                } else if (message.serverContent?.inputTranscription) {
                    const text = message.serverContent.inputTranscription.text;
                    userTranscriptRef.current += text;
                    setCurrentUserTranscription(userTranscriptRef.current);
                }

                if (message.serverContent?.turnComplete) {
                    const fullInput = userTranscriptRef.current;
                    const fullOutput = modelTranscriptRef.current;
                    setTranscriptionHistory(prev => [
                        ...prev,
                        { speaker: 'user', text: fullInput },
                        { speaker: 'model', text: fullOutput }
                    ]);
                    userTranscriptRef.current = '';
                    modelTranscriptRef.current = '';
                    setCurrentUserTranscription('');
                    setCurrentModelTranscription('');
                }

                const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
                if (audioData && outputAudioContextRef.current) {
                    const outputCtx = outputAudioContextRef.current;
                    nextAudioStartTime.current = Math.max(nextAudioStartTime.current, outputCtx.currentTime);
                    const audioBuffer = await decodePCMAudioData(decode(audioData), outputCtx, 24000, 1);
                    const source = outputCtx.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(outputCtx.destination);
                    source.addEventListener('ended', () => outputAudioSources.current.delete(source));
                    source.start(nextAudioStartTime.current);
                    nextAudioStartTime.current += audioBuffer.duration;
                    outputAudioSources.current.add(source);
                }
            };
            
            const onOpen = () => {
                 setSessionState('connected');
            };
            const onError = (e: ErrorEvent) => {
                console.error('Session error:', e);
                setSessionState('error');
                cleanup();
            };
            const onClose = () => {
                cleanup();
            };

            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: { onopen: onOpen, onmessage: onMessage, onerror: onError, onclose: onClose },
                config: {
                    responseModalities: [Modality.AUDIO],
                    outputAudioTranscription: {},
                    inputAudioTranscription: {},
                    systemInstruction: finalSystemInstruction
                },
            });

            microphoneStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            
            sourceNodeRef.current = inputAudioContextRef.current.createMediaStreamSource(microphoneStreamRef.current);
            scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            
            scriptProcessorRef.current.onaudioprocess = (event: AudioProcessingEvent) => {
                const inputData = event.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData);
                if (sessionPromiseRef.current) {
                    sessionPromiseRef.current.then(session => session.sendRealtimeInput({ media: pcmBlob }));
                }
            };
            
            sourceNodeRef.current.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);

        } catch (error) {
            console.error("Failed to start session:", error);
            setSessionState('error');
            cleanup();
        }
    };
    
    const getButtonState = () => {
        switch (sessionState) {
            case 'idle': return { text: 'Start Conversation', disabled: false, icon: <MicrophoneIcon className="w-6 h-6"/>, style: 'bg-blue-600 hover:bg-blue-700' };
            case 'fetching_context': return { text: 'Fetching Context...', disabled: true, icon: <SpinnerIcon className="w-6 h-6"/>, style: 'bg-gray-500' };
            case 'connecting': return { text: 'Connecting...', disabled: true, icon: <SpinnerIcon className="w-6 h-6"/>, style: 'bg-gray-500' };
            case 'connected': return { text: 'End Conversation', disabled: false, icon: <MicrophoneIcon className="w-6 h-6"/>, style: 'bg-red-600 hover:bg-red-700' };
            case 'error': return { text: 'Error - Retry', disabled: false, icon: <MicrophoneIcon className="w-6 h-6"/>, style: 'bg-yellow-600 hover:bg-yellow-700' };
        }
    };

    const buttonState = getButtonState();

    return (
        <div className="flex flex-col h-full">
            <div className="flex-grow bg-gray-900/50 rounded-lg p-4 overflow-y-auto mb-4 min-h-[40vh] max-h-[40vh]">
                {transcriptionHistory.length === 0 && !currentUserTranscription && !currentModelTranscription && sessionState === 'idle' && (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 text-center">
                        <div className="text-4xl mb-4">{agent.icon}</div>
                        <h3 className="text-lg font-semibold text-gray-300">{agent.name}</h3>
                        <p className="text-sm">{agent.description}</p>
                        <p className="mt-4">Press "Start Conversation" to begin.</p>
                    </div>
                )}
                <div className="space-y-4">
                    {transcriptionHistory.map((entry, index) => (
                        <div key={index} className={`flex ${entry.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-xs md:max-w-md p-3 rounded-lg ${entry.speaker === 'user' ? 'bg-blue-800 text-right' : 'bg-gray-700'}`}>
                                <p className="text-sm">{entry.text}</p>
                            </div>
                        </div>
                    ))}
                     {currentUserTranscription && (
                        <div className="flex justify-end opacity-70">
                            <div className="max-w-xs md:max-w-md p-3 rounded-lg bg-blue-800 text-right">
                                <p className="text-sm italic">{currentUserTranscription}</p>
                            </div>
                        </div>
                    )}
                    {currentModelTranscription && (
                         <div className="flex justify-start opacity-70">
                            <div className="max-w-xs md:max-w-md p-3 rounded-lg bg-gray-700">
                                <p className="text-sm italic">{currentModelTranscription}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <div className="flex-shrink-0 flex flex-col items-center">
                <button
                    onClick={sessionState === 'connected' ? cleanup : handleConnect}
                    disabled={buttonState.disabled}
                    className={`flex items-center justify-center gap-3 w-full md:w-auto px-8 py-4 rounded-full text-lg font-bold transition-all duration-300 transform hover:scale-105 ${buttonState.style}`}
                >
                    {buttonState.icon}
                    <span>{buttonState.text}</span>
                </button>
                 {sessionState === 'error' && <p className="text-red-400 mt-2 text-sm">An error occurred. Please check your console and try again.</p>}
            </div>
        </div>
    );
};

export default LiveChat;
