import { useLocalSearchParams } from "expo-router";

import { AccountPage } from "@/ui/settings/user/Account";
import { AppearancePage } from "@/ui/settings/user/Appearance";
import { ConnectedAppsPage } from "@/ui/settings/user/ConnectedApps";
import { ConnectionsPage } from "@/ui/settings/user/Connections";
import { FeatherPage } from "@/ui/settings/user/Feather";
import { FeedbackPage } from "@/ui/settings/user/Feedback";
import { LanguagePage } from "@/ui/settings/user/Language";
import { MyDataPage } from "@/ui/settings/user/MyData";
import { NotificationsPage } from "@/ui/settings/user/Notifications";
import { ProfilePage } from "@/ui/settings/user/Profile";
import { SaveDataPage } from "@/ui/settings/user/SaveData";
import { SessionsPage } from "@/ui/settings/user/Sessions";
import { SupportPage } from "@/ui/settings/user/Support";
import { VoicePage } from "@/ui/settings/user/Voice";

/** One user-settings page (web: UserSettings on a phone: list, then a page) */
export default function UserSettingsSection() {
  const { section, tab } = useLocalSearchParams<{ section: string; tab?: string }>();
  switch (section) {
    case "account":
      return <AccountPage />;
    case "profile":
    case "badges":
      return <ProfilePage tab={section === "badges" || tab === "badges" ? "badges" : "profile"} />;
    case "sessions":
      return <SessionsPage />;
    case "connections":
      return <ConnectionsPage />;
    case "connected-apps":
      return <ConnectedAppsPage />;
    case "my-data":
      return <MyDataPage />;
    case "plus":
    case "subscriptions":
      return <FeatherPage tab={section === "subscriptions" ? "subscriptions" : "feather"} />;
    case "support":
      return <SupportPage />;
    case "feedback":
    case "reports":
      return <FeedbackPage tab={section === "reports" ? "reports" : "feedback"} />;
    case "voice":
      return <VoicePage />;
    case "appearance":
      return <AppearancePage />;
    case "notifications":
      return <NotificationsPage />;
    case "data":
      return <SaveDataPage />;
    case "language":
      return <LanguagePage />;
    default:
      return <AccountPage />;
  }
}
