
import React, { useState } from 'react';
import { AISettings } from '../types';
import { fetchAvailableModels, testModelConnection, DEFAULT_ANALYZE_SYSTEM_INSTRUCTION } from '../services/openaiService';
import { DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_KEY, DEFAULT_EMBEDDING_MODEL, DEFAULT_RERANK_MODEL, VISITOR_DEFAULT_CHAT_MODEL, DEFAULT_ORGANIZE_MODEL } from '../constants';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: AISettings;
  onSave: (newSettings: AISettings) => void;
  isVisitorMode?: boolean;
}

export const AISettingsModal: React.FC<Props> = ({ isOpen, onClose, settings, onSave, isVisitorMode }) => {
  const [localSettings, setLocalSettings] = useState<AISettings>(settings);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'api' | 'cloud'>('api');
  const [showSqlGuide, setShowSqlGuide] = useState(false);

  // Sync when opening
  React.useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings);
      setFetchError(null);
      setTestResult(null);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleReset = () => {
    if (window.confirm("确定要恢复默认参数吗？(API Key 不会被清除)")) {
      setLocalSettings(prev => ({
        ...prev,
        temperature: 0, // Medical default
        topK: 64,
        topP: 0.95,
        maxTokens: 8192,
        thinkingBudget: 0,
        organizeModel: DEFAULT_ORGANIZE_MODEL,
        // Keep credentials
        embeddingModel: DEFAULT_EMBEDDING_MODEL,
        rerankModel: DEFAULT_RERANK_MODEL
      }));
    }
  };
  
  const handleTestConnection = async () => {
      if (!localSettings.apiBaseUrl || !localSettings.apiKey) {
          setTestResult("请先填写 API Base URL 和 API Key");
          return;
      }
      setIsTesting(true);
      setTestResult(null);
      try {
          const msg = await testModelConnection(localSettings.apiBaseUrl, localSettings.apiKey);
          setTestResult(msg);
      } catch (e: any) {
          setTestResult(`连接失败: ${e.message}`);
      } finally {
          setIsTesting(false);
      }
  };

  const handleFetchModels = async () => {
    if (!localSettings.apiBaseUrl || !localSettings.apiKey) {
        setFetchError("请先填写 API Base URL 和 API Key");
        return;
    }
    
    setIsFetchingModels(true);
    setFetchError(null);
    try {
        const models = await fetchAvailableModels(localSettings.apiBaseUrl, localSettings.apiKey);
        if (models.length > 0) {
            setLocalSettings(prev => ({
                ...prev,
                availableModels: models,
                // Auto-select first chat model if empty
                model: prev.model || models[0].id,
            }));
            alert(`成功获取 ${models.length} 个模型！`);
        } else {
            setFetchError("未获取到模型列表，请检查地址或 Key 权限。");
        }
    } catch (e: any) {
        setFetchError(e.message);
    } finally {
        setIsFetchingModels(false);
    }
  };
  
  const handleSave = () => {
    // Ensure system instruction is passed through (even though invisible)
    onSave({
        ...localSettings,
        systemInstruction: DEFAULT_ANALYZE_SYSTEM_INSTRUCTION
    });
    onClose();
    // Prompt for reload if Cloud settings changed to ensure sync starts
    if (settings.supabaseUrl !== localSettings.supabaseUrl) {
       if(window.confirm("云数据库设置已更改，是否刷新页面以加载云端数据？")) {
           window.location.reload();
       }
    }
  };
  
  const copySqlToClipboard = () => {
      const sql = `-- 1. 药材表 (herbs)
create table if not exists herbs (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  nature text,
  flavors jsonb,
  meridians jsonb,
  efficacy text,
  usage text,
  category text,
  processing text,
  is_raw boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. 报告表 (reports)
create table if not exists reports (
  id uuid default gen_random_uuid() primary key,
  prescription text,
  content text,
  meta jsonb,
  analysis_result jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 3. 聊天会话表 (chat_sessions) - 包含病历数据
create table if not exists chat_sessions (
  id text primary key,
  title text,
  messages jsonb,
  meta_info text, 
  medical_record jsonb, 
  created_at bigint,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 🚨 修复补丁: 如果遇到 "Could not find column" 错误，请务必运行下面这几行:
alter table chat_sessions add column if not exists meta_info text;
alter table chat_sessions add column if not exists medical_record jsonb;
alter table chat_sessions add column if not exists updated_at timestamp with time zone default timezone('utc'::text, now());


-- 4. 开启所有表的公开读写权限 (仅限 Demo/单用户模式)
alter table herbs enable row level security;
alter table reports enable row level security;
alter table chat_sessions enable row level security;

create policy "Public access herbs" on herbs for all using (true) with check (true);
create policy "Public access reports" on reports for all using (true) with check (true);
create policy "Public access chats" on chat_sessions for all using (true) with check (true);`;
      navigator.clipboard.writeText(sql);
      alert("全量初始化 SQL 已复制！请前往 Supabase Dashboard -> SQL Editor 粘贴运行。\n\n重要：请检查包含了 'alter table chat_sessions add column medical_record...' 语句。");
  };
  
  const isUsingDefaultCloud = localSettings.supabaseUrl === DEFAULT_SUPABASE_URL;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div 
        className="relative bg-white w-full max-w-4xl h-[90vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-indigo-900 p-6 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center text-2xl shadow-lg">☁️</div>
             <div>
               <h2 className="text-2xl font-black text-white font-serif-sc tracking-wide">云端服务配置</h2>
               <p className="text-indigo-200 text-sm font-medium">Universal AI & Database Cloud Settings</p>
             </div>
          </div>
          <button 
             onClick={onClose}
             className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>
        
        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6">
            <button 
                onClick={() => setActiveTab('api')}
                className={`py-4 px-6 font-bold text-sm border-b-2 transition-colors ${activeTab === 'api' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
                API & 模型
            </button>
            <button 
                onClick={() => setActiveTab('cloud')}
                className={`py-4 px-6 font-bold text-sm border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'cloud' ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
                云数据库 (Supabase)
                <span className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded-full">
                    {isUsingDefaultCloud ? '内置(已连接)' : '同步'}
                </span>
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 bg-slate-50">
          
          {activeTab === 'api' && (
              <>
                {/* 1. API Credentials Section */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <span className="w-2 h-6 bg-emerald-500 rounded-full"></span> 接口连接 (API Connection)
                    </h3>
                    
                    {isVisitorMode ? (
                        <div className="p-4 bg-amber-50 text-amber-800 text-sm rounded-lg border border-amber-200 flex flex-col gap-2">
                           <div className="font-bold flex items-center gap-2">
                              <span>🔒</span> 访客模式已锁定
                           </div>
                           <p>为了保证演示环境的稳定性，访客模式强制使用内置的 SiliconFlow 接口。如需配置自定义 API Key，请切换至管理员模式。</p>
                        </div>
                    ) : (
                        <div className="p-3 bg-indigo-50 text-indigo-700 text-xs rounded-lg border border-indigo-100 mb-2">
                            <strong>配置说明：</strong> 
                            <ul className="list-disc pl-4 mt-1 space-y-1">
                                <li>管理员模式下，填写下方的 API Key 和 URL，系统将<strong>优先使用您的自定义配置</strong>。</li>
                                <li>向量化引擎（Embedding）始终使用内置服务，无需配置。</li>
                            </ul>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
                        {isVisitorMode && <div className="absolute inset-0 bg-slate-100/50 z-10 cursor-not-allowed"></div>}
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700">API Base URL (通用地址)</label>
                            <input 
                            type="text"
                            value={localSettings.apiBaseUrl}
                            onChange={e => setLocalSettings({...localSettings, apiBaseUrl: e.target.value})}
                            placeholder="例如: https://lbls888-lap.hf.space/v1"
                            className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500/50 outline-none"
                            disabled={isVisitorMode}
                            />
                            <p className="text-xs text-slate-400">支持 OpenAI 官方或任意 One-API/New-API 中转地址</p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700">API Key (密钥)</label>
                            <input 
                            type="password"
                            value={localSettings.apiKey}
                            onChange={e => setLocalSettings({...localSettings, apiKey: e.target.value})}
                            placeholder="sk-..."
                            className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500/50 outline-none"
                            disabled={isVisitorMode}
                            />
                        </div>
                    </div>
                    
                    {!isVisitorMode && (
                        <div className="flex flex-wrap gap-4 items-center">
                            <button 
                            onClick={handleTestConnection}
                            disabled={isTesting}
                            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-200 transition flex items-center gap-2 border border-slate-300"
                            >
                            {isTesting ? <span className="animate-spin">⏳</span> : '⚡'} 测试连接
                            </button>
                            
                            <button 
                            onClick={handleFetchModels}
                            disabled={isFetchingModels}
                            className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-bold hover:bg-indigo-100 transition flex items-center gap-2"
                            >
                            {isFetchingModels ? <span className="animate-spin">⏳</span> : '🔄'} 自动获取模型列表
                            </button>
                            
                            {testResult && (
                                <span className={`text-sm font-bold ${testResult.includes('失败') ? 'text-red-500' : 'text-emerald-600'}`}>
                                    {testResult}
                                </span>
                            )}
                            {fetchError && <p className="text-red-500 text-xs mt-2 font-bold">{fetchError}</p>}
                        </div>
                    )}
                </div>

                {/* 2. Model Selection (Unified) */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <span className="w-2 h-6 bg-indigo-500 rounded-full"></span> 模型配置 (Models Configuration)
                    </h3>
                    
                    {isVisitorMode ? (
                         <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                            <label className="text-sm font-bold text-slate-700 block mb-2">当前锁定模型 (Visitor Default)</label>
                            <div className="font-mono text-sm bg-white p-3 rounded-lg border border-slate-200 text-slate-600">
                                {VISITOR_DEFAULT_CHAT_MODEL}
                            </div>
                            <p className="text-xs text-slate-400 mt-2">
                                访客模式使用 SiliconFlow 提供的 DeepSeek R1 蒸馏版模型，无法更改。
                            </p>
                         </div>
                    ) : (
                        <div className="space-y-4">
                            {localSettings.availableModels.length === 0 && (
                                <div className="p-3 bg-amber-50 text-amber-700 text-sm rounded-lg border border-amber-100 mb-4">
                                    尚未获取模型列表。您可以手动输入模型 ID，或点击上方按钮自动获取。
                                </div>
                            )}
                            <div className="space-y-1">
                                <label className="text-sm font-bold text-slate-700 block">
                                    主对话模型 (Chat/Reasoning Model)
                                </label>
                                <div className="relative">
                                    {localSettings.availableModels.length > 0 ? (
                                        <select 
                                        value={localSettings.model}
                                        onChange={e => setLocalSettings({...localSettings, model: e.target.value})}
                                        className="w-full p-3 rounded-xl border border-slate-200 bg-white text-sm outline-none cursor-pointer"
                                        >
                                            {localSettings.availableModels.map(m => (
                                                <option key={m.id} value={m.id}>{m.name || m.id}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input 
                                        type="text" 
                                        value={localSettings.model}
                                        onChange={e => setLocalSettings({...localSettings, model: e.target.value})}
                                        placeholder="例如: gpt-4, claude-3-opus"
                                        className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                                        />
                                    )}
                                </div>
                                <p className="text-xs text-slate-400">用于生成深度分析报告与对话。</p>
                            </div>

                            {/* Organized Model Input */}
                            <div className="space-y-1 pt-2 border-t border-slate-100">
                                <label className="text-sm font-bold text-slate-700 block flex justify-between">
                                    <span>病历整理模型 (Organize Model)</span>
                                    <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 rounded">默认为 {DEFAULT_ORGANIZE_MODEL}</span>
                                </label>
                                <div className="relative">
                                    <input 
                                    type="text" 
                                    value={localSettings.organizeModel || DEFAULT_ORGANIZE_MODEL}
                                    onChange={e => setLocalSettings({...localSettings, organizeModel: e.target.value})}
                                    placeholder={DEFAULT_ORGANIZE_MODEL}
                                    className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-mono text-indigo-700"
                                    />
                                </div>
                                <p className="text-xs text-slate-400">专用于从对话提取结构化病历数据的轻量模型。与主力模型使用相同的 API Key。</p>
                            </div>
                        </div>
                    )}
                    
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 mt-4">
                        <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <span>⚡</span> 向量检索引擎 (Vector Engine)
                        </h4>
                        <div className="text-xs text-slate-600 space-y-1">
                            <div className="flex items-center gap-2">
                                <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold">内置</span>
                                <span>高性能嵌入模型: <span className="font-mono font-bold text-indigo-600">{DEFAULT_EMBEDDING_MODEL}</span></span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold">内置</span>
                                <span>精准重排模型: <span className="font-mono font-bold text-indigo-600">{DEFAULT_RERANK_MODEL}</span></span>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-400 pt-2 border-t border-slate-200 mt-2">
                            本系统内置 SiliconFlow 高速向量服务，无需手动配置。该服务用于病历知识库的语义检索与 RAG 增强。
                        </p>
                    </div>
                </div>

                {/* 3. Advanced Params */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm opacity-90 hover:opacity-100 transition-opacity">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-6">
                        <span className="w-2 h-6 bg-pink-500 rounded-full"></span> 高级参数 (Advanced)
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Temperature */}
                        <div>
                        <div className="flex justify-between mb-2">
                            <label className="font-bold text-slate-700 text-sm">创意度 (Temperature)</label>
                            <span className="font-mono text-indigo-600 font-bold">{localSettings.temperature}</span>
                        </div>
                        <input 
                            type="range" min="0" max="1" step="0.1"
                            value={localSettings.temperature}
                            onChange={e => setLocalSettings({...localSettings, temperature: parseFloat(e.target.value)})}
                            className="w-full accent-indigo-600"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                            医疗/严谨任务建议为 0。数值越高，回复越随机。
                        </p>
                        </div>

                        {/* Top P */}
                        <div>
                        <div className="flex justify-between mb-2">
                            <label className="font-bold text-slate-700 text-sm">核采样 (Top P)</label>
                            <span className="font-mono text-indigo-600 font-bold">{localSettings.topP ?? 0.95}</span>
                        </div>
                        <input 
                            type="range" min="0" max="1" step="0.05"
                            value={localSettings.topP ?? 0.95}
                            onChange={e => setLocalSettings({...localSettings, topP: parseFloat(e.target.value)})}
                            className="w-full accent-indigo-600"
                        />
                        </div>
                        
                        {/* Max Tokens */}
                        <div>
                        <div className="flex justify-between mb-2">
                            <label className="font-bold text-slate-700 text-sm">最大长度 (Max Tokens)</label>
                        </div>
                        <input 
                            type="number"
                            value={localSettings.maxTokens ?? 8192}
                            onChange={e => setLocalSettings({...localSettings, maxTokens: parseInt(e.target.value)})}
                            className="w-full p-2 rounded-lg border border-slate-200 bg-slate-50 text-sm"
                            placeholder="8192"
                        />
                        </div>
                    </div>
                </div>
              </>
          )}

          {activeTab === 'cloud' && (
              <div className="space-y-6">
                  {/* ... Cloud settings content remains mostly the same, maybe disable inputs if visitor but app logic handles connection ... */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <span className="w-2 h-6 bg-emerald-500 rounded-full"></span> Supabase 配置
                    </h3>
                    
                    {isUsingDefaultCloud && (
                        <div className="bg-indigo-50 text-indigo-700 text-sm p-4 rounded-xl border border-indigo-100 flex items-center gap-2">
                            <span>✅</span>
                            <strong>当前正在使用内置的公共数据库连接。您无需任何操作，即可享受云同步服务。</strong>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700">Project URL (项目地址)</label>
                            <input 
                            type="text"
                            value={localSettings.supabaseUrl || ''}
                            onChange={e => setLocalSettings({...localSettings, supabaseUrl: e.target.value})}
                            placeholder={isUsingDefaultCloud ? "(内置默认)" : "https://xyz.supabase.co"}
                            className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-emerald-500/50"
                            disabled={isVisitorMode}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700">Anon Public Key (公开密钥)</label>
                            <input 
                            type="password"
                            value={localSettings.supabaseKey || ''}
                            onChange={e => setLocalSettings({...localSettings, supabaseKey: e.target.value})}
                            placeholder={isUsingDefaultCloud ? "(内置默认)" : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
                            className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-emerald-500/50"
                            disabled={isVisitorMode}
                            />
                            <p className="text-xs text-slate-400">请使用 `anon` (public) key，不要使用 `service_role` key。</p>
                        </div>
                    </div>
                  </div>
                  {/* ... SQL Guide part ... */}
              </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-white p-6 border-t border-slate-100 flex justify-between gap-4 shrink-0">
           <button 
             onClick={handleReset}
             className="px-4 py-3 rounded-xl font-bold text-xs text-slate-400 hover:text-red-500 transition"
           >
             重置参数
           </button>
           <div className="flex gap-4">
               <button 
                 onClick={onClose}
                 className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition"
               >
                 取消
               </button>
               <button 
                 onClick={handleSave}
                 className="px-8 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-200 hover:shadow-2xl hover:-translate-y-1 transition-all"
               >
                 保存并应用
               </button>
           </div>
        </div>
      </div>
    </div>
  );
};