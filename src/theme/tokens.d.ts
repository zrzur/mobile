type ColorValue = string | Record<string, string>;
export declare const colors: Record<string, ColorValue> & {
  action: { DEFAULT: string; hover: string; pressed: string; text: string; tint: string };
  error: { DEFAULT: string; fill: string; hover: string; tint: string };
  [key: string]: ColorValue;
};
export declare const fontSize: Record<
  "display" | "title" | "heading" | "subheading" | "body" | "small" | "tiny",
  [number, number]
>;
export declare const radius: { sm: number; md: number; lg: number };
export declare function space(n: number): number;
