/** Pesan error kecil di bawah sebuah field form. */
export function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-bata-700 mt-1">{msg}</p>;
}
