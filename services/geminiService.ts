import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AnalysisResult, FrameData, Cell, FrameEvent } from "../types";

// Upgraded to Gemini 3 Pro Preview for advanced spatial reasoning and scientific analysis
const GEMINI_MODEL = 'gemini-3-pro-preview';

interface ExtractedFrame {
  timestamp: number;
  base64: string;
}

// Helper: Extract frames from video file with robustness
const extractFrames = async (file: File, intervalSec: number = 1.0): Promise<ExtractedFrame[]> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', ''); // Critical for iOS/WebViews
    video.setAttribute('webkit-playsinline', '');
    video.preload = 'auto';
    
    // Global safety timeout
    const timeout = setTimeout(() => {
      reject(new Error("Video processing timed out. The file might be corrupted, use an unsupported codec, or be too large."));
    }, 45000); 

    video.onerror = () => {
      clearTimeout(timeout);
      const err = video.error;
      let msg = "Could not load video file.";
      if (err) {
        switch (err.code) {
          case MediaError.MEDIA_ERR_ABORTED: 
            msg = "Video loading aborted."; 
            break;
          case MediaError.MEDIA_ERR_NETWORK: 
            msg = "Network error loading video."; 
            break;
          case MediaError.MEDIA_ERR_DECODE: 
            // Specific fix for the user's error message
            msg = "Video decoding failed. This usually means the video uses an unsupported codec (like H.265/HEVC). Please convert it to standard MP4 (H.264)."; 
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: 
            msg = "Video format not supported. Your browser cannot play this file. Please convert to standard MP4 (H.264)."; 
            break;
        }
      }
      reject(new Error(msg));
    };

    const frames: ExtractedFrame[] = [];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Use onloadeddata to ensure the first frame is actually ready to decode
    video.onloadeddata = async () => {
      try {
        const duration = video.duration || 30; // Fallback if infinite
        
        // DOWNSCALING: Limit max dimension to 1024px to prevent huge payloads causing RPC/XHR 500 Errors
        const MAX_DIM = 1024;
        let scale = 1;
        if (video.videoWidth > MAX_DIM || video.videoHeight > MAX_DIM) {
            scale = Math.min(MAX_DIM / video.videoWidth, MAX_DIM / video.videoHeight);
        }
        
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;
        
        // ADAPTIVE SAMPLING:
        // Instead of a hard cap at 30 seconds, we distribute ~30 frames across the full video duration.
        const MAX_FRAMES = 30; 
        
        // Calculate dynamic interval. 
        // e.g., 60s video -> 2s interval. 
        // e.g., 10s video -> 1s interval (capped by Math.max default of 1.0 or intervalSec)
        const samplingInterval = Math.max(intervalSec, duration / MAX_FRAMES);
        
        // 1. Capture the first frame (t=0) immediately without seeking
        // This prevents race conditions where seeking to 0 when already at 0 doesn't fire events
        if (ctx) {
           ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
           // Reduce quality to 0.6 to further optimize payload size
           const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
           frames.push({ timestamp: 0, base64 });
        }

        // 2. Loop for subsequent frames using the adaptive interval
        for (let time = samplingInterval; time < duration; time += samplingInterval) {
          if (frames.length >= MAX_FRAMES) break;

          // Robust Seek Logic
          await new Promise<void>((frameResolve, frameReject) => {
             const seekTimeout = setTimeout(() => {
                 // Don't fail the whole process for one bad frame, just skip
                 console.warn(`Seek timeout at ${time}s, skipping frame.`);
                 frameResolve(); 
             }, 3000);
             
             const onSeek = () => {
                clearTimeout(seekTimeout);
                video.removeEventListener('seeked', onSeek);
                frameResolve();
             };
             
             // CRITICAL: Attach listener BEFORE setting currentTime
             video.addEventListener('seeked', onSeek);
             video.currentTime = time;
          });

          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
            frames.push({ timestamp: time, base64 });
          }
        }
        
        clearTimeout(timeout);
        URL.revokeObjectURL(video.src);
        resolve(frames);
      } catch (e) {
        clearTimeout(timeout);
        URL.revokeObjectURL(video.src);
        reject(e);
      }
    };

    // Trigger load
    video.src = URL.createObjectURL(file);
    video.load(); // Explicitly request load
  });
};

// Helper: Analyze single frame with retry logic
const analyzeFrame = async (ai: GoogleGenAI, frame: ExtractedFrame, retries = 3): Promise<FrameData> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      cellCount: { type: Type.INTEGER },
      cells: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            x: { type: Type.NUMBER, description: "X coordinate of cell center (Percentage 0-100)" },
            y: { type: Type.NUMBER, description: "Y coordinate of cell center (Percentage 0-100)" },
            r: { type: Type.NUMBER, description: "Radius of the cell (Percentage of frame width 0-100)" },
            status: { 
              type: Type.STRING, 
              description: "Biological status from analysis. Choices: 'Normal', 'Dividing', 'Metaphase', 'Anaphase', 'Apoptotic', 'Blebbing', 'Elongated', 'Spreading', 'Rounding', 'Adhering'" 
            }
          },
          required: ["x", "y", "r"]
        }
      },
      frameEvents: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "List of significant biological events (Mitosis phases, Cell death, Fusion, Detachment). Empty if none."
      }
    },
    required: ["cellCount", "cells", "frameEvents"]
  };

  const prompt = `
    You are an expert in biology and computer vision optimized for biology applications. Analyze this microscopy frame and provide a comprehensive biological assessment.

    ## 1. CELL DETECTION & LOCALIZATION
    Identify ALL visible cells (including partial cells at frame edges). For each cell, provide:
    - **x, y**: Center coordinates as percentage of frame dimensions (0-100).
    - **r**: Approximate cell radius as percentage of frame width (0-100).
    - Use the cell's visible boundary/membrane to determine measurements.

    ## 2. CELLULAR STATE ANALYSIS
    For each detected cell, assess its biological state and assign a concise status label (1-3 words) to the 'status' field:

    **Status Categories:**
    - **Morphology-based**: 'Dividing', 'Metaphase', 'Anaphase', 'Telophase', 'Apoptotic', 'Lysing', 'Blebbing'
    - **Phenotype/Shape**: 'Elongated' (migratory phenotype), 'Spreading', 'Rounding', 'Adhering', 'Polarized'
    - **Functional**: 'Extending Protrusion', 'Retracting'
    - **Default**: 'Normal' (for cells with no distinctive features)

    **Visual cues to assess:**
    - Nuclear morphology (condensed, fragmented, enlarged).
    - Membrane characteristics (smooth, irregular, blebbing).
    - Cytoplasmic texture (granular, homogeneous, vacuolated).
    - Cell shape (round vs elongated).

    ## 3. FRAME-LEVEL EVENTS
    Document significant biological events observable in this frame under 'frameEvents':
    - **Mitotic events**: early prophase, metaphase plate formation, chromosome segregation, cytokinesis.
    - **Cell death**: apoptotic bodies, membrane rupture, cellular fragmentation.
    - **Cell-cell interactions**: contact inhibition, cell fusion, aggregation.
  `;

  // Retry Loop
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: {
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: frame.base64 } },
            { text: prompt }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        }
      });

      const text = response.text;
      if (!text) return { timestamp: frame.timestamp, cellCount: 0, cells: [], events: [] };

      const data = JSON.parse(text);
      
      // Transform to internal FrameData format
      const cells: Cell[] = (data.cells || []).map((c: any, index: number) => ({
        id: index + 1, // Temporary ID, will be overwritten by tracker
        x: c.x,
        y: c.y,
        r: c.r,
        status: c.status || 'Normal',
        history: [] // Initialize empty history
      }));

      // Convert string events to FrameEvent objects
      const events: FrameEvent[] = (data.frameEvents || []).map((desc: string) => {
          let type = "Observation";
          const d = desc.toLowerCase();
          if (d.includes('mitosis') || d.includes('divid') || d.includes('phase')) type = "Mitosis";
          else if (d.includes('apoptosis') || d.includes('death') || d.includes('lysing')) type = "Apoptosis";
          else if (d.includes('fusion') || d.includes('contact')) type = "Interaction";
          
          return { type, description: desc };
      });

      return {
        timestamp: frame.timestamp,
        cellCount: data.cellCount || cells.length,
        cells: cells,
        events: events 
      };

    } catch (e: any) {
      const isLastAttempt = attempt === retries - 1;
      
      // If it's a 500/503 or XHR error, we can retry
      const isRetryable = e.message?.includes('500') || e.message?.includes('503') || e.message?.includes('xhr') || e.message?.includes('fetch');
      
      if (isRetryable && !isLastAttempt) {
        console.warn(`Frame ${frame.timestamp}s failed (Attempt ${attempt + 1}/${retries}). Retrying...`);
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      
      if (isLastAttempt) {
        console.error(`Error analyzing frame at ${frame.timestamp}s after ${retries} attempts:`, e);
        // Return empty frame rather than failing whole process
        return { timestamp: frame.timestamp, cellCount: 0, cells: [], events: [] };
      }
    }
  }
  
  return { timestamp: frame.timestamp, cellCount: 0, cells: [], events: [] };
};

// Helper: Heuristic tracker to link IDs, detect growth events, and manage trails
const linkCellsAcrossFrames = (frames: FrameData[]): FrameData[] => {
  if (frames.length === 0) return frames;

  let nextId = 1;
  const HISTORY_LENGTH = 10;
  
  // Assign fresh IDs to first frame
  frames[0].cells.forEach(cell => {
    cell.id = nextId++;
    cell.history = []; // First frame has no history
  });

  for (let i = 1; i < frames.length; i++) {
    const prevFrame = frames[i - 1];
    const currFrame = frames[i];
    const prevCells = prevFrame.cells;
    const currCells = currFrame.cells;
    
    let newCellsFound = 0;

    currCells.forEach(curr => {
      let minDist = Infinity;
      let match = null;

      prevCells.forEach(prev => {
        const dist = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2));
        
        // RELAXED TRACKING THRESHOLD for Adaptive Sampling:
        // Since frames might be 5+ seconds apart, cells move further. 
        // Increased threshold from 10 to 25 to prevent losing IDs on long intervals.
        if (dist < 25) { 
          if (dist < minDist) {
            minDist = dist;
            match = prev;
          }
        }
      });

      if (match) {
        curr.id = match.id;
        // Motion Trail Logic: Inherit history + add previous point
        const prevHistory = match.history || [];
        curr.history = [...prevHistory, { x: match.x, y: match.y }].slice(-HISTORY_LENGTH);
      } else {
        // No match found - this is likely a new cell
        curr.id = nextId++;
        curr.history = []; // New cell starts with empty history
        newCellsFound++;
      }
    });

    // Heuristic Event Detection: If population grew significantly or new IDs appeared
    if (newCellsFound > 0 && currCells.length > prevCells.length) {
       // Only add if not already redundant with AI detection
       const hasMitosis = currFrame.events.some(e => e.type === 'Mitosis');
       if (!hasMitosis) {
         currFrame.events.push({
           type: 'Growth',
           description: `New cell detected (Total: ${currCells.length})`
         });
       }
    }
  }

  return frames;
};

// Helper: Generate formal scientific report
const generateScientificReport = async (ai: GoogleGenAI, frames: FrameData[]): Promise<string> => {
  if (frames.length === 0) return "No data available for report.";

  const duration = frames[frames.length - 1].timestamp;
  const initialCount = frames[0].cellCount;
  const finalCount = frames[frames.length - 1].cellCount;
  const maxCount = Math.max(...frames.map(f => f.cellCount));
  
  const mitosisEvents = frames.flatMap(f => f.events).filter(e => e.type === 'Mitosis').length;
  const apoptosisEvents = frames.flatMap(f => f.events).filter(e => e.type === 'Apoptosis').length;
  const growthEvents = frames.flatMap(f => f.events).filter(e => e.type === 'Growth').length;

  const stats = JSON.stringify({
    videoDurationSeconds: duration,
    initialPopulation: initialCount,
    finalPopulation: finalCount,
    peakPopulation: maxCount,
    eventsDetected: {
      mitosis: mitosisEvents,
      apoptosis: apoptosisEvents,
      populationGrowth: growthEvents
    }
  });

  const prompt = `
    You are a senior computational biologist writing a formal laboratory report based on automated video analysis data.
    
    Data: ${stats}

    Please write a "Scientific Analysis Report" in Markdown format with the following structure:
    ## Abstract
    (Brief summary of the experiment and findings)
    
    ## Methodology: Computer Vision Analysis
    (Briefly explain that a Gemini-powered multimodal AI tracked cell centroids and morphology over time)

    ## Results: Population Dynamics
    (Discuss the trends in cell count, growth rates, and stability. Use the numbers provided.)

    ## Event Analysis
    (Discuss observed biological events like mitosis or cell death based on the stats.)

    ## Conclusion
    (Final biological interpretation of the sample's health and proliferation status.)

    Tone: Academic, objective, professional. 
    Do not use placeholders. Use the data provided to generate realistic text.
  `;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: { text: prompt }
    });
    return response.text || "Report generation returned empty.";
  } catch (e) {
    console.error("Report generation failed", e);
    return "## Analysis Report\n\nAutomated report generation failed due to network or quota limits. Please refer to the raw data charts.";
  }
};

// Helper: Translate technical errors to user friendly messages
const getFriendlyErrorMessage = (error: any): string => {
  const msg = error.toString();
  if (msg.includes("API key")) return "Invalid API Key provided. Please check your key.";
  if (msg.includes("429")) return "Too many requests. The API quota has been exceeded. Please try again in a few minutes.";
  if (msg.includes("Network")) return "Network error. Please check your internet connection.";
  if (msg.includes("timed out")) return "The video processing timed out. Try a shorter video clip.";
  
  // Specific Video Errors
  if (msg.includes("unsupported codec") || msg.includes("H.265")) return "Video format not supported. Your browser cannot play this file (likely H.265/HEVC). Please convert to standard MP4 (H.264).";
  if (msg.includes("corrupted")) return "The video file appears to be corrupted or cannot be decoded by the browser.";
  if (msg.includes("video file")) return "Could not parse video file. Ensure it is a valid MP4/WebM that plays in your browser.";
  
  return "An unexpected error occurred during analysis. Please try again.";
};

export const analyzeMicroscopyVideo = async (
  file: File, 
  apiKey: string,
  onProgress: (progress: number, message: string) => void
): Promise<AnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    // 1. Extract Frames
    onProgress(5, "Initializing video processor...");
    const rawFrames = await extractFrames(file, 1.0);
    
    if (rawFrames.length === 0) {
      throw new Error("No usable frames found in video.");
    }

    onProgress(15, `Extracted ${rawFrames.length} frames. Preparing AI vision model...`);
    
    // 2. Analyze Frames Sequentially 
    const analyzedFrames: FrameData[] = [];
    const totalFrames = rawFrames.length;

    for (let i = 0; i < totalFrames; i++) {
      // Scale progress from 15% to 80%
      const percentage = 15 + Math.round((i / totalFrames) * 65);
      onProgress(percentage, `Scanning frame ${i + 1} of ${totalFrames} for biological structures...`);
      
      const data = await analyzeFrame(ai, rawFrames[i]);
      analyzedFrames.push(data);
    }

    // 3. Post-process to link IDs
    onProgress(85, "Tracking cell trajectories and calculating vectors...");
    const linkedFrames = linkCellsAcrossFrames(analyzedFrames);

    // 4. Generate Scientific Report
    onProgress(90, "Synthesizing final scientific report...");
    const extendedReport = await generateScientificReport(ai, linkedFrames);

    // 5. Finalize
    onProgress(98, "Finalizing data visualization...");
    const avgCount = linkedFrames.reduce((acc, f) => acc + f.cellCount, 0) / (linkedFrames.length || 1);
    const summary = `Analysis complete. Processed ${linkedFrames.length} frames over ${linkedFrames[linkedFrames.length-1]?.timestamp.toFixed(1) || 0} seconds. Average cell count: ${avgCount.toFixed(1)}.`;

    onProgress(100, "Analysis Complete!");

    return {
      frames: linkedFrames,
      summary,
      extendedReport
    };
  } catch (error) {
    console.error("Deep analysis failed:", error);
    throw new Error(getFriendlyErrorMessage(error));
  }
};