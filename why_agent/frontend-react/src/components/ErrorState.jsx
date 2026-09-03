// Shared failure UI for the six pages that fetch their own data — without this,
// a network failure looks identical to "still loading" forever (the state stays
// null and the page just shows "Loading…" indefinitely), which is a real
// credibility gap for anything meant to look like production software.
export default function ErrorState({ message = "Couldn't load this page.", onRetry }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm p-lg flex flex-col items-center text-center gap-sm max-w-md mx-auto my-xl">
      <span className="material-symbols-outlined text-error text-[28px]" aria-hidden="true">
        error
      </span>
      <p className="font-body-md text-body-md text-on-surface">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-xs bg-surface-container border border-outline-variant hover:bg-surface-container-high transition-colors text-on-surface font-label-md text-label-md px-4 py-2 rounded-lg flex items-center gap-xs"
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            refresh
          </span>
          Retry
        </button>
      )}
    </div>
  );
}
