/** @jsxImportSource preact */
export function HomeIcon(props: { class?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      class={props.class}
      aria-hidden="true"
    >
      <path d="M10.5 3.75a2.25 2.25 0 0 1 3 0l7.5 6.75a.75.75 0 0 1-.5 1.313H19.5v6a2.25 2.25 0 0 1-2.25 2.25h-3.75a.75.75 0 0 1-.75-.75v-3.75a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0-.75.75v3.75a.75.75 0 0 1-.75.75H6.75A2.25 2.25 0 0 1 4.5 17.813v-6H3a.75.75 0 0 1-.5-1.313l7.5-6.75Z" />
    </svg>
  );
}

export function ShoppingBagIcon(props: { class?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      class={props.class}
      aria-hidden="true"
    >
      <path
        fill-rule="evenodd"
        d="M6 2.25A.75.75 0 0 1 6.75 1.5h10.5A.75.75 0 0 1 18 2.25V4.5h1.875A2.625 2.625 0 0 1 22.5 7.125v12.75A2.625 2.625 0 0 1 19.875 22.5H4.125A2.625 2.625 0 0 1 1.5 19.875V7.125A2.625 2.625 0 0 1 4.125 4.5H6V2.25Zm1.5 2.25h9V3h-9v1.5ZM7.5 9a.75.75 0 0 0-1.5 0v1.5a6 6 0 1 0 12 0V9a.75.75 0 0 0-1.5 0v1.5a4.5 4.5 0 0 1-9 0V9Z"
        clip-rule="evenodd"
      />
    </svg>
  );
}

export function ShoppingCartIcon(props: { class?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      class={props.class}
      aria-hidden="true"
    >
      <path d="M2.25 2.25a.75.75 0 0 0 0 1.5h1.386c.17 0 .319.114.36.278l1.63 6.517a4.5 4.5 0 0 0 4.366 3.405h5.443a4.5 4.5 0 0 0 4.366-3.405l1.13-4.52a.75.75 0 0 0-.728-.93H6.77l-.196-.784A1.875 1.875 0 0 0 4.636 2.25H2.25Z" />
      <path d="M8.25 20.25a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm10.5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
    </svg>
  );
}

export function TagIcon(props: { class?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      class={props.class}
      aria-hidden="true"
    >
      <path
        fill-rule="evenodd"
        d="M5.25 3A2.25 2.25 0 0 0 3 5.25v3.445c0 .597.237 1.17.659 1.592l8.304 8.304a2.25 2.25 0 0 0 3.182 0l3.446-3.446a2.25 2.25 0 0 0 0-3.182L10.287 3.66A2.25 2.25 0 0 0 8.695 3H5.25Zm1.5 3.75a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"
        clip-rule="evenodd"
      />
    </svg>
  );
}
