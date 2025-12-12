import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { FrameData } from '../types';

interface AnalysisChartsProps {
  data: FrameData[];
  currentTime: number;
}

const AnalysisCharts: React.FC<AnalysisChartsProps> = ({ data, currentTime }) => {
  if (data.length === 0) return null;

  return (
    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg h-[350px]">
      <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center">
        <span className="w-2 h-6 bg-emerald-500 rounded mr-2"></span>
        Population Growth
      </h3>
      <div className="w-full h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis 
              dataKey="timestamp" 
              stroke="#94a3b8" 
              tickFormatter={(val) => `${val}s`}
              label={{ value: 'Time (s)', position: 'insideBottomRight', offset: -5, fill: '#94a3b8' }}
            />
            <YAxis 
              stroke="#94a3b8"
              label={{ value: 'Cell Count', angle: -90, position: 'insideLeft', fill: '#94a3b8' }}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }}
              itemStyle={{ color: '#34d399' }}
              labelFormatter={(label) => `Time: ${label}s`}
            />
            <Line 
              type="monotone" 
              dataKey="cellCount" 
              stroke="#34d399" 
              strokeWidth={3} 
              dot={false}
              activeDot={{ r: 6, fill: '#10b981' }}
              animationDuration={500}
            />
            {/* Sync Line */}
            <ReferenceLine x={currentTime} stroke="#f472b6" strokeDasharray="3 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default AnalysisCharts;