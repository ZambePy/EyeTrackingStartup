export type KeyboardListener = (state: KeyboardStateData) => void;

export interface KeyboardStateData {
  text: string;
  isCaps: boolean;
  suggestions: string[];
  isVisible: boolean;
}

class KeyboardStateManager {
  private state: KeyboardStateData = {
    text: '',
    isCaps: false,
    suggestions: [],
    isVisible: false
  };

  private listeners: Set<KeyboardListener> = new Set();

  public getState(): KeyboardStateData {
    return { ...this.state };
  }

  public updateState(newState: Partial<KeyboardStateData>) {
    this.state = { ...this.state, ...newState };
    this.notify();
  }

  public appendText(char: string) {
    const newText = this.state.text + char;
    this.updateState({ text: newText });
    this.updateSuggestions(newText);
  }

  public backspace() {
    const newText = this.state.text.slice(0, -1);
    this.updateState({ text: newText });
    this.updateSuggestions(newText);
  }

  public clear() {
    this.updateState({ text: '', suggestions: [] });
  }

  public toggleCaps() {
    this.updateState({ isCaps: !this.state.isCaps });
  }

  public setVisible(visible: boolean) {
    this.updateState({ isVisible: visible });
  }

  public setWord(word: string) {
    const words = this.state.text.split(' ');
    words.pop(); // remove last incomplete word
    words.push(word);
    const newText = words.join(' ') + ' ';
    this.updateState({ text: newText });
    this.updateSuggestions(newText);
  }

  private updateSuggestions(currentText: string) {
    // Basic mock for predictive text. In a real scenario, this uses a dictionary trie.
    const words = currentText.trim().split(' ');
    const lastWord = words[words.length - 1].toLowerCase();
    
    if (lastWord.length < 2) {
      this.updateState({ suggestions: [] });
      return;
    }

    const mockDictionary = [
      // Cumprimentos
      "ola","oi","bom","boa","dia","tarde","noite","obrigado","obrigada","por","favor","desculpe",
      // Necessidades
      "agua","comida","banheiro","ajuda","fome","sede","frio","calor","cansado","cansada","dor",
      "remedio","medico","enfermeira","hospital","emergencia",
      // Respostas
      "sim","nao","talvez","claro","entendi","nao entendi","repita","espere",
      // Sentimentos
      "bem","mal","triste","feliz","medo","ansioso","ansiosa","confortavel","desconfortavel",
      // Verbos
      "quero","preciso","posso","pode","vou","tenho","estou","sinto","gosto",
      // Perguntas
      "como","quando","onde","porque","qual","quem","quanto","voce","esta","e",
      // Social
      "eu","me","meu","minha","nos","familia","mae","pai","filho","filha","esposa","marido",
      // Misc AAC
      "agora","depois","antes","hoje","amanha","aqui","ali","isso","muito","pouco",
      "mais","menos","sempre","nunca","tudo","nada","todos",
    ];
    const matches = mockDictionary.filter(w => w.startsWith(lastWord) && w !== lastWord).slice(0, 3);
    this.updateState({ suggestions: matches });
  }

  public subscribe(listener: KeyboardListener) {
    this.listeners.add(listener);
    // Notify immediately on subscribe
    listener(this.getState());
  }

  public unsubscribe(listener: KeyboardListener) {
    this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.getState());
    }
  }
}

export const KeyboardState = new KeyboardStateManager();
