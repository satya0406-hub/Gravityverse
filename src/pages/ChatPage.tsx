import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  History, 
  MessageSquare, 
  Trash2, 
  Loader2, 
  AlertCircle, 
  Home, 
  Paperclip, 
  Mic, 
  ArrowUp, 
  CheckCircle, 
  Check,
  X, 
  Sparkles, 
  SquarePen, 
  Square,
  PanelLeftClose, 
  PanelLeft,
  Menu, 
  User, 
  Settings2,
  Share2,
  Pin,
  Archive,
  Edit3,
  MoreVertical,
  Award,
  LogOut,
  FileText,
  FileSpreadsheet,
  FileCode,
  FileUp,
  File,
  Globe,
  ExternalLink,
  Copy,
  Compass,
  BookOpen,
  Terminal,
  RotateCcw,
  Volume2,
  VolumeX
} from 'lucide-react';
import { speakText, stopSpeaking, isSpeechSynthesisSupported } from '../lib/speechUtils';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, increment, deleteDoc, setDoc } from 'firebase/firestore';
import { parseUploadedFile, ParsedFile } from '../lib/fileParser';
import { db } from '../lib/firebase';
import ReactMarkdown from 'react-markdown';
import { cn, getApiBaseUrl, getAssetPath } from '../lib/utils';
import { useParams, Link, useNavigate } from 'react-router-dom';

import { handleFirestoreError } from '../lib/errorHandler';
import { BadgeModal, SafeBadgeIcon, BadgeIcon } from '../components/BadgeModal';
import { getUnlockedBadgesCount, getHighestBadgeName } from '../lib/badgeUtils';
import { AccessLogsModal } from '../components/AccessLogsModal';
import { ModelSelector } from '../components/ModelSelector';
import { trackAIFeature } from '../lib/analytics';

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
    const textContent = (att.textContents || att.extractedText || "").trim();
    const hasImage = !!(att.type && att.type.startsWith("image/") && att.data);

    if (hasImage && !textContent) {
      fileAnalyses.push(`**${fileName}** (${fileType}): Image processed and available.`);
      continue;
    }

    if (!textContent) {
      fileAnalyses.push(`**${fileName}** (${fileType}): Document uploaded successfully.`);
      continue;
    }

    const lines = textContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const queryTokens = query.split(/\s+/).filter(t => t.length > 2 && !['what', 'when', 'where', 'who', 'how', 'the', 'this', 'that', 'doc', 'document', 'file', 'tell', 'show'].includes(t));

    if (queryTokens.length > 0 && !query.includes("summarize") && !query.includes("summary") && !query.includes("overview")) {
      const matchingLines = lines.filter(line => {
        const lowerLine = line.toLowerCase();
        return queryTokens.some(t => lowerLine.includes(t));
      });

      if (matchingLines.length > 0) {
        fileAnalyses.push(matchingLines.slice(0, 8).join('\n\n'));
        continue;
      }
    }

    if (query.includes("summarize") || query.includes("summary") || query.includes("overview") || !query) {
      const sample = lines.slice(0, 10).join('\n');
      fileAnalyses.push(`Summary of **${fileName}**:\n\n${sample}`);
    } else {
      const topContent = lines.slice(0, 10).join('\n');
      fileAnalyses.push(`From **${fileName}**:\n\n${topContent}`);
    }
  }

  return {
    text: fileAnalyses.join('\n\n---\n\n'),
    model: "gravityverse-file-analyzer",
    isFallback: true
  };
}

export function isFreshnessQuery(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const q = text.toLowerCase().trim();

  // 1. Political & Leadership Roles / Office Holders
  const officeHolderPatterns = [
    /\b(who is|who's|name of|tell me the|who currently is)\s+(the\s+)?(current\s+|present\s+|new\s+)?(cm|chief minister|pm|prime minister|president|governor|vice president|cabinet minister|education minister|finance minister|defence minister|home minister|chief justice|cji|mayor|attorney general|speaker)\b/i,
    /\b(current|present|new|incumbent)\s+(cm|chief minister|pm|prime minister|president|governor|vice president|ceo|director|head|chairman)\b/i,
    /\b(cm|chief minister|governor)\s+of\s+[a-z\s]+/i,
    /\b(pm|prime minister|president)\s+of\s+[a-z\s]+/i,
    /\b(who is|who's)\s+(the\s+)?(ceo|chief executive officer|managing director|md|founder|chairman)\s+of\b/i,
    /\bwho\s+rules\b/i,
    /\bwho\s+won\s+the\s+(election|assembly|presidential|parliamentary)\b/i,
    /\belection\s+results?\b/i
  ];
  if (officeHolderPatterns.some(p => p.test(q))) return true;

  // 2. Explicit Temporal Freshness Indicators
  const temporalKeywords = [
    /\b(current|currently|presently|as of now|at present|now|right now|latest|today|this year|recent|recently|upcoming|newly)\b/i,
    /\b(2025|2026|2027)\b/
  ];
  if (temporalKeywords.some(p => p.test(q))) return true;

  // 3. Live & Dynamic Data
  const liveDataPatterns = [
    /\b(live score|match score|cricket score|football score|who won today|match result)\b/i,
    /\b(stock price|market cap|crypto price|bitcoin price|btc price|gold price|exchange rate)\b/i,
    /\b(weather in|temperature in|forecast for)\b/i,
    /\b(news today|breaking news|latest news|headlines)\b/i,
    /\b(super bowl|world cup|olympics|champions league|ipl|fifa|tournament|championship)\b/i,
    /\b(srmist|srm university|srm events|milan|aarush)\b/i
  ];
  if (liveDataPatterns.some(p => p.test(q))) return true;

  // 4. Queries starting with "who won", "what is happening", "who is the"
  if (/^who (won|leads|heads|governs|rules|runs)\b/i.test(q)) return true;

  return false;
}

function generateLocalResponse(input: string, previousMessages: any[] = [], attachments: any[] = []): { text: string; model: string; isFallback: boolean } {
  // If the query is time-sensitive / requires current real-world information, NEVER return stale local answers
  if (isFreshnessQuery(input)) {
    return {
      text: "I couldn't verify the current information because live web search is unavailable right now. Please try again in a moment.",
      model: "live-verification-notice",
      isFallback: true
    };
  }

  // Handle attachments if present
  if (attachments && attachments.length > 0) {
    return analyzeAttachmentsLocally(input, attachments);
  }

  const query = (input || "").toLowerCase().trim();
  let text = "";

  // Extract last assistant response for context-aware follow-up handling
  const assistantMessages = previousMessages ? previousMessages.filter(m => m.role === 'assistant') : [];
  const lastAssistantMessage = assistantMessages.length > 0 ? assistantMessages[assistantMessages.length - 1].text : '';
  const lastAssistantLower = lastAssistantMessage.toLowerCase();

  const isWondersOfWorldRecall = lastAssistantLower.includes("great wall of china") || lastAssistantLower.includes("taj mahal") || lastAssistantLower.includes("chichen itza");
  const isWondersOfAIRecall = lastAssistantLower.includes("generative ai") || lastAssistantLower.includes("computer vision") || lastAssistantLower.includes("alphafold");

  // Helper check for "6 lines" request
  const wantsSixLines = /(6|six)\s+lines/i.test(query) || query.includes("6 lines") || query.includes("six lines");

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
    const topic = getCleanSubject(input);
    text = `I can see you are asking about **${topic}**. 

My pre-programmed offline knowledge base is configured to manage SRM University standards, interactive academic GPA/CGPA calculations, and core developer tools. For general knowledge queries such as **${topic}**, I require a live connection to the Gemini API.

Currently, the live AI service is offline or a valid **Gemini API Key** is not configured.

### 🔒 Operational Notice on API Key Security & Automatic Revocation:
If you recently paste or write an API key directly into your program files and push it to a public GitHub repository (or share it in a public log), **GitHub's push-protection scanning and Google's Security Scanner will instantly detect and permanently disable/revoke the key within seconds for your protection.** This is why hardcoding keys directly in program files and pushing them to git causes them to stop working immediately.

### 🚀 Recommended Method to Securely Connect Your Bot on GitHub Pages:
You **never** need to write or share your API key in the program code! You can keep your key completely private and safe:

1. **Configure as a Secret in GitHub**:
   - Go to your GitHub repository on GitHub.com.
   - Click **Settings** (gear icon at the top menu of the repository page).
   - In the left sidebar, click **Secrets and variables** > **Actions**.
   - Click the **New repository secret** button.
   - Name the secret exactly: \`GEMINI_API_KEY\`
   - Paste your official **Gemini API Key** (starts with \`AIzaSy...\`) as the value and click **Add secret**.

2. **How it Works**:
   - The compiled build workflow file (\`.github/workflows/build.yml\`) automatically grabs your hidden GitHub Secret at compile-time and injects it safely into the built static files.
   - This keeps your key completely private, avoids any automated security revocation, and enables the chatbot to work instantly on your active link!

Once a valid Gemini API key is configured securely via your GitHub secrets or local hosting environments, the chatbot will automatically activate to answer all topics with Google's high-speed **gemini-2.5-flash**!`;
  }

  return {
    text,
    model: "local-query-engine",
    isFallback: true
  };
}

/**
 * Helper to compress a base64 image down to a lightweight thumbnail for database storage.
 * This ensures we never hit the 1MB Firestore document limit while retaining the image preview.
 */
function createCompressedThumbnail(base64Data: string, mimeType: string, maxDim = 120): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height *= maxDim / width;
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width *= maxDim / height;
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const thumbnail = canvas.toDataURL('image/jpeg', 0.5); // 50% jpeg quality
          resolve(thumbnail.split(',')[1] || '');
        } else {
          resolve('');
        }
      } catch (e) {
        console.error("Thumbnail compression canvas error:", e);
        resolve('');
      }
    };
    img.onerror = () => resolve('');
    img.src = `data:${mimeType};base64,${base64Data}`;
  });
}

export function ChatAssistantPage() {
  const { id: urlChatId } = useParams();
  const navigate = useNavigate();
  const { user, profile, login } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [activeChat, setActiveChat] = useState<string | null>(urlChatId || null);
  const [chats, setChats] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isBadgeModalOpen, setIsBadgeModalOpen] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [showShareSuccess, setShowShareSuccess] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, chatId: string } | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [renamingChat, setRenamingChat] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [chatToDelete, setChatToDelete] = useState<{ id: string; title: string } | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [showConfirm, setShowConfirm] = useState<'logout' | 'shutdown' | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('auto');
  const [webSearchEnabled, setWebSearchEnabled] = useState<boolean>(true);
  const [isLiveSearching, setIsLiveSearching] = useState<boolean>(false);
  const [streamingSources, setStreamingSources] = useState<any[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAutoScrollPausedRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [voiceModeActive, setVoiceModeActive] = useState<boolean>(false);

  // Clean up speech synthesis on unmount
  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  const handleToggleSpeech = (msgId: string, text: string) => {
    if (speakingMessageId === msgId) {
      stopSpeaking();
      setSpeakingMessageId(null);
      return;
    }

    setSpeakingMessageId(msgId);
    speakText(text, {
      onEnd: () => setSpeakingMessageId(null),
      onError: () => setSpeakingMessageId(null)
    });
  };

  const handleChatScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    isAutoScrollPausedRef.current = distanceFromBottom > 90;
  };

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const handleCopyMessage = (msgId: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessageId(msgId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    }).catch(err => {
      console.warn("Failed to copy text:", err);
    });
  };

  const toggleVoiceInput = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in your browser.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => (result as any)[0].transcript)
          .join('');
        setInput(prev => (prev ? prev + ' ' + transcript : transcript));
      };

      recognition.onerror = (event: any) => {
        console.warn("Speech recognition error:", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error("Speech recognition start failed:", err);
      setIsListening(false);
    }
  };

  const suggestionPrompts = [
    {
      icon: Compass,
      title: "Explain a concept",
      description: "Break down complex topics with simple analogies",
      prompt: "Explain how neural networks and machine learning work using simple real-world analogies."
    },
    {
      icon: BookOpen,
      title: "Help me study",
      description: "Generate structured study notes and key takeaways",
      prompt: "Create a structured study guide and practice quiz questions on my chosen topic."
    },
    {
      icon: Globe,
      title: "Find current info",
      description: "Search live web sources for latest developments",
      prompt: "What are the latest major advancements and breakthroughs in AI technology this week?"
    },
    {
      icon: Terminal,
      title: "Analyze & debug code",
      description: "Review logic, spot bugs, and write clean solutions",
      prompt: "Review this algorithm logic for edge cases, performance bottlenecks, and best practices."
    }
  ];

  const handleSelectSuggestion = (promptText: string) => {
    setInput(promptText);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  // Attachment states for Multimodal Study Assistant
  const [attachments, setAttachments] = useState<ParsedFile[]>([]);
  const [conversationAttachments, setConversationAttachments] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [currentProcessingFile, setCurrentProcessingFile] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to get appropriate icon and styles based on file extension
  const getFileIcon = (fileName: string, fileType: string) => {
    const name = fileName.toLowerCase();
    if (fileType.startsWith('image/')) return { icon: FileText, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
    if (name.endsWith('.pdf')) return { icon: FileText, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' };
    if (name.endsWith('.docx') || name.endsWith('.doc')) return { icon: FileText, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' };
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) return { icon: FileSpreadsheet, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
    if (name.endsWith('.pptx') || name.endsWith('.ppt')) return { icon: FileUp, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
    if (['.html', '.css', '.js', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.sql', '.json', '.xml', '.md'].some(ext => name.endsWith(ext))) {
      return { icon: FileCode, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' };
    }
    return { icon: File, color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' };
  };

  // Handle file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    await processFiles(Array.from(e.target.files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Process files asynchronously
  const processFiles = async (fileList: File[]) => {
    const validAttachments: ParsedFile[] = [];
    setError(null);

    for (const file of fileList) {
      // 15MB general limit
      const MAX_SIZE = 15 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        setError(`File "${file.name}" exceeds the 15 MB study size limit.`);
        continue;
      }

      // Check if file name already added
      if (attachments.some(att => att.name === file.name)) {
        continue;
      }

      setUploadProgress(10);
      setCurrentProcessingFile(file.name);

      try {
        const parsed = await parseUploadedFile(file, (progress) => {
          setUploadProgress(progress);
        });
        validAttachments.push(parsed);
      } catch (err: any) {
        console.error("Error parsing file:", err);
        setError(`Failed to parse file "${file.name}": ${err.message || err}`);
      }
    }

    if (validAttachments.length > 0) {
      setAttachments(prev => [...prev, ...validAttachments]);
    }
    setUploadProgress(null);
    setCurrentProcessingFile('');
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Handle clipboard pasting
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        e.preventDefault();
        await processFiles(Array.from(e.clipboardData.files));
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [attachments]);

  const { updateProfile, logout } = useAuth();
  
  const handleLogout = async () => {
    if (showConfirm === 'logout') {
      await logout();
      navigate('/');
    } else if (showConfirm === 'shutdown') {
      await logout();
      setSessionEnded(true);
    }
    setShowConfirm(null);
  };

  useEffect(() => {
    try {
      trackAIFeature.aiWindowOpened();
    } catch (e) {
      console.warn(e);
    }
    return () => {
      try {
        trackAIFeature.aiWindowClosed();
      } catch (e) {
        console.warn(e);
      }
    };
  }, []);

  useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenu(null);
      setUserMenuOpen(false);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  useEffect(() => {
    if (!user) return;
    setError(null);
    const q = query(collection(db, `users/${user.uid}/chats`), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      setChats(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      if (err?.message?.includes('offline') || err?.code === 'unavailable' || String(err).includes('network-request-failed')) {
        console.warn("Chats listener network/offline notice:", err.message);
      } else {
        try {
          handleFirestoreError(err, 'list', `users/${user.uid}/chats`);
        } catch (e) {
          console.warn("Handled chats listener error:", e);
        }
      }
    });
  }, [user]);

  useEffect(() => {
    if (!user || !activeChat) return;
    setError(null);
    const q = query(collection(db, `users/${user.uid}/chats/${activeChat}/messages`), orderBy('createdAt', 'asc'));
    return onSnapshot(q, (snapshot) => {
      const snapshotMsgs = snapshot.docs.map((doc): any => {
        const data = doc.data();
        let createdTime = Date.now();
        if (data.createdAt?.toDate) {
          createdTime = data.createdAt.toDate().getTime();
        } else if (data.createdAt instanceof Date) {
          createdTime = data.createdAt.getTime();
        } else if (typeof data.createdAt === 'number') {
          createdTime = data.createdAt;
        }
        return {
          id: doc.id,
          ...data,
          createdTime
        };
      });

      snapshotMsgs.sort((a, b) => a.createdTime - b.createdTime);

      setMessages(prev => {
        const unconfirmedOptimistic = prev.filter(p => 
          p.id?.startsWith('temp-') && 
          !snapshotMsgs.some(s => s.role === p.role && s.text === p.text)
        );
        return [...snapshotMsgs, ...unconfirmedOptimistic];
      });
    }, (err) => {
      if (err?.message?.includes('offline') || err?.code === 'unavailable' || String(err).includes('network-request-failed')) {
        console.warn("Messages listener network/offline notice:", err.message);
      } else {
        try {
          handleFirestoreError(err, 'list', `users/${user.uid}/chats/${activeChat}/messages`);
        } catch (e) {
          console.warn("Handled messages listener error:", e);
        }
      }
    });
  }, [user, activeChat]);

  useEffect(() => {
    if (!user || !activeChat) {
      setConversationAttachments([]);
      return;
    }
    const qAtt = query(collection(db, `users/${user.uid}/chats/${activeChat}/attachments`), orderBy('createdAt', 'asc'));
    return onSnapshot(qAtt, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setConversationAttachments(docs);
    }, (err) => {
      if (!err?.message?.includes('offline') && err?.code !== 'unavailable') {
        console.warn("Attachments listener notice:", err);
      }
    });
  }, [user, activeChat]);

  useEffect(() => {
    if (urlChatId) {
      setActiveChat(urlChatId);
    }
  }, [urlChatId]);
  
  const handleChatSelect = (chatId: string) => {
    setActiveChat(chatId);
    navigate(`/chat/${chatId}`);
  };

  const createNewChat = () => {
    setActiveChat(null);
    setMessages([]);
    navigate('/chat', { replace: true });
    // Force sidebar close on mobile if it was open
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || !user || loading) return;

    let chatId = activeChat;
    if (!chatId) {
      const displayTitle = input.trim() 
        ? (input.slice(0, 30) + (input.length > 30 ? '...' : '')) 
        : (attachments[0]?.name || 'Study Assistant Session');
      const chatRef = await addDoc(collection(db, `users/${user.uid}/chats`), {
        title: displayTitle,
        createdAt: serverTimestamp(),
        lastMessage: input.trim() || `Uploaded ${attachments.length} file(s)`
      }).catch(e => {
        handleFirestoreError(e, 'create', `users/${user.uid}/chats`);
        return null;
      });
      if (!chatRef) return;
      chatId = chatRef.id;
      setActiveChat(chatId);
      navigate(`/chat/${chatId}`);
    }

    const userInput = input;
    const currentAttachments = [...attachments];
    setInput('');
    setAttachments([]); // clear instantly for visual feedback
    setLoading(true);
    setError(null);
    setStreamingText('');
    isAutoScrollPausedRef.current = false;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }

    let accumulatedText = '';

    try {
      try {
        trackAIFeature.messageSent(userInput.length || 1, ['general_chat']);
      } catch (e) {
        console.warn('Analytics messageSent failed:', e);
      }
      const startTime = Date.now();
      
      // Save user message with attachments to Firestore
      // Prepare lightweight, database-safe copies of attachments to prevent Firestore 1MB document limit issues
      const dbSafeAttachments = await Promise.all(
        currentAttachments.map(async (att) => {
          let safeData = '';
          if (att.type.startsWith('image/') && att.data) {
            // Compress the image base64 down to a lightweight thumbnail
            safeData = await createCompressedThumbnail(att.data, att.type);
          }
          // For non-images (PDF, Word, etc.), safeData is left empty since binary isn't stored in db.
          
          // Truncate textContents if it exists, to be absolutely safe against large files
          const truncatedText = att.textContents
            ? (att.textContents.length > 25000 
                ? att.textContents.slice(0, 25000) + '\n... [Content Truncated for Database Storage] ...' 
                : att.textContents)
            : '';

          return {
            name: att.name,
            type: att.type,
            size: att.size,
            data: safeData,
            textContents: truncatedText,
            pageCount: att.pageCount || 0
          };
        })
      );

      const tempUserMsgId = 'temp-user-' + Date.now();
      const userMsgObj = { id: tempUserMsgId, text: userInput, role: 'user', createdAt: new Date(), createdTime: Date.now(), attachments: dbSafeAttachments };
      setMessages(prev => [...prev, userMsgObj]);

      await addDoc(collection(db, `users/${user.uid}/chats/${chatId}/messages`), {
        text: userInput,
        role: 'user',
        createdAt: serverTimestamp(),
        attachments: dbSafeAttachments
      }).catch(e => handleFirestoreError(e, 'create', `users/${user.uid}/chats/${chatId}/messages`));

      // Persist attachments to the conversation-level attachments collection
      if (currentAttachments.length > 0) {
        for (const att of currentAttachments) {
          const cleanName = (att.name || 'document').replace(/[^\w.-]/g, '_');
          const attDocId = `${cleanName}-${Date.now()}`;
          await setDoc(doc(db, `users/${user.uid}/chats/${chatId}/attachments`, attDocId), {
            attachmentId: attDocId,
            name: att.name || 'document',
            type: att.type || 'application/octet-stream',
            size: att.size || 0,
            pageCount: att.pageCount || 0,
            extractionStatus: 'success',
            extractedText: att.textContents || '',
            textContents: att.textContents || '',
            createdAt: serverTimestamp()
          }).catch(e => console.warn("Failed to persist conversation attachment:", e));
        }
      }

      // Try client-side direct request if a valid compiled key from GitHub Secrets exists, otherwise query server-side Express backend
      let aiText = "";
      let modelUsed = "gemini-flash";
      let isFallbackUsed = false;
      let success = false;

      // 1. QUERY SECURE BACKEND ENDPOINT (SECURE FULL-STACK PATTERN)
      console.log(`[Attachment Pipeline - Frontend] Preparing request with ${currentAttachments.length} attachment(s).`);
      currentAttachments.forEach((att, idx) => {
        console.log(`[Attachment Pipeline - Frontend] Attachment #${idx + 1}: name="${att.name}", type="${att.type}", size=${att.size}, textLen=${att.textContents?.length || 0}, dataLen=${att.data?.length || 0}`);
      });

      let groundingSourcesList: any[] = [];
      let isWebSearchPerformed = false;
      let searchProviderUsed = 'googleSearch';
      setStreamingSources([]);

      const requiresLiveSearch = webSearchEnabled && (isFreshnessQuery(userInput) || webSearchEnabled);
      if (requiresLiveSearch) {
        setIsLiveSearching(true);
      }

      try {
        const fetchUrl = `${getApiBaseUrl()}/api/chat`;

        const recentMessages = messages
          .filter(m => m.text && !m.text.includes("I couldn't verify the current information") && !m.text.includes('[object Object]'))
          .slice(-8)
          .map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: typeof m.text === 'string' ? m.text : String(m.text || '')
          }));

        const conversationPayload = [
          ...recentMessages,
          { role: 'user', content: userInput || (currentAttachments.length > 0 ? "Analyze the attached file(s) and provide a detailed study breakdown." : "Hello!") }
        ];

        const payloadAttachments = currentAttachments.map(att => {
          const isImage = att.type?.startsWith('image/');
          const hasText = Boolean(att.textContents && att.textContents.trim().length > 0);
          return {
            name: att.name,
            type: att.type,
            size: att.size,
            // For images, pass compressed base64 data. For documents with extracted text, omit binary to keep payload lean.
            data: isImage ? (att.data || '') : (hasText ? '' : (att.data || '')),
            textContents: att.textContents || '',
            pageCount: att.pageCount || 0
          };
        });

        // Deduplicate conversation attachments against current payload attachments
        const currentAttachmentNames = new Set(payloadAttachments.map(p => p.name));
        const formattedConvAttachments = conversationAttachments
          .filter(ca => !currentAttachmentNames.has(ca.name))
          .map(ca => ({
            id: ca.attachmentId || ca.id,
            attachmentId: ca.attachmentId || ca.id,
            name: ca.name,
            type: ca.type,
            size: ca.size,
            textContents: ca.textContents || ca.extractedText || '',
            extractedText: ca.extractedText || ca.textContents || '',
            pageCount: ca.pageCount || 0
          }));

        console.log(`[Attachment Pipeline - Frontend] Sending POST to ${fetchUrl}. Payload attachment count: ${payloadAttachments.length}. Messages count: ${conversationPayload.length}`);

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        const token = user ? await user.getIdToken().catch(() => '') : '';
        const fetchHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        };
        if (token) {
          fetchHeaders['Authorization'] = `Bearer ${token}`;
        }

        const responseFetch = await fetch(fetchUrl, {
          method: 'POST',
          headers: fetchHeaders,
          body: JSON.stringify({
            prompt: userInput || (payloadAttachments.length > 0 ? "Analyze the attached file(s) and provide a detailed study breakdown." : "Hello!"),
            stream: true,
            chatId: chatId,
            conversationId: chatId,
            userId: user?.uid || '',
            messages: conversationPayload,
            attachments: payloadAttachments,
            conversationAttachments: formattedConvAttachments,
            model: selectedModel || 'auto',
            webSearch: webSearchEnabled,
            forceWebSearch: webSearchEnabled
          }),
          signal: abortController.signal
        });

        if (responseFetch.ok) {
          const contentType = responseFetch.headers.get('content-type') || '';
          if (contentType.includes('text/event-stream') && responseFetch.body) {
            const reader = responseFetch.body.getReader();
            const decoder = new TextDecoder('utf-8');
            accumulatedText = '';
            let streamBuffer = '';
            let streamDone = false;

            while (!streamDone) {
              const { done, value } = await reader.read();
              if (done) break;
              streamBuffer += decoder.decode(value, { stream: true });
              const lines = streamBuffer.split('\n');
              streamBuffer = lines.pop() || '';

              const parseLine = (line: string) => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(':')) return;
                if (trimmed === 'data: [DONE]' || trimmed === 'data:[DONE]') {
                  streamDone = true;
                  return;
                }
                let rawJson = '';
                if (trimmed.startsWith('data: ')) {
                  rawJson = trimmed.slice(6).trim();
                } else if (trimmed.startsWith('data:')) {
                  rawJson = trimmed.slice(5).trim();
                } else {
                  return;
                }
                if (rawJson === '[DONE]') {
                  streamDone = true;
                  return;
                }

                try {
                  const payload = JSON.parse(rawJson);
                  if (payload.type === 'search_status') {
                    setIsLiveSearching(Boolean(payload.isSearching));
                  } else if (payload.type === 'chunk') {
                    setIsLiveSearching(false);
                    let delta = '';
                    if (typeof payload.delta === 'string') {
                      delta = payload.delta;
                    } else if (typeof payload.chunk === 'string') {
                      delta = payload.chunk;
                    } else if (payload.chunk && typeof payload.chunk === 'object') {
                      delta = payload.chunk.delta || payload.chunk.text || '';
                    }

                    if (delta) {
                      accumulatedText += delta;
                      setStreamingText(accumulatedText);
                    }
                    if (payload.chunk?.modelId) {
                      modelUsed = payload.chunk.modelId;
                    }
                    const chunkSources = payload.chunk?.groundingSources || payload.chunk?.sources;
                    if (chunkSources && Array.isArray(chunkSources) && chunkSources.length > 0) {
                      groundingSourcesList = chunkSources;
                      setStreamingSources(chunkSources);
                      isWebSearchPerformed = true;
                    }
                  } else if (payload.type === 'done') {
                    setIsLiveSearching(false);
                    if (payload.text && (!accumulatedText || payload.text.length > accumulatedText.length)) {
                      accumulatedText = typeof payload.text === 'string' ? payload.text : String(payload.text);
                      setStreamingText(accumulatedText);
                    }
                    if (payload.model) modelUsed = payload.model;
                    if (payload.isFallback !== undefined) isFallbackUsed = payload.isFallback;
                    const doneSources = payload.groundingSources || payload.sources;
                    if (doneSources && Array.isArray(doneSources) && doneSources.length > 0) {
                      groundingSourcesList = doneSources;
                      setStreamingSources(doneSources);
                    }
                    if (payload.webSearchPerformed !== undefined) isWebSearchPerformed = payload.webSearchPerformed;
                    if (payload.searchProvider) searchProviderUsed = payload.searchProvider;
                  } else if (payload.type === 'error') {
                    const errMessage = payload.error || "Selected model is currently unavailable. Please choose another model.";
                    const customErr = new Error(errMessage);
                    (customErr as any).isModelError = true;
                    throw customErr;
                  }
                } catch (parseErr: any) {
                  if (parseErr.isModelError || parseErr.message?.includes('unavailable') || parseErr.message?.includes('Streaming error')) {
                    throw parseErr;
                  }
                }
              };

              for (const line of lines) {
                parseLine(line);
              }
            }

            if (streamBuffer.trim()) {
              const remainingLines = streamBuffer.split('\n');
              for (const line of remainingLines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(':')) continue;
                if (trimmed === 'data: [DONE]' || trimmed === 'data:[DONE]') continue;
                let rawJson = '';
                if (trimmed.startsWith('data: ')) rawJson = trimmed.slice(6).trim();
                else if (trimmed.startsWith('data:')) rawJson = trimmed.slice(5).trim();
                if (rawJson && rawJson !== '[DONE]') {
                  try {
                    const payload = JSON.parse(rawJson);
                    if (payload.type === 'done' && payload.text) {
                      if (!accumulatedText || payload.text.length > accumulatedText.length) {
                        accumulatedText = payload.text;
                        setStreamingText(accumulatedText);
                      }
                      if (payload.model) modelUsed = payload.model;
                    }
                  } catch (e) {}
                }
              }
            }

            if (accumulatedText.trim().length > 0) {
              aiText = accumulatedText.replaceAll('[object Object]', '').trim();
              success = true;
              console.log(`[Attachment Pipeline - Frontend] Stream completed successfully. Text length: ${aiText.length}`);
            }
          } else {
            const resJson = await responseFetch.json();
            aiText = resJson.text;
            modelUsed = resJson.model || modelUsed;
            isFallbackUsed = !!resJson.isFallback;
            groundingSourcesList = resJson.groundingSources || [];
            if (groundingSourcesList.length > 0) {
              setStreamingSources(groundingSourcesList);
            }
            isWebSearchPerformed = !!resJson.webSearchPerformed;
            success = true;
            console.log(`[Attachment Pipeline - Frontend] Received successful response from backend model "${modelUsed}". Text length: ${aiText?.length || 0}`);
          }
        } else {
          if (responseFetch.status === 413) {
            throw new Error("File payload is too large to send. Please upload a smaller file or plain text.");
          }
          const errData = await responseFetch.json().catch(() => ({}));
          console.warn(`[Attachment Pipeline - Frontend] Backend request returned HTTP ${responseFetch.status}:`, errData);
          const errMsg = errData.error || (selectedModel !== 'auto' ? "Selected model is currently unavailable. Please choose another model." : `HTTP error ${responseFetch.status}`);
          const httpErr = new Error(errMsg);
          (httpErr as any).isModelError = true;
          throw httpErr;
        }
      } catch (chatApiError: any) {
        if (chatApiError.name === 'AbortError') {
          console.log('[Attachment Pipeline - Frontend] Generation stopped by user.');
        } else {
          console.error("[Attachment Pipeline - Frontend Error] Backend call failed. Details:", chatApiError);
          if (selectedModel !== 'auto') {
            aiText = chatApiError?.message || "Selected model is currently unavailable. Please choose another model.";
            if (!aiText.includes("Selected model is currently unavailable")) {
              aiText = "Selected model is currently unavailable. Please choose another model.";
            }
            modelUsed = selectedModel;
            isFallbackUsed = false;
            success = true;
          }
        }
      }

      // Check if partial streaming text exists after abort or error
      if (!aiText && (accumulatedText.trim().length > 0 || streamingText)) {
        aiText = accumulatedText.trim() || streamingText;
        success = true;
      }

      // 2. OFFLINE FALLBACK: MATCHING ENGINE (ONLY FOR AUTO MODE)
      if (!success) {
        if (selectedModel !== 'auto') {
          aiText = "Selected model is currently unavailable. Please choose another model.";
          modelUsed = selectedModel;
          isFallbackUsed = false;
        } else {
          console.log("No connection to live AI available. Invoking local engine...");
          const localRes = generateLocalResponse(userInput || "Process files", messages, currentAttachments);
          aiText = localRes.text;
          modelUsed = localRes.model;
          isFallbackUsed = localRes.isFallback;
        }
      }

      if (!aiText) {
        throw new Error("AI Assistant failed to generate a response.");
      }
      
      try {
        trackAIFeature.responseGenerated(Date.now() - startTime, aiText.length, !success);
      } catch (e) {
        console.warn('Analytics responseGenerated failed:', e);
      }
      
      const finalSources = Array.isArray(groundingSourcesList) ? groundingSourcesList : [];
      const hasSearchData = isWebSearchPerformed || finalSources.length > 0;

      const assistantMsgObj = { 
        id: 'temp-ai-' + Date.now(), 
        text: aiText, 
        role: 'assistant', 
        createdAt: new Date(), 
        createdTime: Date.now(),
        model: modelUsed, 
        isFallback: isFallbackUsed, 
        groundingSources: finalSources,
        sources: finalSources, 
        webSearchPerformed: hasSearchData,
        searchProvider: searchProviderUsed
      };
      setMessages(prev => {
        const exists = prev.some(m => m.id === assistantMsgObj.id);
        return exists ? prev : [...prev, assistantMsgObj];
      });

      // If Voice Chat Mode is enabled, automatically read aloud the assistant response
      if (voiceModeActive && aiText) {
        setSpeakingMessageId(assistantMsgObj.id);
        speakText(aiText, {
          onEnd: () => setSpeakingMessageId(null),
          onError: () => setSpeakingMessageId(null)
        });
      }

      await addDoc(collection(db, `users/${user.uid}/chats/${chatId}/messages`), {
        text: aiText,
        role: 'assistant',
        createdAt: serverTimestamp(),
        model: modelUsed,
        isFallback: isFallbackUsed,
        groundingSources: finalSources,
        sources: finalSources,
        webSearchPerformed: hasSearchData,
        searchProvider: searchProviderUsed
      }).catch(e => handleFirestoreError(e, 'create', `users/${user.uid}/chats/${chatId}/messages`));

      await updateDoc(doc(db, 'users', user.uid), {
        conversationsCount: increment(1),
        lastActive: serverTimestamp()
      }).catch(e => handleFirestoreError(e, 'update', `users/${user.uid}`));

    } catch (err: any) {
      console.error("Neural Processing Error:", err);
      setError(err.message || 'An error occurred. Please verify your connection.');
      // Restore attachments if failed to send so the user doesn't lose them
      setAttachments(currentAttachments);
    } finally {
      setLoading(false);
      setIsLiveSearching(false);
      setStreamingText('');
      setStreamingSources([]);
    }
  };


  const deleteChat = async (chatId: string) => {
    if (!user || !chatId) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/chats`, chatId));
      if (activeChat === chatId) {
        setActiveChat(null);
        setMessages([]);
        navigate('/chat', { replace: true });
      }
    } catch (err) {
       handleFirestoreError(err, 'delete', `users/${user.uid}/chats/${chatId}`);
    }
  };

  const togglePinChat = async (chatId: string, isPinned: boolean) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/chats`, chatId), { isPinned: !isPinned });
    } catch (err) {
      handleFirestoreError(err, 'update', `users/${user.uid}/chats/${chatId}`);
    }
  };

  const toggleArchiveChat = async (chatId: string, isArchived: boolean) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/chats`, chatId), { isArchived: !isArchived });
    } catch (err) {
      handleFirestoreError(err, 'update', `users/${user.uid}/chats/${chatId}`);
    }
  };

  const renameChat = async (chatId: string) => {
    if (!user || !newName.trim()) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/chats`, chatId), { title: newName });
      setRenamingChat(null);
      setNewName('');
    } catch (err) {
      handleFirestoreError(err, 'update', `users/${user.uid}/chats/${chatId}`);
    }
  };

  const shareChat = (chatId: string) => {
    const url = `${window.location.origin}/chat/${chatId}`;
    navigator.clipboard.writeText(url).then(() => {
      setShowShareSuccess(true);
      setTimeout(() => setShowShareSuccess(false), 3000);
    });
  };

  const handleContextMenu = (e: React.MouseEvent, chatId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, chatId });
  };

  if (sessionEnded) {
    return (
      <div className="h-screen bg-[#0b0f1a] flex flex-col items-center justify-center p-8 gap-8">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center space-y-6 max-w-md"
        >
          <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-red-500/20">
            <X className="w-12 h-12 text-red-500" />
          </div>
          <h1 className="text-4xl font-serif font-bold text-white tracking-tight">Session Terminated</h1>
          <p className="text-gray-400">Your session has been closed. You are now offline.</p>
          <div className="pt-4">
            <Link 
              to="/" 
              className="inline-flex items-center gap-3 px-8 py-4 bg-brand-blue text-white rounded-2xl font-bold hover:bg-blue-600 transition-all shadow-xl shadow-blue-500/20"
            >
              <Home className="w-5 h-5" /> Return to Home Page
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen bg-[#0b0f1a] flex flex-col items-center justify-center p-8 gap-8">
        <div className="w-20 h-20 bg-brand-blue/10 rounded-3xl flex items-center justify-center animate-bounce shadow-2xl shadow-blue-500/20 overflow-hidden border border-white/10">
          <img src={getAssetPath('chatbot-logo.png')} alt="GravityVerse" className="w-full h-full object-cover" />
        </div>
        <div className="text-center space-y-4 max-w-sm w-full">
          <h1 className="text-4xl font-serif font-bold text-white tracking-tight">Gravity<span className="text-brand-blue">Verse</span> Intelligence</h1>
          <p className="text-gray-400">Please sign in to access AI features and study tools.</p>
          <div className="space-y-3">
            <Link to="/login" className="w-full py-3.5 bg-brand-blue text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-600 transition-colors shadow-xl text-sm">
               Sign In or Register
            </Link>
            <button onClick={login} className="w-full py-3 bg-white text-slate-900 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-100 transition-colors shadow-md text-xs uppercase tracking-wider">
               Continue with Google
            </button>
          </div>
          
          <div className="pt-4 text-center">
            <Link 
              to="/" 
              className="inline-flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-white transition-all uppercase tracking-widest"
            >
              <Home className="w-4 h-4 text-brand-blue" />
              Return to Home Page
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const pinnedChats = chats.filter(c => c.isPinned && !c.isArchived);
  const otherChats = chats.filter(c => !c.isPinned && !c.isArchived);

  return (
    <div className="h-full w-full bg-[#090d16] text-gray-100 flex overflow-hidden font-sans select-none">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar (Desktop Collapsible & Mobile Drawer) */}
      <AnimatePresence mode="wait">
        {sidebarOpen && (
          <motion.div 
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -280, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className="fixed md:relative h-full bg-[#0d121f] border-r border-white/5 flex flex-col flex-shrink-0 z-50 w-[270px] sm:w-[280px]"
          >
            {/* Sidebar Top: New Chat & Close on Mobile */}
            <div className="p-3 border-b border-white/5 flex items-center gap-2">
              <button
                onClick={createNewChat}
                className="flex-1 flex items-center justify-between px-3.5 py-2.5 bg-brand-blue/10 hover:bg-brand-blue/20 border border-brand-blue/30 hover:border-brand-blue/50 text-white rounded-xl text-xs font-semibold tracking-wide transition-all shadow-sm group"
              >
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-brand-blue group-hover:scale-110 transition-transform" />
                  <span>New Chat</span>
                </div>
                <SquarePen className="w-3.5 h-3.5 text-gray-400 opacity-60 group-hover:opacity-100" />
              </button>

              <button 
                onClick={() => setSidebarOpen(false)}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>

            {/* Chats List (Scrollable) */}
            <div className="flex-grow overflow-y-auto px-2 py-3 space-y-4 custom-scrollbar">
              {/* Pinned Chats */}
              {pinnedChats.length > 0 && (
                <div>
                  <div className="px-2.5 py-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Pin className="w-3 h-3 rotate-45 text-brand-blue" />
                    <span>Pinned</span>
                  </div>
                  <div className="space-y-0.5 mt-1">
                    {pinnedChats.map(chat => (
                      <div
                        key={chat.id}
                        onClick={() => handleChatSelect(chat.id)}
                        onContextMenu={(e) => handleContextMenu(e, chat.id)}
                        className={cn(
                          "w-full text-left px-2.5 py-2 rounded-xl flex items-center gap-2.5 transition-all group relative cursor-pointer text-xs",
                          activeChat === chat.id 
                            ? "bg-white/[0.08] text-white font-medium shadow-sm border border-white/5" 
                            : "text-gray-400 hover:bg-white/[0.03] hover:text-gray-200"
                        )}
                      >
                        <MessageSquare className={cn("w-3.5 h-3.5 flex-shrink-0", activeChat === chat.id ? "text-brand-blue" : "opacity-40")} />
                        <span className="truncate flex-1">{chat.title || "Untitled Conversation"}</span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleContextMenu(e as any, chat.id); }} 
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-opacity"
                          title="Options"
                        >
                          <MoreVertical className="w-3 h-3 text-gray-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Chats */}
              <div>
                <div className="px-2.5 py-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <History className="w-3 h-3 text-gray-500" />
                    <span>Recent</span>
                  </span>
                  <span className="text-[10px] text-gray-600 font-mono">{otherChats.length}</span>
                </div>
                <div className="space-y-0.5 mt-1">
                  {otherChats.length === 0 && (
                    <div className="px-3 py-6 text-center text-[11px] text-gray-600">
                      No conversations yet
                    </div>
                  )}
                  {otherChats.map(chat => (
                    <div
                      key={chat.id}
                      onClick={() => handleChatSelect(chat.id)}
                      onContextMenu={(e) => handleContextMenu(e, chat.id)}
                      className={cn(
                        "w-full text-left px-2.5 py-2 rounded-xl flex items-center gap-2.5 transition-all group relative cursor-pointer text-xs",
                        activeChat === chat.id 
                          ? "bg-white/[0.08] text-white font-medium shadow-sm border border-white/5" 
                          : "text-gray-400 hover:bg-white/[0.03] hover:text-gray-200"
                      )}
                    >
                      <MessageSquare className={cn("w-3.5 h-3.5 flex-shrink-0", activeChat === chat.id ? "text-brand-blue" : "opacity-40")} />
                      <span className="truncate flex-1">{chat.title || "Untitled Conversation"}</span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleContextMenu(e as any, chat.id); }} 
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-opacity"
                        title="Options"
                      >
                        <MoreVertical className="w-3 h-3 text-gray-400" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar Bottom: User Account Info */}
            <div className="p-3 border-t border-white/5 bg-[#0a0e17] relative">
              {/* Badge Progress Line */}
              <div className="px-1 py-1 mb-2">
                <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                  <span className="flex items-center gap-1">
                    <Award className="w-3 h-3 text-brand-blue" />
                    <span>Level Progress</span>
                  </span>
                  <span className="font-mono text-brand-blue">{Math.min(Math.round((profile?.progress || 0) * 10), 100)}%</span>
                </div>
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-brand-blue rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min((profile?.progress || 0) * 10, 100)}%` }}
                  />
                </div>
              </div>

              {/* User Row */}
              <div 
                onClick={(e) => { e.stopPropagation(); setUserMenuOpen(!userMenuOpen); }}
                className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/[0.04] transition-all cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10 flex-shrink-0 group-hover:border-brand-blue/50 transition-colors">
                  {user.photoURL && user.photoURL.trim() !== '' ? (
                    <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-brand-blue/20 text-brand-blue">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
                <div className="flex-grow min-w-0">
                  <p className="text-xs font-semibold text-white truncate leading-tight">{user.displayName || user.email?.split('@')[0]}</p>
                  <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
                </div>
                <MoreVertical className="w-3.5 h-3.5 text-gray-500 group-hover:text-gray-300" />
              </div>

              {/* User Menu Dropdown */}
              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute bottom-full left-3 right-3 mb-2 bg-[#121826] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                  >
                    <div className="p-1.5 space-y-0.5 text-xs">
                      <button 
                        onClick={() => { setIsBadgeModalOpen(true); setUserMenuOpen(false); }} 
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                      >
                        <Award className="w-4 h-4 text-brand-blue" />
                        <span>Badge History</span>
                      </button>
                      <button 
                        onClick={() => { setIsLogsModalOpen(true); setUserMenuOpen(false); }} 
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                      >
                        <History className="w-4 h-4 text-brand-blue" />
                        <span>Access Logs</span>
                      </button>
                      <div className="h-[1px] bg-white/5 my-1" />
                      <button 
                        onClick={() => { setUserMenuOpen(false); setShowConfirm('logout'); }} 
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                      >
                        <LogOut className="w-4 h-4 text-brand-blue" />
                        <span>Log Out</span>
                      </button>
                      <button 
                        onClick={() => { setUserMenuOpen(false); setShowConfirm('shutdown'); }} 
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all"
                      >
                        <X className="w-4 h-4" />
                        <span>Shutdown Session</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfirm(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm bg-[#161b2c] border border-white/10 rounded-3xl p-6 shadow-2xl"
            >
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 border",
                showConfirm === 'shutdown' ? "bg-red-500/10 border-red-500/20" : "bg-blue-500/10 border-blue-500/20"
              )}>
                {showConfirm === 'shutdown' ? (
                  <X className="w-6 h-6 text-red-500" />
                ) : (
                  <LogOut className="w-6 h-6 text-brand-blue" />
                )}
              </div>
              <h3 className="text-base font-bold text-white text-center mb-1.5">
                {showConfirm === 'shutdown' ? 'Terminate Session?' : 'Confirm Logout?'}
              </h3>
              <p className="text-gray-400 text-center text-xs mb-6 leading-relaxed">
                {showConfirm === 'shutdown' 
                  ? "This will clear chat history and end your active session." 
                  : "Are you sure you want to log out and disconnect from your GravityVerse account?"}
              </p>
              <div className="flex gap-2.5">
                <button 
                  onClick={() => setShowConfirm(null)}
                  className="flex-1 px-3 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all border border-white/5"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleLogout}
                  className={cn(
                    "flex-1 px-3 py-2 text-white rounded-xl text-xs font-bold transition-all shadow-xl",
                    showConfirm === 'shutdown' ? "bg-red-500 hover:bg-red-600 shadow-red-500/20" : "bg-brand-blue hover:bg-blue-600 shadow-blue-500/20"
                  )}
                >
                  {showConfirm === 'shutdown' ? 'Terminate' : 'Log Out'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Conversational Workspace */}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="flex-grow flex flex-col relative h-full min-w-0 bg-[#090d16]"
      >
        {/* Compact Chat Header */}
        <header className="h-14 sm:h-15 flex items-center justify-between px-3.5 sm:px-6 border-b border-white/5 bg-[#0d121f]/80 backdrop-blur-md z-20 flex-shrink-0">
          {/* Left: Sidebar Toggle & Brand Identity */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 sm:p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
              title={sidebarOpen ? "Collapse sidebar" : "Open sidebar"}
            >
              {sidebarOpen ? <PanelLeftClose className="w-4 h-4 sm:w-5 sm:h-5 hidden md:block" /> : <PanelLeft className="w-4 h-4 sm:w-5 sm:h-5 hidden md:block" />}
              <Menu className="w-5 h-5 md:hidden" />
            </button>
            
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl overflow-hidden border border-white/10 bg-white/5 flex-shrink-0">
                <img src={getAssetPath('chatbot-logo.png')} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-[17px] sm:text-[18px] text-white tracking-tight leading-tight">
                  Gravityverse
                </span>
              </div>
            </div>
          </div>

          {/* Center: Model Selector Dropdown & Live Search Indicator */}
          <div className="flex items-center justify-center gap-2 sm:gap-3">
            <ModelSelector selectedModel={selectedModel} onSelectModel={setSelectedModel} disabled={loading} />

            {/* Visual indicator (pulsing icon) showing when the system is actively performing a live search */}
            <AnimatePresence>
              {isLiveSearching && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.85, x: -6 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.85, x: -6 }}
                  className="flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.35)] animate-pulse"
                  title="Actively performing live search for current information..."
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
                  </span>
                  <Globe className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                  <span className="text-[11.5px] font-semibold text-cyan-200 hidden sm:inline">
                    Live searching...
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: Web Search Toggle, Voice Mode Toggle & Badges */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => {
                const nextVal = !voiceModeActive;
                setVoiceModeActive(nextVal);
                if (!nextVal) stopSpeaking();
              }}
              className={cn(
                "p-2 rounded-xl transition-all border shadow-sm flex items-center justify-center gap-1.5",
                voiceModeActive
                  ? "bg-blue-500/20 border-blue-500/40 text-blue-300 hover:bg-blue-500/30"
                  : "bg-white/[0.04] border-white/10 text-gray-400 hover:text-gray-200 hover:bg-white/[0.08]"
              )}
              title={voiceModeActive ? "Voice Chat Mode: ON (Gemini will read responses aloud). Click to turn off." : "Voice Chat Mode: OFF (Silent text mode). Click to enable auto-speech response."}
              aria-label="Toggle Voice Chat Mode"
            >
              {voiceModeActive ? <Volume2 className="w-4 h-4 text-blue-400" /> : <VolumeX className="w-4 h-4" />}
              <span className="text-[11px] font-semibold hidden md:inline">{voiceModeActive ? "Voice ON" : "Voice"}</span>
            </button>

            <button
              onClick={() => setWebSearchEnabled(!webSearchEnabled)}
              disabled={loading}
              className={cn(
                "relative px-2.5 py-1.5 rounded-xl transition-all border shadow-sm flex items-center justify-center gap-1.5",
                isLiveSearching
                  ? "bg-cyan-500/25 border-cyan-400 text-cyan-200 ring-2 ring-cyan-500/50 animate-pulse shadow-[0_0_15px_rgba(6,182,212,0.4)]"
                  : webSearchEnabled
                  ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25"
                  : "bg-white/[0.04] border-white/10 text-gray-400 hover:text-gray-200 hover:bg-white/[0.08]"
              )}
              title={isLiveSearching ? "Actively performing live Google search..." : (webSearchEnabled ? "Google Search Grounding: Active (Click to toggle)" : "Google Search Grounding: Disabled (Click to enable)")}
              aria-label={webSearchEnabled ? "Disable Google search" : "Enable Google search"}
            >
              {isLiveSearching && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-400" />
                </span>
              )}
              <Globe className={cn("w-4 h-4", isLiveSearching ? "text-cyan-300 animate-spin" : webSearchEnabled ? "text-cyan-400" : "text-gray-400")} />
              <span className="text-[11px] font-semibold hidden md:inline">
                {isLiveSearching ? "Searching..." : (webSearchEnabled ? "Search ON" : "Search OFF")}
              </span>
            </button>

            <button
              onClick={() => setIsBadgeModalOpen(true)}
              className="flex items-center gap-2 px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-brand-blue/30 rounded-xl transition-all group shadow-sm"
              title="View Badge History"
            >
              <BadgeIcon 
                badgeName={getHighestBadgeName(profile)}
                size="xs"
                className="w-5 h-5 rounded-md"
                showTierBadge={false}
              />
              <div className="flex items-center gap-1.5">
                <span className="text-[12.5px] font-bold text-white tracking-tight">
                  {getUnlockedBadgesCount(profile)}
                </span>
                <span className="text-[12px] font-medium text-gray-400 group-hover:text-gray-200 hidden xs:inline">
                  Badges
                </span>
              </div>
            </button>
          </div>
        </header>

        {/* Scrollable Conversation View */}
        <div 
          ref={scrollRef}
          onScroll={handleChatScroll}
          className="flex-1 overflow-y-auto w-full custom-scrollbar selection:bg-brand-blue/30 selection:text-white"
        >
          {messages.length === 0 ? (
            /* Modern Empty State (Replaces oversized hero banner) */
            <div className="h-full flex flex-col items-center justify-center px-4 py-8 max-w-2xl mx-auto text-center animate-fade-in">
              <div className="w-12 h-12 rounded-2xl bg-brand-blue/10 border border-brand-blue/20 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/10">
                <img src={getAssetPath('chatbot-logo.png')} alt="" className="w-7 h-7 object-contain" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-1">
                Gravityverse
              </h1>
              <p className="text-xs sm:text-sm text-gray-400 mb-8">
                How can I help you today?
              </p>

              {/* 4 Clean Suggestion Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left">
                {suggestionPrompts.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSelectSuggestion(item.prompt)}
                      className="p-3 bg-[#111624]/90 hover:bg-[#161d30] border border-white/5 hover:border-brand-blue/30 rounded-2xl transition-all group shadow-sm flex items-start gap-3 text-left"
                    >
                      <div className="p-2 rounded-xl bg-white/5 border border-white/5 group-hover:bg-brand-blue/10 group-hover:border-brand-blue/20 text-gray-400 group-hover:text-brand-blue transition-colors flex-shrink-0 mt-0.5">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-semibold text-gray-200 group-hover:text-white transition-colors truncate">
                          {item.title}
                        </h4>
                        <p className="text-[11px] text-gray-500 group-hover:text-gray-400 leading-snug line-clamp-2 mt-0.5">
                          {item.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Message Thread */
            <div className="max-w-[820px] mx-auto w-full py-6 sm:py-7 px-4 sm:px-6 space-y-6 sm:space-y-7">
              {messages.map((msg, i) => (
                <div key={msg.id || i} className="w-full animate-fade-in">
                  {msg.role === 'user' ? (
                    /* User Message: Clean right-aligned bubble */
                    <div className="flex justify-end w-full">
                      <div className="max-w-[85%] sm:max-w-[72%] bg-gradient-to-br from-[#1d4ed8]/25 to-[#1e40af]/35 border border-blue-500/25 text-white px-4 py-3 rounded-2xl rounded-br-sm shadow-sm backdrop-blur-sm">
                        {msg.text && (
                          <p className="text-[15px] sm:text-[15.5px] leading-[1.55] text-gray-100 whitespace-pre-wrap select-text break-words font-normal">{msg.text}</p>
                        )}
                        {/* User attachments */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2.5 justify-end">
                            {msg.attachments.map((att: any, idx: number) => {
                              const { icon: Icon } = getFileIcon(att.name, att.type);
                              const isImg = att.type.startsWith('image/');
                              return (
                                <div key={idx} className="flex items-center gap-2 px-2.5 py-1.5 bg-[#0b0f1a]/80 border border-white/10 rounded-lg text-xs text-white max-w-[200px] truncate">
                                  {isImg && att.data ? (
                                    <img src={`data:${att.type};base64,${att.data}`} alt="" className="w-5 h-5 rounded object-cover" referrerPolicy="no-referrer" />
                                  ) : (
                                    <Icon className="w-3.5 h-3.5 text-brand-blue" />
                                  )}
                                  <span className="truncate text-[11px] font-medium text-gray-200">{att.name}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Assistant Message: Left-aligned clean layout */
                    <div className="flex items-start gap-3 sm:gap-4 w-full group">
                      <div className="w-8 h-8 rounded-xl overflow-hidden border border-brand-blue/30 bg-brand-blue/10 flex-shrink-0 mt-0.5 shadow-sm">
                        <img src={getAssetPath('chatbot-logo.png')} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13.5px] font-semibold text-gray-200">Gravityverse</span>
                          {msg.model && (
                            <span className="text-[11px] font-mono text-gray-400 uppercase px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08]">
                              {msg.model.replace(/:\s*free\b/gi, '').replace(/\s*\(\s*free\s*\)/gi, '').replace(/\bfree\b/gi, '').trim()}
                            </span>
                          )}
                          {(msg.webSearchPerformed || (msg.groundingSources && msg.groundingSources.length > 0) || (msg.sources && msg.sources.length > 0)) && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-medium bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.12)]">
                              <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
                              </span>
                              <Globe className="w-3 h-3 text-cyan-400" />
                              <span>{msg.searchProvider === 'tavily' ? 'Web Search Grounded' : 'Google Search Grounded'}</span>
                            </span>
                          )}
                        </div>
                        
                        <div className="prose prose-invert prose-p:my-2 prose-pre:my-2 max-w-none text-gray-200 text-[15px] sm:text-[15.5px] leading-[1.62] select-text">
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-[1.62] text-[15px] sm:text-[15.5px] text-gray-200">{children}</p>,
                              ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1.5 text-[15px] sm:text-[15.5px] leading-[1.6] text-gray-200">{children}</ul>,
                              ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1.5 text-[15px] sm:text-[15.5px] leading-[1.6] text-gray-200">{children}</ol>,
                              li: ({ children }) => <li className="leading-[1.6] text-[15px] sm:text-[15.5px] text-gray-200">{children}</li>,
                              h1: ({ children }) => <h1 className="text-[24px] font-bold tracking-tight text-white mt-4.5 mb-2 leading-tight">{children}</h1>,
                              h2: ({ children }) => <h2 className="text-[20px] font-bold tracking-tight text-white mt-3.5 mb-2 leading-tight">{children}</h2>,
                              h3: ({ children }) => <h3 className="text-[17.5px] font-semibold text-white mt-3 mb-1.5 leading-snug">{children}</h3>,
                              strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                              blockquote: ({ children }) => <blockquote className="border-l-2 border-brand-blue/60 pl-3.5 py-1 my-2 text-gray-300 italic text-[14.5px] bg-white/[0.02] rounded-r-md">{children}</blockquote>,
                              code: ({ node, inline, className, children, ...props }: any) => {
                                return inline ? (
                                  <code className="px-1.5 py-0.5 rounded bg-white/[0.08] text-blue-300 font-mono text-[13px] sm:text-[13.5px]" {...props}>
                                    {children}
                                  </code>
                                ) : (
                                  <code className="block bg-[#0b101c] border border-white/10 rounded-xl p-3.5 my-2.5 overflow-x-auto text-[13px] sm:text-[13.5px] font-mono text-gray-200" {...props}>
                                    {children}
                                  </code>
                                );
                              }
                            }}
                          >
                            {msg.text}
                          </ReactMarkdown>
                        </div>

                        {/* Grounding sources */}
                        {((msg.groundingSources && msg.groundingSources.length > 0) || (msg.sources && msg.sources.length > 0)) && (
                          <div className="mt-3.5 pt-3 border-t border-white/[0.08]">
                            <div className="flex items-center gap-2 text-[13px] font-semibold text-cyan-300 mb-2">
                              <Globe className="w-3.5 h-3.5 text-cyan-400" />
                              <span>{(msg.searchProvider === 'tavily' ? 'Live Web Sources' : 'Google Search Sources')} ({(msg.groundingSources || msg.sources || []).length})</span>
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-medium">
                                Live Grounded
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {(msg.groundingSources || msg.sources || []).map((source: any, sIdx: number) => {
                                const url = source.url || (typeof source === 'string' ? source : '');
                                let displayTitle = source.title || url || 'Source';
                                try {
                                  if (url && (displayTitle.startsWith('http') || displayTitle.length > 32)) {
                                    const parsed = new URL(url);
                                    displayTitle = parsed.hostname.replace('www.', '');
                                  }
                                } catch {}
                                return (
                                  <a
                                    key={sIdx}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-cyan-500/20 hover:border-cyan-400/50 hover:bg-cyan-500/10 text-cyan-200 hover:text-white text-[13px] sm:text-[13.5px] font-medium transition-all max-w-[290px] truncate group shadow-sm"
                                    title={source.title || url}
                                  >
                                    <ExternalLink className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 group-hover:scale-110 transition-transform" />
                                    <span className="truncate">{displayTitle}</span>
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Action Bar (Copy & Voice Speak) */}
                        <div className="flex items-center gap-1.5 pt-1">
                          <button 
                            onClick={() => handleCopyMessage(msg.id || `msg-${i}`, msg.text)}
                            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-white/5 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium"
                            title="Copy response"
                          >
                            {copiedMessageId === (msg.id || `msg-${i}`) ? (
                              <>
                                <Check className="w-[15px] h-[15px] text-emerald-400" />
                                <span className="text-[12px] text-emerald-400 font-medium">Copied</span>
                              </>
                            ) : (
                              <Copy className="w-[15px] h-[15px]" />
                            )}
                          </button>

                          <button
                            onClick={() => handleToggleSpeech(msg.id || `msg-${i}`, msg.text)}
                            className={cn(
                              "p-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium",
                              speakingMessageId === (msg.id || `msg-${i}`)
                                ? "text-blue-400 bg-blue-500/20"
                                : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                            )}
                            title={speakingMessageId === (msg.id || `msg-${i}`) ? "Stop speaking" : "Read aloud (Voice)"}
                          >
                            {speakingMessageId === (msg.id || `msg-${i}`) ? (
                              <>
                                <VolumeX className="w-[15px] h-[15px] text-blue-400 animate-pulse" />
                                <span className="text-[12px] text-blue-400 font-medium">Speaking...</span>
                              </>
                            ) : (
                              <Volume2 className="w-[15px] h-[15px]" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Real-time Streaming Response */}
              {streamingText && (
                <div className="flex items-start gap-3 sm:gap-4 w-full animate-fade-in">
                  <div className="w-8 h-8 rounded-xl overflow-hidden border border-brand-blue/30 bg-brand-blue/10 flex-shrink-0 mt-0.5 shadow-sm">
                    <img src={getAssetPath('chatbot-logo.png')} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13.5px] font-semibold text-gray-200">Gravityverse</span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-brand-blue/10 border border-brand-blue/20 text-brand-blue animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Generating...</span>
                      </span>
                      {webSearchEnabled && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-medium bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.12)]">
                          <Globe className="w-3 h-3 text-cyan-400" />
                          <span>Google Search Active</span>
                        </span>
                      )}
                    </div>
                    <div className="prose prose-invert prose-p:my-2 prose-pre:my-2 max-w-none text-gray-200 text-[15px] sm:text-[15.5px] leading-[1.62] select-text">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-[1.62] text-[15px] sm:text-[15.5px] text-gray-200">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1.5 text-[15px] sm:text-[15.5px] leading-[1.6] text-gray-200">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1.5 text-[15px] sm:text-[15.5px] leading-[1.6] text-gray-200">{children}</ol>,
                          li: ({ children }) => <li className="leading-[1.6] text-[15px] sm:text-[15.5px] text-gray-200">{children}</li>,
                          h1: ({ children }) => <h1 className="text-[24px] font-bold tracking-tight text-white mt-4.5 mb-2 leading-tight">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-[20px] font-bold tracking-tight text-white mt-3.5 mb-2 leading-tight">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-[17.5px] font-semibold text-white mt-3 mb-1.5 leading-snug">{children}</h3>,
                          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                          blockquote: ({ children }) => <blockquote className="border-l-2 border-brand-blue/60 pl-3.5 py-1 my-2 text-gray-300 italic text-[14.5px] bg-white/[0.02] rounded-r-md">{children}</blockquote>,
                          code: ({ node, inline, className, children, ...props }: any) => {
                            return inline ? (
                              <code className="px-1.5 py-0.5 rounded bg-white/[0.08] text-blue-300 font-mono text-[13px] sm:text-[13.5px]" {...props}>
                                {children}
                              </code>
                            ) : (
                              <code className="block bg-[#0b101c] border border-white/10 rounded-xl p-3.5 my-2.5 overflow-x-auto text-[13px] sm:text-[13.5px] font-mono text-gray-200" {...props}>
                                {children}
                              </code>
                            );
                          }
                        }}
                      >
                        {streamingText}
                      </ReactMarkdown>
                    </div>

                    {/* Live streaming sources if available */}
                    {streamingSources && streamingSources.length > 0 && (
                      <div className="mt-3.5 pt-3 border-t border-white/[0.08]">
                        <div className="flex items-center gap-2 text-[13px] font-semibold text-cyan-300 mb-2">
                          <Globe className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Google Search Sources ({streamingSources.length})</span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-medium">
                            Live Grounded
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {streamingSources.map((source: any, sIdx: number) => {
                            const url = source.url || (typeof source === 'string' ? source : '');
                            let displayTitle = source.title || url || 'Source';
                            try {
                              if (url && (displayTitle.startsWith('http') || displayTitle.length > 32)) {
                                const parsed = new URL(url);
                                displayTitle = parsed.hostname.replace('www.', '');
                              }
                            } catch {}
                            return (
                              <a
                                key={sIdx}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-cyan-500/20 hover:border-cyan-400/50 hover:bg-cyan-500/10 text-cyan-200 hover:text-white text-[13px] sm:text-[13.5px] font-medium transition-all max-w-[290px] truncate group shadow-sm"
                                title={source.title || url}
                              >
                                <ExternalLink className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 group-hover:scale-110 transition-transform" />
                                <span className="truncate">{displayTitle}</span>
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Thinking / Searching loading state */}
              {loading && !streamingText && (
                <div className="flex items-start gap-3 sm:gap-4 w-full">
                  <div className="w-8 h-8 rounded-xl overflow-hidden border border-brand-blue/30 bg-brand-blue/10 flex-shrink-0 mt-0.5 animate-pulse">
                    <img src={getAssetPath('chatbot-logo.png')} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-2 text-[13px] font-medium text-gray-300 py-1">
                    <Loader2 className="w-4 h-4 animate-spin text-brand-blue" />
                    <span>{webSearchEnabled ? 'Searching live sources and preparing response...' : 'Thinking...'}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Floating Chat Composer */}
        <div className="p-3 sm:p-5 pt-2 flex-shrink-0 relative">
          <div className="max-w-[780px] sm:max-w-[800px] mx-auto w-full">
            {/* File Processing Feedback */}
            {uploadProgress !== null && (
              <div className="mb-2.5 flex items-center gap-2.5 px-3.5 py-2 bg-[#121826]/90 border border-white/10 rounded-xl text-xs text-brand-blue animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                <span className="truncate">Processing <span className="font-semibold text-white">{currentProcessingFile}</span> ({uploadProgress}%)</span>
              </div>
            )}

            {/* Pending Attachments List */}
            {attachments.length > 0 && (
              <div className="mb-2.5 flex flex-wrap gap-2 p-2.5 bg-[#121826]/90 border border-white/10 rounded-xl max-h-[120px] overflow-y-auto custom-scrollbar shadow-lg">
                {attachments.map((att, idx) => {
                  const { icon: Icon } = getFileIcon(att.name, att.type);
                  const isImg = att.type.startsWith('image/');
                  return (
                    <div key={idx} className="relative flex items-center gap-2 pr-7 pl-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white max-w-[200px] truncate group">
                      {isImg && att.previewUrl ? (
                        <img src={att.previewUrl} alt="" className="w-5 h-5 rounded object-cover flex-shrink-0" referrerPolicy="no-referrer" />
                      ) : (
                        <Icon className="w-3.5 h-3.5 text-brand-blue flex-shrink-0" />
                      )}
                      <span className="truncate font-medium text-[11px] text-gray-200">{att.name}</span>
                      <button 
                        onClick={() => removeAttachment(idx)}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-red-400 rounded transition-colors"
                        title="Remove attachment"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Error Notification */}
            {error && (
              <div className="mb-2.5 px-3.5 py-2 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-between text-xs text-red-400">
                <div className="flex items-center gap-2 truncate">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span className="truncate">{error}</span>
                </div>
                <button onClick={() => setError(null)} className="p-1 hover:bg-white/5 rounded text-gray-400 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Modern Compact Floating Composer Box (56-64px initial height) */}
            <div className="relative bg-[#0d1322]/95 border border-white/[0.12] focus-within:border-brand-blue/50 focus-within:ring-1 focus-within:ring-brand-blue/30 rounded-2xl px-2.5 py-1.5 sm:px-3 sm:py-2 shadow-[0_8px_30px_rgb(0,0,0,0.5)] backdrop-blur-xl transition-all flex items-end gap-1.5 sm:gap-2 min-h-[52px] sm:min-h-[56px]">
              {/* Attachment Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/[0.08] rounded-xl transition-all flex-shrink-0 mb-0.5"
                title="Attach file (PDF, Word, Code, Image)"
              >
                <Paperclip className="w-[18px] h-[18px]" />
              </button>

              {/* Web Search Toggle in Composer */}
              <button
                type="button"
                onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                disabled={loading}
                className={cn(
                  "px-2.5 py-1.5 rounded-xl transition-all flex-shrink-0 mb-0.5 flex items-center gap-1.5 text-xs font-medium border",
                  webSearchEnabled
                    ? "text-cyan-300 bg-cyan-500/15 border-cyan-500/35 hover:bg-cyan-500/25 shadow-sm"
                    : "text-gray-400 bg-white/5 border-white/10 hover:text-gray-200 hover:bg-white/10"
                )}
                title={webSearchEnabled ? "Google Search Grounding: Active (Click to disable)" : "Google Search Grounding: Off (Click to enable)"}
              >
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">Search</span>
                <span className={cn("w-1.5 h-1.5 rounded-full", webSearchEnabled ? "bg-cyan-400 animate-pulse" : "bg-gray-500")} />
              </button>

              <input 
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileChange}
                accept="image/*,application/pdf,.docx,.pptx,.xlsx,.xls,.csv,.txt,.md,.js,.ts,.tsx,.py,.java,.c,.cpp,.sql,.json,.xml"
                className="hidden"
              />

              {/* Expanding Textarea */}
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Gravityverse..."
                disabled={loading}
                className="flex-1 bg-transparent text-white placeholder:text-gray-500 text-[15px] sm:text-[15.5px] leading-[1.55] resize-none focus:outline-none max-h-[180px] min-h-[24px] py-1.5 custom-scrollbar"
              />

              {/* Right Action Controls: Mic + Send/Stop */}
              <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0 mb-0.5">
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  className={cn(
                    "p-2 rounded-xl transition-all",
                    isListening 
                      ? "bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse" 
                      : "text-gray-400 hover:text-white hover:bg-white/[0.08]"
                  )}
                  title={isListening ? "Listening... click to stop" : "Voice input"}
                >
                  <Mic className="w-[18px] h-[18px]" />
                </button>

                {loading ? (
                  <button
                    type="button"
                    onClick={handleStopGeneration}
                    className="w-8.5 h-8.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 flex items-center justify-center transition-all shadow-sm group cursor-pointer"
                    title="Stop generation"
                  >
                    <Square className="w-[15px] h-[15px] fill-current" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!input.trim() && attachments.length === 0}
                    className={cn(
                      "w-8.5 h-8.5 rounded-xl flex items-center justify-center transition-all",
                      (input.trim() || attachments.length > 0)
                        ? "bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-md shadow-blue-500/25 active:scale-95 cursor-pointer"
                        : "bg-white/[0.05] text-gray-500 cursor-not-allowed"
                    )}
                    title="Send message"
                  >
                    <ArrowUp className="w-[18px] h-[18px]" />
                  </button>
                )}
              </div>
            </div>

            {/* Disclaimer */}
            <div className="mt-2 text-center">
              <p className="text-[11.5px] text-gray-400/70">
                Gravityverse can make mistakes. Verify important information.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Drag & Drop File Upload Overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-[#090d16]/90 backdrop-blur-md border-2 border-dashed border-brand-blue/50 m-4 rounded-3xl transition-all"
          >
            <div className="p-5 rounded-2xl bg-brand-blue/10 border border-brand-blue/20 text-brand-blue animate-bounce mb-3 shadow-xl">
              <FileUp className="w-10 h-10" />
            </div>
            <h2 className="text-lg font-bold text-white mb-1">Drop Files to Upload</h2>
            <p className="text-xs text-gray-400 text-center max-w-xs">
              Upload images, PDFs, spreadsheets, documents or code to discuss with Gravityverse.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rename Chat Modal */}
      <AnimatePresence>
        {renamingChat && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-[#121826] border border-white/10 rounded-2xl p-5 shadow-2xl"
            >
              <h3 className="text-base font-bold text-white mb-3">Rename Conversation</h3>
              <input 
                autoFocus
                type="text" 
                value={newName} 
                onChange={(e) => setNewName(e.target.value)} 
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white mb-4 focus:border-brand-blue outline-none"
              />
              <div className="flex gap-2.5">
                <button onClick={() => setRenamingChat(null)} className="flex-1 py-2 text-xs text-gray-400 font-semibold hover:text-white transition-all">Cancel</button>
                <button onClick={() => renameChat(renamingChat)} className="flex-1 py-2 bg-brand-blue text-white text-xs font-semibold rounded-xl shadow-lg">Save</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Context Menu for Chat Item */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{ top: contextMenu.y, left: contextMenu.x }}
            className="fixed z-[100] w-44 bg-[#121826] border border-white/10 rounded-xl shadow-2xl py-1 overflow-hidden backdrop-blur-xl"
          >
            <button onClick={() => shareChat(contextMenu.chatId)} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 text-gray-300 hover:text-white transition-all text-xs font-medium">
              <Share2 className="w-3.5 h-3.5" />
              <span>Share Chat</span>
            </button>
            <button 
              onClick={() => {
                const chat = chats.find(c => c.id === contextMenu.chatId);
                setNewName(chat?.title || '');
                setRenamingChat(contextMenu.chatId);
              }} 
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 text-gray-300 hover:text-white transition-all text-xs font-medium border-t border-white/5"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Rename</span>
            </button>
            <button 
              onClick={() => togglePinChat(contextMenu.chatId, chats.find(c => c.id === contextMenu.chatId)?.isPinned)}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 text-gray-300 hover:text-white transition-all text-xs font-medium"
            >
              <Pin className="w-3.5 h-3.5" />
              <span>{chats.find(c => c.id === contextMenu.chatId)?.isPinned ? 'Unpin' : 'Pin'}</span>
            </button>
            <button 
              onClick={() => toggleArchiveChat(contextMenu.chatId, chats.find(c => c.id === contextMenu.chatId)?.isArchived)}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 text-gray-300 hover:text-white transition-all text-xs font-medium"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>{chats.find(c => c.id === contextMenu.chatId)?.isArchived ? 'Restore' : 'Archive'}</span>
            </button>
            <button 
              onClick={() => {
                const chat = chats.find(c => c.id === contextMenu.chatId);
                setChatToDelete({ id: contextMenu.chatId, title: chat?.title || 'Untitled Conversation' });
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-red-500/10 text-red-400 transition-all text-xs font-medium border-t border-white/5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Chat Confirmation Modal */}
      <AnimatePresence>
        {chatToDelete && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setChatToDelete(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm bg-[#161b2c] border border-white/10 rounded-3xl p-6 shadow-2xl z-10"
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 border bg-red-500/10 border-red-500/20 text-red-400">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-base font-bold text-white text-center mb-1.5">
                Delete Conversation?
              </h3>
              <p className="text-gray-400 text-center text-xs mb-6 leading-relaxed">
                Are you sure you want to delete <span className="text-gray-200 font-semibold">"{chatToDelete.title}"</span>? All messages in this conversation will be permanently removed.
              </p>
              <div className="flex gap-2.5">
                <button 
                  onClick={() => setChatToDelete(null)}
                  className="flex-1 px-3 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all border border-white/5"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    const id = chatToDelete.id;
                    setChatToDelete(null);
                    deleteChat(id);
                  }}
                  className="flex-1 px-3 py-2.5 text-white rounded-xl text-xs font-bold transition-all shadow-xl bg-red-500 hover:bg-red-600 shadow-red-500/20"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <BadgeModal isOpen={isBadgeModalOpen} onClose={() => setIsBadgeModalOpen(false)} />
      <AccessLogsModal isOpen={isLogsModalOpen} onClose={() => setIsLogsModalOpen(false)} />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.08);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.15);
        }
      `}</style>
    </div>
  );
}
