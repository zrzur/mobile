import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { AText, Icon } from "@/ui/kit";

import { type MenuOption, SelectSheet } from "./SelectSheet";

/** A field's title and its small helper line (form layout shared by the command and the bot's forms) */
export function FieldLabel({ label, description, optional }: { label: string; description?: string; optional?: boolean }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <AText size={13} line={20} weight="semibold" color={palette.fg2}>
        {label}
        {optional ? (
          <AText size={13} line={20} color={palette.muted}>
            {` · ${t`optional`}`}
          </AText>
        ) : null}
      </AText>
      {description ? (
        <AText autoDir size={12} line={16} color={palette.muted}>
          {description}
        </AText>
      ) : null}
    </View>
  );
}

/** A field that opens a list in a sheet (people, roles, channels, a bot's options) */
export function PickField({
  label,
  options,
  values,
  min = 1,
  max = 1,
  placeholder,
  onChange,
  testID,
  invalid,
}: {
  label: string;
  options: MenuOption[];
  values: string[];
  min?: number;
  max?: number;
  placeholder?: string;
  onChange: (values: string[]) => void;
  testID?: string;
  invalid?: boolean;
}) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  const shown = options.filter((o) => values.includes(o.value)).map((o) => o.label);
  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: shown.join(", ") }}
        onPress={() => setOpen(true)}
        style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: invalid ? palette.danger : palette.fieldBorder, backgroundColor: palette.field, flexDirection: "row", alignItems: "center", gap: 8 }}
      >
        <AText autoDir size={15} line={20} color={shown.length ? palette.fg : palette.muted} numberOfLines={1} style={{ flex: 1 }}>
          {shown.length ? shown.join(", ") : (placeholder ?? t`Make a selection`)}
        </AText>
        <Icon name="caret-down" size={16} color={palette.iconMuted} />
      </Pressable>
      <SelectSheet
        visible={open}
        title={label}
        options={options}
        selected={values}
        min={min}
        max={max}
        inForm
        onClose={() => setOpen(false)}
        onSubmit={(next) => {
          setOpen(false);
          onChange(next);
        }}
      />
    </>
  );
}
