/**
 * Vector Learn Forms — Embed Loader v1 (FORMS-005)
 *
 * Utilizare iframe inline:
 *   <script src="/embed.js" data-form-slug="slug-meu" data-mode="iframe" async></script>
 *
 * Utilizare popup:
 *   <script src="/embed.js" data-form-slug="slug-meu" data-mode="popup"
 *           data-button-text="Înscrie-te" async></script>
 *
 * Vanilla JS pur, zero dependențe externe.
 */
(function () {
  var script = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var slug = script.getAttribute('data-form-slug') || '';
  var mode = script.getAttribute('data-mode') || 'iframe';
  var buttonText = script.getAttribute('data-button-text') || 'Completează formularul';

  if (!slug) {
    console.warn('[VL Forms] data-form-slug lipsește pe scriptul embed.');
    return;
  }

  var origin = (script.src && script.src.indexOf('http') === 0)
    ? script.src.replace(/\/embed\.js.*$/, '')
    : window.location.origin;

  var formUrl = origin + '/#/f/' + encodeURIComponent(slug);

  function createIframe() {
    var iframe = document.createElement('iframe');
    iframe.src = formUrl;
    iframe.width = '100%';
    iframe.height = '600';
    iframe.frameBorder = '0';
    iframe.setAttribute('allowtransparency', 'true');
    iframe.setAttribute('title', 'Formular Vector Learn');
    iframe.style.cssText = 'border:none;overflow:hidden;display:block;width:100%;max-width:100%;';
    return iframe;
  }

  if (mode === 'popup') {
    // Modul popup: buton + overlay modal cu iframe
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = buttonText;
    btn.setAttribute('aria-label', 'Deschide formularul');
    btn.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'padding:12px 24px',
      'background:#6366f1',
      'color:#fff',
      'border:none',
      'border-radius:8px',
      'font-size:15px',
      'font-weight:600',
      'cursor:pointer',
      'min-height:44px',
      'min-width:44px',
    ].join(';');

    btn.addEventListener('click', function () {
      openOverlay();
    });

    script.parentNode && script.parentNode.insertBefore(btn, script.nextSibling);

    function openOverlay() {
      var overlay = document.createElement('div');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Formular Vector Learn');
      overlay.style.cssText = [
        'position:fixed',
        'inset:0',
        'background:rgba(0,0,0,0.6)',
        'z-index:999999',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'padding:16px',
      ].join(';');

      var inner = document.createElement('div');
      inner.style.cssText = [
        'position:relative',
        'width:100%',
        'max-width:640px',
        'background:#fff',
        'border-radius:12px',
        'overflow:hidden',
        'box-shadow:0 25px 50px rgba(0,0,0,0.3)',
      ].join(';');

      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = '×'; // ×
      closeBtn.setAttribute('aria-label', 'Închide');
      closeBtn.style.cssText = [
        'position:absolute',
        'top:8px',
        'right:8px',
        'z-index:10',
        'background:#f1f5f9',
        'border:none',
        'border-radius:50%',
        'width:32px',
        'height:32px',
        'min-width:32px',
        'min-height:32px',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'font-size:18px',
        'cursor:pointer',
        'line-height:1',
      ].join(';');

      closeBtn.addEventListener('click', function () {
        document.body.removeChild(overlay);
      });

      // Close on overlay click (outside inner)
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          document.body.removeChild(overlay);
        }
      });

      // Close on Escape key
      function handleKey(e) {
        if (e.key === 'Escape') {
          document.body.removeChild(overlay);
          document.removeEventListener('keydown', handleKey);
        }
      }
      document.addEventListener('keydown', handleKey);

      var iframe = createIframe();
      iframe.style.height = '80vh';
      iframe.style.maxHeight = '700px';

      inner.appendChild(closeBtn);
      inner.appendChild(iframe);
      overlay.appendChild(inner);
      document.body.appendChild(overlay);
      closeBtn.focus();
    }
  } else {
    // Modul iframe: injectează direct în locul scriptului
    var iframe = createIframe();
    script.parentNode && script.parentNode.insertBefore(iframe, script.nextSibling);
  }
})();
