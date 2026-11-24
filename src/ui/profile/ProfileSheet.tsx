import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useCallback, useState, useSyncExternalStore } from "react";
import { Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { GestureRoot } from "@/ui/kit/GestureRoot";
import { KeyboardSafeScreen } from "@/ui/kit/keyboard";
import { useWide } from "@/ui/app/useWide";
import { ServerIdentitySheet } from "@/ui/settings/user/profile-identity";

import { useTargetMember, useTargetUser } from "./data";
import type { ReportStep } from "./logic";
import { ProfileView } from "./ProfileView";
import { ReportFlow, type ReportSpec } from "./ReportFlow";
import { type ProfileTarget, closeProfile, leaveLayer, profileStore } from "./store";
import { ModerationPanel, RolesPanel, UserMenu } from "./UserMenu";

export { closeProfile, openLayer, openProfile, openUserMenu, useOpenProfile } from "./store";
export { ReportFlow, ReportSheet, type ReportSpec } from "./ReportFlow";


/** Open the member list of a server (web member sidebar, a page on a phone) */
export function openMemberList(serverId: string, channelId?: string) {
  router.push({ pathname: "/members/[serverId]", params: channelId ? { serverId, channel: channelId } : { serverId } });
}

/** The open profile target, live */
export function useProfileTarget(): ProfileTarget | null {
  return useSyncExternalStore(profileStore.subscribe, profileStore.get, profileStore.get);
}

/** The steps and menu, drawn inside the sheet's padded body */
function Layer({ target, onReportStep }: { target: ProfileTarget; onReportStep: (step: ReportStep) => void }) {
  const { t } = useLingui();
  const user = useTargetUser(target.userId);
  const member = useTargetMember(target.serverId, target.userId);
  const facts = useFields(user, (u) => ({ bot: !!u.bot, name: u.displayName, avatar: u.animatedAvatarURL, effect: u.style?.effect }));
  if (!user || !facts) return null;
  switch (target.layer) {
    case "menu":
      return <UserMenu user={user} member={member} serverId={target.serverId} fromProfile={target.back === "profile"} />;
    case "roles":
      return member ? <RolesPanel member={member} /> : null;
    case "timeout":
    case "untimeout":
    case "kick":
    case "ban":
    case "banUser":
      return <ModerationPanel kind={target.layer} user={user} member={member} serverId={target.serverId} />;
    case "report":
    case "reportEffect": {
      const spec: ReportSpec =
        target.layer === "report"
          ? { kind: facts.bot ? "Bot" : "User", id: user.id, label: facts.name, image: facts.avatar }
          : { kind: "CommunityItem", id: facts.effect?.slice(2) ?? "", label: t`Community effect`, effect: true };
      return <ReportFlow spec={spec} onClose={leaveLayer} onStepChange={onReportStep} />;
    }
    default:
      return null;
  }
}

/**
 * The profile sheet and everything it opens, one modal at a time. Render
 * once, inside the signed-in layout. On a phone the profile is a tall
 * sheet edge to edge (web: the full profile on every tap of a name); on a
 * tablet it keeps the dialog's 460 px.
 */
export function ProfileSheetHost() {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const wide = useWide();
  const target = useProfileTarget();
  const [reportStep, setReportStep] = useState<ReportStep>("reason");
  // iOS cannot present a sheet while this one is still leaving
  const [gone, setGone] = useState<string | null>(null);
  const identityServer = useSolid(useCallback(() => (target?.layer === "identity" && target.serverId ? client.servers.get(target.serverId) : undefined), [client, target]));

  const layer = target?.layer;
  const identity = layer === "identity";
  const visible = !!target && !identity;
  const persistent = (layer === "report" || layer === "reportEffect") && reportStep !== "reason" && reportStep !== "done";
  const width = wide ? Math.min(460, window.width) : window.width;
  const close = () => {
    if (persistent) return;
    setReportStep("reason");
    if (layer === "profile") closeProfile();
    else leaveLayer();
  };
  const identityKey = identity && target ? `${target.userId}:${target.serverId}` : null;
  const showIdentity = identityServer && identityKey && (Platform.OS !== "ios" || gone === identityKey);

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={close}
        onDismiss={() => setGone(identityKey)}
      >
        <GestureRoot>
        <KeyboardSafeScreen>
          <View style={{ flex: 1, backgroundColor: palette.sheetScrim, justifyContent: "flex-end", alignItems: "center" }}>
            <Pressable style={{ position: "absolute", top: 0, bottom: 0, start: 0, end: 0 }} onPress={close} accessibilityLabel={t`Close`} testID="profile-sheet-scrim" />
            {target && layer === "profile" ? (
              <View testID="profile-sheet" style={{ width, height: window.height - 48 - insets.top, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden", backgroundColor: palette.frame }}>
                <ProfileView
                  key={`${target.userId}:${target.serverId ?? ""}`}
                  userId={target.userId}
                  serverId={target.serverId}
                  width={width}
                  onLeave={closeProfile}
                  wrap={(children, surface) => (
                    <ScrollView style={{ flex: 1, backgroundColor: surface }} contentContainerStyle={{ paddingBottom: insets.bottom }} keyboardShouldPersistTaps="handled">
                      {children}
                    </ScrollView>
                  )}
                />
                {/* over the banner: a light grabber reads on any picture or theme */}
                <View pointerEvents="none" style={{ position: "absolute", top: 8, alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: palette.knob, opacity: 0.72 }} />
              </View>
            ) : target ? (
              <View testID="profile-layer-sheet" style={{ width, maxHeight: "86%", backgroundColor: palette.frame, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingBottom: 16 + insets.bottom }}>
                <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: palette.borderStrong, marginBottom: 12 }} />
                <ScrollView contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }} bounces={false} keyboardShouldPersistTaps="handled">
                  <Layer key={`${target.userId}:${target.layer}`} target={target} onReportStep={setReportStep} />
                </ScrollView>
              </View>
            ) : null}
          </View>
        </KeyboardSafeScreen>
        </GestureRoot>
      </Modal>
      {showIdentity ? (
        <ServerIdentitySheet
          server={identityServer}
          onClose={() => {
            setGone(null);
            leaveLayer();
          }}
        />
      ) : null}
    </>
  );
}
