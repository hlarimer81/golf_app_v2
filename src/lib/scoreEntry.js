// =====================================================================================
// After a digit is typed, every grid moves focus to the next golfer on the same hole, a
// moment later. That jump must not land once the scorer has already moved on: if they have
// tapped another cell in the meantime, their next digit would go into the cell below
// instead, leaving the cell they tapped empty (issue #29).
// =====================================================================================
export function focusNextScore(nextInput) {
  if (!nextInput) return;
  const typedIn = document.activeElement;
  setTimeout(() => {
    if (document.activeElement === typedIn) nextInput.focus();
  }, 10);
}
