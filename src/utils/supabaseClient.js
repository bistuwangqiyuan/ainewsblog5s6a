/**
 * 创建并导出单例 Supabase 客户端
 * @returns {import('https://esm.sh/@supabase/supabase-js@2').SupabaseClient} 客户端实例
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(url, anon);
