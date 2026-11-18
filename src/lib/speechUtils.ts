/**
 * Speech utilities for Voice Chat (Speech-to-Text and Text-to-Speech)
 */

export function cleanMarkdownForSpeech(text: string): string {
  if (!text) return "";
  return text
    // Replace code blocks with brief note
    .replace(/```[a-zA-Z]*[\s\S]*?```/g, "Code block omitted.")
    // Replace inline code
    .replace(/`([^`]+)`/g, "$1")
    // Replace markdown links [title](url) with title
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove markdown headers, bold, italics, strikethrough, blockquotes
    .replace(/[#*_~>]/g, "")
    // Remove URLs
    .replace(/https?:\/\/\S+/g, "")
    // Collapse consecutive whitespace and newlines
    .replace(/\s+/g, " ")
    .trim();
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      console.warn("Error cancelling speech synthesis:", e);
    }
  }
}

export function speakText(
  text: string,
  options?: {
    rate?: number;
    pitch?: number;
    lang?: string;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (err: any) => void;
  }
): SpeechSynthesisUtterance | null {
  if (!isSpeechSynthesisSupported()) {
    console.warn("SpeechSynthesis is not supported in this browser.");
    options?.onError?.(new Error("Speech synthesis not supported"));
    return null;
  }

  // Cancel any ongoing speech first
  stopSpeaking();

  const cleaned = cleanMarkdownForSpeech(text);
  if (!cleaned) return null;

  try {
    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.rate = options?.rate ?? 1.0;
    utterance.pitch = options?.pitch ?? 1.0;
    utterance.lang = options?.lang ?? 'en-US';

    // Try to pick a natural high quality voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => 
      (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Samantha") || v.name.includes("Daniel")) && 
      v.lang.startsWith("en")
    ) || voices.find(v => v.lang.startsWith("en"));

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => {
      options?.onStart?.();
    };

    utterance.onend = () => {
      options?.onEnd?.();
    };

    utterance.onerror = (e) => {
      // Speech cancellation errors ('canceled' or 'interrupted') are normal when user stops or switches
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        console.warn("Speech synthesis utterance error:", e);
      }
      options?.onError?.(e);
    };

    window.speechSynthesis.speak(utterance);
    return utterance;
  } catch (err) {
    console.error("Failed to speak text:", err);
    options?.onError?.(err);
    return null;
  }
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export function createSpeechRecognition(): any | null {
  if (!isSpeechRecognitionSupported()) return null;
  const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  try {
    const recognition = new SpeechRecognitionClass();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    return recognition;
  } catch (err) {
    console.warn("Could not instantiate SpeechRecognition:", err);
    return null;
  }
}
