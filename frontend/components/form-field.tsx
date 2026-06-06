/** @jsxImportSource preact */

interface FormFieldProps {
  label: string;
  name: string;
  type?: string;
  value?: string;
  error?: string;
  colSpan?: boolean;
  required?: boolean;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
}

export function FormField({
  label,
  name,
  type = "text",
  value,
  error,
  colSpan,
  required,
  placeholder,
  multiline,
  rows = 4,
}: FormFieldProps) {
  const inputClass =
    "w-full rounded-lg border border-gray-300 px-4 py-3 outline-none transition focus:border-blue-500";

  return (
    <label class={colSpan ? "block md:col-span-2" : "block"}>
      <span class="mb-2 block text-sm font-medium text-gray-700">{label}</span>
      {multiline
        ? (
          <textarea
            name={name}
            rows={rows}
            placeholder={placeholder}
            class={inputClass}
            required={required}
          >
            {value}
          </textarea>
        )
        : (
          <input
            type={type}
            name={name}
            value={value}
            placeholder={placeholder}
            class={inputClass}
            required={required}
          />
        )}
      {error && <span class="mt-2 block text-sm text-red-600">{error}</span>}
    </label>
  );
}
