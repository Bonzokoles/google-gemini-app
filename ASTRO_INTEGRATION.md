# Gemini AI Conversation Hub: Features & Integration Guide

This document provides an overview of the Gemini AI Conversation Hub's features and a step-by-step guide on how to integrate it into a blog built with the [Astro](https://astro.build/) framework and deploy it on [Cloudflare Pages](https://pages.cloudflare.com/).

## 1. Core Features

The AI Conversation Hub is a powerful, interactive component designed to engage your blog's visitors.

*   **Triple Interaction Modes:**
    *   **Live Conversation:** A real-time voice chat experience using the Gemini Live API. Users can speak directly to the AI and receive instant, spoken responses for a natural, fluid conversation. Includes live transcription of both user and AI speech.
    *   **Text Chat:** A feature-rich text-based chat interface with real-time streaming responses from the AI.
    *   **MCP (WebSocket) Integration:** A simulation and guide for connecting external clients (like bots or other apps) to an AI agent via a WebSocket server. It demonstrates the protocol and provides a blueprint for a real backend implementation.

*   **Advanced AI Agent System:**
    *   Users can switch between different AI **personas (Agents)**, each with a unique purpose, personality, and icon.
    *   **Available Agents:**
        *   **General Assistant:** A helpful AI for any topic.
        *   **Language Tutor:** An interactive tutor to help users learn a new language. It dynamically adapts its teaching style and language based on user selection. For Polish, it even teaches local Poznań slang!
        *   **Blog Helper:** An assistant for brainstorming blog post ideas, writing, and proofreading.
        *   **Cynical Comedian:** An AI with a dry, sarcastic wit for entertainment.
        *   **Polyglot Translator:** A tool for accurate language translation.
        *   **Positivity Seeker:** An agent that focuses on finding positive news and uplifting information.

*   **Rich Text Chat Features:**
    *   **Text-to-Speech (TTS):** Users can listen to any AI response by clicking a speaker icon.
    *   **Voice Selection:** A dropdown menu allows users to choose from multiple male and female voices for the TTS feature.
    *   **Dynamic Language Selection:** When using the Language Tutor, a second dropdown appears, allowing the user to select the language they wish to learn.

*   **Context-Awareness (Simulated):**
    *   The Live Chat agent can simulate fetching data from a data store like Cloudflare R2 to provide conversations with up-to-date context (e.g., knowing recent blog post topics).

## 2. Integrating with Your Astro Blog

You can add the entire AI Hub to your Astro blog as an interactive "island."

### Step 1: Add React to Astro

If you haven't already, add the official Astro React integration to your project:
```bash
npx astro add react
```

### Step 2: Copy the Assistant Files

1.  Create a new folder inside your Astro project's `src` directory, for example: `src/components/AIAssistant/`.
2.  Copy all the provided component and definition files into this new folder:
    *   `App.tsx`
    *   `components/` (the whole folder: `AgentSelector.tsx`, `Icons.tsx`, `LiveChat.tsx`, `TextChat.tsx`, `MCPIntegration.tsx`)
    *   `constants.tsx`
    *   `types.ts`

### Step 3: Create the Assistant Page

Create a new file in `src/pages/`. This will be the subpage on your blog, for example, `src/pages/assistant.astro`. This will make the assistant available at `your-blog.com/assistant`.

Paste the following code into your new `.astro` file:

```astro
---
// src/pages/assistant.astro
import App from '../components/AIAssistant/App';
// You can define a layout if you use one for your blog
// import MainLayout from '../layouts/MainLayout.astro';
---
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gemini AI Conversation Hub</title>
    <style is:global>
        /* For custom scrollbars, if you want them globally */
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: #1f2937; }
        ::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #6b7280; }
    </style>
</head>
<body class="bg-gray-900 text-gray-100">
    <main class="p-4">
        <!-- 
            The `client:load` directive tells Astro to load and hydrate the 
            React component immediately on page load. This is necessary because 
            the assistant is the main interactive element on this page.
        -->
        <App client:load />
    </main>
</body>
</html>
```

### Step 4: Setup Styling with Tailwind CSS

The assistant is styled with Tailwind CSS. For the best result, integrate Tailwind directly into your Astro project.

1.  Run the Astro command to add Tailwind:
    ```bash
    npx astro add tailwind
    ```
2.  This will create a `tailwind.config.mjs` file. Make sure it's configured to scan your React component files for classes. The default configuration should work.

## 3. Deploying to Cloudflare Pages

Once your Astro project is ready, you can deploy it for free on Cloudflare Pages.

### Step 1: Push to a Git Repository

Make sure your Astro project code is on a GitHub or GitLab repository.

### Step 2: Create a Cloudflare Pages Project

1.  Log in to your Cloudflare dashboard.
2.  Navigate to **Workers & Pages** -> **Create application**.
3.  Select the **Pages** tab and click **Connect to Git**.
4.  Choose the repository containing your Astro project.
5.  In the **Set up builds and deployments** section, Cloudflare will likely detect you are using Astro and select the **Astro** framework preset. The build settings should be:
    *   **Build command:** `npm run build`
    *   **Build output directory:** `dist` (this is the default for Astro 4+)

### Step 3: Add Your Gemini API Key

**This is a critical step.** The assistant will not work without your API key.

1.  In the same setup screen, go to the **Environment variables** section.
2.  Add a **new variable**:
    *   **Variable name:** `VITE_GEMINI_API_KEY`
    *   **Value:** Paste your actual Gemini API Key here.
    *   Click the **Encrypt** button to keep your key secure.
3.  **Important**: You need to modify the code slightly to use this variable. In an Astro project, environment variables exposed to the client-side code must be prefixed with `VITE_`. You will need to change how the API key is accessed in the React code.
    
    In the files `LiveChat.tsx`, `TextChat.tsx`, and `MCPIntegration.tsx`, find this line:
    ```javascript
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    ```
    
    And **change it to**:
    ```javascript
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY as string });
    ```

### Step 4: Deploy

Click **Save and Deploy**. Cloudflare will build your Astro site and deploy it. Once finished, your AI Conversation Hub will be live on a subpage like `your-project.pages.dev/assistant`. If you have a custom domain configured, it will be available at `your-blog.com/assistant`.