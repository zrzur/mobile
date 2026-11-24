import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { type StyleProp, Text, type TextStyle, View, type ViewStyle } from "react-native";

import { type Weight, fontFamily } from "@/theme/fonts";

import { autoDirStyle, directionRuns, isolateWithin, paragraphDirStyle, paragraphSideStyle, plainText } from "./bidi";
import { useFontScaleCap } from "./fontScale";

type ATextProps = {
  size: number;
  line: number;
  weight?: Weight;
  color: string;
  style?: StyleProp<TextStyle>;
  autoDir?: boolean | string;
  autoAlign?: boolean;
  children: ReactNode;
} & Omit<React.ComponentProps<typeof Text>, "style">;

/**
 * Text in the web's sizes; Arabic gets 2 px more line height. Inside a
 * <ChromeScale> (headers, tab bar, badges, chips) the system font size stops
 * at the chrome cap unless `maxFontSizeMultiplier` is given.
 *
 * `autoDir`: text people wrote (names, titles) takes its own direction from
 * its first strong letter, like the web's dir="auto", and stays at the start
 * of the layout; `true` reads it from string children. A string gives the
 * part people wrote: when the children are an interface sentence around it
 * ("Invite friends to {name}"), that part is isolated (FSI … PDI) and the
 * sentence keeps the direction of the interface words, so a name never turns
 * the sentence around.
 *
 * `autoAlign`: a paragraph people wrote also sits on its own side (Arabic on
 * the right in the English app), like a block with dir="auto" (owner,
 * 2026-11-23). It is on by default for `autoDir` text that may wrap (no
 * `numberOfLines={1}`); a one-line name or preview keeps the row's start.
 * For text with line breaks use <ParagraphText>, which gives each line its
 * own direction.
 */
export function AText({ size, line, weight = "regular", color, style, autoDir, autoAlign, children, ...rest }: ATextProps) {
  const { i18n } = useLingui();
  const cap = useFontScaleCap();
  const part = typeof autoDir === "string" ? autoDir : undefined;
  // an interface sentence around a name: isolate the name inside it
  const content = part && typeof children === "string" ? isolateWithin(children, part) : children;
  const shown = typeof content === "string" ? content : plainText(content);
  // the direction comes from what is shown (an isolated name is skipped); elements fall back to the given part
  const dirText = shown || part;
  // text that may wrap is a paragraph: it also sits on its own side; a one-line name keeps the row's start
  const align = autoAlign ?? (!!autoDir && rest.numberOfLines !== 1);
  const own = align ? paragraphDirStyle(dirText) : autoDir ? autoDirStyle(dirText) : null;
  return (
    <Text
      maxFontSizeMultiplier={cap}
      {...rest}
      style={[
        {
          fontFamily: fontFamily(i18n.locale, weight),
          fontSize: size,
          lineHeight: line + (i18n.locale === "ar" ? 2 : 0),
          color,
          textAlign: "auto",
          writingDirection: i18n.locale === "ar" ? "rtl" : "ltr",
        },
        own,
        style,
      ]}
    >
      {content}
    </Text>
  );
}

/**
 * Plain text people wrote, over several lines (a description, a bio, a note):
 * each line is a bidi paragraph of its own and reads and aligns in its own
 * direction (Unicode rule P1; the web's dir="auto" blocks). Lines in one
 * direction stay in one Text, so line spacing is the same as one Text.
 */
export function ParagraphText({
  children,
  containerStyle,
  testID,
  ...props
}: Omit<ATextProps, "children" | "autoDir" | "autoAlign"> & { children: string; containerStyle?: StyleProp<ViewStyle> }) {
  const lines = children.split("\n");
  const runs = directionRuns(lines);
  if (runs.length <= 1) {
    return (
      <View style={containerStyle} testID={testID}>
        <AText {...props} autoAlign>
          {children}
        </AText>
      </View>
    );
  }
  return (
    <View style={containerStyle} testID={testID}>
      {runs.map((run) => {
        const text = lines.slice(run.from, run.to).join("\n");
        return (
          <AText key={run.from} {...props} style={[props.style, paragraphSideStyle(run.dir)]}>
            {text}
          </AText>
        );
      })}
    </View>
  );
}
