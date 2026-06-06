/** @jsxImportSource preact */

interface EmptyStateProps {
  message: string;
  href: string;
  linkText: string;
}

export function EmptyState({ message, href, linkText }: EmptyStateProps) {
  return (
    <div class="rounded-2xl bg-white p-10 text-center shadow-md">
      <p class="text-lg text-gray-600">{message}</p>
      <a
        href={href}
        class="mt-4 inline-block rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
      >
        {linkText}
      </a>
    </div>
  );
}
