// ... (Imports and client setup remain same)
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AISettings, BenCaoHerb, CloudReport, CloudChatSession } from '../types';

let supabase: SupabaseClient | null = null;
let currentSettings: { url: string; key: string } | null = null;

// Helper to gracefully handle network errors
const handleNetworkError = (context: string, e: any) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Load failed") || msg.includes("TypeError")) {
        console.warn(`[Supabase] ${context}: Network request failed (Offline or Blocked).`);
    } else {
        console.error(`[Supabase] ${context} unexpected error:`, e);
    }
};

// Initialize or get existing client
export const getSupabaseClient = (settings: AISettings): SupabaseClient | null => {
  if (!settings.supabaseUrl || !settings.supabaseKey) return null;

  // Re-initialize if settings changed
  if (
    !supabase ||
    currentSettings?.url !== settings.supabaseUrl ||
    currentSettings?.key !== settings.supabaseKey
  ) {
    try {
      supabase = createClient(settings.supabaseUrl, settings.supabaseKey);
      currentSettings = { url: settings.supabaseUrl, key: settings.supabaseKey };
    } catch (e) {
      console.error("Failed to initialize Supabase client:", e);
      return null;
    }
  }
  return supabase;
};

// ... (Herb functions remain same)
export const fetchCloudHerbs = async (settings: AISettings): Promise<BenCaoHerb[]> => {
  const client = getSupabaseClient(settings);
  if (!client) return [];

  try {
    const { data, error } = await client
      .from('herbs')
      .select('*');

    if (error) {
      if (error.code === '42P01' || error.message.includes('Could not find the table')) { 
          console.warn("[Supabase] Table 'herbs' does not exist.");
          return []; 
      } 
      
      if (error.message.includes('Failed to fetch')) {
          console.warn("[Supabase] fetchCloudHerbs: Network request failed.");
          return [];
      }

      console.error("Error fetching herbs from Supabase:", error.message);
      return [];
    }

    if (!data) return [];

    return data.map((row: any) => ({
      id: row.id || `cloud-${row.name}`,
      name: row.name,
      nature: row.nature,
      flavors: Array.isArray(row.flavors) ? row.flavors : JSON.parse(row.flavors || '[]'),
      meridians: Array.isArray(row.meridians) ? row.meridians : JSON.parse(row.meridians || '[]'),
      efficacy: row.efficacy,
      usage: row.usage,
      category: row.category,
      processing: row.processing,
      isRaw: false,
      source: 'cloud'
    }));
  } catch (e) {
    handleNetworkError("fetchCloudHerbs", e);
    return [];
  }
};

export const insertCloudHerb = async (herb: BenCaoHerb, settings: AISettings): Promise<boolean> => {
  const client = getSupabaseClient(settings);
  if (!client) return false;

  try {
    const payload = {
        name: herb.name,
        nature: herb.nature,
        flavors: Array.isArray(herb.flavors) ? herb.flavors : [],
        meridians: Array.isArray(herb.meridians) ? herb.meridians : [],
        efficacy: herb.efficacy,
        usage: herb.usage,
        category: herb.category,
        processing: herb.processing
    };

    const { error } = await client
      .from('herbs')
      .upsert(payload, { onConflict: 'name' });

    if (error) {
      if (error.message.includes('Failed to fetch')) {
         console.warn("[Supabase] insertCloudHerb: Network request failed.");
         return false;
      }
      console.error("Error inserting herb to Supabase:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    handleNetworkError("insertCloudHerb", e);
    return false;
  }
};

export const updateCloudHerb = async (id: string, herb: BenCaoHerb, settings: AISettings): Promise<boolean> => {
  const client = getSupabaseClient(settings);
  if (!client) return false;

  try {
    const payload = {
        name: herb.name,
        nature: herb.nature,
        flavors: herb.flavors,
        meridians: herb.meridians,
        efficacy: herb.efficacy,
        usage: herb.usage,
        category: herb.category,
        processing: herb.processing
    };

    const { error, count } = await client
      .from('herbs')
      .update(payload)
      .eq('name', herb.name);

    if (error) {
      if (error.message.includes('Failed to fetch')) {
         console.warn("[Supabase] updateCloudHerb: Network request failed.");
         return false;
      }
      console.error("Error updating herb in Supabase:", error.message);
      return false;
    }
    if (count === 0) {
        // Fallback update by ID
        const { error: idError } = await client.from('herbs').update(payload).eq('id', id);
        if (idError) return false;
    }
    return true;
  } catch (e) {
    handleNetworkError("updateCloudHerb", e);
    return false;
  }
};

export const bulkUpsertHerbs = async (herbs: BenCaoHerb[], settings: AISettings): Promise<{ success: number, failed: number, error?: string }> => {
    const client = getSupabaseClient(settings);
    if (!client) return { success: 0, failed: herbs.length };

    let successCount = 0;
    let failedCount = 0;
    let errorMessage: string | undefined = undefined;

    const payload = herbs.map(herb => ({
        name: herb.name,
        nature: herb.nature,
        flavors: herb.flavors, 
        meridians: herb.meridians,
        efficacy: herb.efficacy,
        usage: herb.usage,
        category: herb.category,
        processing: herb.processing
    }));

    try {
        const BATCH_SIZE = 100;
        for (let i = 0; i < payload.length; i += BATCH_SIZE) {
            const batch = payload.slice(i, i + BATCH_SIZE);
            const { error } = await client
                .from('herbs')
                .upsert(batch, { onConflict: 'name' });

            if (error) {
                console.error(`Batch upsert error:`, error);
                if (error.code === 'PGRST205' || error.message.includes('Could not find the table')) {
                    errorMessage = "Could not find the table 'public.herbs'.";
                }
                failedCount += batch.length;
                if(errorMessage) break; 
            } else {
                successCount += batch.length;
            }
        }
    } catch (e: any) {
        handleNetworkError("bulkUpsertHerbs", e);
        errorMessage = e.message;
        failedCount = herbs.length - successCount;
    }
    
    if (errorMessage) {
      failedCount = herbs.length;
      successCount = 0;
    }
    return { success: successCount, failed: failedCount, error: errorMessage };
};


// ==========================================
// AI Reports
// ==========================================

export const fetchCloudReports = async (settings: AISettings): Promise<CloudReport[]> => {
    const client = getSupabaseClient(settings);
    if (!client) return [];
  
    try {
      const { data, error } = await client
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50); // Limit to recent 50
  
      if (error) {
        if (!error.message.includes('Could not find the table')) {
             if (error.message.includes('Failed to fetch')) {
                 console.warn("[Supabase] fetchCloudReports: Network request failed.");
                 return [];
             }
             console.error("Error fetching reports:", error.message);
        }
        return [];
      }
      return data as CloudReport[];
    } catch (e) {
      handleNetworkError("fetchCloudReports", e);
      return [];
    }
};

export const saveCloudReport = async (report: Omit<CloudReport, 'id' | 'created_at'>, settings: AISettings): Promise<boolean> => {
    const client = getSupabaseClient(settings);
    if (!client) return false;

    try {
        const { error } = await client
            .from('reports')
            .insert(report);

        if (error) {
            if (error.message.includes('Failed to fetch')) {
                 console.warn("[Supabase] saveCloudReport: Network request failed.");
                 return false;
            }
            console.error("Error saving report:", error.message);
            return false;
        }
        return true;
    } catch (e) {
        handleNetworkError("saveCloudReport", e);
        return false;
    }
};

export const deleteCloudReport = async (id: string, settings: AISettings): Promise<boolean> => {
    const client = getSupabaseClient(settings);
    if (!client) return false;
    
    try {
        const { error } = await client.from('reports').delete().eq('id', id);
        return !error;
    } catch(e) {
        handleNetworkError("deleteCloudReport", e);
        return false;
    }
};


// ==========================================
// Chat Sessions
// ==========================================

export const fetchCloudChatSessions = async (settings: AISettings): Promise<CloudChatSession[]> => {
    const client = getSupabaseClient(settings);
    if (!client) return [];
  
    try {
      const { data, error } = await client
        .from('chat_sessions')
        .select('*')
        .order('created_at', { ascending: false });
  
      if (error) {
        if (!error.message.includes('Could not find the table')) {
            if (error.message.includes('Failed to fetch')) {
                 console.warn("[Supabase] fetchCloudChatSessions: Network request failed.");
                 return [];
            }
            console.error("Error fetching chats:", error.message);
        }
        return [];
      }
      return data as CloudChatSession[];
    } catch (e) {
      handleNetworkError("fetchCloudChatSessions", e);
      return [];
    }
};

export const saveCloudChatSession = async (session: CloudChatSession, settings: AISettings): Promise<boolean> => {
    const client = getSupabaseClient(settings);
    if (!client) return false;

    try {
        const payload = {
            id: session.id,
            title: session.title,
            messages: session.messages,
            meta_info: session.meta_info || null, // Ensure explicit null if undefined
            medical_record: session.medical_record || null,
            created_at: session.created_at,
            updated_at: new Date().toISOString()
        };

        const { error } = await client
            .from('chat_sessions')
            .upsert(payload);

        if (error) {
            if (error.message.includes('Failed to fetch')) {
                 console.warn("[Supabase] saveCloudChatSession: Network request failed.");
                 return false;
            }
            
            // CRITICAL FIX: Detect specific schema error and throw precise error code for UI handling
            const msg = error.message;
            if (
                msg.includes('medical_record') || 
                msg.includes('updated_at') || 
                msg.includes('Could not find the') || 
                error.code === '42703'
            ) {
                console.error("CRITICAL SCHEMA ERROR: Columns missing in chat_sessions.");
                throw new Error("SCHEMA_ERROR: Database columns missing (medical_record or updated_at)");
            }
            
            console.error("Error saving chat session:", error.message);
            throw new Error(error.message); 
        }
        return true;
    } catch (e: any) {
        handleNetworkError("saveCloudChatSession", e);
        // Rethrow if it's our custom schema error
        if (String(e).includes("SCHEMA_ERROR")) throw e;
        
        if (!String(e).includes("Failed to fetch")) throw e;
        return false;
    }
};

export const deleteCloudChatSession = async (id: string, settings: AISettings): Promise<boolean> => {
    const client = getSupabaseClient(settings);
    if (!client) return false;
    
    try {
        const { error } = await client.from('chat_sessions').delete().eq('id', id);
        if (error) throw error;
        return true;
    } catch(e) {
        handleNetworkError("deleteCloudChatSession", e);
        return false;
    }
};