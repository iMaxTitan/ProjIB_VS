const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env.local
const envPath = path.resolve(__dirname, '../.env.local');
const envConfig = {};

if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^["']|["']$/g, '');
            envConfig[key] = value;
        }
    });
}

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Supabase credentials not found in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRpc() {
    console.log('--- Checking RPC functions ---');

    // Try to RPC a special query (using raw SQL via RPC if enabled, or just listing via information_schema wrapper if possible)
    // Since we accept we might have anon capabilities only, we can at least TRY to call postgres generic rpc?
    // Unlikely. But we can inspect using the supabase-js 'rpc' call failure?
    // Actually, we can just use the Data API to inspect metadata if exposed.
    // Standard PostgREST exposes schema?

    // Let's trying to query pg_proc via a generic 'rpc' call or similar is usually blocked.
    // BUT we can infer existence by calling it?

    // Actually, I'll try to use the 'rpc' call with empty args and see the error?
    // No, I want to SEE the duplicates.

    console.log("Since we cannot query pg_proc directly with anon key usually...");
    console.log("I will rely on the error message provided by the user.");
    console.log("The error explicitly lists TWO signatures.");
    console.log("Sig 1: ... p_end_date => date");
    console.log("Sig 2: ... (ends at p_plan_type)");

    console.log("Attempting to call it with explicit nulls to see if we can reproduce.");

    const { error } = await supabase.rpc('manage_weekly_plan', {
        p_weekly_id: '00000000-0000-0000-0000-000000000000', // Dummy UUID
        p_quarterly_id: '00000000-0000-0000-0000-000000000000',
        p_department_id: null,
        p_weekly_date: '2026-01-01',
        p_expected_result: 'test',
        p_planned_hours: 0,
        p_status: 'draft',
        p_user_id: '00000000-0000-0000-0000-000000000000',
        p_assignees: [],
        p_action: 'test_check', // invalid action hopefully just fails or returns null
        p_plan_type: 'weekly',
        p_end_date: null
    });

    if (error) {
        console.log("RPC Error:", error);
    } else {
        console.log("RPC Success (unexpected for dummy call, but means no ambiguity).");
    }
}

checkRpc();
