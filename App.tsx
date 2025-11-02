
import React, { useState } from 'react';
import { Agent } from './types';
import { AGENTS } from './constants';
import AgentSelector from './components/AgentSelector';
import LiveChat from './components/LiveChat';
import TextChat from './components/TextChat';
import MCPIntegration from './components/MCPIntegration';

type Tab = 'live' | 'text' | 'mcp';

const App: React.FC = () => {
    const [selectedAgent, setSelectedAgent] = useState<Agent>(AGENTS[0]);
    const [activeTab, setActiveTab] = useState<Tab>('live');

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-4 font-sans">
            <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
                <header className="text-center">
                    <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
                        Gemini AI Conversation Hub
                    </h1>
                    <p className="text-gray-400 mt-2">
                        Engage in real-time voice and text conversations with powerful AI agents.
                    </p>
                </header>

                <div className="w-full md:w-1/2 mx-auto">
                    <AgentSelector
                        agents={AGENTS}
                        selectedAgent={selectedAgent}
                        onSelectAgent={setSelectedAgent}
                    />
                </div>

                <div className="w-full bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700">
                    <div className="p-2 bg-gray-800 border-b border-gray-700">
                        <div className="flex space-x-2">
                            <button
                                onClick={() => setActiveTab('live')}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 w-full ${activeTab === 'live' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                            >
                                Live Conversation
                            </button>
                            <button
                                onClick={() => setActiveTab('text')}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 w-full ${activeTab === 'text' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                            >
                                Text Chat
                            </button>
                            <button
                                onClick={() => setActiveTab('mcp')}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 w-full ${activeTab === 'mcp' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                            >
                                MCP Integration
                            </button>
                        </div>
                    </div>
                    
                    <div className="p-4 md:p-6 min-h-[60vh]">
                        {activeTab === 'live' && <LiveChat agent={selectedAgent} />}
                        {activeTab === 'text' && <TextChat agent={selectedAgent} />}
                        {activeTab === 'mcp' && <MCPIntegration agent={selectedAgent} />}
                    </div>
                </div>

                <footer className="text-center text-gray-500 text-sm">
                    <p>Powered by Google Gemini. Built by a World-Class Senior Frontend React Engineer.</p>
                </footer>
            </div>
        </div>
    );
};

export default App;