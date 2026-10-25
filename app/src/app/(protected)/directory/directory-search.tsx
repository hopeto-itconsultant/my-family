'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function DirectorySearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  useEffect(() => {
    const t = setTimeout(() => {
      router.replace(value.trim() ? `/directory?q=${encodeURIComponent(value.trim())}` : '/directory');
    }, 300);
    return () => clearTimeout(t);
  }, [value, router]);

  return (
    <input
      type="search"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="Search name or branch…"
      className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-teal-500"
    />
  );
}
