# React Native Port Analysis — Solmaalai

## Overall Verdict: Hard but doable — expect 3-4 weeks of focused work

---

## The Big Blocker: Drag and Drop (~40-50% of the effort)

`react-dnd` does **not** work with React Native at all. The game uses it extensively:

- **`LetterTile.js`** — `useDrag` for dragging tiles from rack
- **`Square.js`** — `useDrop` for placing tiles on board cells, plus tile-merging logic (Uyir + Mey combining)
- **`RackSlot.js`** — `useDrop` for rearranging tiles in rack
- **`PlayingBoard.js`** — `DndProvider` with `TouchBackend`, plus custom drag preview

You'd need to rebuild all of this with **react-native-gesture-handler + react-native-reanimated**, or consider a **tap-to-select, tap-to-place** UX instead of drag-and-drop (arguably better on mobile anyway).

---

## What Ports Easily

| Layer | Status |
|-------|--------|
| **Redux Toolkit** (5 slices, 28 actions) | Works as-is in RN |
| **WebSocket** (`WebSocketContext.js`) | RN has native WebSocket API — minimal changes |
| **Game logic** (all store slices, validation) | Pure JS — no changes needed |
| **Layout** | Already all flexbox, no CSS Grid — maps directly to RN `StyleSheet` |
| **Lodash, uuid** | Work in RN |

---

## Moderate Effort Items

- **CSS animations** (7 keyframe animations in `Styles.css` — tile shaking, color pulsing, spin, fade) — need to be rewritten with Reanimated 2
- **DOM APIs scattered through `App.js`**:
  - `document.cookie` — use AsyncStorage
  - `window.location` / URL params — use React Navigation deep linking
  - `navigator.clipboard` — use `@react-native-clipboard/clipboard`
  - `scrollIntoView` in Chat — use `ScrollView.scrollToEnd`

---

## Small Replacements

| Web Library | RN Replacement |
|-------------|----------------|
| `react-fitty` (auto-size Tamil text on tiles) | Fixed font size or `onLayout` measurement |
| `react-tooltip` (hover tooltips on buttons) | Omit entirely — no hover on mobile |
| `react-select` (consonant/vowel picker in `ChooseLetter.js`) | `@react-native-picker/picker` |
| `react-icons` | `react-native-vector-icons` |
| `react-dropdown` | Not actively used |

---

## Mobile UX Considerations

The 15x15 board (currently 40px cells + margins = ~660px wide) won't fit on a phone screen at full size. Options:

- **Pinch-to-zoom** on the board
- **Smaller cells** with the rack in a fixed bottom bar
- A **scroll/pan** approach for the board

The `InfoBoard` (scores, turn history, chat, letter bags) is currently side-by-side with the board — on mobile it'd need to be a **tab bar or bottom sheet**.

---

## Effort Breakdown

| Component | Effort | Approx Hours |
|-----------|--------|--------------|
| Drag-and-drop system (gesture handler + reanimated) | HIGH | 40-60 |
| CSS animations (rewrite with Reanimated 2) | MEDIUM | 15-20 |
| DOM API replacements (cookies, URLs, clipboard) | LOW | 8-12 |
| react-fitty replacement | LOW | 2-4 |
| react-select replacement | LOW | 3-5 |
| react-tooltip replacement | LOW | 2-3 |
| Layout adaptation (CSS → RN StyleSheet) | LOW | 5-8 |
| WebSocket integration (minor tweaks) | LOW | 2-3 |
| Mobile UX layout (board scaling, tab nav) | MEDIUM | 10-15 |
| Testing and debugging | MEDIUM | 15-20 |
| **Total** | | **~100-150** |

---

## Alternative: PWA First?

The app already uses `TouchBackend` for react-dnd, so it partially works on mobile browsers. Making it a **Progressive Web App** (add a manifest + service worker) would give mobile access with zero porting effort. The main gaps would be offline support and "app-like" feel, but the game requires WebSocket connectivity anyway.

---

## Recommendation

The state management, networking, and game logic port cleanly. The pain is almost entirely in the interaction layer (drag-and-drop) and mobile layout adaptation. If going forward with React Native, switch to a **tap-based interaction model** (tap tile to select, tap square to place) rather than replicating drag-and-drop — it's faster to build and better UX on small screens.
