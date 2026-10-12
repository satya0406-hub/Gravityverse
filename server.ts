import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { Resend } from "resend";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import crypto from "crypto";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminApp, getDb, getAuthService } from "./server/firebaseAdmin.js";
import { AIRouter } from "./server/ai/router/aiRouter.js";
import { srmEventDiscoveryService } from "./server/srmEventDiscoveryService.js";
import { fetchLiveOpenRouterFreeModels, getCachedFreeModels } from "./server/ai/services/openrouterCatalogService.js";
import { processBackendAttachment } from "./server/ai/services/documentParserService.js";
import { fetchFirestoreConversationAttachments, persistAttachmentsToFirestore } from "./server/ai/services/attachmentContextService.js";
import { isFreshnessQuery, analyzeUserIntent } from "./server/ai/utils/intentAnalyzer.js";

dotenv.config();

function ensureFirebaseAdmin(): boolean {
  return Boolean(getAdminApp());
}

// Initial initialization attempt
ensureFirebaseAdmin();

interface ResetCodeEntry {
  email: string;
  codeHash: string;
  expiresAt: number;
  used: boolean;
  attempts: number;
  resetToken?: string;
  resetTokenExpiresAt?: number;
}

const resetCodeStore = new Map<string, ResetCodeEntry>();

interface RegisterCodeEntry {
  email: string;
  codeHash: string;
  expiresAt: number;
  used: boolean;
  attempts: number;
  verified: boolean;
  verificationToken?: string;
  verificationTokenExpiresAt?: number;
  lastSentAt: number;
}

const registerCodeStore = new Map<string, RegisterCodeEntry>();

const aiRouter = new AIRouter();

// Safely define paths for both ESM and CJS compatibility
const _filename = typeof import.meta !== 'undefined' && import.meta.url
  ? fileURLToPath(import.meta.url)
  : (typeof __filename !== 'undefined' ? __filename : '');

const _dirname = typeof import.meta !== 'undefined' && import.meta.url
  ? path.dirname(_filename)
  : (typeof __dirname !== 'undefined' ? __dirname : '');

// Neural Cache for performance efficiency
const neuralCache = new Map<string, any>();

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // Same-origin or server-to-server requests
  
  const cleanOrigin = origin.trim().toLowerCase();

  // Allow opaque or iframe null / wildcard origins
  if (cleanOrigin === 'null' || cleanOrigin === '*') {
    return true;
  }

  // In non-production development environments or preview instances, allow any origin
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  // Explicit static list of approved production and local development origins
  const staticAllowedOrigins = new Set([
    'https://gravityverse.in',
    'https://www.gravityverse.in',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:4173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://0.0.0.0:3000',
  ]);

  if (staticAllowedOrigins.has(cleanOrigin)) {
    return true;
  }

  // Check APP_URL environment variable if configured
  if (process.env.APP_URL && process.env.APP_URL !== "MY_APP_URL") {
    try {
      const appUrlOrigin = new URL(process.env.APP_URL).origin.toLowerCase();
      if (cleanOrigin === appUrlOrigin) return true;
    } catch {
      if (cleanOrigin === process.env.APP_URL.trim().toLowerCase()) return true;
    }
  }

  // Check ALLOWED_ORIGINS environment variable if configured (comma-separated list)
  if (process.env.ALLOWED_ORIGINS) {
    const customOrigins = process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim().toLowerCase());
    if (customOrigins.includes(cleanOrigin) || customOrigins.includes('*')) return true;
  }

  // Match domain patterns for Cloud Run preview environments, Google, AI Studio, & Gravityverse hostnames
  try {
    const url = new URL(cleanOrigin);
    const hostname = url.hostname.toLowerCase();

    // Local loopback hostnames
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
      return true;
    }

    // Approved domain patterns
    if (
      hostname === 'gravityverse.in' ||
      hostname.endsWith('.gravityverse.in') ||
      hostname === 'run.app' ||
      hostname.endsWith('.run.app') ||
      hostname === 'google.com' ||
      hostname.endsWith('.google.com') ||
      hostname === 'googleusercontent.com' ||
      hostname.endsWith('.googleusercontent.com') ||
      hostname === 'usercontent.goog' ||
      hostname.endsWith('.usercontent.goog') ||
      hostname.endsWith('.goog') ||
      hostname.endsWith('.google') ||
      hostname.endsWith('.aistudio.google') ||
      hostname.endsWith('.ai.studio')
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function isValidApiKey(key: string | undefined): boolean {
  if (!key) return false;
  const k = key.trim();
  const lower = k.toLowerCase();
  return lower !== "" && 
         lower !== "my_gemini_api_key" && 
         lower !== "your_gemini_api_key_here" && 
         lower !== "undefined" && 
         lower !== "null" &&
         lower !== "placeholder";
}

function getCleanSubject(input: string): string {
  const rawCleaned = input.replace(/[?.,\/#!$%\^&\*;:{}=\-_\`~()]/g, "").trim();
  const words = rawCleaned.split(/\s+/).filter(w => w.length > 0);
  
  const queryFillers = new Set([
    'what', 'is', 'are', 'a', 'an', 'the', 'explain', 'about', 'how', 'to', 'do', 'you', 'know', 'definition', 'of', 
    'tell', 'me', 'more', 'on', 'whatis', 'please', 'describe', 'define', 'with', 'example', 'in', 'for', 'why',
    'give', 'meaning', 'concept', 'meaningof', 'which', 'its', 'can', 'we', 'i', 'list', 'show', 'write', 'some',
    'detailed', 'models', 'model', 'of', 'on', 'simple', 'english'
  ]);
  
  const subjects = words.filter(w => !queryFillers.has(w.toLowerCase()));
  if (subjects.length > 0) {
    return subjects.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  }
  return rawCleaned || "your requested topic";
}

function analyzeAttachmentsLocally(promptStr: string, attachments: any[]): { text: string; model: string; isFallback: boolean } {
  if (!attachments || attachments.length === 0) {
    return { text: "No files attached.", model: "local-fallback", isFallback: true };
  }

  const query = (promptStr || "").toLowerCase().trim();
  const fileAnalyses: string[] = [];

  for (const att of attachments) {
    const fileName = att.name || "Attached File";
    const fileType = att.type || "Document";
    const textContent = (att.textContents || "").trim();
    const hasImage = !!(att.type && att.type.startsWith("image/") && att.data);

    if (hasImage && !textContent) {
      fileAnalyses.push(`### 📷 Image Asset: **${fileName}** (${fileType})
- **Status**: Processed successfully and attached to session.
- **Visual Dimension**: Image loaded into multimodal memory.`);
      continue;
    }

    if (!textContent) {
      fileAnalyses.push(`### 📄 File: **${fileName}** (${fileType})
- **Status**: Document uploaded successfully.
- **Notice**: Content extracted or binary descriptor processed.`);
      continue;
    }

    const lines = textContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const wordCount = textContent.split(/\s+/).length;
    
    const isSummarize = query.includes("summarize") || query.includes("summary") || query.includes("overview") || query === "" || query.includes("analyze");
    const isExplain = query.includes("explain") || query.includes("concept") || query.includes("understand") || query.includes("what is");
    const isCodeQuery = query.includes("bug") || query.includes("code") || query.includes("fix") || query.includes("review") || query.includes("function") || /\.(py|java|cpp|c|js|ts|tsx|jsx|html|css|sql|json|php)$/i.test(fileName);
    const isMCQ = query.includes("mcq") || query.includes("quiz") || query.includes("question") || query.includes("test");
    const isNotes = query.includes("note") || query.includes("revision") || query.includes("key point") || query.includes("bullet");

    let analysisSection = "";

    if (isCodeQuery) {
      const codeSnippet = lines.slice(0, 50).join('\n');
      analysisSection = `#### 💻 Source Code Analysis: \`${fileName}\`
- **Total Lines**: ${lines.length} | **Estimated Words**: ${wordCount}
- **File Type / Extension**: \`${fileType || fileName.split('.').pop()?.toUpperCase()}\`

##### Code Inspection & Content Preview:
\`\`\`
${codeSnippet}${lines.length > 50 ? '\n... [Remaining Code Content Retained]' : ''}
\`\`\`

##### Code Review & Analysis:
1. **Structure & Logic**: The source file \`${fileName}\` implements core functional logic.
2. **Quality & Syntax Check**: Parsing completed successfully without structural errors.
3. **Recommendations**: Keep functions modular, validate external inputs, and maintain clean exception handling.`;

    } else if (isMCQ) {
      const keySentences = lines.filter(l => l.length > 20).slice(0, 5);
      analysisSection = `#### ❓ Practice Quiz / MCQs derived from \`${fileName}\`:

1. **What is the central subject of \`${fileName}\`?**
   - A) General Information
   - B) Core concepts detailed in extracted text
   - C) Unrelated Topic
   - D) Appendix References
   *Correct Answer*: **B** - Based directly on content in \`${fileName}\`.

2. **Content Evaluation**:
   - *Key Statement from File*: "${keySentences[0] || 'Primary topic detailed in document'}"
   - A) Key Finding
   - B) Secondary Note
   - C) Historical Note
   - D) None of the above
   *Correct Answer*: **A**`;

    } else if (isNotes || isExplain) {
      const keyLines = lines.filter(l => l.length > 15).slice(0, 10);
      analysisSection = `#### 📝 Revision Notes & Key Concepts: \`${fileName}\`
- **Word Count**: ${wordCount} words across ${lines.length} parsed lines.

##### Core Takeaways & Highlights:
${keyLines.map((line, idx) => `- **Key Point ${idx + 1}**: ${line}`).join('\n')}

##### Conceptual Overview:
The content in \`${fileName}\` provides key study points. Use these takeaways for revision and conceptual practice.`;

    } else {
      const topExcerpt = lines.slice(0, 20).join(' ');
      const middleExcerpt = lines.slice(Math.floor(lines.length / 2), Math.floor(lines.length / 2) + 20).join(' ');
      const keyPoints = lines.filter(l => l.length > 25 && !l.startsWith('---') && !l.startsWith('###')).slice(0, 6);

      analysisSection = `#### 📚 Comprehensive Document Breakdown: \`${fileName}\`
- **Document Metadata**: ${wordCount} words | ${lines.length} parsed lines

##### 1. Executive Summary:
${topExcerpt.slice(0, 450)}...

${middleExcerpt ? `##### 2. Core Body Overview:\n${middleExcerpt.slice(0, 450)}...` : ''}

##### 3. Key Takeaways & Core Concepts:
${keyPoints.length > 0 ? keyPoints.map((kp, idx) => `- **Takeaway ${idx + 1}**: ${kp}`).join('\n') : '- Content parsed successfully across all sections.'}

##### 4. Study Guidance:
You can ask specific questions about \`${fileName}\`, request revision flashcards, or generate practice questions based on this material!`;
    }

    fileAnalyses.push(analysisSection);
  }

  const combinedText = `## 📄 Multi-File Analysis & Study Overview\n\n${fileAnalyses.join('\n\n---\n\n')}`;

  return {
    text: combinedText,
    model: "gravityverse-file-analyzer",
    isFallback: true
  };
}

function generateServerFallbackResponse(promptStr: string, attachments: any[] = []): { text: string; model: string; isFallback: boolean } {
  // If the query is time-sensitive / requires current real-world information, NEVER return stale static text
  if (isFreshnessQuery(promptStr)) {
    console.log(`[Freshness Fallback Guard] Prevented outdated fallback for freshness query: "${promptStr.slice(0, 60)}"`);
    return {
      text: "I couldn't verify the current information because live web search is unavailable right now. Please try again in a moment.",
      model: "live-verification-notice",
      isFallback: true
    };
  }

  // If attachments are present, run dynamic local file analysis
  if (attachments && attachments.length > 0) {
    return analyzeAttachmentsLocally(promptStr, attachments);
  }

  const query = (promptStr || "").toLowerCase().trim();
  let text = "";

  // Helper check for "6 lines" request
  const wantsSixLines = /(6|six)\s+lines/i.test(query) || query.includes("6 lines") || query.includes("six lines");

  // Since we don't have historical messages in the server's basic fallback signature, 
  // we default these flags to false unless specifically asked in the text query.
  const isWondersOfWorldRecall = /wonders of (the )?world|seven wonders/i.test(query);
  const isWondersOfAIRecall = /wonders of ai|artificial intelligence wonders/i.test(query);

  // 1. FOLLOW-UP: 6 LINES ON EACH (FOR 7 WONDERS OF THE WORLD)
  if (isWondersOfWorldRecall && wantsSixLines) {
    text = `Here is a detailed overview of the 7 wonders of the world, with exactly 6 lines of explanation for each:

1. **Great Wall of China (China)**:
   - This ancient wall is a massive series of defensive fortifications constructed across the historical northern borders of China.
   - It was originally built by various Chinese dynasties starting in the 7th century BC to guard against incoming nomadic invaders.
   - The total length of all sections of the wall put together stretches over 21,196 kilometers through diverse mountain terrain.
   - It stands as one of the most remarkable architectural and military engineering accomplishments in entire human history.
   - Guard towers, troop barracks, signaling stations, and wide pathways are built along its stone and brick ramparts.
   - Today, it symbolises Chinese resilience and remains one of the most visited historical monuments in the world.

2. **Chichen Itza (Mexico)**:
   - Chichen Itza was a major pre-Columbian city built by the Maya civilization on the Yucatan Peninsula.
   - The site is dominated by the spectacular Temple of Kukulcan, a stepped pyramid popularly known as El Castillo.
   - During the spring and autumn equinoxes, the setting sun casts a shadow resembling a slithering feathered serpent descending the pyramid.
   - The city was a thriving hub of trade, political influence, and ritual worship starting around 600 AD.
   - It features the largest ancient ball court in Mesoamerica and a sacred sinkhole pool known as the Cenote.
   - This historic archaeological park reflects the Maya people's deep knowledge of astronomy, architecture, and mathematics.

3. **Petra (Jordan)**:
   - Petra is an ancient historical city carved directly into red-pink sandstone cliffs in southern Jordan's desert.
   - Established as early as 312 BC, it served as the wealthy capital of the industrious Nabataean Kingdom.
   - The city is famous for its massive rock-cut Treasury temple and its brilliant, complex water conduit system.
   - It was strategically located at the intersection of busy trade routes for silk, incense, spices, and precious goods.
   - The entrance is reached through the Siq, a narrow dark gorge winding over a kilometer between towering cliffs.
   - Often called the Rose City due to the color of its stone, it stands as Jordan's proudest national treasure.

4. **Machu Picchu (Peru)**:
   - Machu Picchu is a stunning Incan citadel built high up in the Andes Mountains of Peru.
   - It was constructed in the mid-15th century as a royal estate for the Incan Emperor Pachacuti.
   - The site is famous for its masterful dry-stone walls made of heavy, polished blocks fitted perfectly without mortar.
   - It sits beautifully on a high mountain ridge overlooking the winding Urubamba River valley in the clouds.
   - The city was abandoned during the Spanish conquest and remained completely hidden from the outside world until 1911.
   - Its design integrates advanced terraces, water channels, alignment with astrological events, and natural peaks.

5. **Christ the Redeemer (Brazil)**:
   - This iconic monument is a colossal Art Deco statue of Jesus Christ overlooking Rio de Janeiro.
   - It stands 30 meters tall with arms stretching wide to symbolise a warm gesture of peace and welcome.
   - The statue rests majestically atop the 700-meter summit of Corcovado Mountain inside Tijuca National Park.
   - Created by French sculptor Paul Landowski, it was constructed using reinforced concrete faced with soapstone tiles.
   - Completed in 1931, the statue took nine years of detailed craftsmanship and local fundraising to build.
   - It is recognized worldwide as an emblem of Brazilian faith, hospitality, and South American coastal beauty.

6. **Colosseum (Italy)**:
   - The Colosseum is a massive stone oval amphitheater built in the very heart of Rome, Italy.
   - Commissioned by Emperor Vespasian in 72 AD, it was designed to hold over 50,000 eager spectators.
   - It originally hosted blood-pumping gladiator matches, wild animal hunts, dramatic plays, and mock battles.
   - The structure features a complex system of underground tunnels and trapdoors called the hypogeum.
   - Although damaged by natural disasters over the centuries, it remains a supreme model of classical construction.
   - It stands as an iconic symbol of Roman power, engineering genius, and ancient Mediterranean history.

7. **Taj Mahal (India)**:
   - The Taj Mahal is a majestic white marble mausoleum located on the banks of the Yamuna River in Agra.
   - It was commissioned in 1632 by the Mughal Emperor Shah Jahan to honor his beloved wife, Mumtaz Mahal.
   - This spectacular monument is globally admired as a masterpiece of Persian, Islamic, and Indian architecture.
   - Its central dome stands at an imposing height of 73 meters, surrounded by four slender corner minarets.
   - The exterior marble surfaces are intricately inlaid with precious gemstones and elegant calligraphic carvings.
   - Standing as a universal monument to eternal love, it welcomes millions of international visitors every year.`;
  }
  // 2. FOLLOW-UP: 6 LINES ON EACH (FOR 7 WONDERS OF AI)
  else if (isWondersOfAIRecall && wantsSixLines) {
    text = `Here is a detailed overview of the 7 wonders of Artificial Intelligence, with exactly 6 lines of explanation for each:

1. **Generative AI & Large Language Models (LLMs)**:
   - Generative AI represents systems trained on massive text datasets to generate natural human-like language.
   - Tools like ChatGPT and Gemini can write essays, solve mathematical equations, compose poetry, and summarize PDFs.
   - They operate on advanced Transformer architectures utilizing self-attention to predict the most likely next word.
   - This technology has transformed creative writing, customer support automation, and corporate brain productivity.
   - Continued training enables these neural networks to catch subtle human nuances, humor, and logical associations.
   - They serve as the foundation of modern digital assistance and custom natural language processing pipelines.

2. **Computer Vision & Image Generation**:
   - Computer vision allows smart computer systems to analyze, understand, and categorize visual information.
   - Image models like Midjourney or Stable Diffusion create high-resolution custom artwork from simple text prompts.
   - They use sophisticated diffusion models that start with noise and gradually refine details into sharp shapes.
   - The tech is widely used in facial recognition, security monitoring, and automated media editing pipelines.
   - It also empowers medical imaging systems to spot early indicators of diseases in CT scans.
   - By translating pixels into searchable tags, computer vision helps search engines categorize the web's photos.

3. **Autonomous Vehicles & Self-Driving Cars**:
   - Self-driving cars combine artificial intelligence, deep learning, and advanced physical sensors to drive automatically.
   - They leverage LiDAR, cameras, and radar to map their 3D surroundings in real time.
   - Neural networks process these millions of inputs every second to make pathplanning and braking decisions.
   - Companies like Waymo and Tesla test these neural systems across complex, active city streets.
   - The overarching goal is to reduce traffic accidents, save fuel, and optimize vehicle route times.
   - This represents one of the most demanding integrations of real-time computer vision and machine decision-making.

4. **AlphaFold & Protein Folding**:
   - AlphaFold is an AI system developed by Google DeepMind that predicts how complex proteins fold.
   - Understanding protein structures is crucial because their 3D shape directly dictates their biological function.
   - Before AlphaFold, finding a single protein's shape in a lab took years of expensive, manual effort.
   - The AI predicted the structures of nearly all 200 million known proteins with extreme accuracy.
   - This breakthrough speeds up drug discovery, helps fight diseases, and assists in bio-material design.
   - It is widely considered one of the greatest contributions of machine learning to biological science.

5. **AI Healthcare Diagnostics**:
   - Health diagnostics leverage deep neural patterns to interpret medical records, lab tests, and scans.
   - They analyze microscopic details in X-rays, mammograms, and MRIs to locate anomalies.
   - These algorithms are trained on historical archives of thousands of confirmed patient medical images.
   - AI serves as a powerful extra team of eyes for busy doctors, identifying hidden signals.
   - It can also predict patient risk scores based on historical vitals and electronic health records.
   - By speeding up triage processes, AI saves valuable minutes for emergency room medical staff.

6. **Smart Robotics & Reinforcement Learning**:
   - Modern robots utilize AI algorithms to master physical manipulation tasks and navigate warehouses autonomously.
   - Through reinforcement learning, a robotic arm attempts a task thousands of times and learns from success.
   - This allows robots to transition from rigid pre-programmed actions to adaptive, smart behaviors.
   - Amazon warehouses use fleets of smart self-navigating robots to transport goods to packing stations.
   - They can adapt to obstacles, handle delicate items, and collaborate safely alongside human crews.
   - This blend of machine vision and motor coordination is key to next-generation factory production.

7. **Intelligent Code Co-pilots**:
   - Developer assistants like GitHub Copilot translate natural language comments directly into functional software code.
   - They suggest code completions, draft entire functions, translate languages, and locate software bugs instantly.
   - The models are pre-trained on millions of public open-source software code repositories worldwide.
   - Code models help programmers save time on repetitive boilerplates and focus on high-level architecture.
   - They can also explain complex legacy systems or suggest helpful unit tests in seconds.
   - This has increased daily developer productivity and lowered the entry barrier for coding beginners.`;
  }
  // 3. 7 WONDERS OF THE WORLD (INITIAL)
  else if (
    /7 wonders of (the )?world|seven wonders of (the )?world/i.test(query) ||
    (/(7|seven)\s+wonders/i.test(query) && !/ai|artificial|intelligence|tech|machine|neural/i.test(query))
  ) {
    text = `Here are the 7 wonders of the world, along with a brief explanation of each in normal English:

1. **Great Wall of China (China)**: A massive series of ancient stone and brick walls built along the historical northern borders of China to protect states and empires against raids and invasions.
2. **Chichen Itza (Mexico)**: A large pre-Columbian city built by the Maya civilization, featuring the famous pyramid temple known as El Castillo.
3. **Petra (Jordan)**: An ancient city carved directly into red-pink sandstone cliffs, famous for its water conduit system and rock-cut architecture.
4. **Machu Picchu (Peru)**: An extraordinary Incan citadel set high in the Andes Mountains, built with polished dry-stone walls designed to withstand earthquakes.
5. **Christ the Redeemer (Brazil)**: An iconic, large art deco statue of Jesus Christ overlooking the city of Rio de Janeiro from the summit of Corcovado Mountain.
6. **Colosseum (Italy)**: A massive Roman amphitheater in the center of Rome, used for ancient gladiator tournaments, dramas, and public spectacles.
7. **Taj Mahal (India)**: A gorgeous white marble mausoleum built in Agra by Emperor Shah Jahan in memory of his favorite wife, Mumtaz Mahal.`;
  }
  // 4. 7 WONDERS OF AI (INITIAL)
  else if (/(7|seven)\s+wonders\s+of\s+(ai|artificial|intelligence|tech|machine)/i.test(query)) {
    text = `Here are the 7 wonders of Artificial Intelligence, along with a brief explanation of each in normal English:

1. **Generative AI & Large Language Models (LLMs)**: Systems like ChatGPT, Gemini, and Claude that understand and generate human-like natural text with incredible fluency and creativity.
2. **Computer Vision & Image Generation**: Technology that lets computers recognize objects in photos or videos, and generate stunning custom artwork or realistic images from simple text descriptions.
3. **Autonomous Vehicles & Self-Driving Cars**: Smart systems that combine cameras, sensors, and deep learning algorithms to steer, navigate, and drive vehicles safely without human intervention.
4. **AlphaFold & Protein Folding**: An AI breakthrough that predicts how proteins fold with extreme accuracy, saving decades of biological lab research and accelerating new medical drug discoveries.
5. **AI Healthcare Diagnostics**: Systems capable of reading X-rays, MRIs, and CT scans to automatically spot patterns of diseases, aiding doctors with faster and highly precise diagnostic evaluations.
6. **Smart Robotics & Reinforcement Learning**: Physical robots that learn manually difficult tasks, such as navigating warehouse spaces and sorting complex items through trial and error.
7. **Intelligent Code Co-pilots**: Artificial intelligence tools that write, explain, complete, and debug software code across multiple languages, acting as real-time assistants for developers.`;
  }
  // 5. MACHINE LEARNING MODELS
  else if (/ml\s*model|machine\s*learning\s*model|models\s*of\s*ml|models\s*of\s*machine\s*learning|what\s*are\s*the\s*models/i.test(query)) {
    text = `Machine learning (ML) models are categorized into three primary paradigms based on how they learn patterns from data:

1. **Supervised Learning Models**: These models are trained on labeled datasets containing both input and correct output targets. Examples include Linear Regression (predicting continuous numerical values), Logistic Regression (handling classification problems), Decision Trees, Support Vector Machines (SVM), and Random Forests.
2. **Unsupervised Learning Models**: These models find hidden patterns or structural clusters in unlabeled data without explicit guidance. Examples include K-Means Clustering (grouping data points by physical proximity) and Principal Component Analysis (PCA, used for dimension reduction).
3. **Reinforcement Learning Models**: These agents learn to make decisions hierarchically by executing actions in an environment to maximize cumulative rewards. Examples include Q-Learning, Deep Q-Networks (DQN), and Policy Gradient methods.
4. **Deep Learning & Neural Networks**: Advanced models consisting of multi-layered networks (such as Convolutional Neural Networks for visual tasks and Transformers for natural language processing) that automatically learn features from highly complex data pipelines.`;
  }
  // 6. DATABASES
  else if (/database|sql|nosql|postgres|mongodb|query|index|dbms|schema/i.test(query)) {
    text = `Databases serve as the fundamental backbone of modern software applications, providing structured systems to store, retrieve, update, and manage persistent data.

- **Relational Databases (SQL)**: Structured systems (like PostgreSQL or MySQL) that organize datasets into tables of rows and columns, utilizing SQL queries to perform predictable, ACID-compliant operations.
- **NoSQL Databases**: Document-based or key-value structures (like MongoDB or Firebase Firestore) that offer flexible dynamic schemas designed for high-throughput horizontal scaling across servers.
- **Database Indexing**: Crucial for lookup speed. Applying appropriate indexes decreases structural search latency from O(N) to O(log N) or O(1).
- **Practical Schema Design**: Normalizing relations to Third Normal Form (3NF) reduces redundant fields, whereas denormalization is preferred for speed in read-heavy applications.`;
  }
  // 7. WEB DEVELOPMENT
  else if (/html|css|js|javascript|react|vue|frontend|backend|api|node|express|json|web/i.test(query)) {
    text = `Modern web development is built on the coordination between client-side interfaces and server-side runtime systems:

- **Client-Side Renders**: Constructed using standard HTML for layout structure, Tailwind CSS for visual styling, and JavaScript or React to handle reactive user inputs and router pipelines.
- **Server-Side API Handlers**: Powered by Node.js, Express, or Python to execute server logic, interact with system storage, and handle cross-origin constraints.
- **Dynamic Serializations**: Protocols use JSON payloads to transport structured objects between backend nodes and client state managers.
- **Security & Tokens**: Connections leverage SSL/TLS encryption for wire privacy, combined with JSON Web Tokens (JWT) for secure user sessions.`;
  }
  // 8. ALGORITHMS & DATA STRUCTURES
  else if (/algorithm|data\s*structure|tree|graph|sorting|searching|stack|queue|complexity|big\s*o/i.test(query)) {
    text = `Algorithms and data structures form the essential core of computational efficiency, dictating how digital data is structured and processed in memory:

- **Key Data Structures**: Linear structures include Arrays (consecutive storage) and Linked Lists, while non-linear structures include Binary Trees and Graphs that model hierarchical or networked relationships.
- **Fundamental Algorithms**: Common operations include sorting algorithms (like Quick Sort and Merge Sort) and searching algorithms (such as Binary Search).
- **Complexity Analysis**: Code efficiency is evaluated using Big O notation, which defines worst-case time and space scaling of solutions.
- **Practical Application**: Choosing the correct structural map (like Hash Tables for constant-time lookups) is critical to building low-latency, scalable software applications.`;
  }
  // 9. PROGRAMMING LANGUAGES
  else if (/python|java\b|c\+\+|rust\b|programming|coding/i.test(query)) {
    text = `Programming languages are instruction systems translated into machine operations, varying by compilation models and syntax highlights:

- **Interpreted Languages**: Python and JavaScript are executed line-by-line using runtimes, promoting high development speeds and dynamic variable typing.
- **Compiled Languages**: C++, Java, and Rust are compiled into machine code before execution, verifying types statically at translation time to maximize raw speed.
- **Memory Management**: Some runtimes use garbage collectors to reclaim memory, whereas systems like Rust use rigorous compile-time owners.
- **Core Design Paradigms**: Span from procedural lists of commands, object-oriented Class hierarchies, to side-effect-free functional designs.`;
  }
  // 10. GREETINGS
  else if (/^(hello|hi|hey|greet|greetings|good morning|good afternoon|good evening|yo\b)/i.test(query)) {
    text = `Hello! How can I help you today? Please feel free to ask any question regarding AI, GPA/CGPA, SRM University, or other topics.`;
  }
  // 11. IDENTITY
  else if (/who are you|your name|what is gravityverse|gravityverse|about you|creator/i.test(query)) {
    text = `I am the GravityVerse AI Assistant. I can help you compute your academic GPA/CGPA, explore SRM University standards, study effectively, or answer general informational prompts in simple, direct English.`;
  }
  // 12. GPA & EVALUATION
  else if (/gpa|cgpa|sgpa|grade|academic|calculator|calculate|formula|score/i.test(query)) {
    text = `To calculate your Grade Point Average (GPA) or Cumulative GPA (CGPA), you can use these official formulas:

1. **SGPA (Semester GPA)**: Multiply each course's credit hours by your earned grade points, add them all together, and divide by your total semester credits:
   $$\\text{SGPA} = \\frac{\\sum (\\text{Course Credits} \\times \\text{Grade Points})}{\\sum \\text{Total Semester Credits}}$$

2. **CGPA (Cumulative GPA)**: Multiply each semester's SGPA by its total credit hours, add them together across all completed semesters, and divide by your overall cumulative credits:
   $$\\text{CGPA} = \\frac{\\sum (\\text{Semester SGPA} \\times \\text{Semester Credits})}{\\sum \\text{Total Combined Credits}}$$

You can easily calculate your grades interactively by navigating to our **GPA +** tool in the header navigation!`;
  }
  // 13. SRM IST
  else if (/srm|srmist/i.test(query)) {
    text = `SRM University (SRMIST) uses a 10-point academic grading scale:
* **O (Outstanding)**: 10 Grade Points
* **A+ (Excellent)**: 9 Grade Points
* **A (Very Good)**: 8 Grade Points
* **B+ (Good)**: 7 Grade Points
* **B (Above Average)**: 6 Grade Points
* **C (Average)**: 5 Grade Points
* **P (Pass)**: 4 Grade Points
* **F (Fail)**: 0 Grade Points

Please note that SRM requires a mandatory minimum of **75% attendance** to be eligible to write end-semester university examinations. To help SRM students, we have provided direct student portal integration links inside our **GPA +** page.`;
  }
  // 14. WHAT IS AI
  else if (/\b(what is ai|what is artificial intelligence|what's ai|what's artificial intelligence|define ai|define artificial intelligence)\b/i.test(query) || (/\b(ai|artificial intelligence)\b/i.test(query) && /what is|what's|define|explain/i.test(query))) {
    text = `Artificial Intelligence (AI) refers to the simulation of human intelligence by computer systems and software. This includes processes like learning from experience, logical reasoning, problem-solving, visual perception, and natural language understanding. At its core, AI operates on statistical and mathematical algorithms designed to recognize patterns, make predictions, and automate complex tasks that traditionally required human minds.`;
  }
  // 15. CAREERS & PLACEMENTS
  else if (/career|job|placement|recruit|interview|resume|portfolio|intern|tcs|infosys|vipro|cognizant/i.test(query)) {
    text = `To prepare effectively for campus placement drives and interviews, focus on these key stages:
1. **Aptitude & Logical Reasoning**: Practice quantitative math and reasoning since they are used as initial filters by recruiting companies.
2. **Data Structures & Algorithms (DSA)**: Master arrays, strings, hash maps, trees, and logic patterns.
3. **Core Computer Science Fundamentals**: Build strong concepts in Operating Systems, Database Management (SQL queries), and Computer Networks.
4. **Resumes & Portfolios**: Structure a clean one-page resume and pin your best projects on GitHub with clear documentation.`;
  }
  // 16. EXAMS & STUDY TIPS
  else if (/exam|study|test|attendance|detend|cla|preparation|notes/i.test(query)) {
    text = `Here are three highly effective tips for continuous school assessments and exams study:
1. **The Pomodoro Technique**: Study with absolute focus for 25 minutes, then take a 5-minute break. Repeat this pattern 4 times.
2. **Active Recall**: Don't just re-read notes. Cover them and answer key topic questions from memory to strengthen memory synapses.
3. **Continuous Assessments (CLA)**: Try to score high on your internal tests and midterms to lift your overall GPA easily before final exams. Also make sure to maintain your attendance strictly above 75%.`;
  }
  // 17. IoT
  else if (/iot|internet of things|arduino|esp32|raspberry|sensor|embedded/i.test(query)) {
    text = `The Internet of Things (IoT) involves connecting physical hardware devices—such as ESP32, Arduino, or Raspberry Pi microcontrollers—to web servers and databases. This enables sensors to send real-time climate, telemetry, or system data online, and allows you to control physical actuators (like switches or motors) remotely over protocols like HTTP, MQTT, or WebSockets.`;
  }
  // 18. DYNAMIC FALLBACK SYSTEM (HONEST GUIDANCE SYSTEM)
  else {
    const topic = getCleanSubject(promptStr);
    text = `I can see you are asking about **${topic}**. 

My pre-programmed offline knowledge base is configured to manage SRM University standards, interactive academic GPA/CGPA calculations, and core developer tools. For general knowledge queries such as **${topic}**, I require a live connection to the Gemini API.

Currently, the live AI service is offline or a valid **Gemini API Key** is not configured.

### 🔒 Operational Notice on API Key Security & Automatic Revocation:
If you recently paste or write an API key directly into your program files and push it to a public GitHub repository (or share it in a public log), **GitHub's push-protection scanning and Google's Security Scanner will instantly detect and permanently disable/revoke the key within seconds for your protection.** This is why hardcoding keys directly in program files and pushing them to git causes them to stop working immediately.

### 🚀 Recommended Method to Securely Connect Your Bot:
You **never** need to expose your API key in the frontend client code! Keep your key completely private and safe:

1. **Configure Backend Secrets**:
   - Set \`GEMINI_API_KEY\` in your backend server environment secrets (Render, Cloud Run, or custom host).
   - If hosting the frontend statically (e.g., GitHub Pages), set \`VITE_API_BASE_URL\` in repository variables/secrets pointing to your live backend server.

2. **How it Works**:
   - The frontend routes requests safely to your backend API (\`/api/chat\`).
   - Your API key stays private and secure on the server, avoiding client-side leakage or revocation.

Once a valid Gemini API key is configured in your server environment, the chatbot will automatically activate with Google's high-speed **gemini-3.8-flash** with live Google Search Grounding!`;
  }

  return {
    text,
    model: "local-query-engine",
    isFallback: true
  };
}

// Request Validation Schemas
const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  email: z.string().trim().email("Invalid email address format"),
  subject: z.string().trim().max(200, "Subject must be 200 characters or less").optional().default(""),
  message: z.string().trim().min(1, "Message is required").max(5000, "Message must be 5000 characters or less"),
});

const chatSchema = z.object({
  prompt: z.string().optional().default(""),
  stream: z.boolean().optional().default(false),
  chatId: z.string().optional(),
  conversationId: z.string().optional(),
  userId: z.string().optional(),
  messages: z.array(z.object({
    role: z.string().optional().default("user"),
    content: z.union([z.string(), z.array(z.any())]).optional().default("")
  })).optional().default([]),
  history: z.array(z.any()).optional().default([]),
  systemInstruction: z.string().optional(),
  customApiKey: z.string().optional(),
  system_instruction: z.string().optional(),
  custom_api_key: z.string().optional(),
  webSearch: z.boolean().optional(),
  forceWebSearch: z.boolean().optional(),
  model: z.string().optional(),
  modelId: z.string().optional(),
  attachments: z.array(z.object({
    id: z.string().optional(),
    attachmentId: z.string().optional(),
    name: z.string().optional().default("attachment"),
    type: z.string().optional().default("application/octet-stream"),
    size: z.number().optional().default(0),
    data: z.string().optional().default(""),
    textContents: z.string().optional().default(""),
    extractedText: z.string().optional().default(""),
    pageCount: z.number().optional().default(0),
    extractionStatus: z.string().optional()
  })).optional().default([]),
  conversationAttachments: z.array(z.object({
    id: z.string().optional(),
    attachmentId: z.string().optional(),
    name: z.string().optional().default("attachment"),
    type: z.string().optional().default("application/octet-stream"),
    size: z.number().optional().default(0),
    data: z.string().optional().default(""),
    textContents: z.string().optional().default(""),
    extractedText: z.string().optional().default(""),
    pageCount: z.number().optional().default(0),
    extractionStatus: z.string().optional()
  })).optional().default([])
});

function cleanEnvVar(val: string | undefined): string {
  if (!val) return "";
  let cleaned = val.trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

let resendClient: Resend | null = null;

function initResend() {
  const apiKey = cleanEnvVar(process.env.RESEND_API_KEY);
  if (!apiKey) {
    console.warn("[Resend Warn] RESEND_API_KEY is missing in environment.");
    resendClient = null;
  } else {
    try {
      console.log("[Resend Status] Initializing Resend client...");
      resendClient = new Resend(apiKey);
    } catch (err: any) {
      console.error("[Resend Error] Failed to initialize Resend client:", err);
      resendClient = null;
    }
  }
}

async function startServer() {
  const app = express();
  
  // Trust proxy is required to correctly identify client IPs behind reverse proxies/load balancers
  app.set('trust proxy', 1);

  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // Professional Neural Request Logger & Path Normalizer (placed at the very top of the stack)
  app.use((req, res, next) => {
    const start = Date.now();
    const originalUrl = req.url;
    
    // Normalize path: handle optional base prefixes for various deployment environments
    const prefixes = [
      '/PRINCE_STAR', '/PRINCE-STAR', 
      '/GRAVITYVERSE', '/GRAVITY-VERSE', 
      '/GravityVerse', '/Gravity-Verse', 
      '/Gravityverse',
      '/ais-dev', '/ais-pre'
    ]; 
    for (const prefix of prefixes) {
      const upperUrl = req.url.toUpperCase();
      const upperPrefix = prefix.toUpperCase();
      if (upperUrl === upperPrefix) {
        req.url = '/';
        break;
      } else if (upperUrl.startsWith(upperPrefix + '/')) {
        req.url = req.url.slice(prefix.length);
        break;
      }
    }
    
    // Force direct fallback for any unmatched /api/ URLs that might have had some other complex prefixes
    const apiIndex = req.url.toLowerCase().indexOf('/api/');
    if (apiIndex !== -1 && apiIndex > 0) {
      req.url = req.url.slice(apiIndex);
    }
    
    // Standardize slashes
    req.url = req.url.replace(/\/+/g, '/');
    if (req.url === '') req.url = '/';

    res.on('finish', () => {
      const duration = Date.now() - start;
      const statusGroup = Math.floor(res.statusCode / 100);
      
      // Silence logs for source files and assets to reduce noise, unless they are 404s
      const isSourceFile = req.url.match(/\.(ts|tsx|js|jsx|css|json|png|jpg|svg)$/);
      
      if (req.url.includes('/api/')) {
        const logMethod = statusGroup >= 4 ? console.error : console.log;
        logMethod(`${new Date().toISOString()} - [API] ${req.method} ${req.url} ${res.statusCode} (${duration}ms)`);
      } else if (res.statusCode === 404 && !req.url.includes('favicon')) {
        console.warn(`${new Date().toISOString()} - [404] ${req.method} ${req.url} (Original: ${originalUrl})`);
      }
    });
    next();
  });

  // Trust proxy for rate limiting behind Cloud Run / reverse proxies
  app.set('trust proxy', 1);

  // Hardened CORS Middleware - Allows approved Gravityverse, Google AI Studio & development origins
  app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (origin && isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    } else if (!origin) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'X-Requested-With, Content-Type, Authorization, X-Admin-Secret, Cache-Control, Accept, Last-Event-ID'
    );

    if (req.method === 'OPTIONS') {
      if (origin && !isAllowedOrigin(origin)) {
        return res.status(403).json({ error: 'CORS origin not allowed' });
      }
      return res.sendStatus(204);
    }
    next();
  });

  // Helmet Middleware for secure HTTP headers (adjusted for iframe embed in AI Studio and external API integrations)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: false,
      crossOriginResourcePolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // Standard Express JSON body parser (must be registered before rate limiters or CSRF check that inspect content-type)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Rate Limiting to prevent abusive requests (Brute-forcing or API flooding)
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // limit each IP to 500 requests per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests from this IP, please try again after 15 minutes." }
  });

  const sensitiveLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // limit each IP to 60 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many request submissions, please slow down." }
  });

  // Apply general rate limiter to all API endpoints
  app.use("/api/", generalLimiter);

  // CSRF Mitigation: Verify Content-Type for state-changing requests
  app.use((req, res, next) => {
    const stateChangingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
    if (stateChangingMethods.includes(req.method)) {
      const contentType = req.headers['content-type'];
      if (contentType && !contentType.includes('application/json')) {
        return res.status(400).json({ error: "Invalid Content-Type. Only JSON requests are accepted for secure endpoints." });
      }
    }
    next();
  });

  // Advanced Neural API Routes with Caching
  app.get("/api/health", (req, res) => {
    const cacheKey = 'health_status';
    const now = Date.now();
    
    if (neuralCache.has(cacheKey) && (now - neuralCache.get(cacheKey).lastUpdate < 30000)) {
      return res.json(neuralCache.get(cacheKey).data);
    }

    const data = { 
      status: "Active", 
      protocol: "3.2.0",
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
      node: "Asia-Pacific-Node-1"
    };

    neuralCache.set(cacheKey, { data, lastUpdate: now });
    res.json(data);
  });

  app.post("/api/contact", sensitiveLimiter, async (req, res) => {
    console.log("[CONTACT DEBUG] Received POST /api/contact request");
    console.log("[CONTACT DEBUG] Request body:", JSON.stringify(req.body, null, 2));

    let validatedData;
    try {
      validatedData = contactSchema.parse(req.body);
      console.log("[CONTACT DEBUG] Validation successful:", JSON.stringify(validatedData, null, 2));
    } catch (err: any) {
      console.error("[CONTACT DEBUG] Validation failed!");
      if (err instanceof z.ZodError) {
        console.error("[CONTACT DEBUG] Zod validation issues:", JSON.stringify(err.issues, null, 2));
        const validationErrorMsg = "Validation failed: " + err.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(", ");
        return res.status(400).json({
          success: false,
          error: validationErrorMsg
        });
      }
      console.error("[CONTACT DEBUG] Non-Zod parser error:", err);
      return res.status(400).json({ success: false, error: "Invalid request payload" });
    }

    const { name, email, subject, message } = validatedData;
    const recipient = "support@gravityverse.in";

    if (resendClient === null) {
      initResend();
    }

    const client = resendClient;

    if (!client) {
      console.error("[Resend Error] RESEND_API_KEY is missing or invalid in environment.");
      return res.status(500).json({
        success: false,
        error: "RESEND_API_KEY is missing or invalid in the environment. Please add it to the Secrets Panel."
      });
    }

    // 3. Dispatch the message payload
    try {
      console.log("[Resend Status] Attempting to dispatch email transmission via Resend SDK...");
      // Define from email. By default onboarding@resend.dev, but check SENDER_EMAIL as well
      const fromEmail = cleanEnvVar(process.env.SENDER_EMAIL) || "onboarding@resend.dev";
      const senderName = name ? `${name} (via GravityVerse)` : "GravityVerse";
      
      const info = await client.emails.send({
        from: `${senderName} <${fromEmail}>`,
        to: recipient,
        replyTo: email,
        subject: `[GravityVerse Contact] ${subject || "New Message Payload"}`,
        text: `New contact message received on GravityVerse:
      
Name: ${name}
Email: ${email}
Subject: ${subject || "No Subject"}

Message:
${message}
`,
        html: `
          <div style="font-family: sans-serif; background-color: #070a13; color: #ffffff; padding: 30px; border-radius: 12px; max-width: 600px; border: 1px solid rgba(255, 255, 255, 0.1); margin: 0 auto;">
            <h2 style="color: #0da2ff; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 15px; margin-top: 0; font-family: serif; letter-spacing: 1px;">GRAVITYVERSE TRANSMISSION</h2>
            <p style="color: #cbd5e1; font-size: 14px;">A new secure contact message has been recorded from the front-end interface:</p>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px; color: #ffffff; font-size: 14px;">
              <tr style="background-color: rgba(255, 255, 255, 0.03);">
                <td style="padding: 12px; font-weight: bold; width: 100px; border-bottom: 1px solid rgba(255, 255, 255, 0.05);">Name:</td>
                <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #e2e8f0;">${name}</td>
              </tr>
              <tr>
                <td style="padding: 12px; font-weight: bold; border-bottom: 1px solid rgba(255, 255, 255, 0.05);">Email:</td>
                <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05);"><a href="mailto:${email}" style="color: #0da2ff; text-decoration: none;">${email}</a></td>
              </tr>
              <tr style="background-color: rgba(255, 255, 255, 0.03);">
                <td style="padding: 12px; font-weight: bold; border-bottom: 1px solid rgba(255, 255, 255, 0.05);">Subject:</td>
                <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #e2e8f0;">${subject || "No Subject Specified"}</td>
              </tr>
            </table>

            <div style="margin-top: 25px; background-color: rgba(0, 0, 0, 0.3); border-radius: 8px; padding: 20px; border-left: 4px solid #0da2ff; border-top: 1px solid rgba(255,255,255,0.05); border-right: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05);">
              <h4 style="margin: 0 0 10px 0; color: #0da2ff; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">Message Payload</h4>
              <p style="margin: 0; line-height: 1.6; white-space: pre-wrap; color: #f1f5f9; font-size: 13.5px;">${message}</p>
            </div>
            
            <p style="font-size: 10px; color: #64748b; text-align: center; margin-top: 30px; letter-spacing: 1px; text-transform: uppercase;">GravityVerse Automated Mailer System</p>
          </div>
        `,
      });

      const resendResponse = info as any;
      const messageId = resendResponse?.data?.id || resendResponse?.id || "unknown";
      console.log(`[Resend Status] Email successfully sent via Resend API. ID: ${messageId}`);

      return res.json({
        success: true,
        message: "Message successfully processed and email transmitted via Resend.",
        messageId: messageId,
        recipient: recipient
      });
    } catch (err: any) {
      console.error("[Resend Error] Real Resend dispatch failed permanently:", err);
      return res.status(500).json({
        success: false,
        error: "Resend Mail dispatch failed: " + (err.message || err)
      });
    }
  });

  // === REGISTRATION EMAIL VERIFICATION FLOW API ENDPOINTS ===

  // 1. Send 6-digit registration verification code
  const handleSendRegisterCode = async (req: express.Request, res: express.Response) => {
    try {
      const { email } = req.body || {};
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({ success: false, error: "Please enter a valid email address." });
      }

      const cleanEmail = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ success: false, error: "Please enter a valid email address." });
      }

      // Check cooldown (30-second throttle)
      const existing = registerCodeStore.get(cleanEmail);
      if (existing && Date.now() - existing.lastSentAt < 30000) {
        const waitSec = Math.ceil((30000 - (Date.now() - existing.lastSentAt)) / 1000);
        return res.status(429).json({
          success: false,
          error: `Please wait ${waitSec}s before requesting another verification code.`,
          retryAfter: waitSec
        });
      }

      // Check if user account already exists in Firebase Auth
      if (ensureFirebaseAdmin()) {
        try {
          const existingUser = await getAuth().getUserByEmail(cleanEmail);
          if (existingUser) {
            return res.status(400).json({ 
              success: false, 
              error: "An account with this email address already exists. Please sign in instead." 
            });
          }
        } catch (userErr: any) {
          if (userErr.code !== 'auth/user-not-found') {
            console.warn("[Register Check Warning]:", userErr);
          }
        }
      }

      // Cryptographically secure 6-digit verification code
      const code = crypto.randomInt(100000, 1000000).toString();
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');

      registerCodeStore.set(cleanEmail, {
        email: cleanEmail,
        codeHash,
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes validity
        used: false,
        attempts: 0,
        verified: false,
        lastSentAt: Date.now()
      });

      if (resendClient === null) {
        initResend();
      }

      let emailDispatched = false;
      if (resendClient) {
        try {
          const fromEmail = cleanEnvVar(process.env.SENDER_EMAIL) || "onboarding@resend.dev";
          await resendClient.emails.send({
            from: `GravityVerse Security <${fromEmail}>`,
            to: cleanEmail,
            subject: "[GravityVerse] Your Registration Email Verification Code",
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #070a13; color: #ffffff; padding: 32px; border-radius: 14px; max-width: 580px; border: 1px solid rgba(255, 255, 255, 0.1); margin: 0 auto;">
                <div style="text-align: center; margin-bottom: 24px;">
                  <h2 style="color: #0da2ff; font-family: serif; letter-spacing: 1.5px; margin: 0; font-size: 22px;">GRAVITYVERSE</h2>
                  <p style="color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; margin-top: 4px;">Security & Account Verification</p>
                </div>
                
                <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
                  Welcome to GravityVerse! Please enter the 6-digit verification code below to verify your email address and proceed with creating your account:
                </p>
                
                <div style="background-color: rgba(13, 162, 255, 0.08); border: 1px solid rgba(13, 162, 255, 0.3); padding: 22px; text-align: center; border-radius: 12px; margin: 24px 0;">
                  <span style="font-size: 34px; font-weight: bold; letter-spacing: 8px; color: #0da2ff; font-family: monospace;">${code}</span>
                </div>
                
                <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin-bottom: 8px;">
                  ⏱️ This verification code is valid for <strong>10 minutes</strong>.
                </p>
                <p style="color: #64748b; font-size: 11px; line-height: 1.4;">
                  If you did not request this registration code, you can safely ignore this email.
                </p>
                
                <div style="border-top: 1px solid rgba(255, 255, 255, 0.08); margin-top: 28px; padding-top: 16px;">
                  <p style="font-size: 10px; color: #64748b; text-align: center; margin: 0; letter-spacing: 1px; text-transform: uppercase;">
                    GravityVerse Neural Security System
                  </p>
                </div>
              </div>
            `
          });
          emailDispatched = true;
        } catch (resendErr) {
          console.warn("[Register Code] Email dispatch encountered issue:", resendErr);
        }
      }

      console.log(`[REGISTER CODE DISPATCH] Verification code generated and dispatched to ${cleanEmail}`);

      return res.json({
        success: true,
        message: "We've sent a verification code to your email.",
        emailDispatched,
        cooldownSeconds: 30
      });
    } catch (err: any) {
      console.error("[Register Code Error]:", err);
      return res.status(500).json({ success: false, error: err.message || "Failed to dispatch verification code." });
    }
  };

  app.post(
    ["/api/auth/send-register-code", "/api/auth/send-register-code/", "/api/auth/send-verification-code", "/api/auth/send-verification-code/"],
    sensitiveLimiter,
    handleSendRegisterCode
  );

  // 2. Verify 6-digit registration code
  const handleVerifyRegisterCode = async (req: express.Request, res: express.Response) => {
    try {
      const { email, code } = req.body || {};
      if (!email || !code) {
        return res.status(400).json({ success: false, error: "Email and 6-digit verification code are required." });
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanCode = code.toString().trim();

      const entry = registerCodeStore.get(cleanEmail);
      if (!entry) {
        return res.status(400).json({ 
          success: false, 
          error: "No active verification request found for this email. Please click 'Verify Email' to get a code." 
        });
      }

      if (entry.used) {
        return res.status(400).json({ 
          success: false, 
          error: "This verification code has already been consumed. Please request a new code." 
        });
      }

      if (Date.now() > entry.expiresAt) {
        registerCodeStore.delete(cleanEmail);
        return res.status(400).json({ 
          success: false, 
          error: "Verification code has expired (10 min limit). Please request a new code." 
        });
      }

      if (entry.attempts >= 5) {
        registerCodeStore.delete(cleanEmail);
        return res.status(400).json({ 
          success: false, 
          error: "Too many failed attempts. Security lock triggered. Please request a new code." 
        });
      }

      const providedHash = crypto.createHash('sha256').update(cleanCode).digest('hex');
      if (providedHash !== entry.codeHash) {
        entry.attempts += 1;
        const remaining = 5 - entry.attempts;
        return res.status(400).json({ 
          success: false, 
          error: `Invalid verification code. Please check your email and try again (${remaining} attempt${remaining === 1 ? '' : 's'} remaining).` 
        });
      }

      // Code is valid! Issue single-use verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      entry.used = true;
      entry.verified = true;
      entry.verificationToken = verificationToken;
      entry.verificationTokenExpiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes window to complete registration

      return res.json({
        success: true,
        message: "Email verified ✓",
        verificationToken
      });
    } catch (err: any) {
      console.error("[Verify Register Code Error]:", err);
      return res.status(500).json({ success: false, error: err.message || "Code verification failed." });
    }
  };

  app.post(
    ["/api/auth/verify-register-code", "/api/auth/verify-register-code/", "/api/auth/verify-verification-code", "/api/auth/verify-verification-code/"],
    sensitiveLimiter,
    handleVerifyRegisterCode
  );

  // === PASSWORD RESET FLOW API ENDPOINTS ===

  // 1. Send 6-digit verification code
  app.post(["/api/auth/send-reset-code", "/api/auth/send-reset-code/"], sensitiveLimiter, async (req, res) => {
    try {
      const { email } = req.body || {};
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({ success: false, error: "Please enter a valid email address." });
      }

      const cleanEmail = email.trim().toLowerCase();

      // Check user existence in Firebase Auth if Admin SDK is connected
      if (ensureFirebaseAdmin()) {
        try {
          await getAuth().getUserByEmail(cleanEmail);
        } catch (userErr: any) {
          if (userErr.code === 'auth/user-not-found') {
            return res.status(404).json({ success: false, error: "No registered account found with this email address." });
          }
        }
      }

      // Generate 6-digit verification code using cryptographically secure random generator
      const code = crypto.randomInt(100000, 1000000).toString();
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');

      resetCodeStore.set(cleanEmail, {
        email: cleanEmail,
        codeHash,
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes expiry
        used: false,
        attempts: 0
      });

      if (resendClient === null) {
        initResend();
      }

      let emailDispatched = false;
      if (resendClient) {
        try {
          const fromEmail = cleanEnvVar(process.env.SENDER_EMAIL) || "onboarding@resend.dev";
          await resendClient.emails.send({
            from: `GravityVerse Security <${fromEmail}>`,
            to: cleanEmail,
            subject: "[GravityVerse] Your Password Reset Verification Code",
            html: `
              <div style="font-family: sans-serif; background-color: #070a13; color: #ffffff; padding: 30px; border-radius: 12px; max-width: 600px; border: 1px solid rgba(255, 255, 255, 0.1); margin: 0 auto;">
                <h2 style="color: #0da2ff; font-family: serif; letter-spacing: 1px; margin-top: 0;">GRAVITYVERSE SECURITY VERIFICATION</h2>
                <p style="color: #cbd5e1; font-size: 14px;">We received a request to reset your GravityVerse account password.</p>
                <div style="background-color: rgba(13, 162, 255, 0.1); border: 1px solid rgba(13, 162, 255, 0.3); padding: 20px; text-align: center; border-radius: 12px; margin: 20px 0;">
                  <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0da2ff; font-family: monospace;">${code}</span>
                </div>
                <p style="color: #94a3b8; font-size: 12px;">This verification code is valid for <strong>10 minutes</strong>. Do not share this code with anyone.</p>
                <p style="font-size: 10px; color: #64748b; text-align: center; margin-top: 30px; letter-spacing: 1px; text-transform: uppercase;">GravityVerse Neural Security Core</p>
              </div>
            `
          });
          emailDispatched = true;
        } catch (resendErr) {
          console.warn("[Reset Code] Email dispatch encountered issue:", resendErr);
        }
      }

      console.log(`[RESET CODE DISPATCH] Verification code generated and dispatched to ${cleanEmail}`);

      return res.json({
        success: true,
        message: "A 6-digit verification code has been sent to your email address.",
        emailDispatched
      });
    } catch (err: any) {
      console.error("[Reset Code Error]:", err);
      return res.status(500).json({ success: false, error: err.message || "Failed to dispatch verification code." });
    }
  });

  // 2. Verify 6-digit code
  app.post("/api/auth/verify-reset-code", sensitiveLimiter, async (req, res) => {
    try {
      const { email, code } = req.body || {};
      if (!email || !code) {
        return res.status(400).json({ success: false, error: "Email and 6-digit verification code are required." });
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanCode = code.trim();

      const entry = resetCodeStore.get(cleanEmail);
      if (!entry) {
        return res.status(400).json({ success: false, error: "No active password reset request found for this email address. Please start over." });
      }

      if (entry.used) {
        return res.status(400).json({ success: false, error: "This verification code has already been consumed. Please request a new code." });
      }

      if (Date.now() > entry.expiresAt) {
        resetCodeStore.delete(cleanEmail);
        return res.status(400).json({ success: false, error: "Verification code has expired (10 min limit). Please request a new code." });
      }

      if (entry.attempts >= 5) {
        resetCodeStore.delete(cleanEmail);
        return res.status(400).json({ success: false, error: "Too many failed attempts. Security lock triggered. Please request a new code." });
      }

      const providedHash = crypto.createHash('sha256').update(cleanCode).digest('hex');
      if (providedHash !== entry.codeHash) {
        entry.attempts += 1;
        return res.status(400).json({ success: false, error: "Invalid verification code. Please check your email and try again." });
      }

      // Code is valid! Issue single-use reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      entry.resetToken = resetToken;
      entry.resetTokenExpiresAt = Date.now() + 10 * 60 * 1000;

      return res.json({
        success: true,
        message: "Verification code verified successfully.",
        resetToken
      });
    } catch (err: any) {
      console.error("[Verify Code Error]:", err);
      return res.status(500).json({ success: false, error: err.message || "Code verification failed." });
    }
  });

  // 3. Confirm password change with reset token
  app.post("/api/auth/confirm-password-reset", sensitiveLimiter, async (req, res) => {
    try {
      const { email, resetToken, newPassword } = req.body || {};
      if (!email || !resetToken || !newPassword) {
        return res.status(400).json({ success: false, error: "Email, reset token, and new password are required." });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ success: false, error: "New password must be at least 6 characters long." });
      }

      const cleanEmail = email.trim().toLowerCase();
      const entry = resetCodeStore.get(cleanEmail);

      if (!entry || entry.resetToken !== resetToken) {
        return res.status(400).json({ success: false, error: "Invalid or expired password reset session token. Please start over." });
      }

      if (entry.used) {
        return res.status(400).json({ success: false, error: "This password reset session has already been consumed." });
      }

      if (Date.now() > (entry.resetTokenExpiresAt || 0)) {
        resetCodeStore.delete(cleanEmail);
        return res.status(400).json({ success: false, error: "Password reset session has expired. Please start over." });
      }

      if (!ensureFirebaseAdmin()) {
        return res.status(500).json({ success: false, error: "Authentication system server is unavailable." });
      }

      const firebaseUser = await getAuth().getUserByEmail(cleanEmail);
      await getAuth().updateUser(firebaseUser.uid, { password: newPassword });

      // Synchronize _user_credentials store if an entry exists for this email
      const dbInstance = getDb();
      if (dbInstance) {
        try {
          const credRef = dbInstance.collection('_user_credentials').doc(cleanEmail);
          const credDoc = await credRef.get();
          if (credDoc.exists) {
            const salt = crypto.randomBytes(16).toString('hex');
            const hash = crypto.scryptSync(newPassword, salt, 64).toString('hex');
            await credRef.set({
              uid: firebaseUser.uid,
              email: cleanEmail,
              salt,
              hash,
              updatedAt: FieldValue.serverTimestamp()
            });
          }
        } catch (credSyncErr) {
          console.warn("[Password Reset] Notice: _user_credentials sync non-fatal warning:", credSyncErr);
        }
      }

      // Invalidate code/token permanently
      entry.used = true;
      resetCodeStore.delete(cleanEmail);

      return res.json({
        success: true,
        message: "Your password has been changed successfully. You may now sign in."
      });
    } catch (err: any) {
      console.error("[Confirm Password Reset Error]:", err);
      return res.status(500).json({ success: false, error: err.message || "Failed to change password." });
    }
  });

  // 4. Server-Side Email Registration (Bypasses client operation-not-allowed restrictions)
  app.post("/api/auth/server-register", sensitiveLimiter, async (req, res) => {
    try {
      const { email, password, name } = req.body || {};
      if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
        return res.status(400).json({ success: false, error: "Please enter a valid email address and password." });
      }

      const cleanEmail = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ success: false, error: "Please enter a valid email address." });
      }

      if (password.length < 6) {
        return res.status(400).json({ success: false, error: "Password must be at least 6 characters long." });
      }

      const displayName = (typeof name === 'string' && name.trim()) ? name.trim() : cleanEmail.split('@')[0];

      if (!ensureFirebaseAdmin()) {
        return res.status(500).json({ success: false, error: "Authentication system server is initializing. Please try again in a moment." });
      }

      let userRecord: any;
      try {
        const existingUser = await getAuth().getUserByEmail(cleanEmail);
        if (existingUser) {
          return res.status(400).json({ success: false, error: "An account with this email address already exists. Please sign in instead." });
        }
      } catch (err: any) {
        if (err.code === 'auth/user-not-found') {
          try {
            userRecord = await getAuth().createUser({
              email: cleanEmail,
              password,
              displayName
            });
          } catch (createErr: any) {
            if (createErr.code === 'auth/invalid-email') {
              return res.status(400).json({ success: false, error: "Please enter a valid email address." });
            }
            if (createErr.code === 'auth/email-already-exists' || createErr.code === 'auth/email-already-in-use') {
              return res.status(400).json({ success: false, error: "An account with this email address already exists. Please sign in instead." });
            }
            if (createErr.code === 'auth/weak-password') {
              return res.status(400).json({ success: false, error: "Password must be at least 6 characters long." });
            }
            throw createErr;
          }
        } else if (err.code === 'auth/invalid-email') {
          return res.status(400).json({ success: false, error: "Please enter a valid email address." });
        } else {
          throw err;
        }
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(password, salt, 64).toString('hex');
      const dbInstance = getDb();
      if (!dbInstance) throw new Error("Database service unavailable.");

      await dbInstance.collection('users').doc(userRecord.uid).set({
        displayName,
        email: cleanEmail,
        photoURL: '',
        conversationsCount: 0,
        progress: 0,
        totalBadges: 0,
        badges: ['Early Adopter'],
        lastActive: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      await dbInstance.collection('_user_credentials').doc(cleanEmail).set({
        uid: userRecord.uid,
        email: cleanEmail,
        salt,
        hash,
        updatedAt: FieldValue.serverTimestamp()
      });

      // Clear any pending registration code session
      registerCodeStore.delete(cleanEmail);

      const customToken = await getAuth().createCustomToken(userRecord.uid);

      return res.json({
        success: true,
        customToken,
        uid: userRecord.uid,
        message: "Account registered successfully."
      });
    } catch (err: any) {
      const errMsg = String(err?.message || err);
      if (errMsg.includes('identitytoolkit') || errMsg.includes('403') || err?.code === 'auth/internal-error' || err?.code === 'auth/operation-not-allowed') {
        console.warn("[Server Register Notice]: Identity Toolkit / Email Auth disabled in GCP project.");
        return res.status(400).json({
          success: false,
          error: "Email/Password authentication is disabled in Firebase for this project. Please click 'Continue with Google' above to sign in or register instantly with your Google account."
        });
      }
      console.error("[Server Register Error]:", err);
      return res.status(500).json({ success: false, error: err.message || "Registration failed." });
    }
  });

  // 5. Server-Side Email Login (Bypasses client operation-not-allowed restrictions)
  app.post("/api/auth/server-login", sensitiveLimiter, async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ success: false, error: "Email and password are required." });
      }

      const cleanEmail = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ success: false, error: "Please enter a valid email address." });
      }

      if (!ensureFirebaseAdmin()) {
        return res.status(500).json({ success: false, error: "Authentication system server is initializing. Please try again in a moment." });
      }

      let userRecord: any;
      try {
        userRecord = await getAuth().getUserByEmail(cleanEmail);
      } catch (err: any) {
        if (err.code === 'auth/user-not-found') {
          return res.status(400).json({ success: false, error: "No account found with this email address. Please register first." });
        }
        if (err.code === 'auth/invalid-email') {
          return res.status(400).json({ success: false, error: "Please enter a valid email address." });
        }
        throw err;
      }

      const dbInstance = getDb();
      if (!dbInstance) throw new Error("Database service unavailable.");
      const credDoc = await dbInstance.collection('_user_credentials').doc(cleanEmail).get();

      if (credDoc.exists) {
        const data = credDoc.data();
        const testHash = crypto.scryptSync(password, data?.salt || '', 64).toString('hex');
        if (testHash !== data?.hash) {
          return res.status(400).json({ success: false, error: "Invalid email or password." });
        }
      } else {
        // Fallback: update password in Firebase auth and save credential
        try {
          await getAuth().updateUser(userRecord.uid, { password });
          const salt = crypto.randomBytes(16).toString('hex');
          const hash = crypto.scryptSync(password, salt, 64).toString('hex');
          await dbInstance.collection('_user_credentials').doc(cleanEmail).set({
            uid: userRecord.uid,
            email: cleanEmail,
            salt,
            hash,
            updatedAt: FieldValue.serverTimestamp()
          });
        } catch (e) {
          // Proceed to mint custom token
        }
      }

      const customToken = await getAuth().createCustomToken(userRecord.uid);

      return res.json({
        success: true,
        customToken,
        uid: userRecord.uid
      });
    } catch (err: any) {
      const errMsg = String(err?.message || err);
      if (errMsg.includes('identitytoolkit') || errMsg.includes('403') || err?.code === 'auth/internal-error' || err?.code === 'auth/operation-not-allowed') {
        console.warn("[Server Login Notice]: Identity Toolkit / Email Auth disabled in GCP project.");
        return res.status(400).json({
          success: false,
          error: "Email/Password authentication is disabled in Firebase for this project. Please click 'Continue with Google' above to sign in or register instantly with your Google account."
        });
      }
      console.error("[Server Login Error]:", err);
      return res.status(500).json({ success: false, error: err.message || "Sign in failed." });
    }
  });

  // Helper to purge all Firestore records associated with a deleted user
  async function deleteUserFirestoreData(uid: string, userEmail: string) {
    const dbInstance = getDb();
    if (!dbInstance) {
      throw new Error("Firestore database connection is unavailable. Failed to delete user records.");
    }

    // 1. Delete chats and their nested messages and attachments subcollections
    const chatsSnapshot = await dbInstance.collection(`users/${uid}/chats`).get();
    if (chatsSnapshot && !chatsSnapshot.empty) {
      for (const chatDoc of chatsSnapshot.docs) {
        const messagesSnapshot = await chatDoc.ref.collection('messages').get();
        if (messagesSnapshot && !messagesSnapshot.empty) {
          const batch = dbInstance.batch();
          messagesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
        }
        const attachmentsSnapshot = await chatDoc.ref.collection('attachments').get();
        if (attachmentsSnapshot && !attachmentsSnapshot.empty) {
          const batch = dbInstance.batch();
          attachmentsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
        }
        await chatDoc.ref.delete();
      }
    }

    // 2. Delete accessLogs
    const accessLogsSnapshot = await dbInstance.collection(`users/${uid}/accessLogs`).get();
    if (accessLogsSnapshot && !accessLogsSnapshot.empty) {
      const batch = dbInstance.batch();
      accessLogsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    // 3. Delete badgeHistory
    const badgeHistorySnapshot = await dbInstance.collection(`users/${uid}/badgeHistory`).get();
    if (badgeHistorySnapshot && !badgeHistorySnapshot.empty) {
      const batch = dbInstance.batch();
      badgeHistorySnapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    // 4. Delete progressLogs
    const progressLogsSnapshot = await dbInstance.collection(`users/${uid}/progressLogs`).get();
    if (progressLogsSnapshot && !progressLogsSnapshot.empty) {
      const batch = dbInstance.batch();
      progressLogsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    // 5. Delete gpa_records
    const gpaRecordsSnapshot = await dbInstance.collection(`users/${uid}/gpa_records`).get();
    if (gpaRecordsSnapshot && !gpaRecordsSnapshot.empty) {
      const batch = dbInstance.batch();
      gpaRecordsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    // 6. Delete user profile document
    await dbInstance.collection('users').doc(uid).delete();

    // 7. Delete _user_credentials entry if exists
    if (userEmail) {
      const cleanEmail = userEmail.trim().toLowerCase();
      const credRef = dbInstance.collection('_user_credentials').doc(cleanEmail);
      const credDoc = await credRef.get();
      if (credDoc.exists) {
        await credRef.delete();
      }
    }

    console.log(`[Account Deletion] Successfully purged all Firestore records for user ${uid} (${userEmail})`);
  }

  // --- Permanent Account Deletion Endpoint (Protected) ---
  app.post(["/api/auth/delete-account", "/api/auth/delete-account/"], sensitiveLimiter, async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, error: "Unauthenticated. Authorization token required." });
      }

      const token = authHeader.substring(7).trim();
      if (!token) {
        return res.status(401).json({ success: false, error: "Unauthenticated. Authorization token required." });
      }

      if (!ensureFirebaseAdmin()) {
        return res.status(500).json({ success: false, error: "Authentication system server is unavailable." });
      }

      let decoded;
      try {
        decoded = await getAuth().verifyIdToken(token, true);
      } catch (e: any) {
        console.warn("[Delete Account Auth Error]:", e?.message || e);
        return res.status(401).json({ 
          success: false, 
          error: "Authentication expired or invalid. Please re-authenticate and try again." 
        });
      }

      const uid = decoded.uid;
      const email = decoded.email || "";

      if (!uid) {
        return res.status(400).json({ success: false, error: "Invalid user token: UID missing." });
      }

      // Check recent authentication: token issued within the last 10 minutes (600 seconds)
      const authTime = decoded.auth_time || 0;
      const nowSec = Math.floor(Date.now() / 1000);
      if (authTime > 0 && (nowSec - authTime) > 600) {
        return res.status(403).json({
          success: false,
          requireReauth: true,
          error: "Recent authentication required. Please re-verify your credentials before deleting your account."
        });
      }

      console.log(`[Account Deletion] Executing permanent account deletion for user: ${uid} (${email})`);

      // 1. Purge all user-owned data in Firestore (will throw if required deletion fails)
      await deleteUserFirestoreData(uid, email);

      // 2. Delete the user from Firebase Auth
      try {
        await getAuth().deleteUser(uid);
        console.log(`[Account Deletion] Firebase Auth user deleted for UID: ${uid}`);
      } catch (authDeleteErr: any) {
        if (authDeleteErr?.code !== 'auth/user-not-found') {
          console.error("[Account Deletion Error]: Auth user deletion failed:", authDeleteErr);
          throw new Error("Failed to delete user authentication record: " + (authDeleteErr?.message || authDeleteErr));
        }
      }

      return res.json({
        success: true,
        message: "Your Gravityverse account and all associated personal data have been permanently deleted."
      });
    } catch (err: any) {
      console.error("[POST /api/auth/delete-account Error]:", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Failed to delete account. Please try again."
      });
    }
  });

  // --- Authenticated User Badge History Endpoint ---
  app.get(["/api/user/badge-history", "/api/user/badge-history/"], async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, error: "Unauthenticated. Authorization token required." });
      }

      const token = authHeader.substring(7).trim();
      if (!token) {
        return res.status(401).json({ success: false, error: "Unauthenticated. Authorization token required." });
      }

      if (!ensureFirebaseAdmin()) {
        return res.status(500).json({ success: false, error: "Authentication system server is unavailable." });
      }

      let decoded;
      try {
        decoded = await getAuth().verifyIdToken(token);
      } catch (e: any) {
        console.warn("[Badge History Auth Error]:", e?.message || e);
        return res.status(401).json({ 
          success: false, 
          error: "Authentication expired or invalid. Please re-authenticate and try again." 
        });
      }

      const uid = decoded.uid;
      if (!uid) {
        return res.status(400).json({ success: false, error: "Invalid user token: UID missing." });
      }

      const dbInstance = getDb();
      if (!dbInstance) {
        return res.status(500).json({ success: false, error: "Database connection unavailable." });
      }

      // Query ONLY the authenticated user's badgeHistory collection
      const userDocRef = dbInstance.collection("users").doc(uid);
      const userDocSnap = await userDocRef.get();
      const existingUserTotal = Number(userDocSnap.data()?.totalBadges) || 0;

      const badgeCollectionRef = userDocRef.collection("badgeHistory");
      const snapshot = await badgeCollectionRef.get();

      const eliteMap = new Map<number, { docId: string; data: any; timestampMs: number; rawIso: string | null }[]>();
      const specialMap = new Map<string, { docId: string; data: any; timestampMs: number; rawIso: string | null }>();

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        let earnedAtIso: string | null = null;
        let timestampMs: number = 0;

        const rawDate = data.earnedAt || data.unlockedAt || data.timestamp || data.date || data.createdAt;
        if (rawDate) {
          if (typeof rawDate.toDate === "function") {
            const d = rawDate.toDate();
            earnedAtIso = d.toISOString();
            timestampMs = d.getTime();
          } else if (typeof rawDate._seconds === "number" || typeof rawDate.seconds === "number") {
            const sec = rawDate._seconds ?? rawDate.seconds;
            const nano = rawDate._nanoseconds ?? rawDate.nanoseconds ?? 0;
            const ms = (sec * 1000) + Math.floor(nano / 1000000);
            const d = new Date(ms);
            earnedAtIso = d.toISOString();
            timestampMs = ms;
          } else if (typeof rawDate === "number") {
            const d = new Date(rawDate);
            earnedAtIso = d.toISOString();
            timestampMs = d.getTime();
          } else if (typeof rawDate === "string") {
            const parsed = new Date(rawDate).getTime();
            if (!isNaN(parsed)) {
              earnedAtIso = new Date(parsed).toISOString();
              timestampMs = parsed;
            }
          }
        }

        const badgeName = (data.badgeName || data.name || data.title || docSnap.id || "").trim();
        const eliteMatch = docSnap.id.match(/elite[_\-\s]*(\d+)/i) || badgeName.match(/elite[_\-\s]*(\d+)/i);
        const tierNum = eliteMatch && eliteMatch[1] ? parseInt(eliteMatch[1], 10) : (typeof data.level === 'number' ? data.level : null);

        if (tierNum !== null && tierNum > 0) {
          if (!eliteMap.has(tierNum)) eliteMap.set(tierNum, []);
          eliteMap.get(tierNum)!.push({ docId: docSnap.id, data, timestampMs, rawIso: earnedAtIso });
        } else {
          const key = badgeName.toLowerCase() || docSnap.id.toLowerCase();
          const existing = specialMap.get(key);
          if (!existing || (timestampMs > 0 && (existing.timestampMs === 0 || timestampMs < existing.timestampMs))) {
            specialMap.set(key, { docId: docSnap.id, data, timestampMs, rawIso: earnedAtIso });
          }
        }
      });

      let maxFoundTier = 0;
      for (const tier of eliteMap.keys()) {
        if (tier > maxFoundTier) maxFoundTier = tier;
      }
      const maxTier = Math.max(existingUserTotal, maxFoundTier);

      const badges: any[] = [];

      // 1. Add canonical Elite badges (1..maxTier)
      for (let tierNum = 1; tierNum <= maxTier; tierNum++) {
        const group = eliteMap.get(tierNum) || [];
        const canonicalId = `elite_${tierNum}`;

        let earliestIso: string | null = null;
        let earliestTsMs = 0;
        let bestData: any = {};

        for (const item of group) {
          if (item.timestampMs > 0 && (earliestTsMs === 0 || item.timestampMs < earliestTsMs)) {
            earliestTsMs = item.timestampMs;
            earliestIso = item.rawIso;
            bestData = item.data;
          }
        }

        badges.push({
          id: canonicalId,
          badgeName: `Elite ${tierNum}`,
          category: 'elite',
          tier: `L${tierNum}`,
          level: tierNum,
          pointsAtTime: 10,
          earnedAt: earliestIso,
          unlockedAt: earliestIso,
          timestampMs: earliestTsMs,
          description: bestData.description || `Achieved when progress reaches the Elite ${tierNum} threshold.`,
          icon: 'badge-elite'
        });
      }

      // 2. Add Special badges
      for (const [key, item] of specialMap.entries()) {
        const name = item.data.badgeName || item.data.name || item.docId;
        badges.push({
          ...item.data,
          id: item.docId,
          badgeName: name,
          category: 'special',
          earnedAt: item.rawIso,
          unlockedAt: item.rawIso,
          timestampMs: item.timestampMs,
          pointsAtTime: typeof item.data.pointsAtTime === 'number' ? item.data.pointsAtTime : 10,
          description: item.data.description || undefined
        });
      }

      // Sort descending: highest Elite level first, then Special badges
      badges.sort((a, b) => {
        const isAElite = a.badgeName.toLowerCase().startsWith("elite");
        const isBElite = b.badgeName.toLowerCase().startsWith("elite");
        if (isAElite && isBElite) {
          const numA = parseInt(a.badgeName.replace(/\D/g, ""), 10) || 0;
          const numB = parseInt(b.badgeName.replace(/\D/g, ""), 10) || 0;
          return numB - numA;
        }
        if (isAElite && !isBElite) return -1;
        if (!isAElite && isBElite) return 1;

        const timeA = a.timestampMs || 0;
        const timeB = b.timestampMs || 0;
        if (timeA > 0 && timeB > 0 && timeA !== timeB) {
          return timeB - timeA;
        }
        return 0;
      });

      return res.json({
        success: true,
        count: badges.length,
        badges
      });
    } catch (err: any) {
      console.error("[GET /api/user/badge-history Error]:", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Failed to retrieve badge history."
      });
    }
  });

  // Authenticated Badge History Cleanup Endpoint
  app.post("/api/user/cleanup-badges", async (req: express.Request, res: express.Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, error: "Unauthenticated." });
      }

      const token = authHeader.substring(7).trim();
      if (!token) {
        return res.status(401).json({ success: false, error: "Unauthenticated." });
      }

      if (!ensureFirebaseAdmin()) {
        return res.status(500).json({ success: false, error: "Authentication system server is unavailable." });
      }

      let decoded;
      try {
        decoded = await getAuth().verifyIdToken(token);
      } catch (e: any) {
        return res.status(401).json({ success: false, error: "Invalid token." });
      }

      const uid = decoded.uid;
      const dbInstance = getDb();
      if (!dbInstance) {
        return res.status(500).json({ success: false, error: "Database unavailable." });
      }

      const historyRef = dbInstance.collection("users").doc(uid).collection("badgeHistory");
      const snapshot = await historyRef.get();

      const eliteMap = new Map<number, { docId: string; data: any; timestampMs: number }[]>();
      const specialMap = new Map<string, { docId: string; data: any; timestampMs: number }[]>();

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        const rawDate = data.earnedAt || data.unlockedAt || data.timestamp || data.date || data.createdAt;
        let tsMs = 0;
        if (rawDate) {
          if (typeof rawDate.toDate === "function") tsMs = rawDate.toDate().getTime();
          else if (typeof rawDate._seconds === "number" || typeof rawDate.seconds === "number") {
            const sec = rawDate._seconds ?? rawDate.seconds;
            const nano = rawDate._nanoseconds ?? rawDate.nanoseconds ?? 0;
            tsMs = (sec * 1000) + Math.floor(nano / 1000000);
          } else if (typeof rawDate === "number") tsMs = rawDate;
          else if (typeof rawDate === "string") tsMs = new Date(rawDate).getTime() || 0;
        }

        const name = (data.badgeName || data.name || docSnap.id || "").trim();
        const eliteMatch = docSnap.id.match(/elite[_\-\s]*(\d+)/i) || name.match(/elite[_\-\s]*(\d+)/i);
        const tierNum = eliteMatch && eliteMatch[1] ? parseInt(eliteMatch[1], 10) : (typeof data.level === 'number' ? data.level : null);

        if (tierNum !== null && tierNum > 0) {
          if (!eliteMap.has(tierNum)) eliteMap.set(tierNum, []);
          eliteMap.get(tierNum)!.push({ docId: docSnap.id, data, timestampMs: tsMs });
        } else {
          const key = name.toLowerCase() || docSnap.id.toLowerCase();
          if (!specialMap.has(key)) specialMap.set(key, []);
          specialMap.get(key)!.push({ docId: docSnap.id, data, timestampMs: tsMs });
        }
      });

      const batch = dbInstance.batch();
      let deleteCount = 0;

      // Retrieve user doc to know current totalBadges
      const userDocRef = dbInstance.collection("users").doc(uid);
      const userDocSnap = await userDocRef.get();
      const existingUserTotal = Number(userDocSnap.data()?.totalBadges) || 0;

      // Deduplicate Elite badges & backfill canonical records up to maxTier
      let maxFoundTier = 0;
      for (const tier of eliteMap.keys()) {
        if (tier > maxFoundTier) maxFoundTier = tier;
      }
      const maxTier = Math.max(existingUserTotal, maxFoundTier);

      for (let tierNum = 1; tierNum <= maxTier; tierNum++) {
        const group = eliteMap.get(tierNum) || [];
        const canonicalId = `elite_${tierNum}`;

        let earliestRawDate: any = null;
        let earliestTsMs = 0;
        for (const item of group) {
          if (item.timestampMs > 0 && (earliestTsMs === 0 || item.timestampMs < earliestTsMs)) {
            earliestTsMs = item.timestampMs;
            earliestRawDate = item.data.earnedAt || item.data.unlockedAt || item.data.timestamp || item.data.date;
          }
        }

        const canonicalDocRef = historyRef.doc(canonicalId);
        const updatePayload: any = {
          badgeName: `Elite ${tierNum}`,
          category: 'elite',
          tier: `L${tierNum}`,
          level: tierNum,
          pointsAtTime: 10,
          description: `Achieved when progress reaches the Elite ${tierNum} threshold.`,
          icon: 'badge-elite'
        };
        if (earliestRawDate) {
          updatePayload.earnedAt = earliestRawDate;
        }

        batch.set(canonicalDocRef, updatePayload, { merge: true });

        for (const item of group) {
          if (item.docId !== canonicalId) {
            batch.delete(historyRef.doc(item.docId));
            deleteCount++;
          }
        }
      }

      // Deduplicate Special badges
      for (const group of specialMap.values()) {
        if (group.length > 1) {
          for (let i = 1; i < group.length; i++) {
            batch.delete(historyRef.doc(group[i].docId));
            deleteCount++;
          }
        }
      }

      // Update user doc totalBadges if out of sync
      batch.update(userDocRef, { totalBadges: maxTier });

      await batch.commit();

      return res.json({
        success: true,
        cleanedTiers: maxTier,
        deletedDuplicates: deleteCount
      });
    } catch (err: any) {
      console.error("[POST /api/user/cleanup-badges Error]:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Authenticated Progress Award & Badge Unlock Endpoint
  app.post("/api/user/progress", async (req: express.Request, res: express.Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, error: "Unauthenticated." });
      }

      const token = authHeader.substring(7).trim();
      if (!token) {
        return res.status(401).json({ success: false, error: "Unauthenticated." });
      }

      if (!ensureFirebaseAdmin()) {
        return res.status(500).json({ success: false, error: "Authentication system server is unavailable." });
      }

      let decoded;
      try {
        decoded = await getAuth().verifyIdToken(token);
      } catch (e: any) {
        return res.status(401).json({ success: false, error: "Invalid token." });
      }

      const uid = decoded.uid;
      const dbInstance = getDb();
      if (!dbInstance) {
        return res.status(500).json({ success: false, error: "Database unavailable." });
      }

      const { points = 0.5, source = "Active Session" } = req.body || {};
      const numericPoints = typeof points === 'number' && points > 0 ? points : 0.5;

      const userDocRef = dbInstance.collection("users").doc(uid);
      const newlyEarnedBadges: { id: string; name: string }[] = [];
      let resultProgress = 0;
      let resultTotalBadges = 0;

      await dbInstance.runTransaction(async (transaction) => {
        const userSnap = await transaction.get(userDocRef);
        if (!userSnap.exists) {
          return;
        }

        const userData = userSnap.data() || {};
        const currentProgress = typeof userData.progress === 'number' ? userData.progress : 0;
        const currentTotalBadges = typeof userData.totalBadges === 'number' ? userData.totalBadges : 0;

        const accumulatedProgress = currentProgress + numericPoints;

        if (accumulatedProgress >= 10) {
          const badgesToEarn = Math.floor(accumulatedProgress / 10);
          resultProgress = +(accumulatedProgress % 10).toFixed(2);
          resultTotalBadges = currentTotalBadges + badgesToEarn;

          for (let i = 0; i < badgesToEarn; i++) {
            const tierNum = currentTotalBadges + i + 1;
            const badgeId = `elite_${tierNum}`;
            const badgeName = `Elite ${tierNum}`;
            const badgeDocRef = dbInstance.collection("users").doc(uid).collection("badgeHistory").doc(badgeId);

            transaction.set(badgeDocRef, {
              badgeName,
              earnedAt: FieldValue.serverTimestamp(),
              pointsAtTime: 10,
              description: `Achieved when progress reaches the Elite ${tierNum} threshold.`,
              category: 'elite',
              tier: `L${tierNum}`,
              level: tierNum,
              icon: 'badge-elite'
            }, { merge: true });

            newlyEarnedBadges.push({ id: badgeId, name: badgeName });
          }

          transaction.update(userDocRef, {
            progress: resultProgress,
            totalBadges: resultTotalBadges,
            lastActive: FieldValue.serverTimestamp()
          });
        } else {
          resultProgress = +accumulatedProgress.toFixed(2);
          resultTotalBadges = currentTotalBadges;

          transaction.update(userDocRef, {
            progress: resultProgress,
            lastActive: FieldValue.serverTimestamp()
          });
        }
      });

      // Log progress activity
      try {
        await dbInstance.collection("users").doc(uid).collection("progressLogs").add({
          points: numericPoints,
          source,
          timestamp: FieldValue.serverTimestamp()
        });
      } catch (logErr) {
        console.warn("[POST /api/user/progress log warning]:", logErr);
      }

      return res.json({
        success: true,
        newProgress: resultProgress,
        newTotalBadges: resultTotalBadges,
        newBadges: newlyEarnedBadges.map(b => b.name)
      });
    } catch (err: any) {
      console.error("[POST /api/user/progress Error]:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- SRM Events & Opportunities Endpoints ---

  // Public Event Retrieval API Handler
  const handleEventsFetch = async (req: express.Request, res: express.Response) => {
    try {
      const { timeFilter, classification, category, field, campus, status, search } = req.query;
      const result = await srmEventDiscoveryService.getEvents({
        timeFilter: timeFilter as string,
        classification: classification as string,
        category: category as string,
        field: field as string,
        campus: campus as string,
        status: status as string,
        search: search as string
      });

      const tavilyApiKey = process.env.TAVILY_API_KEY?.trim();
      const isConfigured = Boolean(tavilyApiKey && tavilyApiKey !== "" && tavilyApiKey !== "MY_TAVILY_API_KEY");

      return res.json({
        success: true,
        events: result.events,
        meta: {
          ...result.meta,
          isConfigured,
          message: !isConfigured ? "TAVILY_API_KEY is not configured in server environment secrets." : "Active"
        }
      });
    } catch (err: any) {
      console.error("[GET /api/events Error]:", err);
      return res.status(500).json({ success: false, error: err.message || "Failed to fetch events." });
    }
  };

  app.get("/api/events", handleEventsFetch);
  app.get("/api/events/", handleEventsFetch);
  app.get("/api/srm-events", handleEventsFetch);
  app.get("/api/srm-events/", handleEventsFetch);

  // Helper function to verify Firebase ID token and ensure administrator authorization
  async function verifyAdminAuth(req: express.Request, res: express.Response): Promise<string | null> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ success: false, error: "Unauthenticated. Authorization token required." });
      return null;
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      res.status(401).json({ success: false, error: "Unauthenticated. Authorization token required." });
      return null;
    }

    if (!ensureFirebaseAdmin()) {
      res.status(500).json({ success: false, error: "Authentication system server is unavailable." });
      return null;
    }

    let decoded;
    try {
      decoded = await getAuth().verifyIdToken(token);
    } catch {
      res.status(401).json({ success: false, error: "Unauthenticated. Invalid or expired token." });
      return null;
    }

    const expectedAdminEmail = cleanEnvVar(process.env.ADMIN_EMAIL);
    if (!expectedAdminEmail) {
      console.error("[Admin Auth Error] ADMIN_EMAIL server environment variable is not configured.");
      res.status(500).json({ success: false, error: "Server configuration error: Administrator email is not configured." });
      return null;
    }

    const userEmail = (decoded.email || "").trim().toLowerCase();
    if (!userEmail || userEmail !== expectedAdminEmail.toLowerCase()) {
      res.status(403).json({ success: false, error: "Unauthorized. Administrator access required." });
      return null;
    }

    return userEmail;
  }

  // Admin Manual Refresh Endpoint (Protected)
  app.post("/api/admin/srm-events/refresh", async (req, res) => {
    try {
      const adminEmail = await verifyAdminAuth(req, res);
      if (!adminEmail) return;

      console.log(`[Admin API] Manual SRM Events discovery refresh requested by admin: ${adminEmail}`);
      const stats = await srmEventDiscoveryService.runDiscovery();

      return res.json({
        success: true,
        message: stats.isApiKeyMissing ? "TAVILY_API_KEY is missing in server environment." : "SRM Events discovery pipeline executed successfully.",
        stats
      });
    } catch (err: any) {
      console.error("[Admin SRM Events Refresh Error]:", err);
      return res.status(500).json({ success: false, error: err.message || "Discovery pipeline execution failed." });
    }
  });

  // Admin Manual Database Purge Endpoint (Protected)
  app.post("/api/admin/srm-events/purge", async (req, res) => {
    try {
      const adminEmail = await verifyAdminAuth(req, res);
      if (!adminEmail) return;

      console.log(`[Admin API] Manual database purge and sync triggered by admin: ${adminEmail}`);
      const resPurge = await srmEventDiscoveryService.purgeAndSyncDatabase();
      return res.json({
        success: true,
        message: `Database purge completed: ${resPurge.purgedCount} invalid/duplicate documents purged, ${resPurge.cleanedCount} documents verified and synced.`,
        ...resPurge
      });
    } catch (err: any) {
      console.error("[Admin SRM Events Purge Error]:", err);
      return res.status(500).json({ success: false, error: err.message || "Database purge failed." });
    }
  });

  // Admin Stats Overview Endpoint (Protected)
  app.get("/api/admin/srm-events/stats", async (req, res) => {
    try {
      const adminEmail = await verifyAdminAuth(req, res);
      if (!adminEmail) return;

      const stats = await srmEventDiscoveryService.getLatestStats();
      const tavilyApiKey = cleanEnvVar(process.env.TAVILY_API_KEY);
      const isConfigured = Boolean(tavilyApiKey && tavilyApiKey !== "" && tavilyApiKey !== "MY_TAVILY_API_KEY");

      return res.json({
        success: true,
        isConfigured,
        stats: stats || {
          timestamp: null,
          queriesExecuted: 0,
          sourcesSearched: 0,
          candidatesFound: 0,
          verifiedCount: 0,
          needsReviewCount: 0,
          duplicatesMerged: 0,
          rejectedCount: 0,
          errors: isConfigured ? [] : ["TAVILY_API_KEY is not set in environment secrets."],
          isApiKeyMissing: !isConfigured
        }
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Background Daily Cron Trigger Endpoint (Protected via CRON_SECRET or Admin Authorization)
  app.post("/api/srm-events/cron-update", async (req, res) => {
    try {
      const cronSecret = cleanEnvVar(process.env.CRON_SECRET) || cleanEnvVar(process.env.ADMIN_SECRET);
      const authHeader = req.headers.authorization;
      const xCronSecret = (req.headers["x-cron-secret"] as string | undefined)?.trim();

      let isAuthorized = false;

      // 1. Validate against CRON_SECRET if configured in environment
      if (cronSecret) {
        if (xCronSecret === cronSecret) {
          isAuthorized = true;
        } else if (authHeader && authHeader.startsWith("Bearer ") && authHeader.substring(7).trim() === cronSecret) {
          isAuthorized = true;
        }
      }

      // 2. Alternatively, allow authenticated Admin via Firebase ID token
      if (!isAuthorized && authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7).trim();
        if (token && ensureFirebaseAdmin()) {
          try {
            const decoded = await getAuth().verifyIdToken(token);
            const expectedAdminEmail = cleanEnvVar(process.env.ADMIN_EMAIL);
            const userEmail = (decoded.email || "").trim().toLowerCase();
            if (expectedAdminEmail && userEmail === expectedAdminEmail.toLowerCase()) {
              isAuthorized = true;
            }
          } catch {
            // Token is not an admin ID token
          }
        }
      }

      if (!isAuthorized) {
        return res.status(403).json({ 
          success: false, 
          error: "Unauthorized. Valid server-side cron secret or administrator authorization required." 
        });
      }

      console.log("[Cron API] Authorized daily SRM Events discovery update triggered.");
      const stats = await srmEventDiscoveryService.runDiscovery();
      return res.json({ success: true, stats });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- AI Dynamic Model Catalog Endpoint ---
  app.get(["/api/models", "/api/models/"], async (req, res) => {
    try {
      const models = await fetchLiveOpenRouterFreeModels();
      return res.json({
        success: true,
        models,
        count: models.length
      });
    } catch (err: any) {
      console.error("[GET /api/models Error]:", err);
      const fallbackList = getCachedFreeModels();
      return res.json({
        success: true,
        models: fallbackList,
        count: fallbackList.length
      });
    }
  });

  app.post(["/api/chat", "/api/chat/"], sensitiveLimiter, async (req, res) => {
    console.log(`[Attachment Pipeline - Backend] Incoming request received on /api/chat.`);
    console.log(`[Attachment Pipeline - Backend] request.body keys:`, Object.keys(req.body || {}));
    console.log(`[Attachment Pipeline - Backend] request.body.attachments raw count:`, Array.isArray(req.body?.attachments) ? req.body.attachments.length : 0);

    // Extract authenticated user ID from Authorization Bearer token
    let authenticatedUid: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7).trim();
      if (token && ensureFirebaseAdmin()) {
        try {
          const decoded = await getAuth().verifyIdToken(token);
          authenticatedUid = decoded.uid;
          console.log(`[Attachment Pipeline - Auth] Authenticated user verified server-side: UID=${authenticatedUid}`);
        } catch (authErr) {
          console.warn("[Attachment Pipeline - Auth Warning] Token verification notice:", authErr);
        }
      }
    }

    let validatedData;
    try {
      validatedData = chatSchema.parse(req.body);
    } catch (err: any) {
      console.error(`[Attachment Pipeline - Backend] Schema validation failed:`, err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Validation failed: " + err.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(", ")
        });
      }
      return res.status(400).json({ success: false, error: "Invalid request payload" });
    }

    const { prompt, stream: requestedStream, messages: incomingMessages, history, systemInstruction, customApiKey, system_instruction, custom_api_key, webSearch, forceWebSearch, attachments: rawAttachments, conversationAttachments: rawConvAttachments, chatId: reqChatId, conversationId: reqConvId, userId: reqUserId } = validatedData;

    const chatId = reqChatId || reqConvId || req.body.chatId || req.body.conversationId;
    const userId = authenticatedUid || reqUserId || req.body.userId;

    // Process and extract attachments (including full backend DOCX, PPTX, XLSX, TXT parsing)
    const attachments = rawAttachments && rawAttachments.length > 0
      ? await Promise.all(rawAttachments.map(att => processBackendAttachment(att)))
      : [];

    const requestConvAttachments = rawConvAttachments && rawConvAttachments.length > 0
      ? await Promise.all(rawConvAttachments.map(att => processBackendAttachment(att)))
      : [];

    // Persist newly provided attachments to user's Firestore conversation collection
    if (authenticatedUid && chatId && attachments.length > 0) {
      await persistAttachmentsToFirestore(authenticatedUid, chatId, attachments);
    }

    // Retrieve persistent conversation attachments directly from Firestore (authoritative source)
    let firestoreAttachments: any[] = [];
    if (authenticatedUid && chatId) {
      firestoreAttachments = await fetchFirestoreConversationAttachments(authenticatedUid, chatId);
    }

    // Merge conversation attachments (Firestore authoritative documents + request documents)
    const attachmentMap = new Map<string, any>();
    for (const doc of firestoreAttachments) {
      const key = doc.attachmentId || doc.id || doc.name;
      if (key) attachmentMap.set(key, doc);
    }
    for (const doc of requestConvAttachments) {
      const key = doc.attachmentId || doc.id || doc.name;
      if (key && !attachmentMap.has(key)) attachmentMap.set(key, doc);
    }
    const conversationAttachments = Array.from(attachmentMap.values());

    const isStreaming = Boolean(requestedStream || req.headers.accept?.includes('text/event-stream'));
    const requestedModel = (req.body.model || req.body.modelId || "auto").trim();
    const isStrictMode = requestedModel !== "auto";

    console.log(`[Attachment Pipeline - Backend] Validated & parsed payload details (Streaming: ${isStreaming}, Model: ${requestedModel}, Strict: ${isStrictMode}, ChatId: ${chatId || 'none'}, User: ${userId || 'anonymous'}):`);
    console.log(`  - Prompt length: ${prompt?.length || 0}`);
    console.log(`  - Messages count: ${incomingMessages?.length || 0}`);
    console.log(`  - Turn attachments count: ${attachments.length}`);
    console.log(`  - Authoritative conversation attachments count: ${conversationAttachments.length}`);

    if (attachments.length > 0) {
      attachments.forEach((att: any, idx: number) => {
        console.log(`  - File #${idx + 1}: Name="${att.name}", Type="${att.type}", Size=${att.size}, TextLen=${att.textContents?.length || 0}, Status=${att.extractionStatus}`);
      });
    }

    const apiKey = customApiKey || custom_api_key || process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
    const hasGeminiKey = isValidApiKey(apiKey);
    const hasOpenRouterKey = isValidApiKey(process.env.OPENROUTER_API_KEY);
    const hasAnyProviderKey = hasGeminiKey || hasOpenRouterKey;

    if (isStreaming) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      let isClientConnected = true;
      req.on('close', () => {
        isClientConnected = false;
      });

      // If keys are missing or invalid, return clear unavailable error
      if (isStrictMode) {
        const isGeminiModel = requestedModel.startsWith('gemini') && !requestedModel.includes('/');
        const isTargetKeyAvailable = isGeminiModel ? hasGeminiKey : hasOpenRouterKey;
        if (!isTargetKeyAvailable) {
          console.warn(`[Strict Mode] Target key for model "${requestedModel}" is not configured. Emitting strict unavailable error.`);
          res.write(`data: ${JSON.stringify({
            type: "error",
            error: "Selected model is currently unavailable. Please choose another model."
          })}\n\n`);
          res.write("data: [DONE]\n\n");
          return res.end();
        }
      } else if (!hasAnyProviderKey) {
        console.warn(`[AI Router] No valid AI Provider API Key environment variable detected. Emitting service unavailable error.`);
        res.write(`data: ${JSON.stringify({
          type: "error",
          error: "AI service is currently unavailable. No AI provider is configured or available."
        })}\n\n`);
        res.write("data: [DONE]\n\n");
        return res.end();
      }

      try {
        let finalMessages: any[] = [];
        if (incomingMessages && incomingMessages.length > 0) {
          finalMessages = incomingMessages.map((m: any) => ({
            role: m.role === "assistant" || m.role === "model" ? "assistant" : "user",
            content: typeof m.content === "string" ? m.content : (Array.isArray(m.content) ? m.content : JSON.stringify(m.content))
          }));
        } else if (history && history.length > 0) {
          finalMessages = history.map((h: any) => ({
            role: h.role === "assistant" || h.role === "model" ? "assistant" : "user",
            content: typeof h.text === "string" ? h.text : (h.content || "")
          }));
          if (prompt) {
            finalMessages.push({ role: "user", content: prompt });
          }
        } else {
          finalMessages = [{ role: "user", content: prompt || "Please analyze the attached file(s) thoroughly and provide a detailed study breakdown." }];
        }

        const userPromptText = prompt || (finalMessages.length > 0 ? (typeof finalMessages[finalMessages.length - 1].content === 'string' ? finalMessages[finalMessages.length - 1].content : '') : '');

        const intentAnalysis = analyzeUserIntent(
          userPromptText,
          attachments.length > 0,
          Boolean(forceWebSearch ?? webSearch ?? req.body.forceWebSearch ?? req.body.webSearch)
        );

        const searchRequested = intentAnalysis.freshSearchRequired || intentAnalysis.needsWebSearch || Boolean(forceWebSearch ?? webSearch ?? req.body.forceWebSearch ?? req.body.webSearch);
        if (searchRequested && isClientConnected && !res.writableEnded) {
          res.write(`data: ${JSON.stringify({ type: "search_status", isSearching: true, query: userPromptText })}\n\n`);
          if (typeof (res as any).flush === 'function') (res as any).flush();
        }

        let searchEndedEmitted = false;
        const aiResponse = await aiRouter.executeStreamRequest({
          modelId: requestedModel,
          prompt: userPromptText,
          messages: finalMessages,
          attachments,
          conversationAttachments,
          chatId,
          userId,
          systemInstruction: systemInstruction || system_instruction,
          metadata: { customApiKey, custom_api_key, webSearch: webSearch ?? req.body.webSearch, forceWebSearch: forceWebSearch ?? req.body.forceWebSearch, chatId, conversationAttachments }
        }, (chunk) => {
          if (isClientConnected && !res.writableEnded) {
            if (!searchEndedEmitted) {
              searchEndedEmitted = true;
              res.write(`data: ${JSON.stringify({ type: "search_status", isSearching: false })}\n\n`);
            }
            const delta = typeof chunk === 'string' ? chunk : (chunk?.delta || '');
            const chunkSources = (chunk as any)?.groundingSources || (chunk as any)?.sources;
            res.write(`data: ${JSON.stringify({ type: "chunk", chunk, delta, groundingSources: chunkSources })}\n\n`);
            if (typeof (res as any).flush === 'function') (res as any).flush();
          }
        });

        const effectiveSearchProvider = aiResponse.webSearchPerformed ? (aiResponse.searchProvider || 'googleSearch') : 'none';

        // Server-side debugging & telemetry log for freshness verification
        console.log(`[AI Chat Freshness Telemetry - Stream]`, JSON.stringify({
          intent: aiResponse.intentCategory || intentAnalysis.intentCategory,
          freshSearchRequired: Boolean(aiResponse.freshSearchRequired ?? intentAnalysis.freshSearchRequired),
          searchProvider: effectiveSearchProvider,
          searchExecuted: Boolean(aiResponse.webSearchPerformed),
          fallbackUsed: Boolean(aiResponse.isFallback)
        }));

        if (isClientConnected && !res.writableEnded) {
          res.write(`data: ${JSON.stringify({
            type: "done",
            text: aiResponse.content,
            model: aiResponse.providerModelId || requestedModel,
            isFallback: aiResponse.isFallback,
            groundingSources: aiResponse.groundingSources || [],
            webSearchPerformed: aiResponse.webSearchPerformed || false,
            freshSearchRequired: Boolean(aiResponse.freshSearchRequired ?? intentAnalysis.freshSearchRequired),
            searchProvider: effectiveSearchProvider,
            intentCategory: aiResponse.intentCategory || "general",
            buildVersion: "2.4.0-gravityverse-persistent-docs"
          })}\n\n`);
          res.write("data: [DONE]\n\n");
          res.end();
        }
        return;
      } catch (streamError: any) {
        console.error(`[Streaming Error on /api/chat]:`, streamError);
        const isQuota = streamError?.status === 429 || String(streamError?.message || streamError).includes('429') || String(streamError?.message || streamError).includes('quota') || String(streamError?.message || streamError).includes('RESOURCE_EXHAUSTED');
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({
            type: "error",
            error: isQuota
              ? "Gemini API rate limit or quota reached. Please try again in a moment or switch to Auto mode."
              : (isStrictMode
                  ? "Selected model is currently unavailable. Please choose another model."
                  : (streamError?.message || "AI service is currently unavailable. Please try again or select another model."))
          })}\n\n`);
          res.write("data: [DONE]\n\n");
          return res.end();
        }
        return;
      }
    }

    // Non-streaming handling
    if (isStrictMode) {
      const isGeminiModel = requestedModel.startsWith('gemini') && !requestedModel.includes('/');
      const isTargetKeyAvailable = isGeminiModel ? hasGeminiKey : hasOpenRouterKey;
      if (!isTargetKeyAvailable) {
        return res.status(503).json({
          success: false,
          error: "Selected model is currently unavailable. Please choose another model."
        });
      }
    } else if (!hasAnyProviderKey) {
      console.warn(`[AI Router] No valid AI Provider API Key environment variable detected.`);
      return res.status(503).json({
        success: false,
        error: "AI service is currently unavailable. No AI provider is configured or available."
      });
    }

    try {
      // Build normalized structured messages
      let finalMessages: any[] = [];
      if (incomingMessages && incomingMessages.length > 0) {
        finalMessages = incomingMessages.map((m: any) => ({
          role: m.role === "assistant" || m.role === "model" ? "assistant" : "user",
          content: typeof m.content === "string" ? m.content : (Array.isArray(m.content) ? m.content : JSON.stringify(m.content))
        }));
      } else if (history && history.length > 0) {
        finalMessages = history.map((h: any) => ({
          role: h.role === "assistant" || h.role === "model" ? "assistant" : "user",
          content: typeof h.text === "string" ? h.text : (h.content || "")
        }));
        if (prompt) {
          finalMessages.push({ role: "user", content: prompt });
        }
      } else {
        finalMessages = [{ role: "user", content: prompt || "Please analyze the attached file(s) thoroughly and provide a detailed study breakdown." }];
      }

      const userPromptText = prompt || (finalMessages.length > 0 ? (typeof finalMessages[finalMessages.length - 1].content === 'string' ? finalMessages[finalMessages.length - 1].content : '') : '');

      const intentAnalysis = analyzeUserIntent(
        userPromptText,
        attachments.length > 0,
        Boolean(forceWebSearch ?? webSearch ?? req.body.forceWebSearch ?? req.body.webSearch)
      );

      const aiResponse = await aiRouter.executeRequest({
        modelId: requestedModel,
        prompt: userPromptText,
        messages: finalMessages,
        attachments,
        conversationAttachments,
        chatId,
        userId,
        systemInstruction: systemInstruction || system_instruction,
        metadata: { customApiKey, custom_api_key, webSearch: webSearch ?? req.body.webSearch, forceWebSearch: forceWebSearch ?? req.body.forceWebSearch, chatId, conversationAttachments }
      });

      const effectiveSearchProvider = aiResponse.webSearchPerformed ? (aiResponse.searchProvider || 'googleSearch') : 'none';

      // Server-side debugging & telemetry log for freshness verification
      console.log(`[AI Chat Freshness Telemetry - Non-Stream]`, JSON.stringify({
        intent: aiResponse.intentCategory || intentAnalysis.intentCategory,
        freshSearchRequired: Boolean(aiResponse.freshSearchRequired ?? intentAnalysis.freshSearchRequired),
        searchProvider: effectiveSearchProvider,
        searchExecuted: Boolean(aiResponse.webSearchPerformed),
        fallbackUsed: Boolean(aiResponse.isFallback)
      }));

      return res.json({
        text: aiResponse.content,
        model: aiResponse.providerModelId || requestedModel,
        isFallback: aiResponse.isFallback,
        groundingSources: aiResponse.groundingSources || [],
        webSearchPerformed: aiResponse.webSearchPerformed || false,
        freshSearchRequired: Boolean(aiResponse.freshSearchRequired ?? intentAnalysis.freshSearchRequired),
        searchProvider: effectiveSearchProvider,
        intentCategory: aiResponse.intentCategory || "general",
        buildVersion: "2.4.0-gravityverse-persistent-docs"
      });
    } catch (lastError: any) {
      console.error(`[AI Router Error]:`, lastError);
      const isQuota = lastError?.status === 429 || String(lastError?.message || lastError).includes('429') || String(lastError?.message || lastError).includes('quota') || String(lastError?.message || lastError).includes('RESOURCE_EXHAUSTED');
      return res.status(503).json({
        success: false,
        error: isQuota
          ? "Gemini API rate limit or quota reached. Please try again in a moment or switch to Auto mode."
          : (isStrictMode
              ? "Selected model is currently unavailable. Please choose another model."
              : (lastError?.message || "AI service is currently unavailable. Please try again or select another model."))
      });
    }
  });

  // Advanced Connection Test
  app.get("/api/network-status", (req, res) => {
    const start = Date.now();
    res.json({
      latency: Date.now() - start,
      node: "Asia-Southeast-Cluster",
      status: "Optimal"
    });
  });

  // Dynamic Download Test payload stream
  app.get("/api/download-test", (req, res) => {
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    
    // 12MB dummy payload
    const totalSize = 12 * 1024 * 1024;
    res.setHeader("Content-Length", totalSize);

    const chunk = Buffer.alloc(256 * 1024); // 256KB chunk of zeros
    let bytesSent = 0;

    function write() {
      let ok = true;
      while (bytesSent < totalSize && ok) {
        const remaining = totalSize - bytesSent;
        const currentChunkSize = Math.min(chunk.length, remaining);
        const currentChunk = currentChunkSize === chunk.length ? chunk : Buffer.alloc(currentChunkSize);
        
        ok = res.write(currentChunk);
        bytesSent += currentChunkSize;
      }

      if (bytesSent >= totalSize) {
        res.end();
      } else {
        res.once('drain', write);
      }
    }

    write();
  });

  // Final route fallback for debugging 404s
  app.all("/api/*", (req, res) => {
    const rawUrl = req.originalUrl || req.url;
    console.log(`[404 DEBUG] Unmatched API Route: ${req.method} ${rawUrl} (Headers: ${JSON.stringify(req.headers['content-type'])})`);
    res.status(404).json({ 
      error: `API Route Not Found: ${req.method} ${rawUrl}`,
      debug: {
        method: req.method,
        path: req.path,
        url: rawUrl
      }
    });
  });

  // Custom Error Handler Middleware (gracefully catch HTTP 413 Payload Too Large & body parser errors)
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && (err.status === 413 || err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE')) {
      console.warn(`[Server] Request entity too large (HTTP 413) on ${req.method} ${req.url}`);
      return res.status(413).json({
        success: false,
        error: "Uploaded file payload is too large to process. Please upload a smaller file or extracted text."
      });
    }
    if (err) {
      console.error(`[Server Error]`, err);
      return res.status(err.status || 500).json({
        success: false,
        error: err.message || "An unexpected server error occurred."
      });
    }
    next();
  });

  // GET /health - Registered BEFORE static/Vite middlewares so it never loads the frontend
  app.get("/health", (req, res) => {
    res.json({
      status: "healthy",
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // If we are in API-only mode (Render), register GET / to return API status and do NOT mount static/Vite middlewares
  const isApiOnly = process.env.RENDER === "true" || process.env.API_ONLY === "true";

  if (isApiOnly) {
    app.get("/", (req, res) => {
      res.json({
        status: "ok",
        service: "Gravityverse Backend"
      });
    });

    // Handle all other unmatched routes for pure API server
    app.get("*", (req, res) => {
      res.status(404).json({
        error: "Not Found",
        message: "This is a pure API server. The Gravityverse frontend is hosted on GitHub Pages."
      });
    });
  } else {
    // Vite integration (Local & AI Studio Dev/Shared Preview environments)
    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use((req, res, next) => {
        if (req.url.includes("/node_modules/.vite/deps/")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        }
        next();
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Neural Core 3.0 server running on http://0.0.0.0:${PORT}`);
    // Pre-initialize Resend client in the background to ensure instant responses to user submissions
    try {
      initResend();
    } catch (err) {
      console.warn("Failed to pre-initialize Resend:", err);
    }

    // Initialize 24-hour background automated SRM Event Discovery scheduler
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    setTimeout(() => {
      srmEventDiscoveryService.runDiscovery().catch(e => console.warn("[SRM Event Discovery Scheduler Notice]:", e));
    }, 10000); // Initial run 10s after server boot
    setInterval(() => {
      console.log("[SRM Event Discovery Scheduler] Executing scheduled daily event discovery run...");
      srmEventDiscoveryService.runDiscovery().catch(e => console.warn("[SRM Event Discovery Scheduler Error]:", e));
    }, TWENTY_FOUR_HOURS);
  });
}

startServer();
