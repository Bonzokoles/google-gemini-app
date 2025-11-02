import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Chat } from '@google/genai';
import { Agent } from '../types';
import { SendIcon } from './Icons';

interface LogEntry {
    timestamp: string;
    source: 'SERVER' | 'CLIENT' | 'AGENT';
    content: object | string;
    color: string;
}

interface MCPIntegrationProps {
    agent: Agent;
}

const MCPIntegration: React.FC<MCPIntegrationProps> = ({ agent }) => {
    const [isServerRunning, setIsServerRunning] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [clientInput, setClientInput] = useState('');
    const [isAgentThinking, setIsAgentThinking] = useState(false);

    const chatRef = useRef<Chat | null>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);

    const addLog = (source: LogEntry['source'], content: LogEntry['content']) => {
        const colorMap = {
            SERVER: 'text-yellow-400',
            CLIENT: 'text-blue-400',
            AGENT: 'text-purple-400',
        };
        const newLog: LogEntry = {
            timestamp: new Date().toLocaleTimeString(),
            source,
            content,
            color: colorMap[source],
        };
        setLogs(prev => [...prev, newLog]);
    };
    
    // Initialize or re-initialize chat when the agent changes
    useEffect(() => {
        const initChat = () => {
             if (!isServerRunning) return;
            addLog('SERVER', `Agent changed. Initializing new chat session with ${agent.name}...`);
            try {
                // Fix: Use process.env.API_KEY for the API key, as per guidelines.
                const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
                chatRef.current = ai.chats.create({
                    model: 'gemini-2.5-flash',
                    config: {
                        systemInstruction: agent.systemInstruction,
                    },
                });
                addLog('SERVER', 'New chat session initialized successfully.');
            } catch (error) {
                console.error("Failed to initialize chat:", error);
                addLog('SERVER', { error: 'Could not initialize chat session.' });
            }
        };
        initChat();
    }, [agent, isServerRunning]);

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const handleToggleServer = () => {
        if (isServerRunning) {
            // Stop server
            addLog('SERVER', 'Server is shutting down...');
            setIsServerRunning(false);
            chatRef.current = null;
            setLogs([]); // Clear logs on stop
        } else {
            // Start server
            setLogs([]); // Clear logs on start
            addLog('SERVER', 'Starting WebSocket server simulation...');
            addLog('SERVER', `Listening on virtual endpoint: wss://gemini-hub.dev/mcp`);
            setIsServerRunning(true);
        }
    };

    const handleClientSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!clientInput.trim() || !chatRef.current || isAgentThinking) return;

        const messagePayload = { type: 'message', payload: clientInput };
        addLog('CLIENT', messagePayload);
        
        setIsAgentThinking(true);
        setClientInput('');

        try {
            const result = await chatRef.current.sendMessage(clientInput);
            const agentResponse = result.text;
            const responsePayload = { type: 'response', payload: agentResponse };
            addLog('AGENT', responsePayload);
        } catch (error) {
            console.error("Error sending message to agent:", error);
            const errorPayload = { type: 'error', message: 'Failed to get response from agent.' };
            addLog('AGENT', errorPayload);
        } finally {
            setIsAgentThinking(false);
        }
    };

    return (
        <div className="flex flex-col h-full text-sm font-mono">
            <div className="p-4 bg-gray-900/50 rounded-lg mb-4 text-gray-300">
                <h3 className="font-bold text-lg text-white mb-2">MCP (WebSocket) Integration Guide</h3>
                <p>This tab simulates a WebSocket server, allowing external clients to connect and interact with the selected AI agent programmatically. Messages are sent and received in JSON format.</p>
                <p className="mt-2">Use this as a blueprint for your backend implementation on services like Cloudflare Workers.</p>
            </div>

            <div className="flex-shrink-0 mb-4">
                <button
                    onClick={handleToggleServer}
                    className={`px-6 py-2 rounded-lg font-bold transition-colors ${isServerRunning ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                    {isServerRunning ? 'Stop Server' : 'Start Server'}
                </button>
            </div>

            <div className="flex-grow bg-black rounded-lg p-4 overflow-y-auto mb-4 min-h-[40vh] max-h-[40vh]">
                <div className="space-y-2">
                    {logs.map((log, index) => (
                        <div key={index}>
                            <span className="text-gray-500 mr-2">{log.timestamp}</span>
                            <span className={`${log.color} font-bold mr-2`}>[{log.source}]</span>
                            <span className="text-gray-200 whitespace-pre-wrap">
                                {typeof log.content === 'object' ? JSON.stringify(log.content) : log.content}
                            </span>
                        </div>
                    ))}
                    <div ref={logsEndRef} />
                </div>
                 {!isServerRunning && logs.length === 0 && (
                    <div className="text-gray-600">Server is offline. Click "Start Server" to begin.</div>
                 )}
            </div>
            
            <div className="flex-shrink-0">
                <form onSubmit={handleClientSendMessage} className="flex gap-2">
                    <input
                        type="text"
                        value={clientInput}
                        onChange={(e) => setClientInput(e.target.value)}
                        placeholder={isServerRunning ? "Simulate client message (e.g., 'Hello agent')" : "Server is offline"}
                        disabled={!isServerRunning || isAgentThinking}
                        className="flex-grow bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 font-mono"
                    />
                    <button
                        type="submit"
                        disabled={!isServerRunning || isAgentThinking || !clientInput.trim()}
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-5 rounded-lg flex items-center justify-center transition-colors"
                    >
                        <SendIcon className="w-5 h-5" />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default MCPIntegration;