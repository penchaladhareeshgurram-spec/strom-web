export interface DetectionMarker {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export interface DetectionResult {
  id?: string;
  timestamp?: any;
  score: number; // 0-100 (AI probability)
  confidence: number; // 0-100 (Model's confidence)
  label: 'Human' | 'Likely Human' | 'Uncertain' | 'Likely AI' | 'AI';
  markers: DetectionMarker[];
  analysis: string;
  textSnippet?: string;
  glassMetrics?: {
    perplexity: number; // 0-100
    burstiness: number; // 0-100
    syntacticRepetition: number; // 0-100
    lexicalDiversity: number; // 0-100
  };
}
