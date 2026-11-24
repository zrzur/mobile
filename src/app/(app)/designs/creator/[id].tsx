import { useLocalSearchParams } from "expo-router";

import { CreatorScreen } from "@/ui/designs/Creators";

/** One creator and their work (web /designs/creator/<id>) */
export default function DesignsCreatorPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CreatorScreen key={id} id={id} />;
}
