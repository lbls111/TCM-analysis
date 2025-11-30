
import React from 'react';
import { UserMode } from '../types';

interface Props {
  onSelect: (mode: UserMode) => void;
}

export const ModeSelector: React.FC<Props> = ({ onSelect }) => {
  return (
    <div className="w-screen h-screen bg-slate-100 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-24 h-24 mx-auto bg-gradient-to-br from-white to-slate-50 rounded-3xl shadow-xl shadow-indigo-100/50 flex items-center justify-center text-5xl mb-6 ring-1 ring-slate-100 text-indigo-600">
        💊
      </div>
      <h1 className="text-5xl md:text-6xl font-black font-serif-sc text-slate-900 mb-4 tracking-tight">
        LogicMaster <span className="text-indigo-600">TCM</span>
      </h1>
      <p className="text-slate-500 text-lg md:text-xl font-medium mb-12">
        请选择您的访问模式
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
        {/* Visitor Mode Card */}
        <div
          onClick={() => onSelect(UserMode.VISITOR)}
          className="bg-white p-8 rounded-3xl shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 cursor-pointer border-2 border-transparent hover:border-amber-400 group"
        >
          <div className="text-5xl mb-4">🚶</div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">访客模式</h2>
          <p className="text-slate-500 mb-6">
            体验应用的核心计算与 AI 分析功能。所有数据将存储在您的浏览器本地，或使用公共的只读云数据库。
          </p>
          <div className="bg-amber-100 text-amber-800 text-sm font-bold py-3 px-6 rounded-full group-hover:bg-amber-500 group-hover:text-white transition-colors">
            立即体验
          </div>
        </div>

        {/* Administrator Mode Card */}
        <div
          onClick={() => onSelect(UserMode.ADMIN)}
          className="bg-white p-8 rounded-3xl shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 cursor-pointer border-2 border-transparent hover:border-indigo-500 group"
        >
          <div className="text-5xl mb-4">☁️</div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">管理员模式</h2>
          <p className="text-slate-500 mb-6">
            连接您自己的 Supabase 云数据库，实现病历、报告和药典数据的私有化存储与跨设备同步。
          </p>
          <div className="bg-indigo-100 text-indigo-800 text-sm font-bold py-3 px-6 rounded-full group-hover:bg-indigo-600 group-hover:text-white transition-colors">
            连接私有云
          </div>
        </div>
      </div>
      
       <p className="text-xs text-slate-400 mt-12">
            选择模式后，您仍然可以在应用内通过设置更改 API Key 等参数。
       </p>
    </div>
  );
};
