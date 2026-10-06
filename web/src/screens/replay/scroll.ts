/**
 * Fait défiler `list` (et seulement elle, jamais la page) pour que `item` soit visible.
 * `list` doit être le parent de positionnement de `item` (`position: relative`).
 */
export function keepVisible(list: HTMLElement | null, item: HTMLElement | null, toEnd = false) {
  if (!list) return;
  if (toEnd) {
    list.scrollTop = list.scrollHeight;
    return;
  }
  if (!item) return;
  const top = item.offsetTop;
  const bottom = top + item.offsetHeight;
  if (top < list.scrollTop) list.scrollTop = top;
  else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
}
