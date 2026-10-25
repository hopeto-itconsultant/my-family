export default function SetupPage() {
  return (
    <main className="min-h-dvh bg-stone-50 px-5 py-8">
      <div className="max-w-md mx-auto space-y-4">
        <h1 className="text-xl font-bold">Our Family Home — setup</h1>
        <ol className="list-decimal pl-5 space-y-2 text-sm text-stone-700">
          <li>Create a Supabase project (free tier is fine for ≤150 users).</li>
          <li>Run <code className="bg-stone-200 px-1 rounded">supabase/migrations/0001_init.sql</code> in the SQL editor (or <code>supabase db push</code>).</li>
          <li>In <code>app/.env.local</code> set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>. Never put the service-role key in any <code>NEXT_PUBLIC_*</code> variable.</li>
          <li>Disable public sign-ups in Supabase Auth; invite relatives by email.</li>
          <li>The first person to sign up becomes Admin automatically (DB trigger). That person assigns branches & roles from the admin tools in a later phase.</li>
          <li><code>npm run dev</code> → sign in at <code>/login</code>.</li>
        </ol>
        <a href="/login" className="inline-block rounded-xl bg-teal-700 text-white font-semibold px-5 py-3">Go to sign in</a>
      </div>
    </main>
  );
}
