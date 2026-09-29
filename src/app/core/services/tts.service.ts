import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class TtsService {
  private synth = window.speechSynthesis;
  private isPlaying = false;

  constructor() { }

  async speak(text: string, lang: string): Promise<void> {
    if (!this.synth) return Promise.resolve();

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      
      // Try to find a good voice
      const voices = this.synth.getVoices();
      const voice = voices.find(v => v.lang.startsWith(lang) || v.lang.startsWith(lang.replace('-', '_')));
      if (voice) {
        utterance.voice = voice;
      }
      
      // Speed adjustments can go here
      utterance.rate = lang.startsWith('ja') ? 0.9 : 1.0; 

      utterance.onend = () => {
        resolve();
      };
      
      utterance.onerror = (e) => {
        console.error('TTS Error:', e);
        resolve(); // resolve anyway to continue sequence
      };

      this.synth.speak(utterance);
    });
  }

  async playSequence(items: { text: string, lang: string, pauseAfterMs?: number }[]) {
    this.isPlaying = true;
    for (const item of items) {
      if (!this.isPlaying) break;
      await this.speak(item.text, item.lang);
      if (item.pauseAfterMs && this.isPlaying) {
        await new Promise(r => setTimeout(r, item.pauseAfterMs));
      }
    }
    this.isPlaying = false;
  }

  stop() {
    this.isPlaying = false;
    this.synth.cancel();
  }

  get isSpeaking(): boolean {
    return this.isPlaying || this.synth.speaking;
  }
}
