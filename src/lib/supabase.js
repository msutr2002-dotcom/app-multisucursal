import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qgsiysbslwurjyjocfii.supabase.co'
const supabaseAnonKey = 'sb_publishable_UzTuJoa-XqBWNg_mYztY4g_sACMQlCY'
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
