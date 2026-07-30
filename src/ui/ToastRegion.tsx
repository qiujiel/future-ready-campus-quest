export function ToastRegion({ message }: { message?: string }) {
  return (
    <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
