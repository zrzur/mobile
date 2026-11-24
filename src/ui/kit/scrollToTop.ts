/**
 * Tab re-tap: tapping the tab that is already open scrolls its list to the
 * top (the iOS tab bar habit).
 *
 *   useScrollToTop(tab, ref)  in the tab's screen: registers its main list
 *                             (FlashList, FlatList or ScrollView ref) while
 *                             the screen is focused
 *   scrollTabToTop(tab)       PhoneTabs calls it on a re-tap; false when no
 *                             list is registered
 */
import { useFocusEffect } from "expo-router";
import { type RefObject, useCallback } from "react";

type Scrollable = {
  scrollToOffset?: (o: { offset: number; animated?: boolean }) => void;
  scrollTo?: (o: { x?: number; y?: number; animated?: boolean }) => void;
};

const lists = new Map<string, RefObject<Scrollable | null>>();

export function useScrollToTop(tab: string, ref: RefObject<Scrollable | null>) {
  useFocusEffect(
    useCallback(() => {
      lists.set(tab, ref);
      return () => {
        if (lists.get(tab) === ref) lists.delete(tab);
      };
    }, [tab, ref]),
  );
}

export function scrollTabToTop(tab: string): boolean {
  const list = lists.get(tab)?.current;
  if (!list) return false;
  if (list.scrollToOffset) list.scrollToOffset({ offset: 0, animated: true });
  else list.scrollTo?.({ y: 0, animated: true });
  return true;
}
