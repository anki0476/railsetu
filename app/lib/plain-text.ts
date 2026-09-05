const UNSAFE_CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const HTML_DELIMITERS = /[<>]/g;

/** Keeps user-controlled content as plain text before it reaches storage, APIs, or UI state. */
export function plainText(value: unknown, maximum = 800) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(UNSAFE_CONTROL_CHARACTERS, '')
    .replace(HTML_DELIMITERS, '')
    .slice(0, maximum);
}
