/**
 * Drag to reorder the server rail (web: servers/railDrag.ts and ServerList).
 *
 * A finger rests on a server or folder for 350 ms: the tile lifts (scale and
 * shadow, a medium haptic). Moving it then drags a copy that follows the
 * finger while the original stays faded in place; an accent line shows where
 * the drop lands, a ring shows the server or folder it would fold into. The
 * rail scrolls by itself near its top and bottom. Resting still a little
 * longer (500 ms in all), or letting go without moving, opens the entry's
 * menu instead, as a long press does everywhere else. A quick tap still
 * opens the server; a quick swipe still scrolls the rail.
 *
 * The maths is in railReorder.ts (tested); the result goes to the synced
 * `server-folders` and `ordering` keys exactly as the web writes them.
 * VoiceOver and TalkBack get Move up / Move down actions on every entry.
 */
import { useLingui } from "@lingui/react/macro";
import { createContext, type ReactNode, type RefObject, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, type AccessibilityActionEvent, type HostInstance } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { type AnimatedRef, scrollTo, type SharedValue, useAnimatedStyle, useFrameCallback, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { useTheme } from "@/theme/ThemeProvider";
import { buzz } from "@/ui/kit/haptics";
import { PRESS_SPRING, useReduceMotion } from "@/ui/kit/motion";

import { CANCEL_MARGIN_PX, DRAG_PX, edgeScrollStep, HOLD_MS, indicatorAt, intentAt, isNoop, MENU_MS, type RailBox, type RailIntent, type RailItem } from "./railReorder";

/** idle, lifted (finger resting), dragging, menu opened */
const IDLE = 0;
const LIFTED = 1;
const DRAGGING = 2;
const MENU = 3;

type Registered = { view: RefObject<HostInstance | null>; onMenu: () => void; label: () => string };

export type RailDrag = {
  phase: SharedValue<number>;
  held: SharedValue<string>;
  pointerX: SharedValue<number>;
  pointerY: SharedValue<number>;
  startX: SharedValue<number>;
  grab: SharedValue<number>;
  intent: SharedValue<RailIntent | undefined>;
  boxes: SharedValue<RailBox[]>;
  scrollY: SharedValue<number>;
  frame: SharedValue<{ top: number; left: number; width: number; height: number; content: number }>;
  /** the rail stops scrolling under a lifted finger */
  locked: boolean;
  /** which entry the floating copy shows */
  ghost: string | undefined;
  register: (id: string, entry: Registered) => () => void;
  lift: (id: string, x: number, y: number) => void;
  begin: () => void;
  end: (id: string, canceled: boolean) => void;
  /** false right after a lift, so the tap that ends it does not open the server */
  tapAllowed: () => boolean;
  shift: (id: string, direction: -1 | 1) => void;
};

const Ctx = createContext<RailDrag | undefined>(undefined);
export const RailDragProvider = Ctx.Provider;
export const useRailDrag = () => useContext(Ctx);

/**
 * The drag state of one rail. `items` are the draggable entries in drawn
 * order (railItems); `onDrop` writes a move; `content` is the View holding
 * the entries (boxes are measured against it) and `scroll` the rail's
 * ScrollView.
 */
export function useRailDragController({
  items,
  content,
  scroll,
  onDrop,
}: {
  items: RailItem[];
  content: RefObject<HostInstance | null>;
  scroll: AnimatedRef<Animated.ScrollView>;
  onDrop: (held: string, intent: RailIntent) => void;
}): RailDrag {
  const { t } = useLingui();
  const phase = useSharedValue(IDLE);
  const held = useSharedValue("");
  const pointerX = useSharedValue(0);
  const pointerY = useSharedValue(0);
  const startX = useSharedValue(0);
  const grab = useSharedValue(0);
  const intent = useSharedValue<RailIntent | undefined>(undefined);
  const boxes = useSharedValue<RailBox[]>([]);
  const scrollY = useSharedValue(0);
  const frame = useSharedValue({ top: 0, left: 0, width: 72, height: 0, content: 0 });
  const [locked, setLocked] = useState(false);
  const [ghost, setGhost] = useState<string>();
  const registry = useRef(new Map<string, Registered>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastEnd = useRef(0);
  const latest = useRef({ items, onDrop });
  useLayoutEffect(() => {
    latest.current = { items, onDrop };
  });

  // edge scroll and the drop target, every frame while dragging (UI thread)
  const tick = useFrameCallback(() => {
    "worklet";
    if (phase.get() !== DRAGGING) return;
    const f = frame.get();
    const y = pointerY.get() - f.top;
    const step = edgeScrollStep(y, 0, f.height);
    if (step) {
      const max = Math.max(0, f.content - f.height);
      const next = Math.min(max, Math.max(0, scrollY.get() + step));
      if (next !== scrollY.get()) {
        scrollY.set(next);
        scrollTo(scroll, 0, next, false);
      }
    }
    const x = pointerX.get();
    const outside = x < f.left - CANCEL_MARGIN_PX || x > f.left + f.width + CANCEL_MARGIN_PX;
    const list = boxes.get();
    const next = intentAt(y + scrollY.get(), held.get(), list, outside);
    intent.set(next && !isNoop(held.get(), next, list) ? next : undefined);
  }, false);

  const reset = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
    tick.setActive(false);
    phase.set(IDLE);
    held.set("");
    intent.set(undefined);
    setLocked(false);
    setGhost(undefined);
    lastEnd.current = Date.now();
  };

  const measure = (id: string, startY: number) => {
    const root = content.current;
    if (!root) return;
    const list = latest.current.items;
    const found: (RailBox | undefined)[] = list.map(() => undefined);
    let left = list.length;
    const done = () => {
      const measured = found.filter((b): b is RailBox => !!b);
      boxes.set(measured);
      const own = measured.find((b) => b.id === id);
      const f = frame.get();
      if (own) grab.set(startY - f.top - (own.top - scrollY.get()));
    };
    list.forEach((item, i) => {
      const view = registry.current.get(item.id)?.view.current;
      if (!view) {
        left--;
        if (!left) done();
        return;
      }
      view.measureLayout(
        root,
        (_x, y, _w, h) => {
          found[i] = { ...item, top: y, bottom: y + h };
          left--;
          if (!left) done();
        },
        () => {
          left--;
          if (!left) done();
        },
      );
    });
    if (!list.length) done();
  };

  const controller: RailDrag = {
    phase,
    held,
    pointerX,
    pointerY,
    startX,
    grab,
    intent,
    boxes,
    scrollY,
    frame,
    locked,
    ghost,
    register: (id, entry) => {
      registry.current.set(id, entry);
      return () => {
        if (registry.current.get(id) === entry) registry.current.delete(id);
      };
    },
    lift: (id, _x, y) => {
      buzz("medium");
      setLocked(true);
      scroll.current?.measureInWindow((left, top, width, height) => {
        frame.set({ ...frame.get(), top, left, width, height });
        measure(id, y);
      });
      // still resting a little longer: the menu, as a long press elsewhere
      timer.current = setTimeout(() => {
        if (phase.get() !== LIFTED || held.get() !== id) return;
        phase.set(MENU);
        setLocked(false);
        registry.current.get(id)?.onMenu();
      }, MENU_MS - HOLD_MS);
    },
    begin: () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = undefined;
      setGhost(held.get());
      tick.setActive(true);
    },
    end: (id, canceled) => {
      const was = phase.get();
      const landed = intent.get();
      reset();
      // the system took the touch (a call, the app left): nothing happens
      if (canceled) return;
      if (was === LIFTED) {
        // let go without moving: the menu (iOS lifts a held item into its menu)
        registry.current.get(id)?.onMenu();
        return;
      }
      if (was !== DRAGGING || !landed) return;
      buzz("light");
      latest.current.onDrop(id, landed);
    },
    tapAllowed: () => phase.get() === IDLE && Date.now() - lastEnd.current > 250,
    shift: (id, direction) => {
      const entry = registry.current.get(id);
      const name = entry?.label() ?? t`Server`;
      const list = latest.current.items;
      const parent = list.find((i) => i.id === id)?.parent;
      const siblings = list.filter((i) => i.parent === parent);
      const at = siblings.findIndex((i) => i.id === id);
      const to = at + direction;
      if (at === -1 || to < 0 || to >= siblings.length) {
        AccessibilityInfo.announceForAccessibility(direction < 0 ? t`${String(name)} is already at the top` : t`${String(name)} is already at the bottom`);
        return;
      }
      const before = direction < 0 ? siblings[to].id : siblings[to + 1]?.id;
      latest.current.onDrop(id, { type: "move", before, parent });
      AccessibilityInfo.announceForAccessibility(t`${String(name)} moved to position ${String(to + 1)} of ${String(siblings.length)}`);
    },
  };
  return controller;
}

/**
 * Wraps one rail tile (a server, or a folder's top tile) so a resting finger
 * lifts and drags it. `onMenu` opens the tile's own menu.
 */
export function RailDraggable({ id, label, onMenu, children }: { id: string; label: () => string; onMenu: () => void; children: ReactNode }) {
  const drag = useRailDrag();
  const reduce = useReduceMotion();
  const { palette } = useTheme();
  const view = useRef<HostInstance>(null);
  const latest = useRef({ label, onMenu });
  useLayoutEffect(() => {
    latest.current = { label, onMenu };
  });
  const register = drag?.register;
  useEffect(() => register?.(id, { view, onMenu: () => latest.current.onMenu(), label: () => latest.current.label() }), [register, id]);

  // shared values pulled out of the controller: worklets capture only these
  const zero = useSharedValue(0);
  const zero2 = useSharedValue(0);
  const zero3 = useSharedValue(0);
  const none = useSharedValue("");
  const phase = drag?.phase ?? zero;
  const held = drag?.held ?? none;
  const pointerX = drag?.pointerX ?? zero2;
  const pointerY = drag?.pointerY ?? zero3;
  const startX = drag?.startX ?? zero2;
  const lift = useSharedValue(1);
  const lifted = useSharedValue(0);
  const enabled = !!drag;

  const startDrag = (x: number, y: number) => drag?.lift(id, x, y);
  const beginDrag = () => drag?.begin();
  const endDrag = (canceled: boolean) => drag?.end(id, canceled);

  const pan = usePanGesture({
    enabled,
    activateAfterLongPress: HOLD_MS,
    shouldCancelWhenOutside: false,
    onActivate: (e) => {
      "worklet";
      if (phase.get() !== IDLE) return;
      phase.set(LIFTED);
      held.set(id);
      pointerX.set(e.absoluteX);
      pointerY.set(e.absoluteY);
      startX.set(e.absoluteX);
      lifted.set(withTiming(1, { duration: 120 }));
      if (!reduce) lift.set(withSpring(1.06, PRESS_SPRING));
      scheduleOnRN(startDrag, e.absoluteX, e.absoluteY);
    },
    onUpdate: (e) => {
      "worklet";
      if (held.get() !== id) return;
      pointerX.set(e.absoluteX);
      pointerY.set(e.absoluteY);
      if (phase.get() === LIFTED && Math.hypot(e.translationX, e.translationY) > DRAG_PX) {
        phase.set(DRAGGING);
        scheduleOnRN(beginDrag);
      }
    },
    onFinalize: (e) => {
      "worklet";
      lift.set(withSpring(1, PRESS_SPRING));
      lifted.set(withTiming(0, { duration: 160 }));
      if (held.get() === id) scheduleOnRN(endDrag, e.canceled);
    },
  });

  const style = useAnimatedStyle(() => {
    const dragging = phase.get() === DRAGGING && held.get() === id;
    return {
      transform: [{ scale: phase.get() === LIFTED && held.get() === id ? lift.get() : 1 }],
      // the original stays in place, faded, while its copy follows the finger
      opacity: dragging ? 0.35 : 1,
      shadowOpacity: phase.get() === LIFTED && held.get() === id ? 0.3 * lifted.get() : 0,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View ref={view} collapsable={false} style={[{ shadowColor: palette.shadow, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }, style]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

/** Move up / Move down for VoiceOver and TalkBack (web: Alt+arrow keys on a rail entry) */
export function useRailA11y(id: string, onMenu: () => void) {
  const { t } = useLingui();
  const drag = useRailDrag();
  return useMemo(
    () => ({
      accessibilityActions: [{ name: "longpress" as const }, ...(drag ? [{ name: "moveUp", label: t`Move up` }, { name: "moveDown", label: t`Move down` }] : [])],
      onAccessibilityAction: (e: AccessibilityActionEvent) => {
        const name = e.nativeEvent.actionName;
        if (name === "longpress") onMenu();
        else if (name === "moveUp") drag?.shift(id, -1);
        else if (name === "moveDown") drag?.shift(id, 1);
      },
    }),
    [drag, id, onMenu, t],
  );
}

/** The drop line or fold ring, drawn inside the rail's content View */
export function RailDropIndicator() {
  const drag = useRailDrag();
  const { palette } = useTheme();
  const fallbackIntent = useSharedValue<RailIntent | undefined>(undefined);
  const fallbackBoxes = useSharedValue<RailBox[]>([]);
  const intent = drag?.intent ?? fallbackIntent;
  const boxes = drag?.boxes ?? fallbackBoxes;
  const line = useAnimatedStyle(() => {
    const at = indicatorAt(intent.get(), boxes.get());
    return at?.type === "line" ? { opacity: 1, transform: [{ translateY: at.y }] } : { opacity: 0, transform: [{ translateY: 0 }] };
  });
  const ring = useAnimatedStyle(() => {
    const at = indicatorAt(intent.get(), boxes.get());
    return at?.type === "ring" ? { opacity: 1, transform: [{ translateY: at.y + (at.height - 52) / 2 }] } : { opacity: 0, transform: [{ translateY: 0 }] };
  });
  if (!drag) return null;
  return (
    <>
      <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 0, start: 6, end: 6, height: 4, borderRadius: 2, backgroundColor: palette.accent }, line]} />
      <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 0, start: 10, width: 52, height: 52, borderRadius: 16, borderWidth: 2, borderColor: palette.accent }, ring]} />
    </>
  );
}

/** The copy that follows the finger, drawn over the rail (outside its ScrollView) */
export function RailGhost({ children }: { children: ReactNode }) {
  const drag = useRailDrag();
  const reduce = useReduceMotion();
  const { palette } = useTheme();
  const zero = useSharedValue(0);
  const box = useSharedValue({ top: 0, left: 0, width: 72, height: 0, content: 0 });
  const phase = drag?.phase ?? zero;
  const pointerX = drag?.pointerX ?? zero;
  const pointerY = drag?.pointerY ?? zero;
  const startX = drag?.startX ?? zero;
  const grab = drag?.grab ?? zero;
  const frame = drag?.frame ?? box;
  const style = useAnimatedStyle(() => ({
    opacity: phase.get() === DRAGGING ? 0.92 : 0,
    transform: [{ translateX: pointerX.get() - startX.get() }, { translateY: pointerY.get() - frame.get().top - grab.get() }, { scale: reduce ? 1 : 1.06 }],
  }));
  if (!drag?.ghost) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", top: 0, left: 9, width: 54, height: 48, alignItems: "center", justifyContent: "center", shadowColor: palette.shadow, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8, zIndex: 10 }, style]}
    >
      {children}
    </Animated.View>
  );
}
