import React, { useState, useEffect } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  metaInfo: string;
  originalMetaInfo?: string; // Old content
  onSave: (info: string) => Promise<void> | void;
  isAiSuggestion?: boolean; // If true, metaInfo is the "New" suggestion
}

export const MetaInfoModal: React.FC<Props> = ({ isOpen, onClose, metaInfo, originalMetaInfo, onSave, isAiSuggestion }) => {
  const [localInfo, setLocalInfo] = useState(metaInfo);
  const [isSaving, setIsSaving] = useState(false);
  
  // Controls for Split View
  const [activeTab, setActiveTab] = useState<'edit' | 'diff'>('edit');

  useEffect(() => {
    setLocalInfo(metaInfo);
    // Auto-switch to diff view if it's an AI suggestion
    if (isAiSuggestion && isOpen) {
        setActiveTab('diff');
    }
  }, [metaInfo, isOpen, isAiSuggestion]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
        await onSave(localInfo);
        onClose();
    } catch (e) {
        console.error("Failed to save meta info", e);
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
      
      <div 
        className={`relative bg-white w-full ${isAiSuggestion ? 'max-w-5xl' : 'max-w-2xl'} rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-200 transition-all`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`p-6 flex justify-between items-center border-b ${isAiSuggestion ? 'bg-gradient-to-r from-indigo-600 to-purple-600 border-indigo-700' : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-100'}`}>
           <div className="flex items-center gap-3">
             <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-sm ${isAiSuggestion ? 'bg-white/20 text-white backdrop-blur' : 'bg-white border border-amber-200'}`}>
               {isAiSuggestion ? '⚖️' : '🧠'}
             </div>
             <div>
               <h3 className={`text-xl font-bold ${isAiSuggestion ? 'text-white' : 'text-amber-900'}`}>
                  {isAiSuggestion ? '病历融合驾驶舱 (Fusion Cockpit)' : '研讨元信息管理'}
               </h3>
               <p className={`text-xs font-medium ${isAiSuggestion ? 'text-indigo-100' : 'text-amber-700/60'}`}>
                  {isAiSuggestion ? 'AI 建议更新病历，请对比差异并确认' : '设定AI问答的背景上下文 (Context)'}
               </p>
             </div>
           </div>
           
           {/* Tab Switcher for Suggestion Mode */}
           {isAiSuggestion && (
               <div className="flex bg-white/20 backdrop-blur p-1 rounded-lg">
                   <button 
                     onClick={() => setActiveTab('diff')}
                     className={`px-3 py-1 rounded text-xs font-bold transition-colors ${activeTab === 'diff' ? 'bg-white text-indigo-700 shadow-sm' : 'text-indigo-100 hover:text-white'}`}
                   >
                       👀 差异对比
                   </button>
                   <button 
                     onClick={() => setActiveTab('edit')}
                     className={`px-3 py-1 rounded text-xs font-bold transition-colors ${activeTab === 'edit' ? 'bg-white text-indigo-700 shadow-sm' : 'text-indigo-100 hover:text-white'}`}
                   >
                       ✏️ 编辑结果
                   </button>
               </div>
           )}
           
           <button onClick={onClose} className={`w-8 h-8 rounded-full flex items-center justify-center transition ml-4 ${isAiSuggestion ? 'text-white/70 hover:bg-white/10 hover:text-white' : 'hover:bg-black/5 text-slate-500'}`}>✕</button>
        </div>

        {isAiSuggestion && activeTab === 'diff' ? (
            // === DIFF VIEW ===
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row bg-slate-50 min-h-[400px] max-h-[70vh]">
                {/* Left: Original */}
                <div className="flex-1 flex flex-col border-b md:border-b-0 md:border-r border-slate-200">
                    <div className="p-3 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider flex justify-between">
                        <span>⏮️ 当前档案 (Original)</span>
                        <span className="bg-slate-200 px-2 py-0.5 rounded text-slate-600">Old</span>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto whitespace-pre-wrap font-mono text-sm leading-relaxed text-slate-600 bg-slate-50/50 custom-scrollbar">
                        {originalMetaInfo || "(空档案)"}
                    </div>
                </div>

                {/* Right: AI Suggestion */}
                <div className="flex-1 flex flex-col">
                    <div className="p-3 bg-indigo-50 border-b border-indigo-100 text-xs font-bold text-indigo-600 uppercase tracking-wider flex justify-between">
                        <span>✨ AI 融合建议 (Proposed)</span>
                        <span className="bg-indigo-100 px-2 py-0.5 rounded text-indigo-700">New</span>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto whitespace-pre-wrap font-mono text-sm leading-relaxed text-slate-800 bg-white custom-scrollbar">
                        {localInfo}
                    </div>
                    <div className="p-2 bg-amber-50 text-amber-700 text-xs border-t border-amber-100 text-center font-bold">
                        ⚠️ 警告：请仔细检查左侧旧数据表格是否完整保留。如果 AI 删除了表格，请切换到“编辑”模式手动修正。
                    </div>
                </div>
            </div>
        ) : (
            // === EDIT VIEW ===
            <div className="p-6 bg-white space-y-4 max-h-[60vh] overflow-y-auto">
                {!isAiSuggestion && (
                    <div className="bg-blue-50 text-blue-700 p-4 rounded-xl text-sm border border-blue-100 flex gap-3">
                        <span className="text-lg">ℹ️</span>
                        <div>
                            <strong>什么是元信息？</strong>
                            <p className="mt-1 opacity-80">
                                在此输入患者的四诊信息（如脉象、舌苔）、主诉、既往病史、体质特征或季节环境等。
                                AI 在回答问题时，将强制引用此处的上下文。
                            </p>
                        </div>
                    </div>
                )}
                
                {isAiSuggestion && (
                     <div className="p-3 bg-indigo-50 text-indigo-600 text-sm rounded-lg border border-indigo-100 mb-2">
                         📝 您可以在下方直接修改最终保存的内容。确认无误后点击“确认并融合”。
                     </div>
                )}

                <textarea
                    value={localInfo}
                    onChange={(e) => setLocalInfo(e.target.value)}
                    placeholder="例如：患者女性，45岁，主诉失眠多梦，舌红少苔，脉细数。既往有甲亢病史..."
                    className={`w-full h-80 p-4 bg-slate-50 border rounded-xl text-slate-800 placeholder-slate-400 focus:ring-2 outline-none resize-none text-base leading-relaxed custom-scrollbar font-mono ${isAiSuggestion ? 'border-indigo-200 focus:ring-indigo-500/50 focus:border-indigo-500' : 'border-slate-200 focus:ring-amber-500/50 focus:border-amber-500'}`}
                />
            </div>
        )}

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 flex justify-between items-center gap-3 bg-slate-50">
            <div>
               {isAiSuggestion && (
                   <span className="text-xs text-slate-400">
                       💡 点击 "确认" 将不可逆地覆盖旧档案。
                   </span>
               )}
            </div>
            <div className="flex gap-3">
                <button onClick={onClose} className="px-5 py-2 rounded-lg text-slate-500 font-bold hover:bg-slate-100 transition">取消</button>
                <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`px-6 py-2 rounded-lg text-white font-bold shadow-lg transition transform active:scale-95 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${isAiSuggestion ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200' : 'bg-amber-500 hover:bg-amber-600 shadow-amber-200'}`}
                >
                    {isSaving ? <span className="animate-spin">⏳</span> : <span>{isAiSuggestion ? '⚡' : '💾'}</span>}
                    {isSaving ? '同步中...' : (isAiSuggestion ? '确认并融合 (Merge)' : '确认并保存')}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};