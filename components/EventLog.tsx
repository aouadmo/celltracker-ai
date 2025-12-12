import React from 'react';
import { FrameData, FrameEvent } from '../types';
import { Activity, Zap, AlertCircle } from 'lucide-react';

interface EventLogProps {
  frames: FrameData[];
  currentTime: number;
}

const EventLog: React.FC<EventLogProps> = ({ frames, currentTime }) => {
  // Flatten events
  const allEvents = frames.flatMap(frame => 
    frame.events.map(event => ({ ...event, timestamp: frame.timestamp }))
  ).sort((a, b) => a.timestamp - b.timestamp);

  const getEventIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('mitosis') || t.includes('division')) return <Zap className="text-yellow-400" size={16} />;
    if (t.includes('apoptosis') || t.includes('death')) return <AlertCircle className="text-red-400" size={16} />;
    return <Activity className="text-blue-400" size={16} />;
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg flex flex-col h-[350px]">
      <div className="p-4 border-b border-slate-700 bg-slate-800/50 rounded-t-xl backdrop-blur">
        <h3 className="text-lg font-semibold text-slate-100 flex items-center">
          <Activity className="mr-2 text-emerald-500" size={20} />
          Event Log
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {allEvents.length === 0 ? (
          <div className="text-center text-slate-500 mt-10 text-sm">No significant events detected yet.</div>
        ) : (
          allEvents.map((evt, idx) => {
            const isPast = evt.timestamp <= currentTime;
            const isRecent = Math.abs(evt.timestamp - currentTime) < 1.5;

            return (
              <div 
                key={`${evt.timestamp}-${idx}`}
                className={`flex items-start p-3 rounded-lg text-sm transition-all duration-300 ${
                  isRecent 
                    ? 'bg-emerald-900/30 border border-emerald-500/50' 
                    : 'bg-slate-700/50 border border-slate-600/30'
                } ${!isPast ? 'opacity-50' : 'opacity-100'}`}
              >
                <span className="font-mono text-slate-400 min-w-[50px] pt-0.5">
                  {evt.timestamp.toFixed(1)}s
                </span>
                <div className="mt-0.5 mr-2">
                  {getEventIcon(evt.type)}
                </div>
                <div>
                  <div className="font-medium text-slate-200">{evt.type}</div>
                  <div className="text-slate-400 text-xs">{evt.description}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default EventLog;