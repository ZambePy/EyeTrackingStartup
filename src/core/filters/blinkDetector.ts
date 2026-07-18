export type BlinkState = 'OPEN' | 'CLOSING' | 'CLOSED' | 'OPENING';

export interface BlinkResult {
  suppressGaze: boolean;
  intentionalBlink: boolean;
  state: BlinkState;
  ear: number;
}

// At 30fps: MIN=3 frames≈100ms, MAX=12≈400ms
const MIN_CLOSING_FRAMES     = 2;
const MIN_INTENTIONAL_FRAMES = 3;
const MAX_INTENTIONAL_FRAMES = 12;
const COOLDOWN_FRAMES        = 18;
const EAR_CLOSE_RATIO        = 0.75;

export class BlinkDetector {
  private state: BlinkState = 'OPEN';
  private closedCount = 0;
  private cooldown = 0;
  private earHistory: number[] = [];
  private readonly HISTORY_LEN = 60;
  private readonly MIN_HISTORY = 20;

  update(ear: number): BlinkResult {
    this.earHistory.push(ear);
    if (this.earHistory.length > this.HISTORY_LEN) this.earHistory.shift();

    let threshold = 0.18;
    if (this.earHistory.length >= this.MIN_HISTORY) {
      const mean = this.earHistory.reduce((a, b) => a + b, 0) / this.earHistory.length;
      threshold = mean * EAR_CLOSE_RATIO;
    }

    const eyesClosed = ear < threshold;
    let intentionalBlink = false;

    if (this.cooldown > 0) {
      this.cooldown--;
      return { suppressGaze: this.state !== 'OPEN', intentionalBlink: false, state: this.state, ear };
    }

    switch (this.state) {
      case 'OPEN':
        if (eyesClosed) { this.state = 'CLOSING'; this.closedCount = 1; }
        break;
      case 'CLOSING':
        if (eyesClosed) { this.closedCount++; if (this.closedCount >= MIN_CLOSING_FRAMES) this.state = 'CLOSED'; }
        else { this.state = 'OPEN'; this.closedCount = 0; }
        break;
      case 'CLOSED':
        if (eyesClosed) {
          this.closedCount++;
        } else {
          if (this.closedCount >= MIN_INTENTIONAL_FRAMES && this.closedCount <= MAX_INTENTIONAL_FRAMES) {
            intentionalBlink = true;
            this.cooldown = COOLDOWN_FRAMES;
          }
          this.state = 'OPENING';
        }
        break;
      case 'OPENING':
        if (!eyesClosed) { this.state = 'OPEN'; this.closedCount = 0; }
        else { this.state = 'CLOSED'; }
        break;
    }

    return { suppressGaze: this.state !== 'OPEN', intentionalBlink, state: this.state, ear };
  }

  reset(): void { this.state = 'OPEN'; this.closedCount = 0; this.cooldown = 0; this.earHistory = []; }
}

export const blinkDetector = new BlinkDetector();
