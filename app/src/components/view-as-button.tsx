import { beginViewAs } from '@/app/actions/view-as';
import { VIEW_AS_NO_LOGIN } from '@/lib/view-as-policy';

/**
 * Starts a preview. Directory-only members (no auth user) stay disabled:
 * there is no sign-in whose row visibility we can show.
 */
export function ViewAsButton({
  memberId,
  hasLogin,
  back,
}: {
  memberId: string;
  hasLogin: boolean | null;
  back: string;
}) {
  if (hasLogin === false) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <button
          type="button"
          disabled
          title={VIEW_AS_NO_LOGIN}
          aria-label={VIEW_AS_NO_LOGIN}
          className="min-h-11 cursor-not-allowed rounded-full bg-stone-100 px-3 text-sm font-semibold text-stone-400"
        >
          View as
        </button>
        <span className="max-w-[9.5rem] text-right text-[11px] leading-tight text-stone-400">
          No login yet
        </span>
      </div>
    );
  }
  return (
    <form action={beginViewAs}>
      <input type="hidden" name="member_id" value={memberId} />
      <input type="hidden" name="back" value={back} />
      <button
        type="submit"
        className="min-h-11 rounded-full bg-amber-100 px-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-300 active:bg-amber-200"
      >
        View as
      </button>
    </form>
  );
}
