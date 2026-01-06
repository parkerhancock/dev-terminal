declare module "ansi-to-svg" {
  interface AnsiToSvgOptions {
    /** Font family (default: "SauceCodePro Nerd Font, Source Code Pro, Courier") */
    fontFamily?: string;
    /** Font size in pixels (default: 14) */
    fontSize?: number;
    /** Line height (default: 18) */
    lineHeight?: number;
    /** Padding top in pixels */
    paddingTop?: number;
    /** Padding left in pixels */
    paddingLeft?: number;
    /** Padding right in pixels */
    paddingRight?: number;
    /** Padding bottom in pixels */
    paddingBottom?: number;
    /** Background color (default: transparent) */
    backgroundColor?: string;
    /** Default foreground color */
    color?: string;
  }

  function ansiToSvg(input: string, options?: AnsiToSvgOptions): string;

  export default ansiToSvg;
}
