import React, { useRef, useEffect, useState } from 'react';
import { FrameData } from '../types';
import { Play, Pause, Maximize } from 'lucide-react';

interface VideoPlayerProps {
  videoUrl: string | null;
  frames: FrameData[];
  onTimeUpdate?: (time: number) => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoUrl, frames, onTimeUpdate }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Handle Play/Pause
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Sync Video Time
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);
      if (onTimeUpdate) onTimeUpdate(time);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  // Canvas Drawing Loop
  useEffect(() => {
    let animationFrameId: number;

    const render = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas) {
        // Match canvas size to video display size
        if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
          canvas.width = video.clientWidth;
          canvas.height = video.clientHeight;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Find closest frame data
          // With adaptive sampling, frames might be at 0, 2.5, 5.0... 
          // We need the closest one to current playback time to ensure annotations persist.
          let frameData: FrameData | null = null;
          if (frames.length > 0) {
             frameData = frames.reduce((prev, curr) => {
                return (Math.abs(curr.timestamp - video.currentTime) < Math.abs(prev.timestamp - video.currentTime) ? curr : prev);
             });
          }

          if (frameData && frameData.cells) {
            frameData.cells.forEach(cell => {
              const x = (cell.x / 100) * canvas.width;
              const y = (cell.y / 100) * canvas.height;
              // Ensure radius is visible but not huge
              const r = Math.max((cell.r / 100) * (Math.min(canvas.width, canvas.height)), 5);

              const isMitosis = cell.status?.toLowerCase().includes('divid') || 
                                cell.status?.toLowerCase().includes('mitosis') || 
                                cell.status?.toLowerCase().includes('prepar');
              
              const baseColor = isMitosis ? '#06b6d4' : '#34d399'; // Cyan for Mitosis, Emerald for Normal

              // --- 1. Draw Motion Trail ("Comet Tail") ---
              if (cell.history && cell.history.length > 0) {
                // Draw line segments with increasing opacity
                for (let i = 0; i < cell.history.length; i++) {
                   const pt = cell.history[i];
                   const nextPt = (i === cell.history.length - 1) 
                      ? { x: cell.x, y: cell.y } // Connect last history point to current
                      : cell.history[i+1];
                   
                   const startX = (pt.x / 100) * canvas.width;
                   const startY = (pt.y / 100) * canvas.height;
                   const endX = (nextPt.x / 100) * canvas.width;
                   const endY = (nextPt.y / 100) * canvas.height;
                   
                   ctx.beginPath();
                   ctx.moveTo(startX, startY);
                   ctx.lineTo(endX, endY);
                   ctx.strokeStyle = baseColor;
                   ctx.lineWidth = 2;
                   // Opacity gradient: Older points are more transparent
                   ctx.globalAlpha = 0.2 + ((i / cell.history.length) * 0.6); 
                   ctx.stroke();
                }
                ctx.globalAlpha = 1.0; // Reset alpha
              }

              // --- 2. Draw Bounding Circle ---
              ctx.beginPath();
              ctx.arc(x, y, r, 0, 2 * Math.PI);
              ctx.strokeStyle = baseColor;
              ctx.lineWidth = 2;
              ctx.stroke();

              // --- 3. Draw ID Label ---
              ctx.fillStyle = baseColor;
              ctx.font = 'bold 12px sans-serif';
              ctx.fillText(`#${cell.id}`, x + r + 2, y);

              // --- 4. Draw "Doctor's Note" Status Label ---
              if (cell.status && cell.status !== 'Normal') {
                ctx.font = 'bold 11px sans-serif';
                ctx.fillStyle = '#ffffff';
                const textWidth = ctx.measureText(cell.status).width;
                
                // Background for text
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.fillRect(x - (textWidth/2) - 4, y - r - 20, textWidth + 8, 16);
                
                // Text
                ctx.fillStyle = isMitosis ? '#67e8f9' : '#ffffff'; // Cyan or White text
                ctx.textAlign = 'center';
                ctx.fillText(cell.status, x, y - r - 8);
                ctx.textAlign = 'left'; // Reset
              }
            });
          }
        }
      }
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [frames]);

  if (!videoUrl) {
    return (
      <div className="w-full h-96 bg-slate-800 rounded-xl flex flex-col items-center justify-center border-2 border-dashed border-slate-600 text-slate-400">
        <div className="text-6xl mb-4">🔬</div>
        <p>Upload a microscopy video to begin</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-4" ref={containerRef}>
      <div className="relative w-full bg-black rounded-xl overflow-hidden shadow-2xl border border-slate-700 group">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-auto block max-h-[600px] object-contain mx-auto"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
          playsInline
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
        />
        
        {/* Controls Overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="flex flex-col space-y-2">
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.1"
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center space-x-4">
                <button onClick={togglePlay} className="hover:text-emerald-400 transition">
                  {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                </button>
                <span className="text-sm font-mono">
                  {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
                </span>
              </div>
              <button className="hover:text-emerald-400 transition" onClick={() => containerRef.current?.requestFullscreen()}>
                 <Maximize size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;