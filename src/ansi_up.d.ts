declare module "ansi_up" {
  export class AnsiUp {
    /** Use CSS classes instead of inline styles (default: false) */
    use_classes: boolean;
    /** Escape HTML in the input (default: true) */
    escape_html: boolean;
    /** Convert ANSI text to HTML with color spans */
    ansi_to_html(txt: string): string;
    /** Strip ANSI codes and return plain text */
    ansi_to_text(txt: string): string;
  }
}
