export interface Cell {
  id: number;
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
  r: number; // Radius percentage
  status?: string; // Short doctor's note (e.g., "Dividing")
  history?: { x: number; y: number }[]; // Trajectory history for motion trails
}

export interface FrameEvent {
  type: string;
  description: string;
}

export interface FrameData {
  timestamp: number; // Seconds
  cellCount: number;
  cells: Cell[];
  events: FrameEvent[];
}

export interface AnalysisResult {
  frames: FrameData[];
  summary: string;
  extendedReport: string;
}

export enum AnalysisStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  ANALYZING = 'ANALYZING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR',
}