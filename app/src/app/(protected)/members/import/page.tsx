import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/session';
import { IssuedPassword } from '@/components/issued-password';

export const metadata = { title: 'Roster import · Our Family Home' };

interface IssuedLogin {
  full_name: string;
  password: string | null;
}

function parseLogins(raw: string | undefined): IssuedLogin[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((row) => {
      if (!row || typeof row !== 'object') return [];
      const name = 'full_name' in row && typeof row.full_name === 'string' ? row.full_name : '';
      const password = 'password' in row && typeof row.password === 'string' ? row.password : null;
      if (!name) return [];
      return [{ full_name: name, password }];
    });
  } catch {
    return [];
  }
}

export default async function RosterImportResultPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; skipped?: string; errors?: string; logins?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.role !== 'admin') {
    redirect('/members?error=' + encodeURIComponent('Only an admin can import members.'));
  }
  const sp = await searchParams;
  const created = sp.created;
  const logins = parseLogins(sp.logins);
  const withPassword = logins.flatMap((login) =>
    login.password ? [{ full_name: login.full_name, password: login.password }] : [],
  );
  const needsPassword = logins.filter((login) => !login.password);

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-4">
      <h1 className="text-xl font-bold">Roster import</h1>

      {created == null ? (
        <p className="text-sm text-stone-600">
          After an import, the standard passwords for new logins are listed here so you can pass them on.
          The standard password is the first letter of the name, @, and the day and month of the birthday
          (Akitoli, 31 July → A@3107). Do not forward this page — it shows passwords.
        </p>
      ) : (
        <p className="text-sm text-stone-600">
          Created {created}
          {sp.skipped && sp.skipped !== '0' ? `, skipped ${sp.skipped} already in the directory` : ''}.
          Copy the passwords below before you leave. Do not forward this page.
        </p>
      )}

      {sp.errors ? (
        <p role="alert" className="rounded-xl bg-amber-50 ring-1 ring-amber-200 p-3 text-sm text-amber-950">
          {sp.errors}
        </p>
      ) : null}

      {withPassword.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Standard passwords</h2>
          {withPassword.map((login) => (
            <IssuedPassword
              key={login.full_name}
              compact
              password={login.password}
              title={`${login.full_name}`}
            />
          ))}
        </div>
      ) : null}

      {needsPassword.length > 0 ? (
        <div className="rounded-xl bg-white ring-1 ring-stone-200 p-3 text-sm text-stone-700 space-y-1">
          <h2 className="font-semibold">No birthday — password not shown</h2>
          <p>
            These logins were created with a random password because the sheet had no day and month.
            Open each person and type a password under Reset password.
          </p>
          <ul className="list-disc pl-5">
            {needsPassword.map((login) => (
              <li key={login.full_name}>{login.full_name}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Link href="/members" className="inline-block text-sm font-medium text-teal-700 underline">
        Back to members
      </Link>
    </div>
  );
}
