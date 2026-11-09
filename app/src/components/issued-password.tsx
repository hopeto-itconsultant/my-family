'use client';

/** Shows a password an admin just set, so they can copy it and pass it on. */
export function IssuedPassword({
  password,
  title,
  compact = false,
}: {
  password: string;
  title: string;
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      className="rounded-xl bg-emerald-50 ring-1 ring-emerald-200 p-3 text-sm text-emerald-950 space-y-2"
    >
      <p>{title}</p>
      <input
        readOnly
        value={password}
        aria-label="Temporary password"
        spellCheck={false}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 font-mono text-base text-stone-900"
      />
      {!compact ? (
        <p className="text-xs text-emerald-800">
          Copy this before you leave the page, and share it with them. They sign in with their mobile number.
        </p>
      ) : null}
    </div>
  );
}
