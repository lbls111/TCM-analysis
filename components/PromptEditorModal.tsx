
import React, { useState, useEffect } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  defaultPrompt: string;
  onSave: (newPrompt: string) => void;
}

export const PromptEditorModal: React.FC<Props> = ({ isOpen, onClose, title, defaultPrompt, onSave }) => {
  const [prompt, setPrompt] = useState(defaultPrompt);

  useEffect(() => {
    setPrompt(defaultPrompt);
  }, [defaultPrompt, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="bg-slate-800 text-white p-4 flex justify-between items-center shrink-0">
           <h3 className="font-bold flex items-center gap-2">
             <span className="text-xl">🔧</span> {title}
           </h3>
           <button onClick={onClose} className="hover:text-slate-300">✕</button>
        </div>
        
        <div className="flex-1 p-0 relative">
            <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full h-full p-6 font-mono text-sm text-slate-700 resize-none outline-none bg-slate-50 focus:bg-white transition-colors"
                placeholder="在此输入系统提示词..."
                spellCheck={false}
            />
        </div>

        <div className="p-4 bg-white border-t border-slate-200 flex justify-between items-center shrink-0">
           <div className="text-xs text-slate-400">
              提示：此修改仅对本次会话生效 (内存中)，刷新页面后将重置为默认值。
           </div>
           <div className="flex gap-3">
               <button onClick={() => setPrompt(defaultPrompt)} className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm font-bold">
                   恢复默认
               </button>
               <button onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-bold">
                   取消
               </button>
               <button 
                   onClick={() => { onSave(prompt); onClose(); }}
                   className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-lg"
               >
                   保存提示词配置
               </button>
           </div>
        </div>
      </div>
    </div>
  );
};
