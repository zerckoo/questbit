// Prevent image copying/downloading across the site
document.addEventListener('DOMContentLoaded', () => {
  const css = document.createElement('style');
  css.textContent = `img, video, canvas { user-select: none; -webkit-user-drag: none; pointer-events: auto; }`;
  document.head.appendChild(css);

  const block = e => { e.preventDefault(); return false; };
  document.addEventListener('contextmenu', e => {
    if (e.target.tagName === 'IMG') block(e);
  });
  document.addEventListener('dragstart', e => {
    if (e.target.tagName === 'IMG') block(e);
  });
  document.addEventListener('mousedown', e => {
    if (e.target.tagName === 'IMG' && e.button === 2) block(e);
  });
});
