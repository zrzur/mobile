import { Redirect, useLocalSearchParams } from "expo-router";

import { DesignPageScreen } from "@/ui/designs/DesignPage";
import { GalleryScreen } from "@/ui/designs/GalleryScreen";
import { slugView } from "@/ui/designs/routes";

/**
 * /designs/<kind> opens the wall on one kind (web /designs/looks, …);
 * /designs/<design> a design's own page (look-…, decoration-…, an id).
 * Anything else (Creator Studio, an unknown word) opens the gallery.
 */
export default function DesignsSlugPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const view = slugView(slug);
  if (view.page === "wall")
    return <GalleryScreen key={view.filter} initialFilter={view.filter} />;
  if (view.page === "design")
    return <DesignPageScreen key={view.slug} slug={view.slug} />;
  return <Redirect href={"/designs" as never} />;
}
