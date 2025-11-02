
import React, { useState, useRef, useEffect } from 'react';
import { Agent } from '../types';
import { ChevronDownIcon, CheckIcon } from './Icons';

interface AgentSelectorProps {
    agents: Agent[];
    selectedAgent: Agent;
    onSelectAgent: (agent: Agent) => void;
}

const AgentSelector: React.FC<AgentSelectorProps> = ({ agents, selectedAgent, onSelectAgent }) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [wrapperRef]);

    const handleSelect = (agent: Agent) => {
        onSelectAgent(agent);
        setIsOpen(false);
    };

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <label id="agent-selector-label" className="block text-sm font-medium text-gray-400 mb-1">Select AI Agent</label>
            <button
                type="button"
                className="relative w-full bg-gray-700 border border-gray-600 rounded-lg shadow-sm pl-3 pr-10 py-3 text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                onClick={() => setIsOpen(!isOpen)}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-labelledby="agent-selector-label"
            >
                <span className="flex items-center">
                    <span className="text-blue-400">{selectedAgent.icon}</span>
                    <span className="ml-3 block truncate font-semibold text-white">{selectedAgent.name}</span>
                </span>
                <span className="ml-3 absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                    <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                </span>
            </button>

            {isOpen && (
                <ul
                    className="absolute z-10 mt-1 w-full bg-gray-700 shadow-lg max-h-56 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm"
                    tabIndex={-1}
                    role="listbox"
                    aria-labelledby="agent-selector-label"
                >
                    {agents.map((agent) => (
                        <li
                            key={agent.id}
                            className="text-gray-200 cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-gray-600"
                            role="option"
                            aria-selected={agent.id === selectedAgent.id}
                            onClick={() => handleSelect(agent)}
                        >
                            <div className="flex items-center">
                                <span className="text-blue-400">{agent.icon}</span>
                                <div className="ml-3">
                                    <span className={`font-semibold block truncate ${agent.id === selectedAgent.id ? 'text-white' : ''}`}>
                                        {agent.name}
                                    </span>
                                    <span className="text-gray-400 text-xs">
                                        {agent.description}
                                    </span>
                                </div>
                            </div>

                            {agent.id === selectedAgent.id && (
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

export default AgentSelector;
