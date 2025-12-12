import React, { useState } from 'react';
import { Upload, Dna, FileVideo, AlertTriangle, Loader2, Key, Info, FileText } from 'lucide-react';
import VideoPlayer from './components/VideoPlayer';
import AnalysisCharts from './components/AnalysisCharts';
import EventLog from './components/EventLog';
import { analyzeMicroscopyVideo } from './services/geminiService';
import { AnalysisResult, AnalysisStatus } from './types';

// Simple Markdown component to avoid heavy external dependencies
const SimpleMarkdown: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split('\n');
  return (
    <div className="space-y-4 font-serif text-slate-300 leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return <h3 key={i} className="text-xl font-bold text-emerald-400 mt-6 mb-2 border-b border-slate-700 pb-2">{line.replace('## ', '')}</h3>;
        }
        if (line.startsWith('### ')) {
          return <h4 key={i} className="text-lg font-semibold text-emerald-300 mt-4">{line.replace('### ', '')}</h4>;
        }
        if (line.trim().startsWith('- ')) {
          return <li key={i} className="ml-4 list-disc marker:text-emerald-500 pl-2">{line.replace('- ', '')}</li>;
        }
        if (line.trim() === '') {
          return <div key={i} className="h-2"></div>;
        }
        return <p key={i} className="text-justify">{line}</p>;
      })}
    </div>
  );
};

function App() {
  const [apiKey, setApiKey] = useState<string>('');
  const [isKeySet, setIsKeySet] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState<string>('Initializing...');

  const handleKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim().length > 0) {
      setIsKeySet(true);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      // Expanded validation to include mov and mkv which are often valid but just wrong mime type in input
      const validTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'];
      
      // If valid type OR ends with expected extension (fallback)
      const isValid = validTypes.includes(selectedFile.type) || 
                      selectedFile.name.endsWith('.mp4') || 
                      selectedFile.name.endsWith('.mov') || 
                      selectedFile.name.endsWith('.mkv') ||
                      selectedFile.name.endsWith('.webm');

      if (!isValid) {
        setStatus(AnalysisStatus.ERROR);
        setErrorMsg("Invalid file format. Please upload an MP4, MOV, or WebM video.");
        return;
      }
      setFile(selectedFile);
      setVideoUrl(URL.createObjectURL(selectedFile));
      setStatus(AnalysisStatus.IDLE);
      setResult(null);
      setErrorMsg(null);
      setProgress(0);
      setProgressMessage("Ready to analyze");
    }
  };

  const handleAnalyze = async () => {
    if (!file || !apiKey) return;

    try {
      setStatus(AnalysisStatus.ANALYZING);
      setProgress(0);
      setProgressMessage("Starting analysis engine...");
      setErrorMsg(null);
      
      const data = await analyzeMicroscopyVideo(file, apiKey, (p, msg) => {
        setProgress(Math.round(p));
        setProgressMessage(msg);
      });
      
      setResult(data);
      setStatus(AnalysisStatus.COMPLETE);
    } catch (err: any) {
      console.error(err);
      setStatus(AnalysisStatus.ERROR);
      setErrorMsg(err.message || "Failed to analyze video. Please check your API key and try again.");
    }
  };

  if (!isKeySet) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800 rounded-xl border border-slate-700 p-8 shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center">
              <Key className="text-emerald-500" size={32} />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center text-slate-100 mb-2">Enter Gemini API Key</h2>
          <p className="text-slate-400 text-center mb-6 text-sm">
            To use CellTracker AI, please provide your own Google Gemini API key. 
            The key is used locally in your browser and is never stored on a server.
          </p>
          <form onSubmit={handleKeySubmit} className="space-y-4">
            <div>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold rounded-lg transition-all shadow-lg"
            >
              Get Started
            </button>
            <p className="text-xs text-center text-slate-500 mt-4">
              Don't have a key? <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">Get one here</a>
            </p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Dna className="text-white" size={24} />
            </div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
              CellTracker AI
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => { setIsKeySet(false); setApiKey(''); }}
              className="text-xs text-slate-500 hover:text-slate-300 font-mono transition-colors"
            >
              Change API Key
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 pb-20">
        
        {/* Upload Section */}
        {status === AnalysisStatus.IDLE && !result && (
          <div className="max-w-2xl mx-auto">
             <div className="bg-slate-800 rounded-2xl border-2 border-dashed border-slate-600 p-12 text-center hover:border-emerald-500/50 transition-colors group">
                <input 
                  type="file" 
                  id="video-upload" 
                  className="hidden" 
                  accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
                  onChange={handleFileChange}
                />
                <label htmlFor="video-upload" className="cursor-pointer flex flex-col items-center">
                  <div className="w-20 h-20 bg-slate-700 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <Upload className="text-emerald-400" size={40} />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-100 mb-2">Upload Microscopy Video</h3>
                  <p className="text-slate-400 max-w-sm mx-auto mb-6">
                    Support for MP4, WebM, and MOV. <br/>AI will extract frames, identify cells, and visualize tracking.
                  </p>
                  <span className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors shadow-lg shadow-emerald-600/20">
                    Select File
                  </span>
                </label>
             </div>
          </div>
        )}

        {/* Processing State with Detailed Feedback */}
        {(status === AnalysisStatus.ANALYZING || (status === AnalysisStatus.IDLE && file && !result)) && (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 flex flex-col space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center space-x-4">
                 <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center">
                   <FileVideo className="text-slate-300" size={24} />
                 </div>
                 <div>
                   <h3 className="text-lg font-medium text-slate-100">{file?.name}</h3>
                   <p className="text-sm text-slate-400">{(file?.size ? file.size / 1024 / 1024 : 0).toFixed(2)} MB</p>
                 </div>
              </div>
              
              {status === AnalysisStatus.IDLE && (
                <button 
                  onClick={handleAnalyze}
                  className="flex items-center px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-medium rounded-lg transition-all shadow-lg"
                >
                  <Dna size={18} className="mr-2" />
                  Start Analysis
                </button>
              )}

              {status === AnalysisStatus.ANALYZING && (
                <div className="flex items-center text-emerald-400">
                  <Loader2 className="animate-spin mr-2" size={20} />
                  <span className="font-medium">{progress}%</span>
                </div>
              )}
            </div>
            
            {status === AnalysisStatus.ANALYZING && (
              <div className="space-y-2">
                <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-emerald-500 h-2 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-center text-emerald-400 font-mono animate-pulse">
                  {progressMessage}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Error State - User Friendly */}
        {status === AnalysisStatus.ERROR && (
           <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 flex flex-col items-center text-center space-y-4 animate-in zoom-in-95">
             <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                <AlertTriangle className="text-red-500" size={24} />
             </div>
             <div className="space-y-1">
               <h3 className="text-lg font-semibold text-red-200">Analysis Failed</h3>
               <p className="text-red-300 max-w-lg">{errorMsg}</p>
             </div>
             <button 
                onClick={() => {
                  setStatus(AnalysisStatus.IDLE);
                  setFile(null); // Reset file to force new upload attempt
                  setResult(null);
                }} 
                className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors text-sm"
             >
               Try Another File
             </button>
           </div>
        )}

        {/* Dashboard Grid */}
        {result && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-700">
            {/* Left Column: Video Player */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-slate-800 rounded-xl p-1 border border-slate-700 shadow-2xl">
                <VideoPlayer 
                  videoUrl={videoUrl} 
                  frames={result.frames} 
                  onTimeUpdate={setCurrentTime}
                />
              </div>
              
              {/* Short Summary Card */}
              <div className="bg-slate-800/60 rounded-xl p-6 border border-slate-700">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Analysis Summary</h3>
                <p className="text-slate-200 leading-relaxed">{result.summary}</p>
              </div>

               {/* Extended Report Section */}
              <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden shadow-2xl mt-8">
                 <div className="bg-slate-800 p-4 border-b border-slate-700 flex items-center">
                    <FileText className="text-emerald-500 mr-2" size={20} />
                    <h2 className="text-lg font-semibold text-slate-100">Scientific Analysis Report</h2>
                 </div>
                 <div className="p-8 bg-slate-900/50">
                    <SimpleMarkdown content={result.extendedReport} />
                 </div>
              </div>
            </div>

            {/* Right Column: Analytics */}
            <div className="space-y-6">
              <AnalysisCharts data={result.frames} currentTime={currentTime} />
              <EventLog frames={result.frames} currentTime={currentTime} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;